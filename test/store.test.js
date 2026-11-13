import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/core/store.js';

// Minimal fake of the IndexedDB calls store.js makes. Data survives reopening; failures
// make the next N transactions throw InvalidStateError synchronously, like a closed connection.
function fakeIndexedDB(failures = 0) {
  const stores = new Map(); // store name -> { keyPath, rows: Map }
  const calls = { open: 0, transaction: 0 };
  const request = run => {
    const r = {};
    setTimeout(() => {
      try { r.result = run(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); }
    }, 0);
    return r;
  };
  const db = {
    createObjectStore(name, { keyPath }) {
      if (!stores.has(name)) stores.set(name, { keyPath, rows: new Map() });
    },
    transaction(name) {
      calls.transaction++;
      if (failures > 0) {
        failures--;
        throw Object.assign(new Error('connection closing'), { name: 'InvalidStateError' });
      }
      const s = stores.get(name);
      return {
        objectStore: () => ({
          put: v => request(() => { s.rows.set(v[s.keyPath], v); return v[s.keyPath]; }),
          get: k => request(() => s.rows.get(k)),
          getAll: () => request(() => [...s.rows.values()]),
          delete: k => request(() => { s.rows.delete(k); }),
        }),
      };
    },
  };
  return {
    calls,
    open() {
      calls.open++;
      const r = { result: db };
      setTimeout(() => { r.onupgradeneeded?.(); r.onsuccess?.(); }, 0);
      return r;
    },
  };
}

async function withFake(failures, fn) {
  const prev = globalThis.indexedDB;
  const fake = fakeIndexedDB(failures);
  globalThis.indexedDB = fake;
  try { return await fn(fake); } finally { globalThis.indexedDB = prev; }
}

const slip = (period, year, month, gross = 1000) => ({ period, year, month, gross });

test('putPayslip replaces the slip with the same period', () => withFake(0, async () => {
  const s = await openStore();
  await s.putPayslip(slip('10/2026/1', 2026, 10, 1));
  await s.putPayslip(slip('10/2026/1', 2026, 10, 2));
  const all = await s.listPayslips();
  assert.equal(all.length, 1);
  assert.equal(all[0].gross, 2);
}));

test('listPayslips sorts by year then month and filters by year', () => withFake(0, async () => {
  const s = await openStore();
  await s.putPayslip(slip('10/2026/1', 2026, 10));
  await s.putPayslip(slip('12/2025/1', 2025, 12));
  await s.putPayslip(slip('9/2026/1', 2026, 9));
  assert.deepEqual((await s.listPayslips()).map(p => p.period), ['12/2025/1', '9/2026/1', '10/2026/1']);
  assert.deepEqual((await s.listPayslips(2026)).map(p => p.period), ['9/2026/1', '10/2026/1']);
}));

test('deletePayslip removes one period', () => withFake(0, async () => {
  const s = await openStore();
  await s.putPayslip(slip('9/2026/1', 2026, 9));
  await s.putPayslip(slip('10/2026/1', 2026, 10));
  await s.deletePayslip('9/2026/1');
  assert.deepEqual((await s.listPayslips()).map(p => p.period), ['10/2026/1']);
}));

test('putOpening and getOpening; missing year gives null', () => withFake(0, async () => {
  const s = await openStore();
  assert.equal(await s.getOpening(2026), null);
  const o = { year: 2026, throughMonth: 8, gross: 30000, tax: null, net: null, grossFrozen: false };
  await s.putOpening(o);
  assert.deepEqual(await s.getOpening(2026), o);
  assert.equal(await s.getOpening(2025), null);
}));

test('years() lists years from payslips and openings, sorted, without duplicates', () => withFake(0, async () => {
  const s = await openStore();
  await s.putPayslip(slip('10/2026/1', 2026, 10));
  await s.putPayslip(slip('12/2025/1', 2025, 12));
  await s.putOpening({ year: 2024, throughMonth: 12, gross: 1, tax: null, net: null });
  await s.putOpening({ year: 2026, throughMonth: 8, gross: 1, tax: null, net: null });
  assert.deepEqual(await s.years(), [2024, 2025, 2026]);
}));

test('a transaction that throws InvalidStateError is retried once on a fresh connection', () => withFake(1, async fake => {
  const s = await openStore();
  await s.putPayslip(slip('10/2026/1', 2026, 10));
  assert.equal((await s.listPayslips()).length, 1);
  assert.equal(fake.calls.open, 2); // first connection, then the retry's fresh one
  assert.equal(fake.calls.transaction, 3); // failed put, retried put, then the list
}));

test('a second InvalidStateError is not retried again', () => withFake(2, async () => {
  const s = await openStore();
  await assert.rejects(s.putPayslip(slip('10/2026/1', 2026, 10)), { name: 'InvalidStateError' });
}));
