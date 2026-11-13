import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepOfHundred, yearSummary, reconcile } from '../src/core/summary.js';

const line = (code, name, amount) => ({ code, name, amount });
const sep = {
  period: '9/2026/1', year: 2026, month: 9, payDate: '2026-09-30',
  gross: 3900, net: 2853.25, tax: 650, tyel: 280.1, unemployment: 34.15, taxableIncome: 3837.5,
  taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 37250 },
  holidayDaysLeft: 12,
  lines: [
    line('990', 'Nettopalkka', 2853.25), line('10', 'Kokonaispalkka', 3900),
    line('14', 'Rahapalkan vähennys puhelinetu', -20),
    line('502', 'Lomapalkka kertymistä', 1100), line('502', 'Lomapalkka kertymistä', 137.5),
    line('650', 'Kuukausipalkan vähennys/poissaolo', -1300),
    line('304', 'Puhelinetu', 20), line('901', 'Ennakonpidätys', -650),
    line('902', 'TyEL maksu', -280.1), line('903', 'Työttömyysvakuutusmaksu', -34.15),
  ],
};
const oct = {
  period: '10/2026/1', year: 2026, month: 10, payDate: '2026-10-30',
  gross: 3900, net: 2850.99, tax: 690.1, tyel: 284.7, unemployment: 34.71, taxableIncome: 3900,
  taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 41150 },
  holidayDaysLeft: 12,
  lines: [
    line('990', 'Nettopalkka', 2850.99), line('10', 'Kokonaispalkka', 3900),
    line('14', 'Rahapalkan vähennys puhelinetu', -20), line('304', 'Puhelinetu', 20),
    line('901', 'Ennakonpidätys', -690.1), line('902', 'TyEL maksu', -284.7),
    line('903', 'Työttömyysvakuutusmaksu', -34.71), line('920', 'Lounasvähennys 75 %', -19.5),
  ],
};
const opening = { year: 2026, throughMonth: 8, gross: 33412.5, tax: null, net: null, tyel: null, unemployment: null, grossFrozen: false };

test('keepOfHundred for October: 74,81 and 49,81', () => {
  // Pension contribution 319.41 / 3900 = 8.19 %.
  assert.deepEqual(keepOfHundred(oct), { belowLimit: 74.81, aboveLimit: 49.81 });
});

test('yearSummary without a complete opening', () => {
  const s = yearSummary(2026, [sep, oct], opening);
  assert.equal(s.taxable, 41150);
  assert.equal(s.net, 5704.24);
  assert.equal(s.tax, 1340.1);
  assert.equal(s.tyel, 564.8);
  assert.equal(s.unemployment, 68.86);
  assert.equal(s.tyelComplete, false);
  assert.equal(s.phoneBenefit, 40);
  assert.equal(s.lunchDeduction, 19.5);
  assert.equal(s.holidayDaysLeft, 12);
  assert.equal(s.monthsCovered, 10);
});

test('yearSummary with numeric opening tyel and unemployment is complete', () => {
  const s = yearSummary(2026, [sep, oct], { ...opening, tyel: 1000, unemployment: 100, net: 20000 });
  assert.equal(s.tyelComplete, true);
  assert.equal(s.tyel, 1564.8);
  assert.equal(s.net, 25704.24);
});

test('reconcile: October adds up', () => {
  const r = reconcile({ gross: 3900, tax: 690.1, tyel: 284.7, unemployment: 34.71, net: 2850.99 }, oct.lines);
  assert.deepEqual(r, { ok: true, expectedNet: 2850.99, diff: 0 });
});

test('reconcile: September with extra lines adds up', () => {
  const r = reconcile({ gross: 3900, tax: 650, tyel: 280.1, unemployment: 34.15, net: 2853.25 }, sep.lines);
  assert.equal(r.ok, true);
  assert.equal(r.expectedNet, 2853.25);
});

test('reconcile: a wrong net is flagged with the difference', () => {
  const r = reconcile({ gross: 3900, tax: 690.1, tyel: 284.7, unemployment: 34.71, net: 2800 }, oct.lines);
  assert.equal(r.ok, false);
  assert.equal(r.diff, -50.99);
});
