import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comparePayslips } from '../src/core/compare.js';

// Fictional copies of the pay-line shapes (no real figures).
const line = (code, name, amount) => ({ code, name, amount });
const sep = {
  period: '9/2026/1', year: 2026, month: 9, net: 2853.25, gross: 3900,
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
  period: '10/2026/1', year: 2026, month: 10, net: 2850.99, gross: 3900,
  lines: [
    line('990', 'Nettopalkka', 2850.99), line('10', 'Kokonaispalkka', 3900),
    line('14', 'Rahapalkan vähennys puhelinetu', -20), line('304', 'Puhelinetu', 20),
    line('901', 'Ennakonpidätys', -690.1), line('902', 'TyEL maksu', -284.7),
    line('903', 'Työttömyysvakuutusmaksu', -34.71), line('920', 'Lounasvähennys 75 %', -19.5),
  ],
};

test('compare Oct with Sep: deltas, net change, largest first', () => {
  const c = comparePayslips([sep, oct], '10/2026/1');
  assert.equal(c.period, '10/2026/1');
  assert.equal(c.prevPeriod, '9/2026/1');
  assert.equal(c.netDelta, -2.26);
  assert.equal(c.grossDelta, 0);
  const find = (code) => c.rows.filter(r => r.code === code);
  assert.equal(find('650')[0].delta, 1300);
  assert.equal(c.rows[0].code, '650'); // largest first
  const lomas = find('502').map(r => r.delta).sort((a, b) => a - b);
  assert.deepEqual(lomas, [-1100, -137.5]);
  assert.equal(find('901')[0].delta, -40.1);
  assert.equal(find('920')[0].delta, -19.5);
  assert.equal(find('990').length, 0);
  assert.equal(find('10').length, 0); // unchanged, dropped
  assert.equal(find('304').length, 0); // unchanged, dropped
  const abs = c.rows.map(r => Math.abs(r.delta));
  assert.deepEqual(abs, [...abs].sort((a, b) => b - a));
});

test('no earlier slip in the year: null', () => {
  assert.equal(comparePayslips([oct], '10/2026/1'), null);
});

test('previous is the nearest earlier month in the same year', () => {
  const aug = { ...sep, period: '8/2026/1', month: 8, net: 3000 };
  const c = comparePayslips([aug, sep, oct], '10/2026/1');
  assert.equal(c.prevPeriod, '9/2026/1');
});
