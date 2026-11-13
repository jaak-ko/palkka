# Architecture

Plain ES modules, no build step. Tests: `node --test` (Node 20+; `pdfjs-dist` is the only
dev dependency).

## `src/core/` (pure logic, no DOM)

| File | Exports |
|---|---|
| `parse.js` | `parsePayslip(items) -> Payslip`, `parseFiNumber`, `NotAPayslipError` |
| `pdf-items.js` | `itemsFromPdf(data, pdfjs)`: page-1 text items with x/y |
| `calc.js` | `buildDashboard(year, payslips, opening, now?)`, `computeOpeningGross`, `breakdown` |
| `advice.js` | `estimateAnnualTax`, `calibrationFromCard`, `taxCardAdvice` |
| `compare.js` | `comparePayslips(payslips, period)` |
| `summary.js` | `keepOfHundred`, `yearSummary`, `reconcile` |
| `store.js` | `openStore()`: IndexedDB (payslips by period, opening balance by year) |
| `opening-file.js` | `serializeOpening`, `parseOpening`, `openingFileName` |

## `src/ui/` (rendering and events)

`app.js` wires the store to the views; `dashboard.js`, `charts.js`, `year.js`, `fixer.js`,
`sheet.js` (confirm sheet), `add-payslip.js`, `opening.js`, `format.js` (Finnish formats),
`styles.css` (themes and layout).

## Data shapes

```js
// Payslip (stored per slip; key = period)
{ period: "10/2026/1", year, month, payDate: "2026-10-30",
  gross, net, tax, tyel, unemployment, taxableIncome,
  taxCard: { basePct, extraPct, limit, cumulativeIncome },
  holidayDaysLeft,
  lines: [{ code, name, amount }] }

// OpeningBalance (one per year)
{ year, throughMonth, gross, tax, net, tyel, unemployment, grossFrozen }  // tax/net/tyel/unemployment may be null

// Dashboard (computed; the UI only reads this)
{ year, taxCard: { limit, used, left, overBy, basePct, extraPct, runsOutMonth, extraTaxEstimate },
  totals: { gross, net, tax }, yearEndForecastGross, holidayDaysLeft,
  monthsCovered, monthsInYear, missingMonths,
  series: [{ month, cumGross, cumNet, kind: "opening" | "actual" | "forecast" }],
  latestPeriod }
```

All euro amounts are numbers in euros, rounded to cents at the parse boundary.

## Testing and real payslips

Real payslips contain a personal ID number and bank account and must never be committed.
Parser tests that need real PDFs read them from `fixtures/` (git-ignored) together with
`fixtures/expected.json`, and skip when those are missing. Committed tests use synthetic
data only.
