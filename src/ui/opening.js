// Opening balance: totals for the earlier months of the year (before the payslips added here). The form, saving,
// and the JSON download.
import { askFields, checks } from './sheet.js';
import { computeOpeningGross } from '../core/calc.js';
import { parseFiNumber } from '../core/parse.js';
import { serializeOpening, openingFileName } from '../core/opening-file.js';
import { plain, monthRange } from './format.js';

// seed: an existing or file-read opening (or null). fromForm: the in-app form, which prefills gross from the slips.
export async function saveOpening({ store, year, payslips, seed, fromForm, netTaxOnly = false, notify }) {
  const computed = computeOpeningGross(payslips, year);
  let prefill;
  if (fromForm) prefill = seed?.grossFrozen ? seed.gross : (computed ?? seed?.gross);
  else prefill = seed?.gross;
  const taxNet = [
    { name: 'tax', label: 'Tax withheld', kind: 'num', value: plain(seed?.tax), check: checks.nonNeg },
    { name: 'net', label: 'Net paid', kind: 'num', value: plain(seed?.net), check: checks.nonNeg },
  ];
  const v = await askFields(netTaxOnly ? {
    title: `${monthRange(seed.throughMonth) ?? 'Earlier months'} ${year}`,
    text: 'Gross comes from your slips. Enter the tax withheld and net paid for these months (from your last payslip from before the ones you added, year to date).',
    fields: taxNet,
  } : {
    title: `Opening balance ${year}`,
    text: 'Totals for the earlier months, from payslips before your first one here. Gross is worked out from your slips unless you change it.',
    fields: [
      { name: 'through', label: 'Months 1 to', kind: 'num', value: plain(seed?.throughMonth ?? 8), check: checks.month },
      { name: 'gross', label: 'Gross', kind: 'num', value: plain(prefill), check: checks.nonNeg },
      ...taxNet,
      // Optional: the year page needs them for a complete pension and unemployment total.
      { name: 'tyel', label: 'Pension (TyEL), optional', kind: 'num', value: plain(seed?.tyel), check: checks.nonNeg, optional: true },
      { name: 'unemployment', label: 'Unemployment, optional', kind: 'num', value: plain(seed?.unemployment), check: checks.nonNeg, optional: true },
    ],
  });
  if (!v) return null;

  if (netTaxOnly) {
    const o = {
      year, throughMonth: seed.throughMonth, gross: seed.gross, tax: parseFiNumber(v.tax), net: parseFiNumber(v.net),
      tyel: seed.tyel ?? null, unemployment: seed.unemployment ?? null, grossFrozen: false,
    };
    await store.putOpening(o);
    notify(`Saved ${monthRange(seed.throughMonth) ?? 'earlier months'} ${year}`);
    if (fromForm) await offerDownload(o);
    return o;
  }

  const gross = parseFiNumber(v.gross);
  const o = {
    year,
    throughMonth: Number(v.through),
    gross,
    tax: parseFiNumber(v.tax),
    net: parseFiNumber(v.net),
    tyel: v.tyel ? parseFiNumber(v.tyel) : null,
    unemployment: v.unemployment ? parseFiNumber(v.unemployment) : null,
    grossFrozen: computed == null || gross !== computed, // typing a different gross freezes it
  };
  await store.putOpening(o);
  notify(`Saved opening balance ${year}`);
  if (fromForm) await offerDownload(o);
  return o;
}

// The JSON goes to the user's files via the share sheet where possible, else a plain download.
async function offerDownload(o) {
  const file = new File([serializeOpening(o)], openingFileName(o.year), { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: file.name }); } catch { /* dismissed */ }
    return;
  }
  const url = URL.createObjectURL(file);
  Object.assign(document.createElement('a'), { href: url, download: file.name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
