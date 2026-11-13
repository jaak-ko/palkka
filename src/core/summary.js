// Keep-of-100, year totals and the pay-line reconciliation.
import { round2, uniqueByPeriod, coveredMonths } from './util.js';

// Of each 100 € of gross-up income, what is kept below and above the tax card limit.
export function keepOfHundred(p) {
  const contribPct = (p.tyel + p.unemployment) / p.taxableIncome * 100;
  return {
    belowLimit: round2(100 - p.taxCard.basePct - contribPct),
    aboveLimit: round2(100 - p.taxCard.extraPct - contribPct),
  };
}

export function yearSummary(year, payslips, opening) {
  const slips = uniqueByPeriod(payslips.filter(p => p.year === year)).sort((a, b) => a.month - b.month);
  const op = opening && opening.year === year ? opening : null;
  const num = v => (typeof v === 'number' ? v : 0);
  const sum = (list, k) => list.reduce((s, p) => s + p[k], 0);
  const lineSum = code => slips.reduce((s, p) => s + p.lines.filter(l => l.code === code).reduce((t, l) => t + l.amount, 0), 0);
  // Slips inside the opening are already in its gross/tax/pension figures.
  const after = slips.filter(p => p.month > (op ? op.throughMonth : 0));

  const tyelComplete = op
    ? typeof op.tyel === 'number' && typeof op.unemployment === 'number'
    : slips.length > 0 && slips[0].month === 1;

  return {
    taxable: round2((op ? op.gross : 0) + sum(after, 'taxableIncome')),
    net: round2(num(op?.net) + sum(after, 'net')),
    tax: round2(num(op?.tax) + sum(after, 'tax')),
    tyel: round2(num(op?.tyel) + sum(after, 'tyel')),
    unemployment: round2(num(op?.unemployment) + sum(after, 'unemployment')),
    tyelComplete,
    phoneBenefit: round2(lineSum('304')),
    lunchDeduction: round2(Math.abs(lineSum('920'))),
    holidayDaysLeft: slips.at(-1)?.holidayDaysLeft ?? null,
    monthsCovered: coveredMonths(slips, op ? op.throughMonth : 0),
  };
}

// Lines that are already in the gross/tax/pension figures or the net total itself.
const NOT_EXTRA = ['10', '990', '304', '901', '902', '903'];

export function reconcile(f, lines) {
  const extra = lines.filter(l => !NOT_EXTRA.includes(l.code)).reduce((s, l) => s + l.amount, 0);
  const expectedNet = round2(f.gross - f.tax - f.tyel - f.unemployment + extra);
  const diff = round2(f.net - expectedNet);
  return { ok: Math.abs(diff) < 0.015, expectedNet, diff };
}
