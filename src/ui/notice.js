// Per-device dismissal of the tax card notice. The dismissal is tied to the current tax card, so a renewed card
// (different limit or rates on the latest payslip) shows the notice again. Storage may be unavailable (private
// mode, blocked site data); then nothing is remembered and the notice simply shows.
const KEY = 'palkka.taxNoticeDismissed';

// The tax card of a payslip, as a string: year|limit|base%|extra%.
export const noticeSignature = (p) => `${p.year}|${p.taxCard.limit}|${p.taxCard.basePct}|${p.taxCard.extraPct}`;

export function isNoticeDismissed(sig) {
  try {
    return globalThis.localStorage?.getItem(KEY) === sig;
  } catch {
    return false;
  }
}

export function dismissNotice(sig) {
  try {
    globalThis.localStorage?.setItem(KEY, sig);
  } catch {
    // not remembered; the notice stays visible
  }
}

export function showNoticeAgain() {
  try {
    globalThis.localStorage?.removeItem(KEY);
  } catch {
    // nothing stored to remove
  }
}
