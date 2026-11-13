// Dashboard maths. Euro amounts are plain numbers, rounded to cents.
const round2 = n => Math.round(n * 100) / 100;

// Opening gross = cumulative tax-card income minus taxable income of the earliest slip of the year.
export function computeOpeningGross(payslips, year) {
  const first = payslips.filter(p => p.year === year).sort((a, b) => a.month - b.month)[0];
  if (!first || first.taxCard?.cumulativeIncome == null || first.taxableIncome == null) return null;
  return round2(first.taxCard.cumulativeIncome - first.taxableIncome);
}

// Same period replaces: the last one given wins.
const uniqueByPeriod = list => [...new Map(list.map(p => [p.period, p])).values()];

export function buildDashboard(year, payslips, opening, now = new Date()) {
  const slips = uniqueByPeriod(payslips.filter(p => p.year === year)).sort((a, b) => a.month - b.month);
  const latest = slips.at(-1) ?? null;
  const op = opening && opening.year === year ? opening : null;
  const throughMonth = op ? op.throughMonth : 0;
  const openGross = op ? op.gross : 0;
  // Opening net/tax may be null (gross-only opening): then net/tax totals are unknown too.
  const netKnown = !op || op.net != null;
  const taxKnown = !op || op.tax != null;
  const openNet = op && op.net != null ? op.net : 0;
  const openTax = op && op.tax != null ? op.tax : 0;

  const slipByMonth = new Map(slips.map(p => [p.month, p]));
  const covered = m => m <= throughMonth || slipByMonth.has(m);
  const isPast = m => year < now.getFullYear() || (year === now.getFullYear() && m < now.getMonth() + 1);

  // Uncovered months: after the latest slip and not yet past = forecast; anything else = missing.
  const missingMonths = [];
  const forecastMonths = [];
  for (let m = 1; m <= 12; m++) {
    if (covered(m)) continue;
    if (latest && m > latest.month) (isPast(m) ? missingMonths : forecastMonths).push(m);
    else if (latest || isPast(m)) missingMonths.push(m);
  }
  const monthsCovered = 12 - missingMonths.length - forecastMonths.length;

  const sum = k => slips.reduce((s, p) => s + p[k], 0);
  const totals = {
    gross: round2(openGross + sum('taxableIncome')),
    net: netKnown ? round2(openNet + sum('net')) : null,
    tax: taxKnown ? round2(openTax + sum('tax')) : null,
  };

  let taxCard;
  let yearEndForecastGross = totals.gross;
  if (latest) {
    const { limit, cumulativeIncome: used, basePct, extraPct } = latest.taxCard;
    // Forecast assumes each remaining month has the latest slip's taxable income (the counter's basis).
    const endCum = used + forecastMonths.length * latest.taxableIncome;
    const over = Math.max(0, endCum - limit);
    let runsOutMonth = null;
    if (used <= limit) {
      let cum = used;
      for (const m of forecastMonths) {
        cum += latest.taxableIncome;
        if (cum > limit) { runsOutMonth = m; break; }
      }
    }
    taxCard = {
      limit,
      used,
      left: round2(Math.max(0, limit - used)),
      overBy: round2(Math.max(0, used - limit)),
      basePct,
      extraPct,
      runsOutMonth,
      extraTaxEstimate: round2(over * (extraPct - basePct) / 100),
    };
    yearEndForecastGross = round2(used + forecastMonths.length * latest.taxableIncome);
  } else {
    taxCard = { limit: null, used: null, left: null, overBy: null, basePct: null, extraPct: null,
      runsOutMonth: null, extraTaxEstimate: null };
  }

  // Cumulative series: one opening point, then each slip, then forecast months.
  const series = [];
  let cumGross = openGross;
  let cumNet = openNet;
  // A partial net sum would mislead, so cumNet stays null until the opening net is known.
  const net = v => (netKnown ? round2(v) : null);
  if (op && throughMonth >= 1) series.push({ month: throughMonth, cumGross: round2(cumGross), cumNet: net(cumNet), kind: 'opening' });
  for (let m = 1; m <= 12; m++) {
    const slip = slipByMonth.get(m);
    if (slip && m > throughMonth) {
      cumGross += slip.taxableIncome;
      cumNet += slip.net;
      series.push({ month: m, cumGross: round2(cumGross), cumNet: net(cumNet), kind: 'actual' });
    } else if (forecastMonths.includes(m)) {
      cumGross += latest.taxableIncome;
      cumNet += latest.net;
      series.push({ month: m, cumGross: round2(cumGross), cumNet: net(cumNet), kind: 'forecast' });
    }
  }

  return {
    year,
    taxCard,
    totals,
    yearEndForecastGross,
    holidayDaysLeft: latest?.holidayDaysLeft ?? null,
    monthsCovered,
    monthsInYear: 12,
    missingMonths,
    series,
    latestPeriod: latest ? latest.period : null,
  };
}

// Stacked bar for one slip. A negative remainder is folded into net so the parts still add to gross.
export function breakdown(p) {
  const pension = p.tyel + p.unemployment;
  const other = round2(p.gross - p.net - p.tax - pension);
  return {
    net: round2(other < 0 ? p.net + other : p.net),
    tax: p.tax,
    pension: round2(pension),
    other: Math.max(0, other),
  };
}
