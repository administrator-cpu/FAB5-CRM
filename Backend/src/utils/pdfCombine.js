const { PDFDocument } = require("pdf-lib");

// Joins documents into one PDF for a single eSign request (the customer signs once) and splits the
// signed copy back into the separate documents the CRM keeps.

/**
 * @param {{docType: string, pdf: Buffer, layout?: {signatureBoxes?: object[]}}[]} documents - in page order
 * @returns {Promise<{pdf: Buffer, layout: {pageCount: number, signatureBoxes: object[]}, parts: {docType: string, fromPage: number, pageCount: number}[]}>}
 *   layout carries each document's signature lines moved to their page in the combined PDF.
 */
const combinePdfs = async (documents) => {
  const combined = await PDFDocument.create();
  const parts = [];
  const signatureBoxes = [];
  for (const { docType, pdf, layout } of documents) {
    const source = await PDFDocument.load(pdf);
    const pages = await combined.copyPages(source, source.getPageIndices());
    const fromPage = combined.getPageCount() + 1;
    pages.forEach((page) => combined.addPage(page));
    parts.push({ docType, fromPage, pageCount: pages.length });
    for (const box of layout?.signatureBoxes || []) {
      signatureBoxes.push({ page: box.page + fromPage - 1, x: box.x, y: box.y, width: box.width });
    }
  }
  return {
    pdf: Buffer.from(await combined.save()),
    layout: { pageCount: combined.getPageCount(), signatureBoxes },
    parts,
  };
};

/**
 * Cuts a signed combined PDF back into its parts (pages after the last part are ignored).
 * @returns {Promise<{docType: string, pdf: Buffer}[]|null>} null when the PDF has fewer pages than the parts need.
 */
const splitPdf = async (pdf, parts) => {
  const source = await PDFDocument.load(pdf);
  const needed = Math.max(...parts.map((part) => part.fromPage + part.pageCount - 1));
  if (source.getPageCount() < needed) return null;

  const result = [];
  for (const { docType, fromPage, pageCount } of parts) {
    const out = await PDFDocument.create();
    const indices = Array.from({ length: pageCount }, (_, i) => fromPage - 1 + i);
    (await out.copyPages(source, indices)).forEach((page) => out.addPage(page));
    result.push({ docType, pdf: Buffer.from(await out.save()) });
  }
  return result;
};

module.exports = { combinePdfs, splitPdf };
