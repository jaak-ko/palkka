import { openStore } from '../core/store.js';
import { buildDashboard, computeOpeningGross } from '../core/calc.js';
import { taxCardAdvice } from '../core/advice.js';
import { yearSummary } from '../core/summary.js';
import { coveredMonths } from '../core/util.js';
import { renderDashboard, slipDetailHtml } from './dashboard.js';
import { addFiles } from './add-payslip.js';
import { saveOpening } from './opening.js';
import { openFixer } from './fixer.js';
import { esc } from './format.js';
import { enterPass, reducedMotion, openSheet, closeSheet, attachSheetMotion, attachEdgeOpen } from './motion.js';
import { noticeSignature, dismissNotice, showNoticeAgain } from './notice.js';

const root = document.getElementById('app');
const picker = document.getElementById('picker');
const toastEl = document.getElementById('toast');
const state = { year: null, years: [], payslips: [], selected: null, draft: null, advice: null, through: 0 };
// Entrance animations play only on the first render and after a year change (see render()).
let pendingAnimate = true;
// Renders may overlap (every action re-renders). Each render takes a sequence number; one that finishes after a newer
// render has started is dropped, so the screen always shows the newest state.
let renderSeq = 0;
let carryAnimate = false; // an entrance pass owed by a dropped render
let store;

// The phone drawer: the same navigation as the Mac sidebar, in a modal dialog (focus stays inside, page locked).
const drawer = document.createElement('dialog');
drawer.className = 'drawer';
drawer.setAttribute('aria-labelledby', 'drawer-title');
drawer.innerHTML = `<div class="drawer-panel">
    <div class="drawer-head"><h2 class="drawer-title" id="drawer-title" tabindex="-1">palkka</h2>
      <button class="drawer-close" type="button" data-action="close-menu" aria-label="Close menu">×</button></div>
    <div class="drawer-body nav"></div>
    <input type="file" class="picker-drawer" accept=".pdf,.json,application/pdf,application/json" multiple hidden>
  </div>`;
document.body.append(drawer);
attachSheetMotion(drawer);
attachEdgeOpen(drawer); // swipe in from the left edge opens the drawer
const drawerPicker = drawer.querySelector('.picker-drawer');

function openDrawer() { if (!drawer.open) openSheet(drawer); }
function closeDrawer() { closeSheet(drawer, 'cancel'); }

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

// The opening balance in effect for a year: the stored one (its gross follows the slips unless frozen), else an
// in-memory one (never saved) covering the months before the first slip.
function effectiveOpening(year, payslips, stored) {
  const computed = computeOpeningGross(payslips, year);
  const first = payslips[0];
  if (stored) return { opening: stored.grossFrozen || computed == null ? stored : { ...stored, gross: computed }, draft: null };
  if (computed != null && first && first.month > 1) {
    const draft = { year, throughMonth: first.month - 1, gross: computed, net: null, tax: null, grossFrozen: false };
    return { opening: draft, draft };
  }
  return { opening: null, draft: null };
}

// Months covered per year, for the "n/12" in the navigation (same opening as the dashboard, so they agree).
async function yearCounts(years) {
  const counts = {};
  for (const y of years) {
    const [slips, stored] = await Promise.all([store.listPayslips(y), store.getOpening(y)]);
    const { opening } = effectiveOpening(y, slips, stored);
    counts[y] = coveredMonths(slips, opening ? opening.throughMonth : 0);
  }
  return counts;
}

async function render() {
  const seq = ++renderSeq;
  const animate = pendingAnimate || carryAnimate;
  pendingAnimate = false;
  carryAnimate = false;
  const stale = () => seq !== renderSeq;
  try {
    const years = await store.years();
    if (stale()) { carryAnimate = animate; return; }
    if (state.year == null || (years.length && !years.includes(state.year))) state.year = years.at(-1) ?? new Date().getFullYear();
    const year = state.year;
    const payslips = await store.listPayslips(year);
    const stored = await store.getOpening(year);
    if (stale()) { carryAnimate = animate; return; }
    const first = payslips[0];
    const { opening, draft } = effectiveOpening(year, payslips, stored);
    state.draft = draft;
    const model = buildDashboard(year, payslips, opening);
    state.advice = taxCardAdvice({ year, payslips, opening });
    state.latestSlip = payslips.at(-1) ?? null; // store order is ascending, so the last one is the latest
    state.through = opening ? opening.throughMonth : (first ? first.month - 1 : 0);
    const list = years.length ? years : [year];
    state.years = list;
    state.payslips = payslips;
    const counts = await yearCounts(list);
    if (stale()) { carryAnimate = animate; return; } // a newer render has started: drop this one
    const navHtml = renderDashboard(root, model, payslips, {
      years: list,
      yearCounts: counts,
      selected: state.selected,
      hasOpening: !!stored,
      advice: state.advice,
      // Year totals use the same derived opening as the dashboard, so the numbers agree.
      summary: yearSummary(year, payslips, opening),
      partialNetTax: !!opening && (opening.net == null || opening.tax == null),
    });
    drawer.querySelector('.drawer-body').innerHTML = navHtml;
    root.classList.toggle('enter', animate);
    if (animate) enterPass(root);
  } catch (e) {
    if (!stale()) root.innerHTML = `<div class="shell"><div class="main"><section class="card empty"><p>Could not open local storage: ${esc(e.message)}</p></section></div></div>`;
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

// Files chosen in either picker (the main one, or the one inside the drawer).
async function handlePicked(input) {
  const files = [...input.files];
  input.value = '';
  await addFiles(files, { store, notify });
  render();
}

// Shows, swaps or hides the payslip detail in place. Returns false when there is no detail container to animate.
// Open: content in, then the wrapper grows (grid rows 0fr to 1fr). Swap: fade out, replace, fade in. Close: shrink.
let detailTimer = null;
function showDetail(next) {
  const wrap = document.getElementById('detail-wrap');
  if (!wrap) return false;
  const inner = wrap.querySelector('.detail-inner');
  const instant = reducedMotion();
  clearTimeout(detailTimer);
  if (!next) {
    wrap.classList.remove('open');
    detailTimer = setTimeout(() => { if (!wrap.classList.contains('open')) inner.innerHTML = ''; }, instant ? 0 : 280);
    return true;
  }
  const html = slipDetailHtml(state.payslips, { selected: next });
  if (wrap.classList.contains('open') && !instant) {
    inner.style.opacity = '0';
    detailTimer = setTimeout(() => { inner.innerHTML = html; inner.style.opacity = ''; }, 200);
  } else if (wrap.classList.contains('open')) {
    inner.innerHTML = html;
  } else {
    inner.innerHTML = html;
    if (instant) wrap.classList.add('open');
    else { void wrap.offsetHeight; wrap.classList.add('open'); } // reading the layout first makes the closed state the start of the transition
  }
  return true;
}

// One action handler for the page and the drawer.
async function handleAction(el) {
  const action = el.dataset.action;
  const inDrawer = !!el.closest('dialog.drawer');
  // Choosing anything in the drawer closes it, except Add payslip: its picker opens from inside the drawer.
  if (inDrawer && action !== 'add') closeDrawer();
  if (action === 'add') {
    (inDrawer ? drawerPicker : picker).click();
  } else if (action === 'menu') {
    openDrawer();
  } else if (action === 'close-menu') {
    closeDrawer();
  } else if (action === 'year') {
    state.year = Number(el.dataset.year);
    state.selected = null;
    pendingAnimate = true;
    render();
  } else if (action === 'year-step') {
    const i = state.years.indexOf(state.year) + Number(el.dataset.step);
    if (i >= 0 && i < state.years.length) {
      state.year = state.years[i];
      state.selected = null;
      pendingAnimate = true;
      render();
    }
  } else if (action === 'pick') {
    const period = el.dataset.period;
    state.selected = state.selected === period ? null : period;
    // No page rebuild: flip the rows' highlight and animate the detail card in place.
    document.querySelectorAll('[data-action="pick"]').forEach((b) => b.classList.toggle('on', b.dataset.period === state.selected));
    if (!showDetail(state.selected)) await render();
    if (state.selected) {
      // The detail lives in the main view: bring it into view (after a drawer has closed and unlocked the page).
      setTimeout(() => document.getElementById('detail-wrap')?.scrollIntoView({ block: 'start', behavior: reducedMotion() ? 'auto' : 'smooth' }), inDrawer ? 320 : 60);
    }
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
}

root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) handleAction(el);
});
drawer.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (el) handleAction(el);
});
picker.addEventListener('change', () => handlePicked(picker));
drawerPicker.addEventListener('change', () => { closeDrawer(); handlePicked(drawerPicker); });

matchMedia('(min-width: 900px)').addEventListener('change', render); // chart geometry and layout differ per width

try {
  store = await openStore();
  await render();
} catch (e) {
  root.innerHTML = `<div class="shell"><div class="main"><section class="card empty"><p>Could not open local storage: ${esc(e.message)}</p></section></div></div>`;
}
