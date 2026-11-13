import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboard, computeOpeningGross, breakdown } from '../src/core/calc.js';

const round = n => Math.round(n * 100) / 100;

// Fictional slips in the data shape.
const slip = (over) => ({
  period: '9/2026/1', year: 2026, month: 9, payDate: '2026-09-30',
  gross: 3900, net: 2853.25, tax: 650, tyel: 280.1, unemployment: 34.15,
  taxableIncome: 3837.5,
  taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 37250 },
  holidayDaysLeft: 12, lines: [],
  ...over,
});
const sep = slip({});
const oct = slip({
  period: '10/2026/1', month: 10, payDate: '2026-10-30',
  gross: 3900, net: 2850.99, tax: 690.1, tyel: 284.7, unemployment: 34.71, taxableIncome: 3900,
  taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 41150 },
});
const opening = { year: 2026, throughMonth: 8, gross: 33412.5, tax: 0, net: 0, grossFrozen: false };
const NOV_13 = new Date(2026, 10, 13);

test('2026 dashboard: tax card, runs-out month, extra withholding, forecast', () => {
  const d = buildDashboard(2026, [sep, oct], opening, NOV_13);
  assert.equal(d.taxCard.limit, 44500);
  assert.equal(d.taxCard.used, 41150);
  assert.equal(d.taxCard.left, 3350);
  assert.equal(d.taxCard.overBy, 0);
  assert.equal(d.taxCard.basePct, 17);
  assert.equal(d.taxCard.extraPct, 42);
  assert.equal(d.taxCard.runsOutMonth, 11);
  // Nov + Dec at 3900: over the limit by 4450 at year end, 25 points extra.
  assert.equal(d.taxCard.extraTaxEstimate, 1112.5);
  assert.equal(d.yearEndForecastGross, 48950);
  assert.equal(d.holidayDaysLeft, 12);
  assert.equal(d.monthsCovered, 10);
  assert.equal(d.monthsInYear, 12);
  assert.deepEqual(d.missingMonths, []);
  assert.equal(d.latestPeriod, '10/2026/1');
});

test('series: opening collapses to one point, then actuals, then forecast', () => {
  const d = buildDashboard(2026, [sep, oct], opening, NOV_13);
  assert.deepEqual(d.series.map(s => s.kind), ['opening', 'actual', 'actual', 'forecast', 'forecast']);
  assert.equal(d.series[0].month, 8);
  assert.equal(d.series.at(-1).month, 12);
});

test('out-of-order input and duplicate periods give the same dashboard', () => {
  const a = buildDashboard(2026, [sep, oct], opening, NOV_13);
  assert.deepEqual(buildDashboard(2026, [oct, sep], opening, NOV_13), a);
  const replaced = { ...sep, gross: 1, net: 1, tax: 0, tyel: 0, unemployment: 0, taxableIncome: 1 };
  const b = buildDashboard(2026, [sep, oct, replaced], opening, NOV_13);
  assert.equal(b.monthsCovered, 10);
  assert.equal(b.totals.gross, buildDashboard(2026, [replaced, oct], opening, NOV_13).totals.gross);
});

test('limit already exceeded: nothing left, over by, no runs-out month', () => {
  const over = slip({ period: '10/2026/1', month: 10,
    taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 47000 } });
  const d = buildDashboard(2026, [over], opening, NOV_13);
  assert.equal(d.taxCard.left, 0);
  assert.equal(d.taxCard.overBy, 2500);
  assert.equal(d.taxCard.runsOutMonth, null);
});

test('a January slip of next year stays out of the 2026 dashboard', () => {
  const jan27 = slip({ period: '1/2027/1', year: 2027, month: 1,
    taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 4000 } });
  assert.deepEqual(buildDashboard(2026, [sep, oct, jan27], opening, NOV_13),
    buildDashboard(2026, [sep, oct], opening, NOV_13));
});

test('a past month with no slip is missing, not forecast', () => {
  const d = buildDashboard(2026, [oct], opening, NOV_13);
  assert.deepEqual(d.missingMonths, [9]);
  assert.equal(d.monthsCovered, 9);
  assert.deepEqual(d.series.map(s => s.month), [8, 10, 11, 12]);
  assert.equal(d.totals.gross, round(33412.5 + 3900));
});

test('no slips: no tax card figures, missing months are past months only', () => {
  const d = buildDashboard(2026, [], opening, NOV_13);
  assert.equal(d.taxCard.left, null);
  assert.equal(d.latestPeriod, null);
  assert.deepEqual(d.missingMonths, [9, 10]);
});

test('totals use taxable income, so before-tax matches the tax card counter', () => {
  // Opening 33412.50 + taxable Sep 3837.50 + taxable Oct 3900.00 = cumulative 41150.00.
  const d = buildDashboard(2026, [sep, oct], opening, NOV_13);
  assert.equal(d.totals.gross, 41150);
  assert.equal(d.totals.gross, d.taxCard.used);
  assert.equal(d.taxCard.left, 3350);
});

test('gross-only opening: gross totals work, net and cumNet are unknown', () => {
  const grossOnly = { year: 2026, throughMonth: 8, gross: 33412.5, net: null, tax: null, grossFrozen: false };
  const d = buildDashboard(2026, [sep, oct], grossOnly, NOV_13);
  assert.equal(d.totals.gross, 41150);
  assert.equal(d.totals.net, null);
  assert.equal(d.totals.tax, null);
  assert.equal(d.taxCard.left, 3350);
  assert.equal(d.series[0].cumGross, 33412.5);
  assert.equal(d.series[0].cumNet, null);
  const lastActual = d.series.filter(s => s.kind === 'actual').at(-1);
  assert.equal(lastActual.cumGross, 41150);
  assert.equal(lastActual.cumNet, null);
  assert.ok(d.series.every(s => s.cumNet === null));
});

test('numeric opening net and tax sum as before', () => {
  const full = { ...opening, net: 20000, tax: 5000 };
  const d = buildDashboard(2026, [sep, oct], full, NOV_13);
  assert.equal(d.totals.net, round(20000 + 2853.25 + 2850.99));
  assert.equal(d.totals.tax, round(5000 + 650 + 690.1));
  assert.equal(d.series[0].cumNet, 20000);
  assert.equal(d.series.at(-1).cumNet, round(20000 + 2853.25 + 2850.99 + 2 * 2850.99));
});

test('computeOpeningGross: earliest slip cumulative minus its taxable income', () => {
  assert.equal(computeOpeningGross([oct, sep], 2026), 33412.5);
  assert.equal(computeOpeningGross([], 2026), null);
});

test('breakdown: pension is TyEL + unemployment, other is the remainder', () => {
  assert.deepEqual(breakdown(oct), { net: 2850.99, tax: 690.1, pension: 319.41, other: 39.5 });
});

test('breakdown: a negative remainder moves into net, other never goes negative', () => {
  const p = { gross: 100, net: 90, tax: 10, tyel: 5, unemployment: 0 };
  assert.deepEqual(breakdown(p), { net: 85, tax: 10, pension: 5, other: 0 });
});

test('months covered by the opening are not counted again in totals', () => {
  // Opening covers months 1..8; the August slip is already inside its gross/tax/net.
  const aug = slip({ period: '8/2026/1', month: 8, gross: 4000, taxableIncome: 4000, net: 3000, tax: 500 });
  const o = { year: 2026, throughMonth: 8, gross: 30000, tax: 0, net: 0, grossFrozen: true };
  const d = buildDashboard(2026, [aug], o, NOV_13);
  assert.equal(d.totals.gross, 30000);
  assert.equal(d.totals.net, 0);
  assert.equal(d.totals.tax, 0);
});

test('monthsCovered counts opening months once, with no slips it is the opening alone', () => {
  const d = buildDashboard(2026, [], { year: 2026, throughMonth: 8, gross: 30000, tax: 0, net: 0, grossFrozen: true }, NOV_13);
  assert.equal(d.monthsCovered, 8);
});
