// Pay lines of one slip against the previous month's slip in the same year.
import { round2 } from './util.js';

// Lines with the same code and name are matched by occurrence (order within the slip).
function byKey(lines) {
  const map = new Map();
  for (const l of lines) {
    const key = `${l.code}|${l.name}`;
    map.set(key, [...(map.get(key) ?? []), l]);
  }
  return map;
}

export function comparePayslips(payslips, period) {
  const cur = payslips.filter(p => p.period === period).at(-1);
  if (!cur) return null;
  const prev = payslips
    .filter(p => p.year === cur.year && p.month < cur.month)
    .sort((a, b) => b.month - a.month)[0];
  if (!prev) return null;

  const a = byKey(cur.lines.filter(l => l.code !== '990'));
  const b = byKey(prev.lines.filter(l => l.code !== '990'));
  const rows = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const ca = a.get(key) ?? [];
    const pb = b.get(key) ?? [];
    for (let k = 0; k < Math.max(ca.length, pb.length); k++) {
      const current = ca[k]?.amount ?? 0;
      const previous = pb[k]?.amount ?? 0;
      const delta = round2(current - previous);
      if (delta !== 0) {
        const { code, name } = (ca[k] ?? pb[k]);
        rows.push({ code, name, current, previous, delta });
      }
    }
  }
  rows.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  return {
    period,
    prevPeriod: prev.period,
    netDelta: round2(cur.net - prev.net),
    grossDelta: round2(cur.gross - prev.gross),
    rows,
  };
}
