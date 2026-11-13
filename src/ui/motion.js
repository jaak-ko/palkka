// Motion helpers: modal panels (bottom sheets and the phone drawer), one swipe implementation with an axis,
// count-up numbers, and the entrance pass. Everything checks prefers-reduced-motion and ends in the final state.
import { fmtEur, fmtEur2 } from './format.js';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => matchMedia('(max-width: 899px)').matches;

// ---------- body lock: keeps the page behind a modal still (iOS ignores overflow:hidden on body) ----------
let locks = 0;
let scrollY = 0;
let bodyStyle = null;
function lockBody() {
  if (locks++ > 0) return;
  scrollY = window.scrollY;
  bodyStyle = document.body.getAttribute('style');
  Object.assign(document.body.style, { position: 'fixed', top: `-${scrollY}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
}
// Each modal locks once and unlocks once, whichever close path runs first (our own, or the close event).
const locked = new WeakSet();
function endLock(dlg) {
  if (!locked.has(dlg)) return;
  locked.delete(dlg);
  unlockBody();
}
function unlockBody() {
  if (--locks > 0) return;
  if (bodyStyle === null) document.body.removeAttribute('style');
  else document.body.setAttribute('style', bodyStyle);
  window.scrollTo(0, scrollY);
}

// The panel of a modal: the form of a sheet, or the drawer's panel.
const panelOf = (dlg) => dlg.querySelector('form, .drawer-panel');

// Opens a modal, locks the page behind it, unlocks once on close, and focuses its title (never a field or button,
// so the keyboard does not rise over a sheet and the drawer opens without a focused control).
export function openSheet(dlg) {
  // A persistent dialog (the drawer) is reused: clear what the last close left behind.
  delete dlg.dataset.closing;
  dlg.classList.remove('closing');
  dlg.style.removeProperty('--bd');
  const panel0 = panelOf(dlg);
  if (panel0) { panel0.style.transform = ''; panel0.style.transition = ''; }
  lockBody();
  locked.add(dlg);
  dlg.addEventListener('close', () => endLock(dlg));
  dlg.showModal();
  const title = dlg.querySelector('.sh-head h2, .drawer-title');
  if (title) { title.tabIndex = -1; title.focus({ preventScroll: true }); } else document.activeElement?.blur?.();
  // A sheet that does not scroll owns every vertical touch (so the browser never takes over mid-swipe);
  // one that scrolls keeps native scrolling and is dragged from its header or when scrolled to the top.
  const form = dlg.querySelector('form');
  if (form) {
    const sync = () => { form.style.touchAction = form.scrollHeight > form.clientHeight + 1 ? 'pan-y' : 'none'; };
    sync();
    requestAnimationFrame(sync);
    dlg.addEventListener('input', sync);
  }
}

// Closes the dialog and releases the page lock now (the close event may come later, or never in some hosts).
function closeNow(dlg) {
  dlg.close();
  endLock(dlg);
  dlg.dispatchEvent(new Event('palkka-closed')); // askFields settles once on either event
}

// Closes with the slide-out (or fade on wide) first. Runs once; the close event then fires as usual.
export function closeSheet(dlg, value = 'cancel') {
  if (dlg.dataset.closing) return;
  dlg.dataset.closing = '1';
  dlg.returnValue = value;
  if (reducedMotion() || !dlg.open) { closeNow(dlg); return; }
  const panel = panelOf(dlg);
  dlg.classList.add('closing');
  let done = false;
  const finish = () => { if (!done) { done = true; closeNow(dlg); } };
  panel?.addEventListener('animationend', (e) => { if (e.target === panel) finish(); }, { once: true });
  setTimeout(finish, 450); // fallback if the animation did not run
}

// Gives a modal its gestures: backdrop tap, Escape, form submit (sheets), and swipe on phones: down for a sheet,
// left for the drawer.
export function attachSheetMotion(dlg) {
  const panel = panelOf(dlg);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(dlg, 'cancel'); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(dlg, 'cancel'); });
  const form = dlg.querySelector('form');
  if (form) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      closeSheet(dlg, e.submitter?.value ?? 'cancel');
    });
  }
  attachSwipe(dlg, panel, { axis: panel.matches('.drawer-panel') ? 'x' : 'y' });
}

// ---------- one swipe implementation for every modal ----------
// axis 'y': a bottom sheet, dragged down (from its grabber and header, or from the content when scrolled to the top).
// axis 'x': the left drawer, dragged left (from its title). Phone only; on wide screens nothing is dragged.
// Closing direction is positive; release closes past 90 px or above 0.5 px/ms, otherwise snaps back.
export function attachSwipe(dlg, panel, { axis = 'y' } = {}) {
  const isX = axis === 'x';
  const handles = panel.querySelectorAll(isX ? '.drawer-head' : '.grab, .sh-head');
  const coord = (e) => (isX ? e.clientX : e.clientY);
  const touchCoord = (e) => (isX ? e.touches[0].clientX : e.touches[0].clientY);
  let s0 = null; // start coordinate
  let prev = null; // last sample {s, t}
  let vel = 0;
  let dragging = false;
  let source = null;
  let shift = 0;

  const apply = (d) => {
    shift = d;
    panel.style.transform = isX ? `translateX(${-d}px)` : `translateY(${d}px)`;
    dlg.style.setProperty('--bd', String(Math.max(0, 1 - d / (isX ? panel.offsetWidth : 320))));
  };
  const begin = (c, t, src) => {
    if (!phone() || dlg.dataset.closing) return;
    s0 = c; prev = { s: 0, t }; vel = 0; dragging = false; source = src;
  };
  const move = (c, t, ev) => {
    if (s0 == null) return;
    const s = isX ? s0 - c : c - s0; // positive = towards closing
    if (prev && t > prev.t) vel = (s - prev.s) / (t - prev.t);
    prev = { s, t };
    if (!dragging) {
      if (s <= 4) return; // taps and moves away from the closing direction stay normal
      if (source === 'content' && panel.scrollTop > 0) { s0 = null; return; } // the content is scrolling itself
      dragging = true;
      panel.style.transition = 'none';
      if (dlg.contains(document.activeElement)) document.activeElement.blur?.(); // lower the keyboard while dragging
    }
    if (ev.cancelable) ev.preventDefault(); // keeps the page behind from scrolling during the drag
    apply(Math.max(0, s));
  };
  const end = () => {
    if (s0 == null) return;
    const wasDragging = dragging;
    s0 = null;
    if (!wasDragging) return;
    if (shift > 90 || vel > 0.5) {
      if (dlg.dataset.closing) return;
      dlg.dataset.closing = '1';
      panel.style.transition = 'transform 220ms cubic-bezier(.4,0,1,1)';
      apply(isX ? panel.offsetWidth : window.innerHeight);
      setTimeout(() => { dlg.returnValue = 'cancel'; closeNow(dlg); }, 230);
    } else {
      panel.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
      apply(0);
      setTimeout(() => { panel.style.transition = ''; }, 240);
    }
  };

  handles.forEach((handle) => {
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', (e) => { begin(coord(e), e.timeStamp, 'handle'); handle.setPointerCapture?.(e.pointerId); });
    handle.addEventListener('pointermove', (e) => move(coord(e), e.timeStamp, e));
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
  // Touch anywhere on the panel. The sheet only starts from the top of its scrolled content; the drawer only when the
  // finger moves more sideways than up/down, so scrolling its list still works.
  let cross0 = null; // start coordinate on the other axis
  panel.addEventListener('touchstart', (e) => {
    cross0 = isX ? e.touches[0].clientY : e.touches[0].clientX;
    if (isX || panel.scrollTop <= 0) begin(touchCoord(e), e.timeStamp, 'content');
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (isX && s0 != null && !dragging) {
      const cross = Math.abs(e.touches[0].clientY - cross0);
      if (cross > 6 && cross > Math.abs(s0 - e.touches[0].clientX)) { s0 = null; return; } // a vertical scroll
    }
    move(touchCoord(e), e.timeStamp, e);
  }, { passive: false });
  panel.addEventListener('touchend', end);
  panel.addEventListener('touchcancel', end);
}

// ---------- count-up: numbers grow to their formatted value; ends exactly on it ----------
export function countUps(root) {
  if (reducedMotion()) return;
  root.querySelectorAll('[data-count]').forEach((el) => {
    const target = Number(el.dataset.count);
    const fmt = el.dataset.fmt === 'eur2' ? fmtEur2 : fmtEur;
    const dur = 600;
    const start = performance.now() + 120;
    el.textContent = fmt(0);
    const step = (now) => {
      const t = Math.min(1, Math.max(0, (now - start) / dur));
      const e = 1 - Math.pow(1 - t, 3);
      el.textContent = t >= 1 ? fmt(target) : fmt(target * e);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
}

// ---------- entrance pass: runs only on the renders that ask for it (load, year and view changes) ----------
export function enterPass(root) {
  // One rule for every block on every view (dashboard, Year page): cards, tiles, notices and hints, in page order.
  const cards = root.querySelectorAll('.card, .tile, .warn, .hint, .notice-restore, .yactions');
  cards.forEach((el, i) => { el.classList.add('stagger'); el.style.setProperty('--i', i); });
  root.querySelectorAll('.slips .row').forEach((el, i) => el.style.setProperty('--i', i));
  root.querySelectorAll('.slips .chip').forEach((el, i) => el.style.setProperty('--i', i));
  countUps(root);
}
