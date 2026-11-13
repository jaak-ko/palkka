// The one-per-year opening balance (earlier months of the year), as a JSON file the user keeps with their payslips.
// net, tax, tyel and unemployment may be null (not entered yet).
const isAmount = v => Number.isFinite(v) && v >= 0;
const optional = v => v === null || v === undefined || isAmount(v);

export function serializeOpening(o) {
  return JSON.stringify({
    year: o.year,
    months: `1-${o.throughMonth}`,
    gross: o.gross,
    tax: o.tax ?? null,
    net: o.net ?? null,
    tyel: o.tyel ?? null,
    unemployment: o.unemployment ?? null,
  }, null, 2);
}

// Validates a file the user picked: it is untrusted input.
export function parseOpening(text) {
  let o;
  try {
    o = JSON.parse(text);
  } catch {
    throw new Error('Not a valid opening-balance file');
  }
  const range = /^1-(\d{1,2})$/.exec(o?.months ?? '');
  const through = range ? Number(range[1]) : 0;
  if (!Number.isInteger(o?.year) || through < 1 || through > 12) throw new Error('Bad year or months in opening-balance file');
  if (!isAmount(o.gross)) throw new Error('Bad gross in opening-balance file');
  for (const k of ['tax', 'net', 'tyel', 'unemployment']) {
    if (!optional(o[k])) throw new Error(`Bad ${k} in opening-balance file`);
  }
  return {
    year: o.year,
    throughMonth: through,
    gross: o.gross,
    tax: o.tax ?? null,
    net: o.net ?? null,
    tyel: o.tyel ?? null,
    unemployment: o.unemployment ?? null,
    grossFrozen: false,
  };
}

export const openingFileName = year => `palkka-${year}-opening.json`;
