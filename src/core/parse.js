// Finnish "PALKKALASKELMA" payslip -> Payslip, read by position: a label's value is the
// matching item in the same grid column below it. A field that can't be found is null,
// so the confirm sheet can ask for it.

export class NotAPayslipError extends Error {
  constructor() {
    super("This doesn't look like a supported payslip");
    this.name = 'NotAPayslipError';
  }
}

// Grid columns on the slip are about 86 pt wide; a value sits inside its label's column.
const COL_W = 86;
const isNumber = s => /^[-−]?[\d\s  ]*\d(,\d+)?$/.test(s);
const isPercent = s => /^\d{1,2},\d$/.test(s);
const isLimit = s => /^\d[\d\s  ]{3,}$/.test(s);
const isPeriod = s => /^\d{1,2}\/\d{4}\/\d+$/.test(s);
const isDate = s => /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s);

export function parseFiNumber(s) {
  const t = s.replace(/[\s  ]/g, '').replace('−', '-').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) throw new Error(`Not a Finnish number: "${s}"`);
  return Number(Number(t).toFixed(2));
}

// Labels with this text, lowest on the page last (topmost first). Pay-line names
// can repeat a label, so callers try them in order until one has a value under it.
const labels = (items, text) => items.filter(i => i.str === text).sort((a, b) => b.y - a.y);

// Items in the column under a label, nearest row first, then left to right.
const under = (items, label, width = COL_W) =>
  items
    .filter(i => label.y - i.y > 2 && label.y - i.y < 30 && i.x >= label.x - 4 && i.x < label.x + width)
    .sort((a, b) => b.y - a.y || a.x - b.x);

function valueUnder(items, text, ok) {
  for (const label of labels(items, text)) {
    const hit = under(items, label).find(i => ok(i.str));
    if (hit) return hit.str;
  }
  return null;
}

const numberUnder = (items, text) => {
  const s = valueUnder(items, text, isNumber);
  return s === null ? null : parseFiNumber(s);
};

export function parsePayslip(items) {
  if (!items.some(i => i.str.includes('PALKKALASKELMA'))) throw new NotAPayslipError();

  const period = valueUnder(items, 'Palkkakausi', isPeriod);
  const [month, year] = period ? period.split('/').map(Number) : [null, null];
  const date = valueUnder(items, 'Palkkakausi', isDate);
  const [dd, mm, yyyy] = date ? date.split('.') : [];
  const payDate = date ? `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : null;

  // Pay lines: a code at the left, the amount in the "Euro" column of the same row.
  const header = labels(items, 'Palkkalaji')[0];
  const euro = labels(items, 'Euro')[0];
  const lines = [];
  if (header && euro) {
    const codes = items.filter(i => /^\d{2,4}$/.test(i.str) && i.x < 70 && i.y < header.y).sort((a, b) => b.y - a.y);
    for (const code of codes) {
      const row = items.filter(i => Math.abs(i.y - code.y) < 3);
      const amount = row.find(i => i.x >= euro.x - 4 && isNumber(i.str));
      if (!amount) continue;
      // Name column runs from just right of the code to the date columns (about x = 215).
      const name = row.filter(i => i.x > code.x + 10 && i.x < 215).sort((a, b) => a.x - b.x).map(i => i.str).join(' ');
      lines.push({ code: code.str, name, amount: parseFiNumber(amount.str) });
    }
  }
  const lineAmount = code => {
    const l = lines.find(line => line.code === code);
    return l ? Math.abs(l.amount) : null;
  };

  // Tax card: the first row under "Verokortti" holds base % and extra %; the limit is the next row.
  const vk = labels(items, 'Verokortti')[0];
  const cells = vk ? under(items, vk) : [];
  const pct = cells.filter(i => isPercent(i.str));
  const limit = cells.find(i => isLimit(i.str));

  // Cumulative income: the top-right number of the "Kumulat. verotiedot" box.
  const kl = labels(items, 'Kumulat. verotiedot')[0];
  const cum = kl && items
    .filter(i => kl.y - i.y > 2 && kl.y - i.y < 20 && i.x >= kl.x && isNumber(i.str))
    .sort((a, b) => b.y - a.y || b.x - a.x)[0];

  return {
    period,
    year,
    month,
    payDate,
    gross: numberUnder(items, 'Kokonaispalkka'),
    net: numberUnder(items, 'Maksetaan'),
    tax: numberUnder(items, 'Ennakonpidätys'),
    tyel: lineAmount('902'),
    unemployment: lineAmount('903'),
    taxableIncome: numberUnder(items, 'Enn.pid.al.ansio'),
    taxCard: {
      basePct: pct[0] ? parseFiNumber(pct[0].str) : null,
      extraPct: pct[1] ? parseFiNumber(pct[1].str) : null,
      limit: limit ? parseFiNumber(limit.str) : null,
      cumulativeIncome: cum ? parseFiNumber(cum.str) : null,
    },
    holidayDaysLeft: numberUnder(items, 'Lomaa jäljellä'),
    lines,
  };
}
