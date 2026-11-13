// Finnish number formats: narrow no-break space for thousands, comma decimals, no-break space before the unit.
const THIN = ' ';
const NBSP = ' ';
const MINUS = '−';

function fmtNum(n, decimals) {
  const [int, dec] = Math.abs(n).toFixed(decimals).split('.');
  const neg = n < 0 && Number(Math.abs(n).toFixed(decimals)) !== 0;
  return (neg ? MINUS : '') + int.replace(/\B(?=(\d{3})+(?!\d))/g, THIN) + (dec ? ',' + dec : '');
}

export const fmtEur = (n) => fmtNum(n, 0) + NBSP + '€';
export const fmtEur2 = (n) => fmtNum(n, 2) + NBSP + '€';
export const fmtPct = (n) => (n == null ? '—' : fmtNum(n, 1) + NBSP + '%');
// Signed euros for deltas: +10,07 € / −20,00 €. Zero has no sign.
export const fmtSigned = (n) => {
  const abs = fmtEur2(Math.abs(n));
  return Math.abs(n) < 0.005 ? abs : (n > 0 ? '+' : MINUS) + abs;
};
// Whole-euro rounding to the nearest 10, for "about" figures.
export const about = (n) => fmtEur(Math.round(Math.abs(n) / 10) * 10);
// Month range for the months before the first payslip, e.g. "Jan–Mar"; null when none are known.
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthRange = (through) => (through >= 1 ? `Jan–${SHORT_MONTHS[through - 1]}` : null);
export const earlierMonths = (through) => monthRange(through) ?? 'earlier months';
// Plain Finnish decimal for editable fields, e.g. 1234.5 -> "1234,5".
export const plain = (n) => (n == null ? '' : String(n).replace('.', ','));
// Escapes text from PDFs and files before it goes into innerHTML.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
