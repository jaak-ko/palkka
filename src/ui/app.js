import { openStore } from '../core/store.js';
import { buildDashboard, computeOpeningGross } from '../core/calc.js';
import { taxCardAdvice } from '../core/advice.js';
import { yearSummary } from '../core/summary.js';
import { renderDashboard } from './dashboard.js';
import { addFiles } from './add-payslip.js';
import { saveOpening } from './opening.js';
import { openFixer } from './fixer.js';
import { esc } from './format.js';
import { enterPass, reducedMotion } from './motion.js';
import { noticeSignature, dismissNotice, showNoticeAgain } from './notice.js';

const root = document.getElementById('app');
const picker = document.getElementById('picker');
const toastEl = document.getElementById('toast');
const state = { year: null, selected: null, draft: null, view: 'dash', advice: null, through: 0 };
// Entrance animations play only on the first render, and after a year or view change (see render()).
let pendingAnimate = true;
let prevView = null;
let store;

function notify(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('out');
  toastEl.hidden = false;
  clearTimeout(notify.timer);
  clearTimeout(notify.hide);
  notify.timer = setTimeout(() => {
    toastEl.classList.add('out');
    notify.hide = setTimeout(() => { toastEl.hidden = true; }, 260);
  }, 4000);
}

// Months covered per year, for the "n/12" in the Mac sidebar.
async function yearCounts(years) {
  const counts = {};
  for (const y of years) {
    const [slips, opening] = await Promise.all([store.listPayslips(y), store.getOpening(y)]);
    const months = new Set(slips.map((p) => p.month));
    for (let m = 1; opening && m <= opening.throughMonth; m++) months.add(m);
    counts[y] = months.size;
  }
  return counts;
}

async function render() {
  const animate = pendingAnimate;
  pendingAnimate = false;
  try {
    const years = await store.years();
    if (state.year == null || (years.length && !years.includes(state.year))) state.year = years.at(-1) ?? new Date().getFullYear();
    const year = state.year;
    const payslips = await store.listPayslips(year);
    const stored = await store.getOpening(year);
    // Until the user freezes the gross, the opening balance follows the slips.
    const computed = computeOpeningGross(payslips, year);
    const first = payslips[0];
    let opening = !stored ? null : stored.grossFrozen || computed == null ? stored : { ...stored, gross: computed };
    // No stored opening: an in-memory one (never saved) so the chart still covers the months before the first slip.
    state.draft = null;
    if (!stored && computed != null && first && first.month > 1) {
      opening = { year, throughMonth: first.month - 1, gross: computed, net: null, tax: null, grossFrozen: false };
      state.draft = opening;
    }
    const model = buildDashboard(year, payslips, opening);
    state.advice = taxCardAdvice({ year, payslips, opening });
    state.latestSlip = payslips.at(-1) ?? null; // store order is ascending, so the last one is the latest
    state.through = opening ? opening.throughMonth : (first ? first.month - 1 : 0);
    const list = years.length ? years : [year];
    renderDashboard(root, model, payslips, {
      years: list,
      yearCounts: await yearCounts(list),
      selected: state.selected,
      hasOpening: !!stored,
      view: state.view,
      advice: state.advice,
      summary: state.view === 'year' ? yearSummary(year, payslips, stored) : null,
    });
    root.classList.toggle('enter', animate);
    if (animate) enterPass(root);
    // The Dashboard | Year indicator slides from the previous position.
    const ind = root.querySelector('.seg-ind');
    if (ind && prevView && prevView !== state.view) {
      ind.style.transition = 'none';
      ind.style.transform = `translateX(${prevView === 'year' ? 100 : 0}%)`;
      void ind.offsetWidth;
      ind.style.transition = '';
      ind.style.transform = `translateX(${state.view === 'year' ? 100 : 0}%)`;
    }
    prevView = state.view;
  } catch (e) {
    root.innerHTML = `<div class="shell"><div class="main"><section class="card empty"><p>Could not open local storage: ${esc(e.message)}</p></section></div></div>`;
  }
}

// The opening balance form, or the earlier-months prompt when none is stored yet.
async function openOpeningForm() {
  const year = state.year;
  const stored = await store.getOpening(year);
  // Opened from the prompts (no stored opening yet): gross stays from the slips, ask only tax and net.
  const netTaxOnly = !stored && !!state.draft;
  await saveOpening({
    store, year, payslips: await store.listPayslips(year), seed: stored ?? state.draft,
    fromForm: true, netTaxOnly, notify,
  });
  render();
}

root.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const action = el.dataset.action;
  if (action === 'add') picker.click();
  else if (action === 'view') {
    state.view = el.dataset.view;
    pendingAnimate = true;
    render();
  } else if (action === 'year') {
    state.year = Number(el.dataset.year);
    state.selected = null;
    pendingAnimate = true;
    render();
  } else if (action === 'year-step') {
    const years = await store.years();
    const i = years.indexOf(state.year) + Number(el.dataset.step);
    if (i >= 0 && i < years.length) {
      state.year = years[i];
      state.selected = null;
      pendingAnimate = true;
      render();
    }
  } else if (action === 'pick') {
    const period = el.dataset.period;
    state.selected = state.selected === period ? null : period;
    render();
  } else if (action === 'opening') {
    await openOpeningForm();
  } else if (action === 'fixer') {
    if (state.advice) openFixer(state.advice, { year: state.year, through: state.through, onOpening: openOpeningForm });
  } else if (action === 'dismiss-notice') {
    const latestSlip = state.latestSlip;
    // The card collapses first, then the state changes and the page re-renders without it.
    const card = root.querySelector('.warn');
    if (card && !reducedMotion()) {
      card.classList.add('collapse');
      await new Promise((r) => setTimeout(r, 250));
    }
    if (latestSlip) dismissNotice(noticeSignature(latestSlip));
    notify('Notice hidden');
    render();
  } else if (action === 'show-notice') {
    showNoticeAgain();
    render();
  } else if (action === 'print') {
    window.print();
  } else if (action === 'delete') {
    if (!window.confirm('Delete this payslip? It cannot be undone; you can re-add it from your PDF.')) return;
    await store.deletePayslip(el.dataset.period);
    state.selected = null;
    notify('Payslip deleted');
    render();
  }
});

picker.addEventListener('change', async () => {
  const files = [...picker.files];
  picker.value = '';
  await addFiles(files, { store, notify });
  render();
});

matchMedia('(min-width: 900px)').addEventListener('change', render); // chart geometry and layout differ per width

try {
  store = await openStore();
  await render();
} catch (e) {
  root.innerHTML = `<div class="shell"><div class="main"><section class="card empty"><p>Could not open local storage: ${esc(e.message)}</p></section></div></div>`;
}
