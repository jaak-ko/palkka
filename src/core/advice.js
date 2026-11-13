// Tax card advice. An estimate: Vero's 2026 example rates plus a calibration from the user's own card.
import { buildDashboard } from './calc.js';

const round2 = n => Math.round(n * 100) / 100;
const round1 = n => Math.round(n * 10) / 10;
// Vero 2026 example points: [annual income, annual tax] (Helsinki, evangelical Lutheran).
const POINTS = [[0, 0], [10000, 0], [16000, 80], [20000, 300], [30000, 2550], [40000, 5600],
  [50000, 9361.96], [60000, 13244.84], [70000, 17415.6]];

export function estimateAnnualTax(income, calibrationPct = 0) {
  let base;
  if (income <= 0) base = 0;
  else if (income >= 70000) base = 17415.6 + (income - 70000) * 0.417;
  else {
    const i = POINTS.findIndex(([x]) => x > income);
    const [x0, y0] = POINTS[i - 1];
    const [x1, y1] = POINTS[i];
    base = y0 + (income - x0) * (y1 - y0) / (x1 - x0);
  }
  return base + (calibrationPct / 100) * income;
}

// Percentage points by which the card's withholding differs from the Vero example at the card's limit.
export function calibrationFromCard({ basePct, limit }) {
  return (basePct / 100 * limit - estimateAnnualTax(limit)) / limit * 100;
}

const uniqueByPeriod = list => [...new Map(list.map(p => [p.period, p])).values()];

export function taxCardAdvice({ year, payslips, opening, now = new Date() }) {
  const dash = buildDashboard(year, payslips, opening, now);
  if (!dash.latestPeriod) return null;
  const latest = payslips.filter(p => p.year === year && p.period === dash.latestPeriod).at(-1);
  const { limit, used, basePct, extraPct, runsOutMonth, overBy } = dash.taxCard;

  const remainingMonths = dash.series.filter(s => s.kind === 'forecast').length;
  const remainingIncome = remainingMonths * latest.taxableIncome;
  const estimatedAnnualIncome = round2(used + remainingIncome);
  const calibrationPct = calibrationFromCard({ basePct, limit });
  const expectedAnnualTax = round2(estimateAnnualTax(estimatedAnnualIncome, calibrationPct));

  const slips = uniqueByPeriod(payslips.filter(p => p.year === year));
  const knownTax = opening && typeof opening.tax === 'number';
  const withheldYtd = round2(knownTax
    ? opening.tax + slips.reduce((s, p) => s + p.tax, 0)
    : basePct / 100 * used);

  const below = Math.min(remainingIncome, Math.max(0, limit - used));
  const above = remainingIncome - below;
  const withheldIfNothingChanges = round2(withheldYtd + basePct / 100 * below + extraPct / 100 * above);

  return {
    applicable: runsOutMonth !== null || overBy > 0,
    estimatedAnnualIncome,
    incomeToEnterAtVero: Math.ceil(estimatedAnnualIncome / 100) * 100,
    expectedAnnualTax,
    withheldIfNothingChanges,
    projectedRefund: round2(withheldIfNothingChanges - expectedAnnualTax),
    extraWithholdingVsBase: round2(above * (extraPct - basePct) / 100),
    withheldYtd,
    withheldYtdEstimated: !knownTax,
    suggestedPctForRestOfYear: remainingIncome > 0 ? round1((expectedAnnualTax - withheldYtd) / remainingIncome * 100) : null,
    calibrationPct,
  };
}
