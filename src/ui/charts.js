// Hand-drawn SVG cumulative chart, geometry from the Nordic Night designs (Mac: 760x260, phone: 310x160).
// Months are points at the end of each month; month 0 is the start of the year (0 €).
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function cumulativeChart(series, limit, wide = false) {
  const W = wide ? 760 : 310;
  const H = wide ? 260 : 160;
  const padL = wide ? 40 : 10;
  const padR = wide ? 20 : 10;
  const base = wide ? 230 : 140; // y of 0 €
  const limY = wide ? 54.4 : 35.5; // y of the tax card limit
  const X = (m) => +(padL + (m * (W - padL - padR)) / 12).toFixed(1);
  const maxV = Math.max(limit, ...series.map((s) => s.cumGross));
  const k = Math.min((base - limY) / limit, (base - (wide ? 10 : 8)) / maxV); // € → px
  const Y = (v) => +(base - v * k).toFixed(1);
  const pt = (m, v) => `${X(m)},${Y(v)}`;

  const opening = series.find((s) => s.kind === 'opening');
  const actual = series.filter((s) => s.kind !== 'forecast'); // includes the opening point
  const fc = series.filter((s) => s.kind === 'forecast');
  const last = actual[actual.length - 1];
  const netKnown = series.every((s) => s.cumNet != null);

  // Grid and axis labels (wide only).
  let grid = '';
  if (wide) {
    for (let v = 10000; Y(v) >= 38; v += 10000) {
      grid += `<line x1="${padL}" y1="${Y(v)}" x2="${W - padR}" y2="${Y(v)}" style="stroke:var(--grid)"/>`;
      grid += `<text x="34" y="${Y(v) + 4}" font-size="11" text-anchor="end" style="fill:var(--muted)">${v / 1000}k</text>`;
    }
  }

  // Lines for one key ('cumGross' or 'cumNet'): dotted ramp from 0 to the opening, solid actuals, dotted forecast.
  const line = (key, color) => {
    let out = '';
    if (opening) {
      out += `<polyline points="${X(0)},${base} ${pt(opening.month, opening[key])}" fill="none" style="stroke:${color}" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>`;
    }
    out += `<polyline points="${actual.map((s) => pt(s.month, s[key])).join(' ')}" fill="none" style="stroke:${color}" stroke-width="2.5" stroke-linejoin="round"/>`;
    if (fc.length) {
      out += `<polyline points="${[last, ...fc].map((s) => pt(s.month, s[key])).join(' ')}" fill="none" style="stroke:${color}" stroke-width="1.5" stroke-dasharray="1 5" stroke-linecap="round"/>`;
    }
    return out;
  };

  // Area under before-tax pay up to the last actual month.
  const area = `<polygon points="${[`${X(0)},${base}`, ...actual.map((s) => pt(s.month, s.cumGross)), `${X(last.month)},${base}`].join(' ')}" style="fill:var(--blue)" fill-opacity=".1"/>`;

  // Limit-crossing marker: where the before-tax line first passes the limit.
  const j = series.findIndex((s) => s.cumGross > limit);
  let crossing = '';
  if (j >= 0) {
    const cur = series[j];
    const prev = j > 0 ? series[j - 1] : { month: 0, cumGross: 0 };
    const f = (limit - prev.cumGross) / (cur.cumGross - prev.cumGross);
    const xm = prev.month + f * (cur.month - prev.month);
    const x = +(padL + (xm * (W - padL - padR)) / 12).toFixed(1);
    crossing = `<circle cx="${x}" cy="${limY}" r="4.5" style="fill:var(--card);stroke:var(--red)" stroke-width="2.5"/>
      <text x="${x}" y="${limY + (wide ? 22 : 16)}" font-size="11" text-anchor="middle" style="fill:var(--red)">${MON[cur.month - 1]}</text>`;
  }

  const monthLabels = wide ? MON.map((m, i) => [i + 1, m]) : [[1, 'Jan'], [8, 'Aug'], [10, 'Oct'], [12, 'Dec']];
  const labels = monthLabels.map(([m, name]) => {
    const isOct = m === 10;
    const x = wide ? X(m) : m === 1 ? X(0) : m === 12 ? X(12) : X(m);
    const anchor = !wide && m === 12 ? 'end' : !wide && m === 1 ? 'start' : 'middle';
    return `<text x="${x}" y="${H - (wide ? 10 : 4)}" font-size="11" text-anchor="${anchor}" style="fill:${isOct ? 'var(--ink)' : 'var(--muted)'}"${isOct ? ' font-weight="600"' : ''}>${name}</text>`;
  }).join('');

  const ly = limY;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Cumulative pay by month against the ${fmtLimit(limit)} tax card limit${j >= 0 ? `, crossed in ${MON[series[j].month - 1]}` : ''}">
  ${grid}
  <line x1="${padL}" y1="${base}" x2="${W - padR}" y2="${base}" style="stroke:var(--axis)"/>
  <line x1="${padL}" y1="${ly}" x2="${W - padR}" y2="${ly}" style="stroke:var(--red)" stroke-width="1.2" stroke-dasharray="5 4"/>
  <text x="${padL + 6}" y="${ly - (wide ? 6 : 6)}" font-size="${wide ? 12 : 11}" font-weight="600" style="fill:var(--red)">Tax card limit ${fmtLimit(limit)}</text>
  ${area}
  ${line('cumGross', 'var(--blue)')}
  ${netKnown ? line('cumNet', 'var(--green)') : ''}
  <circle cx="${X(last.month)}" cy="${Y(last.cumGross)}" r="${wide ? 6 : 5}" style="fill:var(--blue);stroke:var(--card)" stroke-width="3"/>
  ${netKnown ? `<circle cx="${X(last.month)}" cy="${Y(last.cumNet)}" r="${wide ? 6 : 5}" style="fill:var(--green);stroke:var(--card)" stroke-width="3"/>` : ''}
  ${crossing}
  ${labels}
</svg>`;
}

// 12000 -> "12 000 €" with a plain space.
function fmtLimit(n) {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' €';
}
