// Turns picked files into saved records. Nothing is stored until the user confirms a sheet.
// One pick may hold many files (Select All in the payslip folder): every PDF is read first, then each payslip is
// decided by its period. Stored periods are skipped silently; only new ones open a confirm sheet, oldest first.
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
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const isJson = (f) => /\.json$/i.test(f.name);

// pdf.js 3.11.174 UMD is loaded as a classic script in index.html before this module runs.
if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

export async function addFiles(files, { store, notify }) {
  const multi = files.length > 1;
  const pdfs = files.filter((f) => !isJson(f));
  const jsons = files.filter(isJson);
  const stats = { added: 0, upToDate: 0, skipped: 0 };
  let single = null; // the one payslip saved from a single-file pick, for its own toast

  if (pdfs.length && !window.pdfjsLib) {
    notify('The PDF reader did not load. Check your connection and try again.');
    return;
  }

  // 1. Read every PDF first. Unreadable or non-payslip files are counted, not toasted one by one.
  const read = [];
  for (const file of pdfs) read.push(await readPayslip(file));
  const readable = read.filter((r) => r.parsed).sort((a, b) => (a.parsed.year - b.parsed.year) || (a.parsed.month - b.parsed.month));
  if (!multi && read[0]?.error) {
    notify(read[0].error === 'notPayslip' ? `${new NotAPayslipError().message}. Nothing was saved.` : `Could not read ${read[0].file.name} as a PDF. Nothing was saved.`);
    return;
  }
  stats.skipped += read.filter((r) => r.error).length;

  // 2. Decide per payslip by period. A single file that is already stored is replaced after confirming.
  const stored = new Set((await store.listPayslips()).map((p) => p.period));
  for (const r of readable) {
    const exists = stored.has(r.parsed.period);
    if (multi && exists) { stats.upToDate++; continue; }
    const saved = await confirmPayslip(r.file, r.parsed, { store, replace: exists });
    if (saved) {
      stored.add(saved.period);
      stats.added++;
      single = saved;
    } else {
      stats.skipped++;
    }
  }

  // 3. Opening balances: with several files, an opening already stored for that year is skipped silently.
  for (const file of jsons) {
    let seed;
    try {
      seed = parseOpening(await file.text()); // throws a readable message on bad input
    } catch (e) {
      if (multi) stats.skipped++; else notify(e.message);
      continue;
    }
    if (multi && await store.getOpening(seed.year)) continue;
    await saveOpening({ store, year: seed.year, payslips: await store.listPayslips(seed.year), seed, fromForm: false, notify });
  }

  // 4. One summary for a multi-file pick; a single payslip keeps its own toast with the net change.
  if (!multi) {
    if (single) {
      const cmp = comparePayslips(await store.listPayslips(single.year), single.period);
      const change = cmp ? ` · net ${fmtSigned(cmp.netDelta)} vs ${MONTHS[Number(cmp.prevPeriod.split('/')[0]) - 1]}` : '';
      notify(`Saved payslip ${single.period}${change}`);
    }
    return;
  }
  const parts = [];
  if (stats.added) parts.push(`Added ${plural(stats.added, 'payslip')}`);
  if (stats.upToDate) parts.push(`${stats.upToDate} already up to date`);
  if (stats.skipped) parts.push(`${plural(stats.skipped, 'file')} skipped`);
  const nothingNew = stats.added === 0 && stats.skipped === 0;
  notify(nothingNew ? 'Everything is up to date' : parts.join(', '));
}

// Returns { file, parsed } or { file, error } where error is 'notPayslip' or 'unreadable'. Never throws.
async function readPayslip(file) {
  try {
    return { file, parsed: parsePayslip(await itemsFromPdf(await file.arrayBuffer(), window.pdfjsLib)) };
  } catch (e) {
    return { file, error: e instanceof NotAPayslipError ? 'notPayslip' : 'unreadable' };
  }
}

// The confirm sheet for one payslip. Resolves to { period, year, month } once saved, or null when cancelled.
async function confirmPayslip(file, parsed, { store, replace }) {
  const t = parsed.taxCard ?? {};
  const [pm, py] = (parsed.period ?? '').split('/').map(Number);
  const title = pm && py ? `${MONTHS[pm - 1]} ${py}` : 'Check payslip';
  // Each number from the slip's grid; `other` is worked out live and read-only.
  const v = await askFields({
    title,
    subtitle: 'Check the numbers before saving',
    save: 'Save payslip',
    text: replace ? 'Already added. Saving replaces it.' : `Read from ${file.name}`,
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
  if (!v) return null;

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
  return { period: v.period, year, month };
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
