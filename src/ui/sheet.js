// Confirm sheet: a modal <dialog> (bottom sheet on phone, centred on Mac). Resolves with the typed strings on Save, null on Cancel.
import { parseFiNumber } from '../core/parse.js';
import { esc } from './format.js';
import { openSheet, attachSheetMotion } from './motion.js';

const isNum = (s) => { try { parseFiNumber(s); return true; } catch { return false; } };
export const checks = {
  num: isNum,
  nonNeg: (s) => isNum(s) && parseFiNumber(s) >= 0,
  month: (s) => /^\d{1,2}$/.test(s) && Number(s) >= 1 && Number(s) <= 12,
  period: (s) => /^\d{1,2}\/\d{4}\/\d+$/.test(s),
};

const ICON_DOC = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/></svg>';
const ICON_OK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"/></svg>';
const ICON_WARN = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/></svg>';

// fields: { name, label, value, kind: 'num'|'text', check?, optional?, readonly?, group: 'main'|'tiles', dot?, net? }
// status(values) -> { ok, text }  (shown live above the fields)
// derive(values) -> { [readonlyName]: string }  (recomputed live)
export function askFields({ title, subtitle = '', text = '', fields, save = 'Save', status, derive, icon = ICON_DOC }) {
  return new Promise((resolve) => {
    const main = fields.filter((f) => f.group !== 'tiles');
    const tiles = fields.filter((f) => f.group === 'tiles');
    const dlg = document.createElement('dialog');
    dlg.className = 'sheet';
    const rowHtml = (f) => `<div class="row-f${f.net ? ' net' : ''}"><label for="f-${esc(f.name)}">${f.dot ? `<i class="dot" style="background:${f.dot}"></i>` : ''}${esc(f.label)}</label>
        <input id="f-${esc(f.name)}" name="${esc(f.name)}" value="${esc(f.value)}" inputmode="decimal" autocomplete="off" spellcheck="false"${f.readonly ? ' readonly tabindex="-1"' : ''}></div>`;
    const tileHtml = (f) => `<div class="tf"><label for="f-${esc(f.name)}">${esc(f.label)}</label>
        <input id="f-${esc(f.name)}" name="${esc(f.name)}" value="${esc(f.value)}" inputmode="${f.kind === 'text' ? 'text' : 'decimal'}" autocomplete="off" spellcheck="false"></div>`;
    dlg.innerHTML = `<form method="dialog">
      <div class="grab"></div>
      <div class="sh-head"><div class="sh-ico">${icon}</div><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ''}</div></div>
      ${status ? '<div class="status" aria-live="polite"></div>' : ''}
      ${text ? `<p class="lbl">${esc(text)}</p>` : ''}
      ${main.length ? `<div class="grp">${main.map(rowHtml).join('')}</div>` : ''}
      ${tiles.length ? `<div class="tgrid">${tiles.map(tileHtml).join('')}</div>` : ''}
      <p class="need" aria-live="polite"></p>
      <div class="acts"><button class="add" type="submit" value="ok">${esc(save)}</button><button class="ghost" type="submit" value="cancel" formnovalidate>Cancel</button></div>
    </form>`;

    const inputs = Object.fromEntries([...dlg.querySelectorAll('input')].map((i) => [i.name, i]));
    const okBtn = dlg.querySelector('button[value=ok]');
    const need = dlg.querySelector('.need');
    const statusEl = dlg.querySelector('.status');
    const valuesNow = () => Object.fromEntries(Object.entries(inputs).map(([k, i]) => [k, i.value.trim()]));

    const update = () => {
      const values = valuesNow();
      if (derive) {
        for (const [name, v] of Object.entries(derive(values))) inputs[name].value = v;
      }
      const editable = fields.filter((f) => !f.readonly);
      const missing = editable.filter((f) => {
        const s = inputs[f.name].value.trim();
        if (s === '') return !f.optional;
        return !(f.check ?? (f.kind === 'text' ? () => true : checks.num))(s);
      });
      need.textContent = missing.length ? `Missing or unreadable: ${missing.map((f) => f.label).join(', ')}` : '';
      okBtn.disabled = missing.length > 0;
      if (statusEl && status) {
        const st = status(valuesNow());
        statusEl.className = `status ${st.ok ? 'ok' : 'warn'}`;
        statusEl.innerHTML = `${st.ok ? ICON_OK : ICON_WARN}<span>${esc(st.text)}</span>`;
      }
    };
    Object.values(inputs).forEach((i) => i.addEventListener('input', update));

    dlg.addEventListener('close', () => {
      const out = dlg.returnValue === 'ok' ? valuesNow() : null;
      dlg.remove();
      resolve(out);
    });
    document.body.append(dlg);
    attachSheetMotion(dlg);
    openSheet(dlg);
    update();
  });
}
