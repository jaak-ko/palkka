// Tax card fixer: what happens if nothing changes, and what to ask Vero. An estimate, Vero's own calculation decides.
import { fmtEur, fmtPct, about, earlierMonths } from './format.js';
import { openSheet, closeSheet, attachSheetMotion } from './motion.js';

export const VERO_ORDER_URL = 'https://www.vero.fi/henkiloasiakkaat/verokortti-ja-veroilmoitus/verokortti/tilaa-uusi-verokortti/';
const ICON = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></svg>';

// Refund sentence, shared with the warning card.
export function refundSentence(refund) {
  return refund >= 0
    ? `Projected refund next spring about ${about(refund)}.`
    : `You may owe about ${about(refund)} next spring.`;
}

// Opens the fixer as a dialog. onOpening() is called when the user taps the earlier-months note.
export function openFixer(a, { year, through, onOpening }) {
  const dlg = document.createElement('dialog');
  dlg.className = 'sheet';
  const pctRest = a.suggestedPctForRestOfYear == null ? '—' : fmtPct(a.suggestedPctForRestOfYear);
  dlg.innerHTML = `<form method="dialog" class="fixer">
    <div class="grab"></div>
    <div class="sh-head"><div class="sh-ico">${ICON}</div><div><h2>Tax card fixer</h2><p>Estimate for ${year}</p></div></div>

    <section class="fx">
      <p class="lbl">If nothing changes</p>
      <p class="fx-big">${fmtEur(a.withheldIfNothingChanges)} withheld this year</p>
      <p class="fx-sub">Expected tax about ${fmtEur(a.expectedAnnualTax)}. ${refundSentence(a.projectedRefund)}</p>
      <p class="fx-sub">${fmtEur(a.extraWithholdingVsBase)} of it is extra withholding above your base rate.</p>
    </section>

    <section class="fx">
      <p class="lbl">Ask Vero for an estimated annual income of</p>
      <p class="fx-big">${fmtEur(a.incomeToEnterAtVero)}</p>
      <button class="copy" type="button" data-copy="${a.incomeToEnterAtVero}">Copy amount</button>
    </section>

    <section class="fx">
      <p class="lbl">Rate for the rest of the year</p>
      <p class="fx-big">${pctRest}</p>
      <p class="fx-sub">The withholding rate that would bring the year to the expected tax.</p>
    </section>

    ${a.withheldYtdEstimated ? `<button class="fx-note" type="button" data-open>Tax for ${earlierMonths(through)} is not entered yet, so this uses your tax card rate. Add it in the opening balance ›</button>` : ''}
    <p class="fx-est">Estimate calibrated on your tax card and Vero's published example rates. Vero's own calculation decides.</p>
    <a class="fx-link" href="${VERO_ORDER_URL}" target="_blank" rel="noopener noreferrer">Order a new tax card at vero.fi</a>
    <button class="ghost" type="submit" value="close">Close</button>
  </form>`;

  dlg.querySelector('[data-copy]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(String(a.incomeToEnterAtVero));
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = `Select ${a.incomeToEnterAtVero}`; // no clipboard permission: the number stays visible
    }
  });
  dlg.querySelector('[data-open]')?.addEventListener('click', () => {
    closeSheet(dlg, 'cancel');
    onOpening();
  });
  dlg.addEventListener('close', () => dlg.remove());
  document.body.append(dlg);
  attachSheetMotion(dlg);
  openSheet(dlg);
}
