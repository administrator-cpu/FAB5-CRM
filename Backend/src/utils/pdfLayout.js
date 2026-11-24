// Shared layout for generated company documents (CAF, PO): A4 page, branded header,
// footer, gradient accents and the table/signature helpers used by both generators.
const path = require("path");
const PDFDocument = require("pdfkit");
const { COMPANY } = require("../templates/company");

const LOGO_PATH = path.resolve(__dirname, "../../public/fab5_logo.png");

// ─────────── Layout constants (A4, points) ───────────
const PAGE = { width: 595.28, height: 841.89 };
const MARGIN = { top: 100, bottom: 45, left: 40, right: 40 };
const CONTENT_WIDTH = PAGE.width - MARGIN.left - MARGIN.right;
const HEADER_TOP = 24;
const HEADER_RULE_Y = MARGIN.top - 14;

// Orange → red, sampled from the FAB5 logo.
const BRAND_GRADIENT_STOPS = [[0, "#F3972D"], [0.45, "#CE5C32"], [1, "#BB262E"]];

const COLORS = {
  text: "#1F1F1F",
  muted: "#666666",
  border: "#9A9A9A",
  labelFill: "#F4F4F4",
};

const FONT = { regular: "Helvetica", bold: "Helvetica-Bold" };
const NA = "N/A";

// ─────────── Value helpers ───────────
const valueOrNA = (value) => {
  if (value === undefined || value === null) return NA;
  const str = String(value).trim();
  return str ? str : NA;
};

const formatNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? new Intl.NumberFormat("en-IN").format(num) : NA;
};

const formatDate = (date) => date.toLocaleDateString("en-IN", {
  day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata",
});

// "<Customer Name>_<Opportunity No>_<suffix>.pdf", with characters that aren't allowed in file names removed.
const documentFileName = (customerName, opportunityId, suffix) => {
  const safeName = String(customerName || "")
    .replace(/[\\/:*?"<>|\x00-\x1F]/g, "")
    .replace(/\s+/g, " ")
    .trim() || "Customer";
  return `${safeName}_${opportunityId}_${suffix}.pdf`;
};

// ─────────── Gradient ───────────
// Horizontal logo gradient spanning x1 → x2 (usable as fill, stroke or text colour).
const brandGradient = (doc, x1, x2) => {
  const gradient = doc.linearGradient(x1, 0, x2, 0);
  BRAND_GRADIENT_STOPS.forEach(([offset, color]) => gradient.stop(offset, color));
  return gradient;
};

// Writes a single line of text filled with the logo gradient.
const gradientText = (doc, text, x, y, { width = CONTENT_WIDTH, align = "left" } = {}) => {
  const textWidth = Math.min(doc.widthOfString(text), width);
  const startX = align === "center" ? x + (width - textWidth) / 2 : align === "right" ? x + width - textWidth : x;
  doc.fillColor(brandGradient(doc, startX, startX + textWidth))
    .text(text, x, y, { width, align, lineBreak: false });
  doc.fillColor(COLORS.text);
};

// ─────────── Header / footer ───────────
// Company details (left), logo (centre) and a gradient rule at ruleY.
const drawHeader = (doc, { ruleY = HEADER_RULE_Y } = {}) => {
  const leftWidth = 180;

  doc.fillColor(COLORS.text).font(FONT.bold).fontSize(9)
    .text(COMPANY.name, MARGIN.left, HEADER_TOP, { width: leftWidth });
  doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.muted)
    .text(COMPANY.address, { width: leftWidth })
    .text(COMPANY.contact, { width: leftWidth });

  const logoWidth = 110;
  doc.image(LOGO_PATH, (PAGE.width - logoWidth) / 2, HEADER_TOP - 6, { width: logoWidth });

  const ruleEnd = PAGE.width - MARGIN.right;
  doc.moveTo(MARGIN.left, ruleY).lineTo(ruleEnd, ruleY)
    .lineWidth(1.2).strokeColor(brandGradient(doc, MARGIN.left, ruleEnd)).stroke();
};

// Header and footer are stamped on every page after the content is laid out
// (drawing them from a "pageAdded" handler breaks pdfkit's text flow mid-paragraph).
// firstPageHeader, when given, replaces the standard header on page 1; header: false stamps footers only.
// footerCenter adds a centred footer line; pageNumbers: false drops the "Page X of Y" text.
const stampHeadersAndFooters = (doc, { footerLeft, footerCenter, firstPageHeader, header = true, pageNumbers = true } = {}) => {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    if (header) {
      if (i === range.start && firstPageHeader) firstPageHeader(doc);
      else drawHeader(doc);
    }

    // Footer sits inside the bottom margin, so disable the margin temporarily to avoid an auto page break.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font(FONT.regular).fontSize(7).fillColor(COLORS.muted);
    if (footerLeft) {
      doc.text(footerLeft, MARGIN.left, PAGE.height - 28, { width: CONTENT_WIDTH / 2, lineBreak: false });
    }
    if (footerCenter) {
      doc.text(footerCenter, MARGIN.left, PAGE.height - 28, { width: CONTENT_WIDTH, align: "center", lineBreak: false });
    }
    if (pageNumbers) {
      doc.text(`Page ${i + 1} of ${range.count}`, MARGIN.left + CONTENT_WIDTH / 2, PAGE.height - 28, {
        width: CONTENT_WIDTH / 2, align: "right", lineBreak: false,
      });
    }
    doc.page.margins.bottom = bottom;
  }
};

// ─────────── Flow helpers ───────────
const bottomLimit = () => PAGE.height - MARGIN.bottom;

const ensureSpace = (doc, height) => {
  if (doc.y + height > bottomLimit()) doc.addPage();
};

const sectionBar = (doc, title) => {
  ensureSpace(doc, 40);
  const y = doc.y;
  doc.rect(MARGIN.left, y, CONTENT_WIDTH, 17).fill(brandGradient(doc, MARGIN.left, MARGIN.left + CONTENT_WIDTH));
  doc.fillColor("#FFFFFF").font(FONT.bold).fontSize(9.5)
    .text(title.toUpperCase(), MARGIN.left + 8, y + 4.5, { width: CONTENT_WIDTH - 16, lineBreak: false });
  doc.fillColor(COLORS.text);
  doc.x = MARGIN.left;
  doc.y = y + 17;
};

// Bordered label | value table.
const detailRows = (doc, rows, { labelWidth = 165 } = {}) => {
  const valueWidth = CONTENT_WIDTH - labelWidth;
  const pad = 6;

  rows.forEach(([label, value]) => {
    doc.font(FONT.regular).fontSize(9);
    const textHeight = Math.max(
      doc.heightOfString(label, { width: labelWidth - pad * 2 }),
      doc.heightOfString(value, { width: valueWidth - pad * 2 }),
    );
    const rowHeight = Math.max(18, textHeight + 8);
    ensureSpace(doc, rowHeight);
    const y = doc.y;

    doc.rect(MARGIN.left, y, labelWidth, rowHeight).fillAndStroke(COLORS.labelFill, COLORS.border);
    doc.rect(MARGIN.left + labelWidth, y, valueWidth, rowHeight).lineWidth(0.6).stroke(COLORS.border);

    doc.fillColor(COLORS.text).font(FONT.bold).fontSize(9)
      .text(label, MARGIN.left + pad, y + 4.5, { width: labelWidth - pad * 2 });
    doc.font(FONT.regular)
      .text(value, MARGIN.left + labelWidth + pad, y + 4.5, { width: valueWidth - pad * 2 });

    doc.x = MARGIN.left;
    doc.y = y + rowHeight;
  });
  doc.y += 8;
};

// Bordered grid with a shaded bold header row. columns: [{ title, width }], rows: [[cell, ...]].
// repeatHeader: draw the header row again at the top of each new page (long tables).
const gridTable = (doc, columns, rows, { fontSize = 9, repeatHeader = false } = {}) => {
  const pad = 6;
  const cellFont = (isHeader, i) => (isHeader || (i === 0 && columns[0].boldFirst) ? FONT.bold : FONT.regular);
  const drawRow = (cells, isHeader) => {
    doc.fontSize(fontSize);
    const rowHeight = Math.max(18, ...cells.map((cell, i) =>
      doc.font(cellFont(isHeader, i)).heightOfString(cell, { width: columns[i].width - pad * 2 }) + 8));
    if (!isHeader && repeatHeader && doc.y + rowHeight > bottomLimit()) {
      doc.addPage();
      drawRow(columns.map((c) => c.title), true);
    }
    ensureSpace(doc, rowHeight);
    const y = doc.y;
    let x = MARGIN.left;
    cells.forEach((cell, i) => {
      const { width } = columns[i];
      if (isHeader) doc.rect(x, y, width, rowHeight).lineWidth(0.6).fillAndStroke(COLORS.labelFill, COLORS.border);
      else doc.rect(x, y, width, rowHeight).lineWidth(0.6).stroke(COLORS.border);
      doc.fillColor(COLORS.text).font(cellFont(isHeader, i))
        .text(cell, x + pad, y + 4.5, { width: width - pad * 2, align: columns[i].align || "left" });
      x += width;
    });
    doc.x = MARGIN.left;
    doc.y = y + rowHeight;
  };

  drawRow(columns.map((c) => c.title), true);
  rows.forEach((cells) => drawRow(cells, false));
  doc.y += 8;
};

// Writes a paragraph made of bold/regular runs.
const writeRuns = (doc, runs, x, width, align, { fontSize = 8.5 } = {}) => {
  doc.fillColor(COLORS.text).fontSize(fontSize);
  runs.forEach((run, i) => {
    const options = { width, align, continued: i < runs.length - 1, lineGap: 1 };
    doc.font(run.bold ? FONT.bold : FONT.regular);
    if (i === 0) doc.text(run.text, x, doc.y, options);
    else doc.text(run.text, options);
  });
  doc.x = MARGIN.left;
};

// Section heading written in the logo gradient. keepWithNext reserves room so it isn't stranded at a page bottom.
const gradientHeading = (doc, text, { align = "left", fontSize = 10, keepWithNext = 30 } = {}) => {
  ensureSpace(doc, keepWithNext);
  doc.y += 6;
  doc.font(FONT.bold).fontSize(fontSize);
  const headingY = doc.y;
  gradientText(doc, text, MARGIN.left, headingY, { align });
  doc.x = MARGIN.left;
  doc.y = headingY + doc.currentLineHeight(true) + 4;
};

// signatureAt: index of the label whose line is signed on; it's recorded in doc.signatureBoxes
// (like signatureCaption) so eSign can stamp there.
const signRow = (doc, labels, { gapBefore = 18, signatureAt } = {}) => {
  ensureSpace(doc, gapBefore + 10);
  doc.y += gapBefore;
  const y = doc.y;
  doc.font(FONT.regular).fontSize(8.5).fillColor(COLORS.text);
  const labelWidths = labels.map((label) => doc.widthOfString(label) + 4);
  const lineWidth = (CONTENT_WIDTH - labelWidths.reduce((a, b) => a + b, 0)) / labels.length;

  let x = MARGIN.left;
  labels.forEach((label, i) => {
    doc.text(label, x, y, { lineBreak: false });
    const lineStart = x + labelWidths[i];
    doc.moveTo(lineStart, y + 9).lineTo(lineStart + lineWidth - 14, y + 9)
      .lineWidth(0.6).stroke(COLORS.border);
    if (i === signatureAt) {
      // y is the top of the row: the labels sit on the line itself, so the stamp goes above them.
      const range = doc.bufferedPageRange();
      (doc.signatureBoxes ||= []).push({ page: range.start + range.count, x: lineStart, y, width: lineWidth - 14 });
    }
    x += labelWidths[i] + lineWidth;
  });
  doc.x = MARGIN.left;
  doc.y = y + 24;
};

// Blank space above each signature line: room to sign by hand, or for e-Hastakshar's eSign stamp
// (about 140 × 70 pt) to sit on the line.
const SIGNATURE_SPACE = 78;

// Draws the signature line + caption and records where it is (doc.signatureBoxes) so eSign can place
// the stamp on it. page is 1-based; x / y / width are in points from the top-left, y being the line.
const signatureCaption = (doc, text) => {
  ensureSpace(doc, SIGNATURE_SPACE + 18);
  doc.y += SIGNATURE_SPACE;
  const width = 250;
  const x = PAGE.width - MARGIN.right - width;
  const range = doc.bufferedPageRange();
  (doc.signatureBoxes ||= []).push({ page: range.start + range.count, x, y: doc.y, width });
  doc.moveTo(x, doc.y).lineTo(x + width, doc.y).lineWidth(0.6).stroke(COLORS.border);
  doc.font(FONT.bold).fontSize(8.5).fillColor(COLORS.text)
    .text(text, x, doc.y + 4, { width, align: "center" });
  doc.x = MARGIN.left;
  doc.y += 4;
};

// ─────────── Watermark ───────────
// Faint diagonal company name across the middle of every generated page (also used by the PO
// stamped onto a template in documentGenerators).
const WATERMARK = { text: "Fab Five Network Pvt. Ltd.", fontSize: 46, opacity: 0.1, angle: -45 };

const stampWatermark = (doc) => {
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    // Drawn on top of the content, so the margin is lifted to keep pdfkit from adding a page.
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.save();
    doc.rotate(WATERMARK.angle, { origin: [PAGE.width / 2, PAGE.height / 2] });
    doc.font(FONT.bold).fontSize(WATERMARK.fontSize).fillColor(COLORS.text).fillOpacity(WATERMARK.opacity);
    // Wider than the page: the rotated line runs corner to corner.
    doc.text(WATERMARK.text, -PAGE.width / 2, PAGE.height / 2 - WATERMARK.fontSize / 2, {
      width: PAGE.width * 2, align: "center", lineBreak: false,
    });
    doc.restore();
    doc.page.margins.bottom = bottom;
  }
};

// ─────────── Document wrapper ───────────
// Creates an A4 document, runs draw(doc), watermarks every page and resolves with the PDF bytes.
// The Buffer also carries pageCount and signatureBoxes (see signatureCaption), used to place eSign stamps.
const renderPdf = ({ title, subject, margins = MARGIN }, draw) => new Promise((resolve, reject) => {
  try {
    const doc = new PDFDocument({
      size: "A4",
      margins,
      bufferPages: true,
      info: { Title: title, Author: COMPANY.name, Subject: subject },
    });

    const chunks = [];
    let pageCount = 0;
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => {
      const pdf = Buffer.concat(chunks);
      pdf.pageCount = pageCount;
      pdf.signatureBoxes = doc.signatureBoxes || [];
      resolve(pdf);
    });
    doc.on("error", reject);

    draw(doc);
    stampWatermark(doc);
    pageCount = doc.bufferedPageRange().count;
    doc.end();
  } catch (error) {
    reject(error);
  }
});

module.exports = {
  LOGO_PATH, PAGE, MARGIN, CONTENT_WIDTH, HEADER_TOP, HEADER_RULE_Y, COLORS, FONT, NA,
  valueOrNA, formatNumber, formatDate, documentFileName,
  brandGradient, gradientText, gradientHeading,
  drawHeader, stampHeadersAndFooters,
  bottomLimit, ensureSpace, sectionBar, detailRows, gridTable, writeRuns, signRow, signatureCaption, SIGNATURE_SPACE,
  WATERMARK,
  renderPdf,
};
