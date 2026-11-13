// Page 1 of a PDF as positioned text items. pdfjs is passed in, so the same code
// runs in the browser (pdf.js UMD global) and in Node tests.
export async function itemsFromPdf(data, pdfjs) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(data), verbosity: 0 }).promise;
  const page = await doc.getPage(1);
  const content = await page.getTextContent();
  return content.items
    .map(i => ({ str: i.str.trim(), x: i.transform[4], y: i.transform[5] }))
    .filter(i => i.str !== '');
}
