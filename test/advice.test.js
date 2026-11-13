import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateAnnualTax, calibrationFromCard, taxCardAdvice } from '../src/core/advice.js';

const NOV_13 = new Date(2026, 10, 13);
const slip = over => ({
  period: '9/2026/1', year: 2026, month: 9, payDate: '2026-09-30',
  gross: 3900, net: 2853.25, tax: 650, tyel: 280.1, unemployment: 34.15,
  taxableIncome: 3837.5,
  taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 37250 },
  holidayDaysLeft: 12, lines: [], ...over,
});
const sep = slip({});
const oct = slip({
  period: '10/2026/1', month: 10, payDate: '2026-10-30',
  net: 2850.99, tax: 690.1, tyel: 284.7, unemployment: 34.71, taxableIncome: 3900,
  taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 41150 },
});
const openingGrossOnly = { year: 2026, throughMonth: 8, gross: 33412.5, tax: null, net: null, grossFrozen: false };

test('estimateAnnualTax interpolates Vero example points and extrapolates above 70 000', () => {
  assert.equal(estimateAnnualTax(0), 0);
  assert.equal(estimateAnnualTax(10000), 0);
  assert.equal(estimateAnnualTax(30000), 2550);
  assert.equal(estimateAnnualTax(50000), 9361.96);
  assert.equal(estimateAnnualTax(80000), 17415.6 + 10000 * 0.417);
  assert.equal(estimateAnnualTax(30000, 1), 2550 + 300);
});

test('calibrationFromCard: 17 % on 44 500 gives about 0.61 points', () => {
  // estimateAnnualTax(44500) = 7292.88; 0.17 * 44500 = 7565; (7565 - 7292.88) / 44500 = 0.61 %.
  assert.ok(Math.abs(calibrationFromCard({ basePct: 17, limit: 44500 }) - 0.61) < 0.01);
});

test('taxCardAdvice for fictional Sep+Oct: forecast crosses the limit', () => {
  const a = taxCardAdvice({ year: 2026, payslips: [sep, oct], opening: openingGrossOnly, now: NOV_13 });
  assert.equal(a.applicable, true);
  assert.equal(a.estimatedAnnualIncome, 48950);
  assert.equal(a.incomeToEnterAtVero, 49000);
  assert.equal(a.extraWithholdingVsBase, 1112.5);
  assert.equal(a.withheldYtd, 6995.5);
  assert.equal(a.withheldYtdEstimated, true);
  assert.ok(Math.abs(a.expectedAnnualTax - 9266) < 100, `expectedAnnualTax ${a.expectedAnnualTax}`);
  // Refund: withheld 9434.00 if nothing changes, minus expected 9266 -> a small refund, under 500.
  assert.ok(a.projectedRefund > 0 && a.projectedRefund < 500, `projectedRefund ${a.projectedRefund}`);
  assert.ok(Math.abs(a.calibrationPct - 0.61) < 0.01);
  assert.ok(Math.abs(a.suggestedPctForRestOfYear - 29.1) < 0.1);
});

test('taxCardAdvice uses opening tax when it is known', () => {
  const a = taxCardAdvice({ year: 2026, payslips: [sep, oct], opening: { ...openingGrossOnly, tax: 5000 }, now: NOV_13 });
  assert.equal(a.withheldYtdEstimated, false);
  assert.equal(a.withheldYtd, 6340.1);
});

test('not applicable when the forecast stays under the limit', () => {
  const small = slip({ period: '10/2026/1', month: 10, gross: 2000, taxableIncome: 2000,
    taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 20000 } });
  const a = taxCardAdvice({ year: 2026, payslips: [small], opening: null, now: NOV_13 });
  assert.equal(a.applicable, false);
  assert.equal(a.extraWithholdingVsBase, 0);
});

test('already over the limit still works', () => {
  const over = slip({ period: '10/2026/1', month: 10,
    taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 47000 } });
  const a = taxCardAdvice({ year: 2026, payslips: [over], opening: null, now: NOV_13 });
  assert.equal(a.applicable, true);
  assert.ok(a.extraWithholdingVsBase > 0);
  assert.ok(a.expectedAnnualTax > 0);
});

test('no slips: null', () => {
  assert.equal(taxCardAdvice({ year: 2026, payslips: [], opening: null, now: NOV_13 }), null);
});
