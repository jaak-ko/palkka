import { fmtEur, fmtEur2, fmtPct, fmtSigned, about, esc, monthRange, earlierMonths } from './format.js';
import { cumulativeChart } from './charts.js';
import { breakdown } from '../core/calc.js';
import { comparePayslips } from '../core/compare.js';
import { refundSentence } from './fixer.js';
import { noticeSignature, isNoticeDismissed } from './notice.js';
import { round2 } from '../core/util.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
  'August', 'September', 'October', 'November', 'December'];
const ICON = (d, w = 18) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const PLUS = ICON('<path d="M12 5v14M5 12h14"/>', 20);
const WARN = ICON('<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>');
const TIP = `<p class="tip">Tip: open your payslip folder and tap Select All. Payslips you already added are skipped.</p>`;
const MENU = ICON('<path d="M4 7h16M4 12h16M4 17h16"/>', 20);
const CHEV_L = ICON('<path d="M15 18l-6-6 6-6"/>');
const CHEV_R = ICON('<path d="M9 18l6-6-6-6"/>');
const RING_ARC = 518.36; // 3/4 of the ring, the track length
const RING_GAP = 691.15;

const paidOn = (iso) => {
  const [, m, d] = (iso ?? '').split('-').map(Number);
  return d && m ? `Paid ${d}.${m}.` : '';
};
const monthOf = (period) => Number(period.split('/')[0]);

// renderDashboard(el, model, payslips, ui). payslips are ascending (store order).
// ui: { years, yearCounts, selected, hasOpening, advice (TaxCardAdvice|null) }.
// Taps are data-action attributes, handled in app.js.
export function renderDashboard(el, model, payslips = [], ui = {}) {
  const { year, taxCard: tc, series, monthsCovered, monthsInYear, missingMonths, latestPeriod } = model;
  const years = ui.years ?? [year];
  const counts = ui.yearCounts ?? {};
  const latest = payslips.find((p) => p.period === latestPeriod);
  const opening = series.find((s) => s.kind === 'opening');
  const first = payslips[0];
  const through = opening?.month ?? (first ? first.month - 1 : 0);
  const idx = years.indexOf(year);

  const navCtx = { years, counts, year, payslips, latestPeriod, missingMonths, through, ui, covered: monthsCovered, total: monthsInYear };
  const side = `<aside class="side nav" aria-label="Years and payslips">${navHtml({ ...navCtx, brand: true, addClass: 'add-side' })}</aside>`;

  const yearArrows = years.length > 1
    ? `<div class="yarrows"><button class="yarrow" type="button" data-action="year-step" data-step="-1" aria-label="Previous year"${idx <= 0 ? ' disabled' : ''}>${CHEV_L}</button><button class="yarrow" type="button" data-action="year-step" data-step="1" aria-label="Next year"${idx >= years.length - 1 ? ' disabled' : ''}>${CHEV_R}</button></div>`
    : '';
  const advice = ui.advice;
  const dismissed = !!latest && !!advice?.applicable && isNoticeDismissed(noticeSignature(latest));
  const pill = latest && advice?.applicable
    ? `<button class="pill-head${dismissed ? ' is-off' : ''}" type="button" data-action="fixer">${ICON('<path d="M12 8v5M12 17h.01"/><circle cx="12" cy="12" r="9"/>', 14)}Tax card needs updating</button>`
    : '';
  const header = `<header class="top"><button class="menu-btn" type="button" data-action="menu" aria-label="Open menu">${MENU}</button><div>
      <h1 class="h1">Your ${year}</h1>
    </div>
    <div class="top-r">${yearArrows}${pill}</div></header>`;

  let body;
  if (!latestPeriod) body = `<section class="card empty"><p>Add your first payslip to see your year.</p><button class="add add-empty" type="button" data-action="add">${PLUS}Add payslips</button>${TIP}</section>`;
  else body = mainBody({ model, payslips, ui, latest, opening, through, dismissed });

  el.innerHTML = `<div class="shell">${side}<div class="main"><div class="main-inner">${header}${body}</div></div></div>`;
  // The phone drawer shows the same navigation; the app puts it in the drawer.
  return navHtml({ ...navCtx, brand: false, addClass: 'add-drawer', tip: true });
}

// Year totals, after the stat tiles. The print button prints only this card (see the print rules in styles.css).
// The figures of the payslips the user has added, summed here (not the opening balance): each row is complete for
// the months it covers, so nothing is shown as partial.
export function addedTotals(payslips) {
  const sum = (k) => round2(payslips.reduce((t, p) => t + (p[k] ?? 0), 0));
  const line = (code) => round2(payslips.reduce((t, p) => t + p.lines.filter((l) => l.code === code).reduce((u, l) => u + l.amount, 0), 0));
  return {
    count: payslips.length, gross: sum('gross'), tax: sum('tax'), tyel: sum('tyel'), unemployment: sum('unemployment'),
    net: sum('net'), phone: line('304'), lunch: Math.abs(line('920')),
  };
}

// The one calm prompt for the months before the first payslip (the after-tax totals need their tax and net).
function earlierPrompt(through, cls = '') {
  const range = monthRange(through);
  if (!range) return '';
  return `<section class="prompt-card ${cls}">
    <div class="pc-text"><p class="pc-t">After-tax totals need ${range}</p><p class="pc-b">Add tax and net from your last payslip before these, once.</p></div>
    <button class="pc-btn" type="button" data-action="opening">Add ${range}</button>
  </section>`;
}

function yearTotalsHtml(year, payslips, through, hasOpening) {
  if (!payslips.length) return '';
  const t = addedTotals(payslips);
  const row = (label, value) => `<div class="yt-row"><span>${label}</span><span>${value}</span></div>`;
  return `<section class="card ytotals">
    <div class="card-h"><h2>Year totals</h2><span class="sm">${year}</span></div>
    <p class="yt-scope">From your ${t.count} payslip${t.count === 1 ? '' : 's'}</p>
    <p class="yt-print-head">Palkka · Year ${year}</p>
    ${row('Gross, before tax', fmtEur(t.gross))}
    ${row('Tax withheld', fmtEur(t.tax))}
    ${row('Pension (TyEL)', fmtEur2(t.tyel))}
    ${row('Unemployment insurance', fmtEur2(t.unemployment))}
    ${row('Net pay', fmtEur(t.net))}
    ${row('Phone benefit', fmtEur2(t.phone))}
    ${row('Lunch deduction', fmtEur2(t.lunch))}
    ${!hasOpening ? earlierPrompt(through, 'pc-compact') : ''}
    <button class="btn-print no-print" type="button" data-action="print">Print year summary</button>
  </section>`;
}

// The two rates as one row of two centred columns: the current rate, and the next rate (above the limit).
const RATE_UP = '<svg class="rate-up" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
// The next rate is shown only close to the limit: under 20 % of the limit still left, or already over it.
const NEXT_RATE_SHARE = 0.2;
function ratesHtml(tc) {
  if (tc.basePct == null) return '';
  const close = tc.overBy > 0 || tc.left <= tc.limit * NEXT_RATE_SHARE;
  const current = `<div class="rate"><p class="k">Current tax rate</p><p class="v">${fmtPct(tc.basePct)}</p></div>`;
  if (!close) return `<div class="rates single">${current}</div>`;
  return `<div class="rates">
    ${current}
    <div class="rate rate-next"><p class="k">Next rate</p><p class="v">${fmtPct(tc.extraPct)}${RATE_UP}</p><p class="rate-sub">above your limit</p></div>
  </div>`;
}

function mainBody({ model, payslips, ui, latest, opening, through, dismissed }) {
  const { year, taxCard: tc, totals, series, holidayDaysLeft, yearEndForecastGross, monthsCovered, monthsInYear } = model;
  const wide = matchMedia('(min-width: 900px)').matches; // chart geometry follows the layout; app.js redraws on change
  const over = tc.overBy > 0;
  const netKnown = series.every((s) => s.cumNet != null) && totals.net != null;
  const advice = ui.advice;

  // Ring (phone) and bar (wide) show the same used/limit/forecast.
  const used = tc.used;
  const arc = over ? RING_ARC : Math.min(1, used / tc.limit) * RING_ARC;
  const left = over ? 0 : tc.left;
  const sub = over ? `over by ${fmtEur(tc.overBy)}` : `${fmtEur(used)} of ${fmtEur(tc.limit)}`;
  const gauge = `<div class="gauge">
      <svg width="260" height="260" viewBox="0 0 260 260" role="img" aria-label="${fmtPct(used / tc.limit * 100)} of the tax card limit used">
        <circle cx="130" cy="130" r="110" fill="none" style="stroke:var(--track)" stroke-width="18" stroke-linecap="round" stroke-dasharray="${RING_ARC} ${RING_GAP}" transform="rotate(135 130 130)"/>
        <circle class="arc" cx="130" cy="130" r="110" fill="none" style="stroke:${over ? 'var(--red)' : 'var(--amber)'}" stroke-width="18" stroke-linecap="round" stroke-dasharray="${arc.toFixed(2)} ${RING_GAP}" transform="rotate(135 130 130)"/>
        <circle cx="130" cy="130" r="88" fill="none" style="stroke:var(--grid)" stroke-width="1" stroke-dasharray="2 6"/>
      </svg>
      <div class="gauge-c"><p class="lbl">Earned in ${year}</p><p class="g-num" data-count="${totals.gross}" data-fmt="eur">${fmtEur(totals.gross)}</p><p class="g-sub">of ${fmtEur(tc.limit)} (tax card limit)</p></div>
    </div>`;

  const ringLeft = `<p class="ring-left">${over ? `Over by <b>${fmtEur(tc.overBy)}</b> on your tax card` : `<b>${fmtEur(left)}</b> left on your tax card`}</p>`;
  const heroL = `<div class="heroL"><p class="lbl">Left on your tax card</p><p class="big" data-count="${left}" data-fmt="eur">${fmtEur(left)}</p>
    <p class="rate-line">Rate <b>${fmtPct(tc.basePct)}</b> now, <span class="r">${fmtPct(tc.extraPct)}</span> above the limit</p>
    ${ratesHtml(tc)}</div>`;

  const ratesPhone = ratesHtml(tc);

  // Wide bar: scale so the limit sits at 88.5 % of the track, as in the design.
  const scale = Math.max(tc.limit * 1.13, yearEndForecastGross * 1.01);
  const pc = (v) => (v / scale) * 100;
  const bar = `<div class="bar-block"><div class="bar-track">
      <div class="bar-used" style="width:${pc(used)}%"></div>
      <div class="bar-fore" style="left:${pc(used)}%;width:${pc(Math.max(0, yearEndForecastGross - used))}%"></div>
      <div class="bar-limit" style="left:${pc(tc.limit)}%"></div>
    </div>
    <div class="bar-legend"><span><i class="sw" style="background:var(--amber)"></i>${fmtEur(used)} used</span>
      <span><i class="sw" style="background:var(--forecast-a)"></i>Forecast ${fmtEur(yearEndForecastGross)}</span>
      <span class="lim"><i class="sw" style="width:2px;height:12px;background:var(--red)"></i>Limit ${fmtEur(tc.limit)}</span></div></div>`;

  // Both slots are always in the page while the notice applies, so dismissing and restoring only flip classes.
  let warn = '';
  if (advice?.applicable) {
    const title = over ? 'Over the tax card limit' : `Limit runs out in ${MONTHS[tc.runsOutMonth - 1]}`;
    const extraLine = over
      ? 'Extra tax is already being withheld.'
      : `About ${about(advice.extraWithholdingVsBase)} more tax withheld by year end.`;
    warn = `<div class="notice-slot${dismissed ? ' collapsed' : ''}" id="notice-slot"><div class="notice-inner"><section class="warn"><button class="warn-x" type="button" data-action="dismiss-notice" aria-label="Dismiss tax card notice">×</button><div class="warn-ico">${WARN}</div><div><p class="warn-t">${title}</p>
      <p class="warn-b">${extraLine} ${refundSentence(advice.projectedRefund)}</p>
      <button class="warn-btn" type="button" data-action="fixer">See the tax card fixer ›</button></div></section></div></div>`;
    // Hidden by the user: the fixer and the Vero link stay reachable from here.
    warn += `<div class="restore-slot${dismissed ? ' open' : ''}" id="restore-slot"><div class="restore-inner"><button class="notice-restore" type="button" data-action="show-notice">Show tax card notice</button></div></div>`;
  }

  const hero = `<section class="card hero">${gauge}${ringLeft}${heroL}${ratesPhone}<div class="barWrap">${bar}${warn}</div></section>`;

  const tiles = `<div class="tiles">
    <section class="tile"><p class="k"><i class="dot" style="background:var(--blue)"></i>Before tax</p><p class="v" data-count="${totals.gross}" data-fmt="eur">${fmtEur(totals.gross)}</p></section>
    ${netKnown
      ? `<section class="tile"><p class="k"><i class="dot" style="background:var(--green)"></i>After tax</p><p class="v" data-count="${totals.net}" data-fmt="eur">${fmtEur(totals.net)}</p></section>`
      : `<section class="tile tap" role="button" tabindex="0" data-action="opening"><p class="k"><i class="dot" style="background:var(--green)"></i>After tax</p><p class="v">–</p></section>`}
    <section class="tile"><p class="k">Year-end forecast</p><p class="v" data-count="${yearEndForecastGross}" data-fmt="eur">${fmtEur(yearEndForecastGross)}</p></section>
    <section class="tile"><p class="k">Holiday left</p><p class="v">${holidayDaysLeft == null ? '—' : `${holidayDaysLeft} <small>${holidayDaysLeft === 1 ? 'day' : 'days'}</small>`}</p></section>
  </div>`;

  const opening0 = series.find((s) => s.kind === 'opening');
  const caption = opening0 ? `Dotted: ${monthRange(opening0.month)} opening balance and forecast` : 'Dotted: forecast';
  const chart = `<section class="card chart-card">
    <div class="card-h"><h2>Cumulative pay</h2><span class="sm">Jan–Dec</span></div>
    <div class="chart-legend"><span><i class="lg-line" style="background:var(--blue)"></i>Before tax</span>${netKnown ? '<span><i class="lg-line" style="background:var(--green)"></i>After tax</span>' : ''}<span><i class="lg-line" style="background:none;border-top:2px dotted var(--muted)"></i>Opening / forecast</span></div>
    ${cumulativeChart(series, tc.limit, wide)}
    ${netKnown ? '' : earlierPrompt(through)}
    <p class="chart-note">${caption}</p>
  </section>`;

  let where = '';
  const shown = payslips.find((p) => p.period === (ui.selected ?? latest?.period));
  if (shown) {
    const b = breakdown(shown);
    const pct = (v) => (v / shown.gross) * 100;
    const parts = [['var(--green)', 'To you', b.net], ['var(--amber)', 'Tax', b.tax], ['var(--purple)', 'Pension', b.pension], ['var(--grey)', 'Other', b.other]];
    where = `<section class="card where-card">
      <div class="card-h"><h2>Where ${MONTHS[shown.month - 1]} went</h2><span class="where-amt">${fmtEur(shown.gross)}</span></div>
      <p class="where-big">${fmtEur(shown.gross)}</p>
      <div class="stack">${parts.map(([c, , v]) => `<div style="width:${pct(v)}%;background:${c};border-radius:6px"></div>`).join('')}</div>
      <div class="legend2">${parts.map(([c, n, v]) => `<div><span class="l"><i class="dot" style="background:${c}"></i>${n}</span><span>${fmtPct(pct(v))}</span></div>`).join('')}</div>
      <div class="where-list">${parts.map(([c, n, v]) => `<div><span class="l"><i class="dot" style="background:${c}"></i>${n}</span><span><b>${fmtEur2(v)}</b><span class="p">${fmtPct(pct(v))}</span></span></div>`).join('')}</div>
    </section>`;
  }

  const slips = `<section class="card slips slips-main"><div class="card-h"><h2>Payslips <span class="sm">· ${monthsCovered} of ${monthsInYear}</span></h2></div>${listHtml(payslips, model.missingMonths, through, ui)}</section>`;
  const detailOpen = !!ui.selected && payslips.some((p) => p.period === ui.selected);
  const detail = `<div class="detail-wrap${detailOpen ? ' open' : ''}" id="detail-wrap"><div class="detail-inner">${slipDetailHtml(payslips, ui)}</div></div>`;
  return `${hero}${tiles}${yearTotalsHtml(year, payslips, through, !!ui.hasOpening)}<div class="split">${chart}${where}</div>${slips}${detail}`;
}

// The navigation shared by the Mac sidebar and the phone drawer: year, payslips, add.
export function navHtml({ years, counts, year, payslips, latestPeriod, missingMonths, through, ui, brand, addClass, tip = false, covered, total }) {
  return `${brand ? '<div class="brand"><div class="mark">p</div><span>palkka</span></div>' : ''}
    <div class="side-sec"><p>Year</p>${years.map((y) => `<button class="yr${y === year ? ' on' : ''}" type="button" data-action="year" data-year="${y}"${y === year ? ' aria-current="true"' : ''}><span>${y}</span>${counts[y] != null ? `<span class="c">${counts[y]}/12</span>` : ''}</button>`).join('')}</div>
    <div class="side-sec"><p>Payslips · ${covered} of ${total}</p><div class="slips-side">${latestPeriod ? listHtml(payslips, missingMonths, through, ui) : ''}</div></div>
    <div class="side-foot"><button class="add ${addClass}" type="button" data-action="add">${PLUS}Add payslips</button>${tip ? TIP : ''}</div>`;
}

// Payslip rows (newest first), a net-change chip on each row that has an earlier slip, missing months,
// the opening row. The detail of the tapped slip is in slipDetailHtml, in the main view.
function listHtml(payslips, missing, through, ui) {
  const selected = ui.selected ? payslips.find((p) => p.period === ui.selected) : null;
  const rows = [
    ...payslips.map((p) => {
      const cmp = comparePayslips(payslips, p.period);
      const chip = cmp && Math.abs(cmp.netDelta) >= 0.005
        ? `<span class="chip ${cmp.netDelta >= 0 ? 'up' : 'down'}">${fmtSigned(cmp.netDelta)}</span>`
        : '';
      return { m: p.month, html: `<button class="row${p.period === ui.selected ? ' on' : ''}" type="button" data-action="pick" data-period="${esc(p.period)}"><span><span class="n" style="display:block">${MONTHS[p.month - 1]}</span><span class="s">${paidOn(p.payDate)}</span></span><span class="row-r">${chip}<span class="pay-amt">${fmtEur2(p.net)}</span></span></button>` };
    }),
    ...missing.filter((m) => m > through).map((m) => ({ m, html: `<button class="row missing" type="button" data-action="add" aria-label="Add a payslip for ${MONTHS[m - 1]}"><span class="rlead"><span class="mk" aria-hidden="true"></span><span><span class="n" style="display:block">${MONTHS[m - 1]}</span><span class="s">No payslip</span></span></span></button>` })),
  ].sort((a, b) => b.m - a.m);
  if (through >= 1) {
    const label = monthRange(through);
    rows.push({
      m: 0,
      html: ui.hasOpening
        ? `<button class="row sub" type="button" data-action="opening"><span><span class="n" style="display:block">${label}</span><span class="s">Opening balance</span></span><span class="pay-amt">›</span></button>`
        : `<button class="row sub" type="button" data-action="opening"><span><span class="n" style="display:block">${label}</span><span class="s">No opening balance</span></span><span class="pay-amt">›</span></button>`,
    });
  }
  return rows.map((r) => r.html).join('');
}

// The tapped payslip's detail, in the main view: the change against the previous month, the pay lines, and Delete.
export function slipDetailHtml(payslips, ui) {
  const selected = ui.selected ? payslips.find((p) => p.period === ui.selected) : null;
  if (!selected) return '';
  const cmp = comparePayslips(payslips, selected.period);
  const compare = cmp
    ? `<p class="lbl">Compared with ${MONTHS[monthOf(cmp.prevPeriod) - 1]}</p>
       <div class="line strong"><span>Net pay</span>${Math.abs(cmp.netDelta) < 0.005 ? '<span style="color:var(--sub)">No change</span>' : `<span class="${cmp.netDelta > 0 ? 'up' : 'down'}">${fmtSigned(cmp.netDelta)}</span>`}</div>
       ${cmp.rows.map((r) => `<div class="line"><span>${esc(r.code)} ${esc(r.name)}</span><span class="${r.delta >= 0 ? 'up' : 'down'}">${fmtSigned(r.delta)}</span></div>`).join('')}`
    : `<p class="lbl">No earlier payslip to compare with</p>`;
  return `<section class="card slip-detail" id="slip-detail">
    <div class="card-h"><h2>${MONTHS[selected.month - 1]} ${selected.year}</h2></div>
    <p class="src">${paidOn(selected.payDate)}${selected.source ? ` · <span title="${esc(selected.source)}">${esc(selected.source)}</span>` : ''}</p>
    ${compare}
    <p class="lbl detail-h">Pay lines</p>
    ${selected.lines.map((l) => `<div class="line"><span>${esc(l.code)} ${esc(l.name)}</span><span>${fmtEur2(l.amount)}</span></div>`).join('')}
    <button class="del" type="button" data-action="delete" data-period="${esc(selected.period)}">Delete this payslip</button>
  </section>`;
}
