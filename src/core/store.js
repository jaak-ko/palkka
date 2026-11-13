// Thin IndexedDB wrapper (db "palkka"). Browser-only; checked by the UI in a real browser.
// iOS Safari can close an open connection when the page is backgrounded ("The database
// connection is closing" / "Connection to Indexed Database server lost"), so every operation
// gets a live connection and retries once on a fresh one.
const req = r => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

const RETRYABLE = new Set(['InvalidStateError', 'UnknownError', 'TransactionInactiveError']);

function openDb() {
  return new Promise((resolve, reject) => {
    const open = globalThis.indexedDB.open('palkka', 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('payslips', { keyPath: 'period' });
      open.result.createObjectStore('openings', { keyPath: 'year' });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
    open.onblocked = () => reject(new Error('The database is open in another tab. Close it and reload.'));
  });
}

export async function openStore() {
  let dbp = null;
  const reset = () => { dbp = null; };
  const conn = () => {
    dbp ??= openDb().then(db => {
      db.onclose = reset;
      db.onversionchange = () => { db.close(); reset(); };
      return db;
    }, e => { reset(); throw e; });
    return dbp;
  };
  await conn(); // fail early, with the real error, if storage is unavailable

  // fn gets the object store and returns an IDBRequest.
  async function run(name, mode, fn) {
    for (let attempt = 0; ; attempt++) {
      try {
        const db = await conn();
        return await req(fn(db.transaction(name, mode).objectStore(name)));
      } catch (e) {
        if (attempt > 0 || !RETRYABLE.has(e?.name)) throw e;
        reset();
      }
    }
  }

  const byYearMonth = (a, b) => a.year - b.year || a.month - b.month;
  return {
    putPayslip: p => run('payslips', 'readwrite', s => s.put(p)), // same period replaces
    async listPayslips(year) {
      const all = await run('payslips', 'readonly', s => s.getAll());
      return all.filter(p => year === undefined || p.year === year).sort(byYearMonth);
    },
    deletePayslip: period => run('payslips', 'readwrite', s => s.delete(period)),
    async getOpening(year) {
      return (await run('openings', 'readonly', s => s.get(year))) ?? null;
    },
    putOpening: o => run('openings', 'readwrite', s => s.put(o)),
    async years() {
      const [slips, openings] = await Promise.all([
        run('payslips', 'readonly', s => s.getAll()),
        run('openings', 'readonly', s => s.getAll()),
      ]);
      return [...new Set([...slips.map(p => p.year), ...openings.map(o => o.year)])].sort((a, b) => a - b);
    },
  };
}
