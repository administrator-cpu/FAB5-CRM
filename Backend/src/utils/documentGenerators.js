const ExcelJS = require("exceljs");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const fs = require("fs").promises;
const path = require("path");
const PoCounter = require("../models/poCounter.model");

/* 
 *─────────────────────────────────────────────────────────────────
  1. PO NUMBER GENERATOR
 *─────────────────────────────────────────────────────────────────
*/
const generateGlobalPoNumber = async () => {
  const today = new Date();
  const month = today.getMonth();
  const year = today.getFullYear();

  let financialYear = "";
  if (month >= 3) {
    financialYear = `${year}-${String(year + 1).slice(-2)}`;
  } else {
    financialYear = `${year - 1}-${String(year).slice(-2)}`;
  }

  const counterId = `PO_SEQUENCE_${financialYear}`;
  const counter = await PoCounter.findByIdAndUpdate(
    counterId,
    { $inc: { sequenceValue: 1 } },
    { new: true, upsert: true }
  );

  const seq = String(counter.sequenceValue).padStart(4, '0');
  const poNumber = `FAB5/${financialYear}/${seq}`;

  return { poNumber, financialYear };
};

/* 
 *─────────────────────────────────────────────────────────────────
  2. TEMPLATE SELECTOR
 *─────────────────────────────────────────────────────────────────
*/
const getPdfTemplatePath = (serviceType, historyArray) => {
  const isILL = serviceType === "ILL";

  const recentHistory = [...historyArray].reverse();
  const definingAction = recentHistory.find(entry =>
    ["CREATED", "UPGRADE", "DOWNGRADE", "SHIFTING"].includes(entry.action)
  );

  const requestType = definingAction ? definingAction.action : "CREATED";
  let fileName = "";
  if (isILL) {
    if (requestType === "SHIFTING") fileName = "ILL Shifting PO.pdf";
    else if (requestType === "UPGRADE") fileName = "ILL Upgrade PO.pdf";
    else if (requestType === "DOWNGRADE") fileName = "ILL Downgrade PO.pdf";
    else fileName = "ILL PO.pdf";
  } else {
    if (requestType === "UPGRADE") fileName = "NLD Upgrade PO.pdf";
    else if (requestType === "DOWNGRADE") fileName = "NLD Downgrade PO.pdf";
    else if (requestType === "SHIFTING") fileName = "NLD Shifting PO.pdf";
    else fileName = "NLD PO.pdf";
  }

  return path.join(__dirname, "../templates", fileName);
};

/* 
 *─────────────────────────────────────────────────────────────────
  3. PDF PO STAMPER
 *─────────────────────────────────────────────────────────────────
*/
const generatePoPdf = async (templatePath, poNumber) => {
  const existingPdfBytes = await fs.readFile(templatePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);

  const firstPage = pdfDoc.getPages()[0];

  const today = new Date();
  const deliveryDate = new Date();
  deliveryDate.setDate(today.getDate() + 45);

  const dateStr = today.toLocaleDateString("en-IN");
  const cndStr = deliveryDate.toLocaleDateString("en-IN");

  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 9;
  const textColor = rgb(0, 0, 0);

  firstPage.drawText(poNumber, { x: 432, y: 730, size: fontSize, font: boldFont, color: textColor });
  firstPage.drawText(dateStr, { x: 432, y: 715.5, size: fontSize, font: boldFont, color: textColor });
  firstPage.drawText(cndStr, { x: 194, y: 467, size: fontSize, font: boldFont, color: textColor });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
};

/* 
 *─────────────────────────────────────────────────────────────────
  4. EXCEL PO GENERATOR
 *───────────────────────────────────────────────────────────────── 
*/
const generatePoExcel = async (connections) => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Purchase Order");

  const sampleConn = connections[0];
  const serviceType = sampleConn.serviceType;

  const recentHistory = [...sampleConn.history].reverse();
  const definingAction = recentHistory.find(entry =>
    ["CREATED", "UPGRADE", "DOWNGRADE", "SHIFTING"].includes(entry.action)
  );
  const requestType = definingAction ? definingAction.action : "CREATED";

  const isILL = serviceType === "ILL";
  const isUpOrDown = requestType === "UPGRADE" || requestType === "DOWNGRADE";
  const isShifting = requestType === "SHIFTING";

  const columns = [
    { header: "SL. No.", key: "sno", width: 8 },
    { header: "Company Name", key: "company", width: 25 },
  ];

  if (isUpOrDown || isShifting) {
    columns.push({ header: "Telco Circuit ID", key: "telecoCircuitId", width: 25 });
  }

  if (isShifting && isILL) {
    columns.push(
      { header: "Old A End - BTS ID", key: "oldABts", width: 20 },
      { header: "New A End - BTS ID", key: "newABts", width: 20 },
      { header: "Old A End - Address", key: "oldAAddr", width: 30 },
      { header: "New A End - Address", key: "newAAddr", width: 30 },
      { header: "Old A End - Lat", key: "oldALat", width: 15 },
      { header: "New A End - Lat", key: "newALat", width: 15 },
      { header: "Old A End - Long", key: "oldALong", width: 15 },
      { header: "New A End - Long", key: "newALong", width: 15 }
    );
  } else if (isShifting && !isILL) {
    columns.push(
      { header: "Old A End - BTS ID", key: "oldABts", width: 20 },
      { header: "New A End - BTS ID", key: "newABts", width: 20 },
      { header: "Old A End - Address", key: "oldAAddr", width: 30 },
      { header: "New A End - Address", key: "newAAddr", width: 30 },
      { header: "Old A End - Lat", key: "oldALat", width: 15 },
      { header: "New A End - Lat", key: "newALat", width: 15 },
      { header: "Old A End - Long", key: "oldALong", width: 15 },
      { header: "New A End - Long", key: "newALong", width: 15 },
      { header: "Old B End - BTS ID", key: "oldBBts", width: 20 },
      { header: "New B End - BTS ID", key: "newBBts", width: 20 },
      { header: "Old B End - Address", key: "oldBAddr", width: 30 },
      { header: "New B End - Address", key: "newBAddr", width: 30 },
      { header: "Old B End - Lat", key: "oldBLat", width: 15 },
      { header: "New B End - Lat", key: "newBLat", width: 15 },
      { header: "Old B End - Long", key: "oldBLong", width: 15 },
      { header: "New B End - Long", key: "newBLong", width: 15 }
    );
  } else if (isILL) {
    columns.push(
      { header: "A End - BTS Id", key: "aBts", width: 15 },
      { header: "A End - Address", key: "aAddr", width: 30 },
      { header: "A End - Lat", key: "aLat", width: 15 },
      { header: "A End - Long", key: "aLong", width: 15 }
    );
  } else {
    columns.push(
      { header: "A End - BTS Id", key: "aBts", width: 15 },
      { header: "A End - Address", key: "aAddr", width: 30 },
      { header: "A End - Lat", key: "aLat", width: 15 },
      { header: "A End - Long", key: "aLong", width: 15 },
      { header: "B End - BTS Id", key: "bBts", width: 15 },
      { header: "B End - Address", key: "bAddr", width: 30 },
      { header: "B End - Lat", key: "bLat", width: 15 },
      { header: "B End - Long", key: "bLong", width: 15 }
    );
  }

  columns.push(
    { header: "Product/Link Type", key: "product", width: 18 },
    { header: "BW (mbps)", key: "bw", width: 20 },
    { header: "Rate", key: "rate", width: 15 },
    { header: "MRC", key: "mrc", width: 15 },
    { header: "ARC", key: "arc", width: 15 }
  );

  worksheet.columns = columns;
  worksheet.getRow(1).font = { bold: true };
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  connections.forEach((conn, index) => {
    const productType = conn.serviceType === "ILL" ? "ILL" : "NLD";
    const mrc = Number(conn.providerCost?.mrc || 0);
    const rate = Number(conn.providerCost?.ratePerMb || 0);

    const connHistoryRev = [...conn.history].reverse();
    const actionIdx = connHistoryRev.findIndex(h => h.action === requestType);
    const oldSnapshot = (actionIdx >= 0 && connHistoryRev[actionIdx + 1])
      ? connHistoryRev[actionIdx + 1]
      : null;

    let displayBw = conn.bandwidth || "0";
    if (isUpOrDown) {
      const oldBw = oldSnapshot ? (Number(oldSnapshot.bandwidth) || "0") : "0";
      displayBw = `${oldBw} to ${displayBw}`;
    }

    const rowData = {
      sno: index + 1,
      company: "Fab Five Network Pvt. Ltd.",
      telecoCircuitId: conn.telecoCircuitId || "-",
      product: productType,
      bw: displayBw,
      rate: rate,
      mrc: mrc,
      arc: mrc * 12,
    };

    if (isShifting && isILL) {
      const oldTech = oldSnapshot?.technicalDetails || {};
      rowData.oldABts = oldTech.aEnd?.btsId || "-";
      rowData.newABts = conn.technicalDetails?.aEnd?.btsId || "-";
      rowData.oldAAddr = oldTech.aEnd?.address || "-";
      rowData.newAAddr = conn.technicalDetails?.aEnd?.address || "-";
      rowData.oldALat = oldTech.aEnd?.latitude || "-";
      rowData.newALat = conn.technicalDetails?.aEnd?.latitude || "-";
      rowData.oldALong = oldTech.aEnd?.longitude || "-";
      rowData.newALong = conn.technicalDetails?.aEnd?.longitude || "-";
    } else if (isShifting && !isILL) {
      const oldTech = oldSnapshot?.technicalDetails || {};

      rowData.oldABts = oldTech.aEnd?.btsId || "-";
      rowData.newABts = conn.technicalDetails?.aEnd?.btsId || "-";
      rowData.oldAAddr = oldTech.aEnd?.address || "-";
      rowData.newAAddr = conn.technicalDetails?.aEnd?.address || "-";
      rowData.oldALat = oldTech.aEnd?.latitude || "-";
      rowData.newALat = conn.technicalDetails?.aEnd?.latitude || "-";
      rowData.oldALong = oldTech.aEnd?.longitude || "-";
      rowData.newALong = conn.technicalDetails?.aEnd?.longitude || "-";

      rowData.oldBBts = oldTech.bEnd?.btsId || "-";
      rowData.newBBts = conn.technicalDetails?.bEnd?.btsId || "-";
      rowData.oldBAddr = oldTech.bEnd?.address || "-";
      rowData.newBAddr = conn.technicalDetails?.bEnd?.address || "-";
      rowData.oldBLat = oldTech.bEnd?.latitude || "-";
      rowData.newBLat = conn.technicalDetails?.bEnd?.latitude || "-";
      rowData.oldBLong = oldTech.bEnd?.longitude || "-";
      rowData.newBLong = conn.technicalDetails?.bEnd?.longitude || "-";
    } else if (isILL) {
      rowData.aBts = conn.technicalDetails?.aEnd?.btsId || "-";
      rowData.aAddr = conn.technicalDetails?.aEnd?.address || "-";
      rowData.aLat = conn.technicalDetails?.aEnd?.latitude || "-";
      rowData.aLong = conn.technicalDetails?.aEnd?.longitude || "-";
    } else {
      rowData.aBts = conn.technicalDetails?.aEnd?.btsId || "-";
      rowData.aAddr = conn.technicalDetails?.aEnd?.address || "-";
      rowData.aLat = conn.technicalDetails?.aEnd?.latitude || "-";
      rowData.aLong = conn.technicalDetails?.aEnd?.longitude || "-";

      rowData.bBts = conn.technicalDetails?.bEnd?.btsId || "-";
      rowData.bAddr = conn.technicalDetails?.bEnd?.address || "-";
      rowData.bLat = conn.technicalDetails?.bEnd?.latitude || "-";
      rowData.bLong = conn.technicalDetails?.bEnd?.longitude || "-";
    }

    worksheet.addRow(rowData);
  });

  return await workbook.xlsx.writeBuffer();
};


module.exports = {
  generateGlobalPoNumber,
  getPdfTemplatePath,
  generatePoPdf,
  generatePoExcel,
};
