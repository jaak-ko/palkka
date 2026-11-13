// Thin IndexedDB wrapper (db "palkka"). Browser-only; checked by the UI in a real browser.
const req = r => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(r.error);
});

export function openStore() {
  return new Promise((resolve, reject) => {
    const open = globalThis.indexedDB.open('palkka', 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('payslips', { keyPath: 'period' });
      open.result.createObjectStore('openings', { keyPath: 'year' });
    };
    open.onsuccess = () => resolve(makeStore(open.result));
    open.onerror = () => reject(open.error);
  });
}

function makeStore(db) {
  const os = (name, mode = 'readonly') => db.transaction(name, mode).objectStore(name);
  const byYearMonth = (a, b) => a.year - b.year || a.month - b.month;
  return {
    putPayslip: p => req(os('payslips', 'readwrite').put(p)), // same period replaces
    async listPayslips(year) {
      const all = await req(os('payslips').getAll());
      return all.filter(p => year === undefined || p.year === year).sort(byYearMonth);
    },
    deletePayslip: period => req(os('payslips', 'readwrite').delete(period)),
    async getOpening(year) {
      return (await req(os('openings').get(year))) ?? null;
    },
    putOpening: o => req(os('openings', 'readwrite').put(o)),
    async years() {
      const [slips, openings] = await Promise.all([req(os('payslips').getAll()), req(os('openings').getAll())]);
      return [...new Set([...slips.map(p => p.year), ...openings.map(o => o.year)])].sort((a, b) => a - b);
    },
  };
}
