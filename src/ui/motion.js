// Motion helpers: sheets (open, close, swipe-down, body lock), count-up numbers, and the entrance pass.
// Everything here checks prefers-reduced-motion and ends in the final state when it is set.
import { fmtEur, fmtEur2 } from './format.js';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => matchMedia('(max-width: 899px)').matches;

// ---------- body lock: keeps the page behind a sheet still (iOS ignores overflow:hidden on body) ----------
let locks = 0;
let scrollY = 0;
let bodyStyle = null;
function lockBody() {
  if (locks++ > 0) return;
  scrollY = window.scrollY;
  bodyStyle = document.body.getAttribute('style');
  Object.assign(document.body.style, { position: 'fixed', top: `-${scrollY}px`, left: '0', right: '0', width: '100%', overflow: 'hidden' });
}
function unlockBody() {
  if (--locks > 0) return;
  if (bodyStyle === null) document.body.removeAttribute('style');
  else document.body.setAttribute('style', bodyStyle);
  window.scrollTo(0, scrollY);
}

// Opens a sheet modally, locks the page behind it, unlocks once on close.
export function openSheet(dlg) {
  lockBody();
  let unlocked = false;
  dlg.addEventListener('close', () => {
    if (!unlocked) { unlocked = true; unlockBody(); }
  });
  dlg.showModal();
  // showModal() focuses the first field. On a phone that raises the keyboard over the sheet at once and
  // gets in the way of swiping it away, so focus the title instead; people tap a field when they want to type.
  const title = dlg.querySelector('.sh-head h2');
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

// Closes with the slide-out (or fade on wide) first. Runs once; the close event then fires as usual.
export function closeSheet(dlg, value = 'cancel') {
  if (dlg.dataset.closing) return;
  dlg.dataset.closing = '1';
  dlg.returnValue = value;
  if (reducedMotion() || !dlg.open) { dlg.close(); return; }
  const form = dlg.querySelector('form');
  dlg.classList.add('closing');
  let done = false;
  const finish = () => { if (!done) { done = true; dlg.close(); } };
  form?.addEventListener('animationend', (e) => { if (e.target === form) finish(); }, { once: true });
  setTimeout(finish, 450); // fallback if the animation did not run
}

// Gives a sheet its gestures: backdrop tap, Escape, form submit with the close animation, and swipe-down on phones.
export function attachSheetMotion(dlg) {
  const form = dlg.querySelector('form');
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeSheet(dlg, 'cancel'); });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) closeSheet(dlg, 'cancel'); });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    closeSheet(dlg, e.submitter?.value ?? 'cancel');
  });
  bindSwipe(dlg, form);
}

// Swipe-down: from the grabber and header (pointer events, touch-action none there), or from the content when it
// is scrolled to the top. Phone only; on wide screens nothing changes.
function bindSwipe(dlg, form) {
  const handles = form.querySelectorAll('.grab, .sh-head'); // querySelector would return only the first match
  let y0 = null;
  let t0 = 0;
  let prev = null; // last sample {y, t}
  let vel = 0;
  let dragging = false;
  let source = null;
  let shift = 0;

  const apply = (d) => {
    shift = d;
    form.style.transform = `translateY(${d}px)`;
    dlg.style.setProperty('--bd', String(Math.max(0, 1 - d / 320)));
  };
  const begin = (y, t, src) => {
    if (!phone() || dlg.dataset.closing) return;
    y0 = y; t0 = t; prev = { y, t }; vel = 0; dragging = false; source = src;
  };
  const move = (y, t, ev) => {
    if (y0 == null) return;
    if (prev && t > prev.t) vel = (y - prev.y) / (t - prev.t);
    prev = { y, t };
    const d = y - y0;
    if (!dragging) {
      if (d <= 4) return; // not a downward drag yet (taps and upward moves stay normal)
      if (source === 'content' && form.scrollTop > 0) { y0 = null; return; } // the content is scrolling itself
      dragging = true;
      form.style.transition = 'none';
      if (dlg.contains(document.activeElement)) document.activeElement.blur?.(); // lower the keyboard while dragging
    }
    if (ev.cancelable) ev.preventDefault(); // keeps the page behind from scrolling during the drag
    apply(Math.max(0, d));
  };
  const end = () => {
    if (y0 == null) return;
    const wasDragging = dragging;
    y0 = null;
    if (!wasDragging) return;
    if (shift > 90 || vel > 0.5) {
      if (dlg.dataset.closing) return;
      dlg.dataset.closing = '1';
      form.style.transition = 'transform 220ms cubic-bezier(.4,0,1,1)';
      apply(window.innerHeight);
      setTimeout(() => { dlg.returnValue = 'cancel'; dlg.close(); }, 230);
    } else {
      form.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
      apply(0);
      setTimeout(() => { form.style.transition = ''; }, 240);
    }
  };

  handles.forEach((handle) => {
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', (e) => { begin(e.clientY, e.timeStamp, 'handle'); handle.setPointerCapture?.(e.pointerId); });
    handle.addEventListener('pointermove', (e) => move(e.clientY, e.timeStamp, e));
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  });
  form.addEventListener('touchstart', (e) => { if (form.scrollTop <= 0) begin(e.touches[0].clientY, e.timeStamp, 'content'); }, { passive: true });
  form.addEventListener('touchmove', (e) => move(e.touches[0].clientY, e.timeStamp, e), { passive: false });
  form.addEventListener('touchend', end);
  form.addEventListener('touchcancel', end);
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
