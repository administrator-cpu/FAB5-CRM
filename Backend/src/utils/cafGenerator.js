const {
  PAGE, MARGIN, CONTENT_WIDTH, HEADER_TOP, COLORS, FONT, NA,
  valueOrNA, formatNumber, formatDate, gradientText, gradientHeading,
  drawHeader, stampHeadersAndFooters, bottomLimit, ensureSpace,
  sectionBar, detailRows, writeRuns, signRow, signatureCaption, renderPdf,
} = require("./pdfLayout");
const {
  PHOTO_BOX_TEXT, ACCEPTANCE_DECLARATION, OFFICE_USE_LINES,
  IP_JUSTIFICATION_ROWS, IP_UTILIZATION, TERMS_BLOCKS,
} = require("../templates/cafContent");

// Page 1 only: the header is taller so the photo box fits on its right, above the header line.
const PHOTO_BOX = { width: 80, height: 92 };
PHOTO_BOX.x = PAGE.width - MARGIN.right - PHOTO_BOX.width;
PHOTO_BOX.y = HEADER_TOP - 6;
const FIRST_PAGE_RULE_Y = PHOTO_BOX.y + PHOTO_BOX.height + 8;

const drawFirstPageHeader = (doc) => {
  drawHeader(doc, { ruleY: FIRST_PAGE_RULE_Y });
  doc.rect(PHOTO_BOX.x, PHOTO_BOX.y, PHOTO_BOX.width, PHOTO_BOX.height)
    .lineWidth(0.8).dash(3, { space: 2 }).stroke(COLORS.border).undash();
  doc.font(FONT.regular).fontSize(7).fillColor(COLORS.muted)
    .text(PHOTO_BOX_TEXT, PHOTO_BOX.x + 3, PHOTO_BOX.y + PHOTO_BOX.height / 2 - 8, {
      width: PHOTO_BOX.width - 6, align: "center",
    });
};

// ─────────── Page 1: Customer Application Form ───────────
const drawFirstPage = (doc, data) => {
  // CAF No and Date fill the gap under the company address (left of the header, above the line).
  const metaY = FIRST_PAGE_RULE_Y - 34;
  const dateText = formatDate(data.date || new Date());
  doc.fontSize(9.5).fillColor(COLORS.text);
  [["CAF No: ", data.opportunityId], ["Date: ", dateText]].forEach(([label, value], i) => {
    doc.font(FONT.bold).text(label, MARGIN.left, metaY + i * 14, { continued: true, lineBreak: false })
      .font(FONT.regular).text(value, { lineBreak: false });
  });

  // Only the title sits under the header line.
  const rowY = FIRST_PAGE_RULE_Y + 12;
  doc.font(FONT.bold).fontSize(14);
  gradientText(doc, "Customer Application Form (CAF)", MARGIN.left, rowY, { align: "center" });

  doc.x = MARGIN.left;
  doc.y = rowY + 28;

  const { customer, billing, connection } = data;
  const isIll = connection.serviceType === "ILL";
  const ipCount = Number(connection.ipCount) || 0;

  sectionBar(doc, "General Information");
  detailRows(doc, [
    ["Customer Name", valueOrNA(customer.name)],
    ["Type of Applicant", valueOrNA(customer.customerType)],
    ["Contact Person", valueOrNA(customer.person)],
    ["Mobile Number", valueOrNA(customer.mobile)],
    ["Email", valueOrNA(customer.email)],
  ]);

  sectionBar(doc, "Billing");
  detailRows(doc, [
    ["GST Number", valueOrNA(billing?.gstNumber)],
    ["Street Address", valueOrNA(billing?.address?.street)],
    ["City", valueOrNA(billing?.address?.city)],
    ["State", valueOrNA(billing?.address?.state)],
    ["Pincode", valueOrNA(billing?.address?.pincode)],
  ]);

  sectionBar(doc, "Service Details");
  detailRows(doc, [
    ["Service Type", valueOrNA(connection.serviceType)],
    ["A-End BTS ID", valueOrNA(connection.aEndBtsId)],
    ["A-End Address", valueOrNA(connection.aEndAddress)],
    ["B-End BTS ID", isIll ? NA : valueOrNA(connection.bEndBtsId)],
    ["B-End Address", isIll ? NA : valueOrNA(connection.bEndAddress)],
  ]);

  sectionBar(doc, "Financial Charges Details");
  const financialRows = [
    ["Bandwidth", connection.bandwidth ? `${connection.bandwidth} Mbps` : NA],
    ["Rate Per MB", connection.ratePerMb ? `Rs. ${formatNumber(connection.ratePerMb)}` : NA],
    ["Required Static IP", ipCount > 0 ? "Yes" : "No"],
  ];
  if (ipCount > 0) financialRows.push(["No. of IP(s)", String(ipCount)]);
  detailRows(doc, financialRows);

  sectionBar(doc, "Customer Acceptance");
  doc.y += 6;
  writeRuns(doc, [{ text: ACCEPTANCE_DECLARATION, bold: false }], MARGIN.left, CONTENT_WIDTH, "justify");
  signatureCaption(doc, "Signature of the Authorized person with Company Seal");
  signRow(doc, ["Name", "Date", "Place"], { gapBefore: 14 });
};

// ─────────── Pages 2+: terms, declarations and forms ───────────
const drawOfficeBox = (doc) => {
  const lineHeight = 15;
  const height = 26 + OFFICE_USE_LINES.length * lineHeight;
  ensureSpace(doc, height + 16);
  doc.y += 14;
  const y = doc.y;

  doc.rect(MARGIN.left, y, CONTENT_WIDTH, height).lineWidth(0.8).stroke(COLORS.border);
  doc.font(FONT.bold).fontSize(9).fillColor(COLORS.text)
    .text("For office use only", MARGIN.left + 8, y + 8, { width: CONTENT_WIDTH - 16 });
  doc.font(FONT.regular).fontSize(8);
  OFFICE_USE_LINES.forEach((line, i) => {
    doc.text(line, MARGIN.left + 8, y + 24 + i * lineHeight, { width: CONTENT_WIDTH - 16, lineBreak: false, ellipsis: true });
  });
  doc.x = MARGIN.left;
  doc.y = y + height + 6;
};

const drawDiagramBox = (doc) => {
  doc.y += 8;
  const height = bottomLimit() - doc.y - 10;
  doc.rect(MARGIN.left, doc.y, CONTENT_WIDTH, height).lineWidth(0.8).stroke(COLORS.border);
  doc.y += height;
};

const drawIpJustificationTable = (doc) => {
  const cols = [28, 250, CONTENT_WIDTH - 278];
  const pad = 5;
  doc.y += 6;

  IP_JUSTIFICATION_ROWS.forEach((label, i) => {
    doc.font(FONT.regular).fontSize(8.5);
    const rowHeight = Math.max(18, doc.heightOfString(label, { width: cols[1] - pad * 2 }) + 8);
    ensureSpace(doc, rowHeight);
    const y = doc.y;
    let x = MARGIN.left;
    cols.forEach((w) => {
      doc.rect(x, y, w, rowHeight).lineWidth(0.6).stroke(COLORS.border);
      x += w;
    });
    doc.fillColor(COLORS.text)
      .text(String(i + 1), MARGIN.left, y + 4.5, { width: cols[0], align: "center" })
      .text(label, MARGIN.left + cols[0] + pad, y + 4.5, { width: cols[1] - pad * 2 });
    doc.x = MARGIN.left;
    doc.y = y + rowHeight;
  });
  doc.y += 10;
};

const drawIpUtilizationTable = (doc) => {
  const cols = [300, 100, CONTENT_WIDTH - 400];
  const pad = 5;
  doc.font(FONT.bold).fontSize(8.5);

  ensureSpace(doc, 20);
  let y = doc.y;
  doc.rect(MARGIN.left, y, CONTENT_WIDTH, 18).lineWidth(0.6).fillAndStroke(COLORS.labelFill, COLORS.border);
  doc.fillColor(COLORS.text).text(IP_UTILIZATION.title, MARGIN.left, y + 5, { width: CONTENT_WIDTH, align: "center" });
  doc.y = y + 18;

  const headerHeight = Math.max(...IP_UTILIZATION.columns.map((c, i) =>
    doc.heightOfString(c, { width: cols[i] - pad * 2 }))) + 10;
  const rows = [IP_UTILIZATION.columns, ...Array(IP_UTILIZATION.emptyRows).fill(["", "", ""])];

  rows.forEach((cells, r) => {
    const rowHeight = r === 0 ? headerHeight : 18;
    ensureSpace(doc, rowHeight);
    y = doc.y;
    let x = MARGIN.left;
    cells.forEach((cell, i) => {
      doc.rect(x, y, cols[i], rowHeight).lineWidth(0.6).stroke(COLORS.border);
      if (cell) {
        doc.font(r === 0 ? FONT.bold : FONT.regular).fontSize(8).fillColor(COLORS.text)
          .text(cell, x + pad, y + 5, { width: cols[i] - pad * 2, align: i === 0 ? "left" : "center" });
      }
      x += cols[i];
    });
    doc.x = MARGIN.left;
    doc.y = y + rowHeight;
  });
  doc.y += 10;
};

const drawTermsPages = (doc) => {
  doc.addPage();
  const itemIndent = 20;
  const subIndent = 38;

  TERMS_BLOCKS.forEach((block) => {
    switch (block.type) {
      case "pageBreak":
        doc.addPage();
        break;
      case "heading":
        gradientHeading(doc, block.text, { align: block.align === "center" ? "center" : "left" });
        break;
      case "para": {
        ensureSpace(doc, 14);
        const x = MARGIN.left + (block.indent ? itemIndent : 0);
        writeRuns(doc, block.runs, x, CONTENT_WIDTH - (x - MARGIN.left), block.align);
        doc.y += 4;
        break;
      }
      case "item": {
        ensureSpace(doc, 14);
        const indent = block.level > 0 ? subIndent : itemIndent;
        const labelX = MARGIN.left + indent - (block.level > 0 ? 16 : 20);
        const y = doc.y;
        doc.font(FONT.regular).fontSize(8.5).fillColor(COLORS.text)
          .text(block.label, labelX, y, { width: 18, lineBreak: false });
        doc.y = y;
        writeRuns(doc, block.runs, MARGIN.left + indent, CONTENT_WIDTH - indent, block.align);
        doc.y += 3;
        break;
      }
      case "signature":
        signatureCaption(doc, block.text);
        break;
      case "signRow":
        signRow(doc, block.labels);
        break;
      case "officeBox":
        drawOfficeBox(doc);
        break;
      case "diagramBox":
        drawDiagramBox(doc);
        break;
      case "ipJustificationTable":
        drawIpJustificationTable(doc);
        break;
      case "ipUtilizationTable":
        drawIpUtilizationTable(doc);
        break;
      default:
        break;
    }
  });
};

/**
 * Builds the Customer Application Form PDF for a new connection.
 * @param {object} data
 * @param {string} data.opportunityId - CAF number
 * @param {object} data.customer - Customer document (name, customerType, person, mobile, email)
 * @param {object} [data.billing] - Billing profile ({ gstNumber, address: { street, city, state, pincode } })
 * @param {object} data.connection - { serviceType, bandwidth, ratePerMb, aEndBtsId, aEndAddress, bEndBtsId, bEndAddress, ipCount }
 * @param {Date} [data.date] - date printed on page 1 (defaults to now)
 * @returns {Promise<Buffer>}
 */
const generateCafPdf = (data) => renderPdf(
  { title: `Customer Application Form - ${data.opportunityId}`, subject: "Customer Application Form (CAF)" },
  (doc) => {
    drawFirstPage(doc, data);
    drawTermsPages(doc);
    stampHeadersAndFooters(doc, { footerLeft: `CAF No: ${data.opportunityId}`, firstPageHeader: drawFirstPageHeader });
  },
);

module.exports = { generateCafPdf };
