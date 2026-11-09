const {
  LOGO_PATH, MARGIN, CONTENT_WIDTH, COLORS, FONT, NA,
  valueOrNA, formatNumber, gradientText, gradientHeading,
  stampHeadersAndFooters, ensureSpace, detailRows, gridTable, signRow, renderPdf, SIGNATURE_SPACE,
} = require("./pdfLayout");

// RMACD — the "Charge Deviation Form" generated for upgrade / downgrade / shifting requests.
const TITLE = "Charge Deviation Form";
const FOOTER_TEXT = "This is auto generated form.";
const MODIFY_REQUEST_LABELS = {
  UPGRADE: "Bandwidth Upgrade",
  DOWNGRADE: "Bandwidth Downgrade",
  SHIFTING: "Shifting Service Charges",
};

// No company header on this form, so content starts near the top of the page.
const RMACD_MARGIN = { ...MARGIN, top: 40 };

const mbps = (value) => (value !== undefined && value !== null && String(value).trim() !== "" ? `${value} Mbps` : NA);
const rupees = (value) => (Number(value) > 0 ? `Rs. ${formatNumber(value)}` : NA);

// Bordered strip with the logo on the left and the form title beside it.
const drawTitleStrip = (doc) => {
  const y = RMACD_MARGIN.top;
  const height = 52;
  const logoArea = 120;

  doc.rect(MARGIN.left, y, CONTENT_WIDTH, height).lineWidth(0.8).stroke(COLORS.border);
  doc.moveTo(MARGIN.left + logoArea, y).lineTo(MARGIN.left + logoArea, y + height).lineWidth(0.8).stroke(COLORS.border);
  doc.image(LOGO_PATH, MARGIN.left + 10, y + 5, { fit: [logoArea - 20, height - 10], align: "center", valign: "center" });

  doc.font(FONT.bold).fontSize(18);
  gradientText(doc, TITLE, MARGIN.left + logoArea, y + height / 2 - 9, { width: CONTENT_WIDTH - logoArea, align: "center" });

  doc.x = MARGIN.left;
  doc.y = y + height + 18;
};

/**
 * Table with an optional second header row: a column with `subs` shows its title over sub-columns
 * (e.g. Bandwidth → Old / New); other columns span both header rows.
 * columns: [{ title, width, value } | { title, width, subs: [{ title, value }] }]
 */
const drawChargesTable = (doc, columns) => {
  const pad = 5;
  const groupRowHeight = 18;
  const hasSubs = columns.some((c) => c.subs);
  const subRowHeight = hasSubs ? 18 : 0;
  const headerHeight = groupRowHeight + subRowHeight;

  const cells = columns.flatMap((c) => (c.subs
    ? c.subs.map((s) => ({ width: c.width / c.subs.length, value: s.value }))
    : [{ width: c.width, value: c.value }]));
  doc.font(FONT.regular).fontSize(9);
  const dataHeight = Math.max(22, ...cells.map((c) => doc.heightOfString(c.value, { width: c.width - pad * 2 }) + 10));

  ensureSpace(doc, headerHeight + dataHeight);
  const top = doc.y;
  let x = MARGIN.left;

  const headerCell = (text, cx, cy, w, h) => {
    doc.rect(cx, cy, w, h).lineWidth(0.6).fillAndStroke(COLORS.labelFill, COLORS.border);
    doc.font(FONT.bold).fontSize(8.5);
    const textHeight = doc.heightOfString(text, { width: w - pad * 2 });
    doc.fillColor(COLORS.text).text(text, cx + pad, cy + Math.max(3, (h - textHeight) / 2), { width: w - pad * 2, align: "center" });
  };

  columns.forEach((col) => {
    if (col.subs) {
      headerCell(col.title, x, top, col.width, groupRowHeight);
      const subWidth = col.width / col.subs.length;
      col.subs.forEach((sub, i) => headerCell(sub.title, x + subWidth * i, top + groupRowHeight, subWidth, subRowHeight));
    } else {
      headerCell(col.title, x, top, col.width, headerHeight);
    }
    x += col.width;
  });

  x = MARGIN.left;
  const rowY = top + headerHeight;
  cells.forEach((cell) => {
    doc.rect(x, rowY, cell.width, dataHeight).lineWidth(0.6).stroke(COLORS.border);
    doc.font(FONT.regular).fontSize(9).fillColor(COLORS.text)
      .text(cell.value, x + pad, rowY + 6, { width: cell.width - pad * 2, align: "center" });
    x += cell.width;
  });

  doc.x = MARGIN.left;
  doc.y = rowY + dataHeight + 14;
};

// ratePerMb may be a number (current rate) or { old, new } for upgrade/downgrade.
const rateValues = (ratePerMb) => (ratePerMb !== null && typeof ratePerMb === "object"
  ? { old: ratePerMb.old, new: ratePerMb.new }
  : { old: ratePerMb, new: ratePerMb });

const chargesColumns = (data) => {
  const modifyRequest = { title: "Modify Request", width: 130, value: MODIFY_REQUEST_LABELS[data.requestType] || NA };
  const rates = rateValues(data.ratePerMb);
  const rate = { title: "Rate/Mb", width: 80, value: rupees(rates.old) };

  if (data.requestType === "SHIFTING") {
    return [
      modifyRequest,
      { title: "Bandwidth", width: 95, value: mbps(data.bandwidth?.old) },
      rate,
      { title: "One Time Charge", width: 100, value: rupees(data.otc) },
      { title: "Recurring Charge (MRC)", width: CONTENT_WIDTH - 405, value: rupees(data.mrc?.old) },
    ];
  }

  const bandwidth = { title: "Bandwidth", subs: [{ title: "Old", value: mbps(data.bandwidth?.old) }, { title: "New", value: mbps(data.bandwidth?.new) }] };
  const mrc = { title: "Recurring Charge (MRC)", subs: [{ title: "Old", value: rupees(data.mrc?.old) }, { title: "New", value: rupees(data.mrc?.new) }] };

  // Rate changed along with the bandwidth: show Old / New Rate/Mb too.
  if (Number(rates.old) !== Number(rates.new)) {
    return [
      { ...modifyRequest, width: 110 },
      { ...bandwidth, width: 130 },
      { title: "Rate/Mb", width: 120, subs: [{ title: "Old", value: rupees(rates.old) }, { title: "New", value: rupees(rates.new) }] },
      { ...mrc, width: CONTENT_WIDTH - 360 },
    ];
  }

  return [
    modifyRequest,
    { ...bandwidth, width: 140 },
    rate,
    { ...mrc, width: CONTENT_WIDTH - 350 },
  ];
};

const drawShiftingAddresses = (doc, shifting) => {
  const ends = [["aEnd", "A-End Shifting"], ["bEnd", "B-End Shifting"]].filter(([key]) => shifting?.[key]);
  const labelWidth = 90;
  const endWidth = (CONTENT_WIDTH - labelWidth) / 2;

  ends.forEach(([key, heading]) => {
    const { old: before = {}, new: after = {} } = shifting[key];
    gradientHeading(doc, heading, { keepWithNext: 80 });
    gridTable(doc, [
      { title: "", width: labelWidth, boldFirst: true },
      { title: "Old", width: endWidth },
      { title: "New", width: endWidth },
    ], [
      ["BTS ID", valueOrNA(before.btsId), valueOrNA(after.btsId)],
      ["Address", valueOrNA(before.address), valueOrNA(after.address)],
    ]);
  });
};

// Upgrade / downgrade: where the circuit currently runs (A-End and B-End BTS ID and address).
const drawCurrentLocation = (doc, data) => {
  const isIll = data.serviceType === "ILL";
  const { aEnd = {}, bEnd = {} } = data.location || {};
  const labelWidth = 90;
  const endWidth = (CONTENT_WIDTH - labelWidth) / 2;

  gradientHeading(doc, "Current Location", { keepWithNext: 80 });
  gridTable(doc, [
    { title: "", width: labelWidth, boldFirst: true },
    { title: "A-End", width: endWidth },
    { title: "B-End", width: endWidth },
  ], [
    ["BTS ID", valueOrNA(aEnd.btsId), isIll ? NA : valueOrNA(bEnd.btsId)],
    ["Address", valueOrNA(aEnd.address), isIll ? NA : valueOrNA(bEnd.address)],
  ]);
};

/**
 * Builds the RMACD (Charge Deviation Form) PDF for a change request.
 * @param {object} data
 * @param {"UPGRADE"|"DOWNGRADE"|"SHIFTING"} data.requestType
 * @param {string} data.customerName
 * @param {string} data.opportunityId - FAB Circuit ID
 * @param {string} data.serviceType
 * @param {{old, new}} data.bandwidth - new is used for upgrade/downgrade only
 * @param {number|{old, new}} data.ratePerMb - current rate, or old/new for upgrade/downgrade (split only when they differ)
 * @param {{old, new}} data.mrc - new is used for upgrade/downgrade only
 * @param {number} [data.otc] - shifting one time charge
 * @param {object} [data.shifting] - { aEnd?: { old: {btsId, address}, new: {btsId, address} }, bEnd?: {...} }
 * @param {object} [data.location] - upgrade/downgrade: { aEnd: {btsId, address}, bEnd: {btsId, address} }
 * @returns {Promise<Buffer>}
 */
const generateRmacdPdf = (data) => renderPdf(
  { title: `${TITLE} - ${data.opportunityId}`, subject: TITLE, margins: RMACD_MARGIN },
  (doc) => {
    drawTitleStrip(doc);
    detailRows(doc, [
      ["Customer Name", valueOrNA(data.customerName)],
      ["FAB Circuit ID", valueOrNA(data.opportunityId)],
      ["Service Type", valueOrNA(data.serviceType)],
    ]);
    doc.y += 8;
    drawChargesTable(doc, chargesColumns(data));
    if (data.requestType === "SHIFTING") drawShiftingAddresses(doc, data.shifting);
    else drawCurrentLocation(doc, data);
    // Room above the line for a hand signature or the eSign stamp, which lands on this line.
    signRow(doc, ["Name & Signature of Customer", "Date"], { gapBefore: SIGNATURE_SPACE, signatureAt: 0 });
    stampHeadersAndFooters(doc, { header: false, footerCenter: FOOTER_TEXT, pageNumbers: false });
  },
);

module.exports = { generateRmacdPdf };
