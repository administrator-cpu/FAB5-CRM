const {
  PAGE, MARGIN, CONTENT_WIDTH, COLORS, FONT, NA,
  valueOrNA, formatNumber, formatDate, gradientText, gradientHeading,
  stampHeadersAndFooters, ensureSpace, sectionBar, detailRows, gridTable, writeRuns, signatureCaption, renderPdf,
} = require("./pdfLayout");
const {
  TITLE, ADDRESSEE, CUSTOMER_LABELS, COMMERCIAL_HEADING, SITE_TABLE, CHARGES_COLUMNS,
  TECHNICAL, TERMS_BLOCKS, SIGNATURE_TEXT,
} = require("../templates/poContent");

// The PO has no company header (that's only on the CAF), so content starts near the top of the page.
const PO_MARGIN = { ...MARGIN, top: 40 };

const rupees = (value) => (Number(value) > 0 ? `Rs. ${formatNumber(value)}` : NA);

const formatBillingAddress = (billing) => {
  const address = billing?.address || {};
  const cityState = [address.city, address.state].filter(Boolean).join(", ");
  const parts = [address.street, cityState].filter(Boolean).join(", ");
  const full = address.pincode ? `${parts}${parts ? " - " : ""}${address.pincode}` : parts;
  return valueOrNA(full);
};

const drawTitleBlock = (doc, data) => {
  const top = PO_MARGIN.top;
  doc.font(FONT.bold).fontSize(16);
  gradientText(doc, TITLE, MARGIN.left, top, { align: "center" });

  // "To," block on the left, date on the right.
  const blockY = top + 30;
  doc.font(FONT.bold).fontSize(9.5).fillColor(COLORS.text)
    .text(ADDRESSEE.salutation, MARGIN.left, blockY)
    .text(ADDRESSEE.name);
  doc.font(FONT.regular).fontSize(9);
  ADDRESSEE.lines.forEach((line) => doc.text(line));
  const blockBottom = doc.y;

  const dateText = formatDate(data.date || new Date());
  doc.font(FONT.regular).fontSize(9.5);
  const dateWidth = doc.widthOfString(dateText);
  doc.font(FONT.bold);
  const labelWidth = doc.widthOfString("Date: ");
  doc.text("Date: ", PAGE.width - MARGIN.right - dateWidth - labelWidth, blockY, { continued: true, lineBreak: false })
    .font(FONT.regular).text(dateText, { lineBreak: false });

  doc.x = MARGIN.left;
  doc.y = blockBottom + 14;
};

const drawCustomerDetails = (doc, { customer, billing }) => {
  sectionBar(doc, "Customer Details");
  const contact = [customer.mobile, customer.email].filter(Boolean).join(" / ");
  detailRows(doc, [
    [CUSTOMER_LABELS.name, valueOrNA(customer.name)],
    [CUSTOMER_LABELS.billingAddress, formatBillingAddress(billing)],
    [CUSTOMER_LABELS.gst, valueOrNA(billing?.gstNumber)],
    [CUSTOMER_LABELS.person, valueOrNA(customer.person)],
    [CUSTOMER_LABELS.contact, valueOrNA(contact)],
  ]);
};

const drawCommercialDetails = (doc, { connection }) => {
  const isIll = connection.serviceType === "ILL";
  sectionBar(doc, COMMERCIAL_HEADING);
  doc.y += 6;

  const labelWidth = 165;
  const endWidth = (CONTENT_WIDTH - labelWidth) / 2;
  gridTable(doc, [
    { title: SITE_TABLE.columns[0], width: labelWidth, boldFirst: true },
    { title: SITE_TABLE.columns[1], width: endWidth },
    { title: SITE_TABLE.columns[2], width: endWidth },
  ], [
    [SITE_TABLE.btsLabel, valueOrNA(connection.aEndBtsId), isIll ? NA : valueOrNA(connection.bEndBtsId)],
    [SITE_TABLE.addressLabel, valueOrNA(connection.aEndAddress), isIll ? NA : valueOrNA(connection.bEndAddress)],
  ]);

  const widths = [125, 100, 145, CONTENT_WIDTH - 370];
  gridTable(doc, CHARGES_COLUMNS.map((title, i) => ({ title, width: widths[i], align: "center" })), [[
    valueOrNA(connection.serviceType),
    connection.bandwidth ? String(connection.bandwidth) : NA,
    rupees(connection.mrc),
    rupees(connection.otc),
  ]]);
};

// Bulk order: one row per link, then the totals.
const drawBulkCommercialDetails = (doc, { connections }) => {
  sectionBar(doc, COMMERCIAL_HEADING);
  doc.y += 6;

  const end = (btsId, address) => [btsId, address].filter((v) => v && String(v).trim()).join(" / ") || NA;
  const columns = [
    { title: "#", width: 30, align: "center" },
    { title: "Opportunity ID", width: 92 },
    { title: "Product", width: 42, align: "center" },
    { title: "Mbps", width: 36, align: "center" },
    { title: "A_End (BTS/PoP / Address)", width: 94 },
    { title: "B_End (BTS/PoP / Address)", width: 94 },
    { title: "IPs", width: 26, align: "center" },
    { title: "MRC (18% GST Extra)", width: 56, align: "right" },
    { title: "OTC (18% GST Extra)", width: CONTENT_WIDTH - 470, align: "right" },
  ];
  const rows = connections.map((c, i) => [
    String(i + 1),
    valueOrNA(c.opportunityId),
    valueOrNA(c.serviceType),
    c.bandwidth ? String(c.bandwidth) : NA,
    end(c.aEndBtsId, c.aEndAddress),
    c.serviceType === "ILL" ? NA : end(c.bEndBtsId, c.bEndAddress),
    String(Number(c.ipCount) || 0),
    rupees(c.mrc),
    rupees(c.otc),
  ]);
  const sum = (key) => connections.reduce((total, c) => total + (Number(c[key]) || 0), 0);
  rows.push(["", `Total (${connections.length} links)`, "", "", "", "", String(sum("ipCount")), rupees(sum("mrc")), rupees(sum("otc"))]);

  gridTable(doc, columns, rows, { fontSize: 7.5, repeatHeader: true });
};

const drawTechnicalPart = (doc, { connection, connections }) => {
  const ipCount = connections
    ? connections.reduce((total, c) => total + (Number(c.ipCount) || 0), 0)
    : Number(connection.ipCount) || 0;
  gradientHeading(doc, TECHNICAL.heading);

  const items = [
    ["i)", TECHNICAL.slaLabel, TECHNICAL.slaValue],
    ["ii)", TECHNICAL.staticIpLabel, ipCount > 0 ? `Yes (${ipCount} IP${ipCount > 1 ? "s" : ""})` : "No"],
  ];
  items.forEach(([label, title, value]) => {
    ensureSpace(doc, 14);
    const y = doc.y;
    doc.font(FONT.regular).fontSize(9).fillColor(COLORS.text).text(label, MARGIN.left + 4, y, { width: 18, lineBreak: false });
    doc.y = y;
    writeRuns(doc, [{ text: `${title} `, bold: true }, { text: value, bold: false }], MARGIN.left + 24, CONTENT_WIDTH - 24, "left", { fontSize: 9 });
    doc.y += 3;
  });

  doc.y += 2;
  writeRuns(doc, [{ text: TECHNICAL.note, bold: true }], MARGIN.left + 24, CONTENT_WIDTH - 24, "left");
  doc.y += 4;
};

const drawTerms = (doc) => {
  TERMS_BLOCKS.forEach((block) => {
    if (block.type === "heading") {
      gradientHeading(doc, block.text, { keepWithNext: 60 });
      return;
    }
    // Each term is a bullet point.
    ensureSpace(doc, 14);
    const bulletIndent = 14;
    const y = doc.y;
    doc.font(FONT.regular).fontSize(8.5).fillColor(COLORS.text)
      .text("•", MARGIN.left + 3, y, { width: bulletIndent, lineBreak: false });
    doc.y = y;
    writeRuns(doc, block.runs, MARGIN.left + bulletIndent, CONTENT_WIDTH - bulletIndent, "justify");
    doc.y += 4;
  });
};

/**
 * Builds the customer Purchase Order PDF for a new connection.
 * @param {object} data
 * @param {object} data.customer - Customer document (name, person, mobile, email)
 * @param {object} [data.billing] - Selected billing profile ({ gstNumber, address: { street, city, state, pincode } })
 * @param {object} data.connection - { serviceType, bandwidth, mrc, otc, aEndBtsId, aEndAddress, bEndBtsId, bEndAddress, ipCount }
 * @param {Date} [data.date] - date printed on the PO (defaults to now)
 * @returns {Promise<Buffer>}
 */
const generateCustomerPoPdf = (data) => renderPdf(
  { title: `Purchase Order - ${data.customer?.name || ""}`.trim(), subject: "Purchase Order", margins: PO_MARGIN },
  (doc) => {
    drawTitleBlock(doc, data);
    drawCustomerDetails(doc, data);
    drawCommercialDetails(doc, data);
    drawTechnicalPart(doc, data);
    drawTerms(doc);
    signatureCaption(doc, SIGNATURE_TEXT);
    stampHeadersAndFooters(doc, { footerLeft: "Purchase Order", header: false });
  },
);

/**
 * Builds one customer Purchase Order PDF covering every connection of a bulk upload.
 * @param {object} data
 * @param {object} data.customer - Customer document
 * @param {object} [data.billing] - Selected billing profile
 * @param {string} data.batchNumber - bulk batch number, printed in the footer
 * @param {object[]} data.connections - [{ opportunityId, serviceType, bandwidth, mrc, otc, aEndBtsId, aEndAddress, bEndBtsId, bEndAddress, ipCount }]
 * @param {Date} [data.date]
 * @returns {Promise<Buffer>}
 */
const generateBulkPoPdf = (data) => renderPdf(
  { title: `Purchase Order - ${data.customer?.name || ""} - ${data.batchNumber}`.trim(), subject: "Purchase Order", margins: PO_MARGIN },
  (doc) => {
    drawTitleBlock(doc, data);
    drawCustomerDetails(doc, data);
    drawBulkCommercialDetails(doc, data);
    drawTechnicalPart(doc, data);
    drawTerms(doc);
    signatureCaption(doc, SIGNATURE_TEXT);
    stampHeadersAndFooters(doc, { footerLeft: `Purchase Order - ${data.batchNumber}`, header: false });
  },
);

module.exports = { generateCustomerPoPdf, generateBulkPoPdf };