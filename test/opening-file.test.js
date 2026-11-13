import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeOpening, parseOpening, openingFileName } from '../src/core/opening-file.js';

const opening = { year: 2026, throughMonth: 8, gross: 33412.5, tax: 5000.12, net: 20000.5, tyel: 2400, unemployment: 300, grossFrozen: false };

test('serialize and parse round-trip', () => {
  const text = serializeOpening(opening);
  assert.deepEqual(JSON.parse(text), { year: 2026, months: '1-8', gross: 33412.5, tax: 5000.12, net: 20000.5, tyel: 2400, unemployment: 300 });
  assert.deepEqual(parseOpening(text), opening);
});

test('old files without tyel and unemployment parse as null', () => {
  const o = parseOpening('{"year":2026,"months":"1-8","gross":1,"tax":0,"net":0}');
  assert.equal(o.tyel, null);
  assert.equal(o.unemployment, null);
});

test('gross-only opening (net and tax unknown) round-trips', () => {
  const g = { year: 2026, throughMonth: 8, gross: 33412.5, tax: null, net: null, tyel: null, unemployment: null, grossFrozen: false };
  assert.deepEqual(parseOpening(serializeOpening(g)), g);
});

test('parseOpening rejects malformed JSON', () => {
  assert.throws(() => parseOpening('{not json'));
  assert.throws(() => parseOpening('null'));
});

test('parseOpening rejects a wrong year type', () => {
  assert.throws(() => parseOpening('{"year":"2026","months":"1-8","gross":1,"tax":0,"net":0}'));
});

test('parseOpening rejects bad month ranges', () => {
  for (const months of ['1--3', '-3', '0-8', '1-13', '3-8', '1-8x', undefined]) {
    assert.throws(() => parseOpening(JSON.stringify({ year: 2026, months, gross: 1, tax: 0, net: 0 })), months);
  }
});

test('parseOpening rejects missing gross and negative amounts', () => {
  assert.throws(() => parseOpening('{"year":2026,"months":"1-8","tax":0,"net":0}'));
  assert.throws(() => parseOpening('{"year":2026,"months":"1-8","gross":-1,"tax":0,"net":0}'));
  assert.throws(() => parseOpening('{"year":2026,"months":"1-8","gross":1,"tax":0,"net":0,"tyel":-5}'));
});

test('openingFileName', () => {
  assert.equal(openingFileName(2026), 'palkka-2026-opening.json');
});
