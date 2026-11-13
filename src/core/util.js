// Helpers shared by the dashboard, advice and summary modules.

// Euro amounts are plain numbers, rounded to cents.
export const round2 = n => Math.round(n * 100) / 100;

// Same period replaces: the last one given wins.
export const uniqueByPeriod = list => [...new Map(list.map(p => [p.period, p])).values()];

// Months 1..12 that are covered by the opening (1..throughMonth) or by a slip.
export function coveredMonths(slips, throughMonth = 0) {
  const months = new Set(slips.map(p => p.month));
  for (let m = 1; m <= throughMonth; m++) months.add(m);
  return months.size;
}
