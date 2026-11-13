import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.js';
import { parsePayslip, parseFiNumber, NotAPayslipError } from '../src/core/parse.js';
import { itemsFromPdf } from '../src/core/pdf-items.js';

const fixture = name => new URL(`../fixtures/${name}`, import.meta.url);
// Expected values for the real PDFs live in fixtures/expected.json (git-ignored), never in this file.
const expectedFile = fixture('expected.json');
const expected = existsSync(expectedFile) ? JSON.parse(await readFile(expectedFile, 'utf8')) : null;

test('parseFiNumber reads Finnish numbers', () => {
  assert.equal(parseFiNumber('3900,00'), 3900);
  assert.equal(parseFiNumber('-690,10'), -690.1);
  assert.equal(parseFiNumber('41 150,00'), 41150);
  assert.equal(parseFiNumber('41 150,00'), 41150);
  assert.equal(parseFiNumber('41 150,00'), 41150);
  assert.equal(parseFiNumber('−20,00'), -20);
  assert.equal(parseFiNumber('0,00'), 0);
  assert.throws(() => parseFiNumber('abc'));
});

test('parsePayslip rejects text that is not a payslip', () => {
  assert.throws(() => parsePayslip([{ str: 'hello', x: 0, y: 0 }]), NotAPayslipError);
  assert.throws(() => parsePayslip([{ str: 'hello', x: 0, y: 0 }]), /supported payslip/);
});

// Fictional October 2026 slip, laid out like the real grid (label above value, columns at the same x).
const fakeOctober = ({ withNet = true, extra = [] } = {}) => [
  { str: 'PALKKALASKELMA/PALKKATODIS', x: 311.3, y: 791.8 },
  { str: 'Palkkakausi', x: 306.8, y: 776 }, { str: '10/2026/1', x: 311.3, y: 763.3 }, { str: '30.10.2026', x: 311.3, y: 751.3 },
  { str: 'Kokonaispalkka', x: 306.8, y: 632 }, { str: '3900,00', x: 356.3, y: 619.3 },
  { str: 'Maksetaan', x: 479.3, y: 263 }, ...(withNet ? [{ str: '2850,99', x: 528.8, y: 250.3 }] : []),
  { str: 'Ennakonpidätys', x: 306.8, y: 263 }, { str: '690,10', x: 360.8, y: 250.3 },
  { str: 'Enn.pid.al.ansio', x: 134.3, y: 263 }, { str: '3900,00', x: 183.8, y: 250.3 },
  { str: 'Lomaa jäljellä', x: 479.3, y: 596 }, { str: '12,00', x: 537.8, y: 583.3 },
  { str: 'Verokortti', x: 306.8, y: 704 }, { str: '17,0', x: 319.5, y: 691.3 }, { str: '42,0', x: 370.5, y: 691.3 },
  { str: 'B', x: 320.3, y: 679.3 }, { str: '44500', x: 363.8, y: 679.3 },
  { str: 'Kumulat. verotiedot', x: 393, y: 668 }, { str: '30,33', x: 451.5, y: 655.3 }, { str: '41150,00', x: 524.3, y: 655.3 },
  { str: 'Palkkalaji', x: 48, y: 560 }, { str: 'Euro', x: 479.3, y: 560 },
  { str: '990', x: 52.5, y: 548.3 }, { str: 'Nettopalkka', x: 82.5, y: 548.3 }, { str: '2850,99', x: 528.8, y: 548.3 },
  { str: '10', x: 52.5, y: 524.3 }, { str: 'Kokonaispalkka', x: 82.5, y: 524.3 }, { str: '3900,00', x: 528.8, y: 524.3 },
  { str: '14', x: 52.5, y: 512.3 }, { str: 'Rahapalkan vähennys puhelinetu', x: 82.5, y: 512.3 }, { str: '-20,00', x: 534.8, y: 512.3 },
  { str: '304', x: 52.5, y: 500.3 }, { str: 'Puhelinetu', x: 82.5, y: 500.3 }, { str: '20,00', x: 537.8, y: 500.3 },
  { str: '901', x: 52.5, y: 487.3 }, { str: 'Ennakonpidätys', x: 82.5, y: 487.3 }, { str: '-690,10', x: 530.3, y: 487.3 },
  { str: '902', x: 52.5, y: 475.3 }, { str: 'TyEL maksu', x: 82.5, y: 475.3 }, { str: '-284,70', x: 530.3, y: 475.3 },
  { str: '903', x: 52.5, y: 463.3 }, { str: 'Työttömyysvakuutusmaksu', x: 82.5, y: 463.3 }, { str: '-34,71', x: 534.8, y: 463.3 },
  { str: '920', x: 52.5, y: 452 }, { str: 'Lounasvähennys 75 %', x: 82.5, y: 452 }, { str: '-19,50', x: 534.8, y: 452 },
  ...extra,
];

const fakeOctoberParsed = {
  period: '10/2026/1', year: 2026, month: 10, payDate: '2026-10-30',
  gross: 3900, net: 2850.99, tax: 690.1, tyel: 284.7, unemployment: 34.71, taxableIncome: 3900,
  taxCard: { basePct: 17, extraPct: 42, limit: 44500, cumulativeIncome: 41150 },
  holidayDaysLeft: 12,
  lines: [
    { code: '990', name: 'Nettopalkka', amount: 2850.99 },
    { code: '10', name: 'Kokonaispalkka', amount: 3900 },
    { code: '14', name: 'Rahapalkan vähennys puhelinetu', amount: -20 },
    { code: '304', name: 'Puhelinetu', amount: 20 },
    { code: '901', name: 'Ennakonpidätys', amount: -690.1 },
    { code: '902', name: 'TyEL maksu', amount: -284.7 },
    { code: '903', name: 'Työttömyysvakuutusmaksu', amount: -34.71 },
    { code: '920', name: 'Lounasvähennys 75 %', amount: -19.5 },
  ],
};

test('parsePayslip reads a synthetic payslip laid out like the real grid', () => {
  assert.deepEqual(parsePayslip(fakeOctober()), fakeOctoberParsed);
});

test('parsePayslip keeps extra pay lines', () => {
  const extra = [
    { str: '25', x: 52.5, y: 535.3 }, { str: 'Lomaraha', x: 82.5, y: 535.3 }, { str: '500,00', x: 528.8, y: 535.3 },
  ];
  const p = parsePayslip(fakeOctober({ extra }));
  assert.equal(p.gross, 3900);
  assert.deepEqual(p.lines.find(l => l.code === '25'), { code: '25', name: 'Lomaraha', amount: 500 });
});

test('parsePayslip returns null for a field it cannot find', () => {
  const p = parsePayslip(fakeOctober({ withNet: false }));
  assert.equal(p.net, null);
  assert.equal(p.gross, 3900);
});

// Real PDFs: values come from fixtures/expected.json; skipped when either is missing.
for (const key of ['oct', 'sep']) {
  test(`parsePayslip reads the real ${key} payslip (values from fixtures/expected.json)`, async t => {
    const ex = expected?.[key];
    if (!ex || !existsSync(fixture(ex.file))) return t.skip('fixtures/ or expected.json not present');
    const p = parsePayslip(await itemsFromPdf(await readFile(fixture(ex.file)), pdfjs));
    for (const [k, v] of Object.entries(ex.values)) {
      if (k === 'line901') assert.equal(p.lines.find(l => l.code === '901').amount, v);
      else assert.deepEqual(p[k], v, k);
    }
  });
}
