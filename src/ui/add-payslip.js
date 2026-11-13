// Turns picked files into saved records. Nothing is stored until the user confirms the sheet.
import { itemsFromPdf } from '../core/pdf-items.js';
import { parsePayslip, NotAPayslipError, parseFiNumber } from '../core/parse.js';
import { parseOpening } from '../core/opening-file.js';
import { askFields, checks } from './sheet.js';
import { saveOpening } from './opening.js';
import { plain, fmtEur2, fmtSigned } from './format.js';
import { reconcile } from '../core/summary.js';
import { comparePayslips } from '../core/compare.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];

// pdf.js 3.11.174 UMD is loaded as a classic script in index.html before this module runs.
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export async function addFiles(files, { store, notify }) {
  for (const file of files) {
    try {
      if (/\.json$/i.test(file.name)) await addOpeningFile(file, { store, notify });
      else await addPdf(file, { store, notify });
    } catch (e) {
      notify(e.message);
    }
  }
}

async function addPdf(file, { store, notify }) {
  if (!window.pdfjsLib) throw new Error('The PDF reader did not load. Check your connection and try again.');
  let parsed;
  try {
    parsed = parsePayslip(await itemsFromPdf(await file.arrayBuffer(), window.pdfjsLib));
  } catch (e) {
    if (e instanceof NotAPayslipError) throw new Error(`${e.message}. Nothing was saved.`);
    throw new Error(`Could not read ${file.name} as a PDF. Nothing was saved.`);
  }

  const t = parsed.taxCard ?? {};
  const [pm, py] = (parsed.period ?? '').split('/').map(Number);
  const title = pm && py ? `${MONTHS[pm - 1]} ${py}` : 'Check payslip';
  // Each number from the slip's grid; `other` is worked out live and read-only.
  const v = await askFields({
    title,
    subtitle: 'Check the numbers before saving',
    save: 'Save payslip',
    text: `Read from ${file.name}`,
    fields: [
      { name: 'gross', label: 'Gross pay', value: plain(parsed.gross) },
      { name: 'tax', label: 'Withholding tax', value: plain(parsed.tax), dot: 'var(--amber)' },
      { name: 'tyel', label: 'Pension (TyEL)', value: plain(parsed.tyel), dot: 'var(--purple)' },
      { name: 'unemployment', label: 'Unemployment insurance', value: plain(parsed.unemployment), dot: 'var(--grey)' },
      { name: 'other', label: 'Other deductions', value: '', readonly: true, optional: true, dot: 'var(--grey)' },
      { name: 'net', label: 'Net pay', value: plain(parsed.net), net: true },
      { name: 'period', label: 'Pay period', kind: 'text', value: parsed.period ?? '', check: checks.period, group: 'tiles' },
      { name: 'taxableIncome', label: 'Taxable income', value: plain(parsed.taxableIncome), group: 'tiles' },
      { name: 'basePct', label: 'Tax card base %', value: plain(t.basePct), group: 'tiles' },
      { name: 'extraPct', label: 'Tax card extra %', value: plain(t.extraPct), group: 'tiles' },
      { name: 'limit', label: 'Tax card limit', value: plain(t.limit), group: 'tiles' },
      { name: 'cumulativeIncome', label: 'Tax card used', value: plain(t.cumulativeIncome), group: 'tiles' },
      { name: 'holidayDaysLeft', label: 'Holiday left', optional: true, value: plain(parsed.holidayDaysLeft), group: 'tiles' },
    ],
    status: (vals) => check(vals, parsed.lines),
    derive: (vals) => ({ other: otherDeductions(vals) }),
  });
  if (!v) return;

  const [month, year] = v.period.split('/').map(Number);
  const n = (k) => parseFiNumber(v[k]);
  await store.putPayslip({
    period: v.period,
    year,
    month,
    payDate: parsed.payDate,
    gross: n('gross'),
    net: n('net'),
    tax: n('tax'),
    tyel: n('tyel'),
    unemployment: n('unemployment'),
    taxableIncome: n('taxableIncome'),
    taxCard: { basePct: n('basePct'), extraPct: n('extraPct'), limit: n('limit'), cumulativeIncome: n('cumulativeIncome') },
    holidayDaysLeft: v.holidayDaysLeft ? n('holidayDaysLeft') : null,
    lines: parsed.lines ?? [],
  });
  // Net change against the previous month, if there is one.
  const cmp = comparePayslips(await store.listPayslips(year), v.period);
  const change = cmp ? ` · net ${fmtSigned(cmp.netDelta)} vs ${MONTHS[Number(cmp.prevPeriod.split('/')[0]) - 1]}` : '';
  notify(`Saved payslip ${v.period}${change}`);
}

// Live check on the confirm sheet. Shows the rule's result; saving stays allowed either way.
function check(vals, lines) {
  try {
    const r = reconcile({
      gross: parseFiNumber(vals.gross), tax: parseFiNumber(vals.tax), tyel: parseFiNumber(vals.tyel),
      unemployment: parseFiNumber(vals.unemployment), net: parseFiNumber(vals.net),
    }, lines);
    return r.ok
      ? { ok: true, text: 'Gross minus deductions matches net pay' }
      : { ok: false, text: `Numbers don't add up: off by ${fmtEur2(Math.abs(r.diff))}` };
  } catch {
    return { ok: false, text: 'Fill in the amounts to check them' };
  }
}

// Gross minus tax, pension, unemployment and net: what the slip deducts besides those. Shown negative.
function otherDeductions(vals) {
  try {
    const rest = parseFiNumber(vals.gross) - parseFiNumber(vals.tax) - parseFiNumber(vals.tyel)
      - parseFiNumber(vals.unemployment) - parseFiNumber(vals.net);
    return plain(Math.round(-rest * 100) / 100);
  } catch {
    return '';
  }
}

async function addOpeningFile(file, { store, notify }) {
  const seed = parseOpening(await file.text()); // throws a readable message on bad input
  await saveOpening({ store, year: seed.year, payslips: await store.listPayslips(seed.year), seed, fromForm: false, notify });
}
