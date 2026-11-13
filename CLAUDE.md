# palkka

Payslip dashboard for Finnish employees: add monthly payslip PDFs, see the year's pay, taxes
and tax card (verokortti) status. Static site on GitHub Pages; everything runs in the browser.

## Start here

- Design: `docs/superpowers/specs/2026-11-13-payslip-dashboard-design.md`.
- Structure and data shapes: `docs/architecture.md`.
- Tests: `node --test`. Serve locally with `python3 -m http.server 8000`.

## Hard rules

- **No payslip data leaves the device.** No backend, analytics, external APIs, AI/OCR
  services. Libraries may load from a CDN; data never goes anywhere.
- **Never commit real payslips or real figures.** They contain personal data. Real PDFs for
  tests go in `fixtures/` (git-ignored). Committed tests and docs use fictional data only.
- **Nothing is saved without the user confirming the numbers read** (the confirm sheet).
- Smallest stack that does the job well; no build step.
- Finnish number format everywhere (`41 150 €`, `17,0 %`); UI text in English.
