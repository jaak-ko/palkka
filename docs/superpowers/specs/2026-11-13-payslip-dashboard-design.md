# Palkka: design

A static, in-browser dashboard for Finnish payslips. Add each monthly payslip PDF and see the
year so far: cumulative pay before and after tax, how much is left on the tax card
(verokortti), and a warning before the tax card income limit runs out.

## Why

Payslips arrive as PDFs and are hard to follow over a year. The most useful thing to know
early is when the tax card income limit will be exceeded: after it, withholding jumps from the
base percentage to the (much higher) extra percentage until a new tax card is ordered.

## Goals

- Add payslip PDFs (one or several) and see the dashboard update immediately.
- Show: cumulative pay before and after tax by month; tax card left, base and extra
  percentages, month the limit runs out; where each month's gross went; year-end forecast;
  holiday days left; payslip count and missing months.
- Help with the tax card: an estimate of what happens if nothing changes, an income figure to
  ask the tax authority for, and a link to order a new tax card.
- Explain pay changes between months, show what is kept of each extra 100 euros, and give a
  printable year summary (pension, unemployment insurance, benefits).
- Feel native as a home-screen web app on a phone; work well on a wide desktop screen.

## Non-goals

- Syncing between devices, accounts, or any backend.
- A native app, share-sheet integration, or automatic import from a folder.
- Parsing payslip formats other than the supported one.

## Anti-goals

- Payslip data (pay, personal ID number, bank account) leaving the device. No backend,
  analytics, third-party API or AI/OCR service.
- A wrong number saved silently: what was read is always shown for confirmation first.
- Committing real payslips to the repository.

## Constraints and decisions

- **Hosting:** static site on GitHub Pages. All parsing and storage happen in the browser
  (pdf.js from a CDN, IndexedDB for data).
- **The PDFs are the archive.** The app is a view built from them: if browser data is lost,
  re-add the PDFs and it rebuilds.
- Re-adding a slip replaces the stored one with the same pay period; it never duplicates.
- Installable as a home-screen web app (manifest and icons).
- UI text in English, Finnish number formats (`41 150 €`, `17,0 %`), labels from the payslip
  stay in Finnish where shown. Light and dark themes follow the system; layout follows width.

## The payslip

One page of real text (not a scan) in a fixed grid. The extracted text order is scrambled, so
values are read **by position**: a label is a small text item and its value is the item in the
same cell below it (right-aligned). Numbers use Finnish format (`1 234,56`, `-78,90`).

| Field | Label on the slip |
|---|---|
| Pay period, pay date | Palkkakausi, Ajalta |
| Gross | Kokonaispalkka |
| Net paid | Maksetaan |
| Tax withheld | Ennakonpidätys (period box) |
| Pension (TyEL), unemployment insurance | pay lines 902, 903 |
| Taxable income | Enn.pid.al.ansio (period box) |
| Tax card base %, extra %, income limit | Verokortti box |
| Income counted against the limit so far | Kumulat. verotiedot, top-right number |
| Holiday days left | Lomaa jäljellä |

Pay lines (code, name, amount) come from the Palkkalaji table and are kept, including unknown
ones. The tax-card meter uses the cumulative figure from the slip, not the app's own sum.

## Opening balance

Months before the first payslip in the app are represented by one entry per year:
`{ year, throughMonth, gross, tax, net, tyel, unemployment, grossFrozen }`. Gross is computed
from the earliest slip (cumulative tax-card income minus that slip's taxable income) unless
the user edits it. Tax, net and the contributions are typed once and may be unknown (null).
The chart draws these months as one dotted segment, not as invented monthly points.

## Calculations

- Latest slip = highest (year, month), never insertion order. Tax card values come from it.
- Tax card left = limit minus cumulative income. Over the limit: left is 0 and "over by" shows.
- Forecast: each remaining month equals the latest slip's taxable income. The month the limit
  runs out is the first forecast month whose cumulative income exceeds it.
- Extra withholding = forecast income above the limit times (extra % minus base %).
- A past month with no slip and not in the opening balance is "missing", not forecast.
- Totals and the chart use taxable income (what the tax card counts).
- Tax advice is an **estimate**: annual tax is interpolated from the tax authority's published
  example rates and calibrated against the user's own tax card; the UI says the tax
  authority's own calculation decides.

## UI

Nordic Night look: ring gauge hero for the tax card, warning card, stat tiles, cumulative
chart with the limit line and crossing marker, "where it went" breakdown, payslip list with
change chips, Year page, confirm sheet with a live "gross minus deductions matches net" check.
Phone: single column with a fixed Add payslip button. Wide screens: sidebar plus grid.
