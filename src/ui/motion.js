// Motion helpers: modal panels (bottom sheets and the phone drawer), one swipe implementation with an axis,
// count-up numbers, and the entrance pass. Everything checks prefers-reduced-motion and ends in the final state.
import { fmtEur, fmtEur2 } from './format.js';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const phone = () => matchMedia('(max-width: 899px)').matches;

// ---------- scroll lock: keeps the page behind a modal still ----------
// The page scrolls the document (the root element), so the lock only stops that from scrolling. It must not move the
// body (position: fixed with a negative top): that collapses the document, the browser resets the scroll position,
// and the page visibly jumps (measured: 266 px to 0 px on the dashboard). overflow: hidden on the root keeps the
// document height and the scroll position.
let locks = 0;
let rootStyle = null;
function lockBody() {
  if (locks++ > 0) return;
  rootStyle = document.documentElement.getAttribute('style');
  document.documentElement.style.overflow = 'hidden';
}
function unlockBody() {
  if (--locks > 0) return;
  if (rootStyle === null) document.documentElement.removeAttribute('style');
  else document.documentElement.setAttribute('style', rootStyle);
}
// Each modal locks once and unlocks once, whichever close path runs first (our own, or the close event).
const locked = new WeakSet();
function endLock(dlg) {
  if (!locked.has(dlg)) return;
  locked.delete(dlg);
  unlockBody();
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
  const panelNow2 = panelOf(dlg);
  if (panelNow2) { panelNow2.style.transform = ''; panelNow2.style.transition = ''; }
  // Each open starts with the entrance animation; the edge opening takes over the panel while it is dragged.
  const panelNow = panelOf(dlg);
  if (panelNow) panelNow.style.animation = '';
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
  if (dlg.classList.contains('drawer')) return closeDrawer(dlg, value);
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

// The drawer closes from wherever it is (a tap, Escape, a swipe): the panel moves on transform only, from its current
// position, and the backdrop fades in the same frame. The dialog is removed when the transition ends, not before.
function closeDrawer(dlg, value) {
  if (dlg.dataset.closing) return;
  dlg.dataset.closing = '1';
  dlg.returnValue = value;
  if (reducedMotion() || !dlg.open) { closeNow(dlg); return; }
  const panel = dlg.querySelector('.drawer-panel');
  const current = getComputedStyle(panel).transform; // where the panel is now (a swipe may have moved it)
  panel.style.animation = 'none';
  panel.style.transition = 'none';
  panel.style.transform = current === 'none' ? 'translateX(0px)' : current;
  void panel.offsetWidth; // the current position is the start of the transition
  panel.style.transition = 'transform 260ms cubic-bezier(.4, 0, 1, 1)';
  panel.style.transform = 'translateX(-100%)';
  dlg.style.setProperty('--bd', '0'); // backdrop fades (see the drawer's ::backdrop transition)
  let done = false;
  const finish = () => { if (!done) { done = true; closeNow(dlg); } };
  panel.addEventListener('transitionend', (e) => { if (e.target === panel && e.propertyName === 'transform') finish(); }, { once: true });
  setTimeout(finish, 340); // fallback if no transition ran
}

// Gives a modal its gestures: backdrop tap, Escape, form submit (sheets), and the swipe (see attachSwipe).
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

// ---------- one drag tracker for every modal gesture ----------
// axis 'x' or 'y'. sign +1: moving the positive way is progress (down for a sheet, right for the edge opening);
// sign -1: moving the other way is progress (left, to close the drawer). A drag is recognised after `from` px of
// progress; on the x axis only when the move is more horizontal than vertical (so vertical scrolling stays native).
export function makeDrag({ axis = 'y', sign = 1, from = 4, canRecognise = () => true, onFollow, onRelease }) {
  const along = (x, y) => (axis === 'x' ? x : y);
  let start = null;
  let last = null;
  let vel = 0;
  let on = false;
  let recognised = false;
  return {
    begin(x, y, t) {
      start = { x, y }; last = { s: 0, t }; vel = 0; on = true; recognised = false;
    },
    move(x, y, t, ev) {
      if (!on) return false;
      const dx = x - start.x;
      const dy = y - start.y;
      const s = sign * (along(x, y) - along(start.x, start.y));
      if (t > last.t) vel = (s - last.s) / (t - last.t); // velocity in the progress direction
      last = { s, t };
      if (!recognised) {
        if (s < from) return false;
        if ((axis === 'x' && Math.abs(dx) <= Math.abs(dy)) || !canRecognise(s)) { on = false; return false; }
        recognised = true;
      }
      if (ev?.cancelable) ev.preventDefault(); // keeps the page behind from scrolling during the drag
      onFollow(s);
      return true;
    },
    end() {
      if (!on) return;
      on = false;
      if (recognised) onRelease(last.s, vel);
    },
  };
}

// The sheets and the drawer (dragged closed). Handles: the grabber and header; a sheet also drags from its content
// when scrolled to the top. Phone only; on wide screens nothing is dragged.
export function attachSwipe(dlg, panel, { axis = 'y' } = {}) {
  const isX = axis === 'x';
  const handles = panel.querySelectorAll(isX ? '.drawer-head' : '.grab, .sh-head');
  const coord = (e) => (isX ? e.clientX : e.clientY);
  const touchCoord = (e) => (isX ? e.touches[0].clientX : e.touches[0].clientY);
  let source = null;
  let dragging = false;

  const apply = (d) => {
    panel.style.transform = isX ? `translateX(${-d}px)` : `translateY(${d}px)`;
    dlg.style.setProperty('--bd', String(Math.max(0, 1 - d / (isX ? panel.offsetWidth : 320))));
  };
  const drag = makeDrag({
    axis, sign: isX ? -1 : 1, from: 4,
    canRecognise: () => isX || !(source === 'content' && panel.scrollTop > 0), // a sheet's content may be scrolling itself
    onFollow: (d) => {
      if (!dragging) { dragging = true; panel.style.transition = 'none'; if (dlg.contains(document.activeElement)) document.activeElement.blur?.(); }
      apply(Math.max(0, d));
    },
    onRelease: (d, v) => {
      if (!dragging) return;
      dragging = false;
      if (d > 90 || v > 0.5) {
        if (isX) { closeSheet(dlg, 'cancel'); return; } // the drawer: the same code path as a tap
        if (dlg.dataset.closing) return;
        dlg.dataset.closing = '1';
        panel.style.transition = 'transform 220ms cubic-bezier(.4,0,1,1)';
        apply(window.innerHeight);
        setTimeout(() => { dlg.returnValue = 'cancel'; closeNow(dlg); }, 230);
      } else {
        panel.style.transition = 'transform 220ms cubic-bezier(.2,.8,.2,1)';
        apply(0);
        setTimeout(() => { panel.style.transition = ''; }, 240);
      }
    },
  });
  const begin = (c, t, src) => { if (!phone() || dlg.dataset.closing) return; source = src; drag.begin(c.x, c.y, t); };
  handles.forEach((handle) => {
    handle.style.touchAction = 'none';
    handle.addEventListener('pointerdown', (e) => { begin({ x: e.clientX, y: e.clientY }, e.timeStamp, 'handle'); try { handle.setPointerCapture(e.pointerId); } catch { /* no active pointer (synthetic events): the drag still works */ } });
    handle.addEventListener('pointermove', (e) => drag.move(e.clientX, e.clientY, e.timeStamp, e));
    handle.addEventListener('pointerup', () => drag.end());
    handle.addEventListener('pointercancel', () => drag.end());
  });
  // Touch anywhere on the panel. A sheet starts only from the top of its scrolled content; the drawer from anywhere,
  // because makeDrag only recognises it when the move is more sideways than vertical (its list still scrolls).
  panel.addEventListener('touchstart', (e) => { if (isX || panel.scrollTop <= 0) begin({ x: e.touches[0].clientX, y: e.touches[0].clientY }, e.timeStamp, 'content'); }, { passive: true });
  panel.addEventListener('touchmove', (e) => drag.move(e.touches[0].clientX, e.touches[0].clientY, e.timeStamp, e), { passive: false });
  panel.addEventListener('touchend', () => drag.end());
  panel.addEventListener('touchcancel', () => drag.end());
}

// Opens the drawer by dragging from the left edge: the panel follows the finger, then opens or springs back.
// Phone only, and only while no other dialog is open. Vertical scrolling from the edge is left alone.
export function attachEdgeOpen(drawer) {
  const panel = drawer.querySelector('.drawer-panel');
  const w = () => panel.offsetWidth;
  const EDGE = 20; // px from the left edge where a touch may start
  let touching = false;
  const place = (x) => {
    panel.style.transform = `translateX(${-w() + x}px)`;
    drawer.style.setProperty('--bd', String(x / w()));
  };
  const settle = (x, transition, done) => {
    panel.style.transition = transition;
    panel.style.transform = x === null ? '' : `translateX(${x}px)`;
    if (done) setTimeout(done, 240);
  };
  const drag = makeDrag({
    axis: 'x', sign: 1, from: 8,
    onFollow: (s) => {
      if (!drawer.open) {
        openSheet(drawer); // no entrance animation: the panel is placed by the finger
        panel.style.animation = 'none';
        panel.style.transition = 'none';
      }
      place(Math.min(w(), s));
    },
    onRelease: (s, v) => {
      const open = s > 0.35 * w() || v > 0.5;
      if (reducedMotion()) {
        if (open) { panel.style.transform = 'translateX(0px)'; drawer.style.setProperty('--bd', '1'); } else closeNow(drawer);
        return;
      }
      if (open) settle(0, 'transform 220ms cubic-bezier(.2,.8,.2,1)', () => { panel.style.transition = ''; drawer.style.setProperty('--bd', '1'); });
      else settle(-w(), 'transform 220ms cubic-bezier(.4,0,1,1)', () => closeNow(drawer));
    },
  });
  const anyModalOpen = () => !!document.querySelector('dialog[open]');
  document.addEventListener('touchstart', (e) => {
    touching = false;
    if (!phone() || anyModalOpen() || e.touches.length !== 1) return;
    const t = e.touches[0];
    if (t.clientX > EDGE) return;
    touching = true;
    drag.begin(t.clientX, t.clientY, e.timeStamp);
  }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!touching) return;
    const t = e.touches[0];
    drag.move(t.clientX, t.clientY, e.timeStamp, e);
  }, { passive: false }); // non-passive: preventDefault once the horizontal drag is recognised
  const end = () => { if (touching) { touching = false; drag.end(); } };
  document.addEventListener('touchend', end);
  document.addEventListener('touchcancel', end);
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

// ---------- entrance pass: runs only on the renders that ask for it (load and year changes) ----------
export function enterPass(root) {
  // One rule for every block on the dashboard: cards, tiles, notices and hints, in page order.
  const cards = root.querySelectorAll('.card, .tile, .warn, .hint, .notice-restore, .yactions');
  cards.forEach((el, i) => { el.classList.add('stagger'); el.style.setProperty('--i', i); });
  root.querySelectorAll('.slips .row').forEach((el, i) => el.style.setProperty('--i', i));
  root.querySelectorAll('.slips .chip').forEach((el, i) => el.style.setProperty('--i', i));
  countUps(root);
}
