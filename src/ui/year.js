// Year page: the year's totals from yearSummary. Printable on one page (see the print rules in styles.css).
import { fmtEur, fmtEur2, monthRange } from './format.js';

// through: the last month covered by the opening balance (0 when none).
export function yearBody(year, s, through = 0) {
  const stat = (label, value, note = '') => `<section class="card ystat"><p class="lbl">${label}</p><p class="ystat-v">${value}</p>${note ? `<p class="ystat-n">${note}</p>` : ''}</section>`;
  const holiday = s.holidayDaysLeft == null ? '—' : `${s.holidayDaysLeft} <small>${s.holidayDaysLeft === 1 ? 'day' : 'days'}</small>`;
  return `<section class="year-page">
    <section class="card yhero">
      <p class="lbl">Taxable income ${year}</p>
      <p class="yhero-v">${fmtEur(s.taxable)}</p>
      <p class="ystat-n">${s.monthsCovered} of 12 months covered</p>
    </section>
    <div class="ystats">
      ${stat('Net pay', fmtEur(s.net))}
      ${stat('Tax withheld', fmtEur(s.tax))}
      ${stat('Pension (TyEL)', s.tyelComplete ? fmtEur(s.tyel) : `${fmtEur(s.tyel)} <small>partial</small>`)}
      ${stat('Unemployment insurance', s.tyelComplete ? fmtEur2(s.unemployment) : `${fmtEur2(s.unemployment)} <small>partial</small>`)}
      ${stat('Phone benefit', fmtEur2(s.phoneBenefit))}
      ${stat('Lunch deduction', fmtEur2(s.lunchDeduction))}
      ${stat('Holiday left', holiday)}
    </div>
    ${s.tyelComplete ? '' : `<section class="card ynote"><p>${monthRange(through) ?? 'Earlier months'} not included in the pension and unemployment totals. <button class="linkish" type="button" data-action="opening">Add them in the opening balance ›</button></p></section>`}
    <div class="yactions"><button class="btn-print" type="button" data-action="print">Print this page</button></div>
  </section>`;
}
