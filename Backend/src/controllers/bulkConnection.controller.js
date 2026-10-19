const ExcelJS = require('exceljs');
const { generateTemplate } = require('../services/bulkConnection.service');
const { uploadDocument } = require('../services/upload.service');
const mongoose = require('mongoose');
const { createGeneratedBulkCaf } = require('../services/caf.service');
const { createGeneratedBulkPo } = require('../services/po.service');
const generateOpportunityId = require('../services/opportunityId.service');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');
const Connection = require('../models/connectionModel');
const User = require('../models/userModel');
const Customer = require('../models/customerModel');
const BulkBatch = require('../models/bulkBatch.model');
const emailQueue = require("../queue/email.queue");
const ROLES = require('../constants/roles');
const { buildIps, classifyIpCost } = require('../utils/ipCost');
const { hasSignedDocuments, areSignedDocumentsLocked, applySignedDocuments } = require('../utils/signedDocuments');

// Billing profile a bulk-created connection bills to: only unambiguous when the customer has exactly one.
const singleBillingProfileId = (customer) =>
  customer?.billingProfile?.length === 1 ? customer.billingProfile[0]._id : null;
const ioHelper = require('../utils/ioHelper');

const withCreatedBy = async (connectionId) => {
  return await Connection
    .findById(connectionId)
    .populate("createdBy", "name email");
};

const downloadTemplate = async (req, res) => {
  try {
    const workbook = await generateTemplate();

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=crm-bulk-connection-template.xlsx');

    await workbook.xlsx.write(res);
    res.end();

  } catch (error) {
    console.error('Error downloading template:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate template',
    });
  }
};

const uploadBulkConnections = asyncHandler(async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({
      success: false,
      message: 'No file uploaded',
    });
  }

  const columnMapping = {
    "Service Type": "serviceType",
    "Bandwidth": "bandwidth",
    "A-End BTS ID": "AbtsId",
    "A-End Address": "Aaddress",
    "A-End Longitude": "Alongitude",
    "A-End Latitude": "Alatitude",
    "B-End BTS ID": "BbtsId",
    "B-End Address": "Baddress",
    "B-End Longitude": "Blongitude",
    "B-End Latitude": "Blatitude",
    "Telecom Provider": "telcoProvider",
    "Rate Per MB": "ratePerMb",
    "No. of IPs": "ipCount",
    "Per IP Cost": "ipCost",
    "MRC": "mrc",
    "OTC": "otc",
    "Advance": "advance",
    "Remarks": "remarks"
  };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);

  const worksheet = workbook.worksheets[0];

  const rows = [];
  const headers = [];

  worksheet.getRow(1).eachCell((cell, colNumber) => {
    const humanHeader = cell.value ? cell.value.toString().trim() : "";
    headers[colNumber] = columnMapping[humanHeader] || humanHeader;
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const getCellValue = (cell) => {
      if (!cell || cell.value === null || cell.value === undefined) return null;
      if (typeof cell.value === 'object') {
        return cell.result !== undefined ? cell.result : (cell.text || cell.value.richText?.map(t => t.text).join('') || null);
      }
      return cell.value;
    };

    const rowData = { excelRowNumber: rowNumber };
    let hasData = false;

    row.eachCell((cell, colNumber) => {
      const key = headers[colNumber];
      if (key) {
        const val = getCellValue(cell);
        rowData[key] = val;
        // Check if row actually has content (avoids pushing completely empty rows)
        if (val !== null && val !== "") hasData = true;
      }
    });

    if (hasData) rows.push(rowData);
  });

  if (rows.length > 100) {
    return res.status(400).json({
      success: false,
      message: 'Maximum 100 rows allowed',
    });
  }

  const validRows = [];
  const invalidRows = [];

  rows.forEach((row, index) => {

    const errors = [];

    const rawServiceType = String(row.serviceType || "").trim();
    const allowedServiceTypes = ["ILL", "DNC", "Mix", "Peering"];
    const matchedType = allowedServiceTypes.find((type) => type.toLowerCase() === rawServiceType.toLowerCase());
    const serviceType = matchedType || rawServiceType;
    row.serviceType = serviceType;

    const rawProvider = String(row.telcoProvider || "").trim();
    const allowedProviders = ["Airtel", "TCL", "Vodafone", "Jio", "Other"];
    const matchedProvider = allowedProviders.find((p) => p.toLowerCase() === rawProvider.toLowerCase());
    row.telcoProvider = matchedProvider || rawProvider;

    row.AbtsId = typeof row.AbtsId === 'string' ? row.AbtsId.trim() : row.AbtsId;
    row.Aaddress = typeof row.Aaddress === 'string' ? row.Aaddress.trim() : row.Aaddress;
    row.Alatitude = typeof row.Alatitude === 'string' ? row.Alatitude.trim() : row.Alatitude;
    row.Alongitude = typeof row.Alongitude === 'string' ? row.Alongitude.trim() : row.Alongitude;

    row.BbtsId = typeof row.BbtsId === 'string' ? row.BbtsId.trim() : row.BbtsId;
    row.Baddress = typeof row.Baddress === 'string' ? row.Baddress.trim() : row.Baddress;
    row.Blongitude = typeof row.Blongitude === 'string' ? row.Blongitude.trim() : row.Blongitude;
    row.Blatitude = typeof row.Blatitude === 'string' ? row.Blatitude.trim() : row.Blatitude;

    const bandwidth = Number(row.bandwidth || 0);
    const ratePerMb = Number(row.ratePerMb || 0);
    if (!ratePerMb || ratePerMb <= 0) errors.push("ratePerMb is required");
    const ipCount = Number(row.ipCount || 0);
    const ipCost = Number(row.ipCost || 0);
    const mrc = Number(row.mrc || 0);

    if (!serviceType) {
      errors.push("serviceType is required");
    } else if (!allowedServiceTypes.includes(serviceType)) {
      errors.push(`Invalid service type. Allowed: ${allowedServiceTypes.join(', ')}`);
    }

    if (!row.telcoProvider) {
      errors.push("TelcoProvider is required");
    } else if (!matchedProvider) {
      errors.push(`Invalid telcoProvider: '${rawProvider}'. Allowed: ${allowedProviders.join(', ')}`);
    }

    if (!bandwidth) errors.push("bandwidth is required");
    if (!row.AbtsId) errors.push("AbtsId is required");
    if (!row.Aaddress) errors.push("Aaddress is required");
    if (!row.Alatitude) errors.push("A latitude is required");
    if (!row.Alongitude) errors.push("A longitude is required");

    if (serviceType !== "ILL") {
      if (!row.BbtsId) errors.push("BbtsId is required");
      if (!row.Baddress) errors.push("Baddress is required");
      if (!row.Blatitude) errors.push("B latitude is required");
      if (!row.Blongitude) errors.push("B longitude is required");
    }

    const calculatedMrc = (ratePerMb * bandwidth) + (ipCount * ipCost);
    if (Math.round(calculatedMrc) !== Math.round(mrc)) {
      errors.push("MRC mismatch");
    }

    if (errors.length) {
      invalidRows.push({
        rowNumber: row.excelRowNumber,
        errors,
        row
      });
    } else {
      validRows.push({
        ...row,
        calculatedMrc
      });
    }
  });

  res.status(200).json({
    success: true,
    totalRows: rows.length,
    validRows,
    invalidRows
  });

});

// Stores an uploaded signed document; null when no file was attached.
const storeSignedFile = async (file, folder, userId) => {
  if (!file || file.size === 0) return null;
  const uploaded = await uploadDocument(file, folder);
  return { fileName: file.originalname, ...uploaded, uploadedAt: new Date(), uploadedBy: userId };
};

// The connection copy of a batch document leaves out who uploaded it (kept on the batch).
const toConnectionDoc = (doc) => {
  if (!doc) return null;
  const { uploadedBy, ...rest } = doc;
  return rest;
};

const newBatchNumber = async () => {
  let batchNumber;
  do { batchNumber = `BULK${generateOpportunityId().slice(3)}`; } while (await BulkBatch.exists({ batchNumber }));
  return batchNumber;
};

// Creates every valid row as a Pending connection, plus one unsigned PO and one unsigned CAF
// covering all of them. Signed copies can be uploaded now (optional) or later for the whole batch.
const createBulkConnections = asyncHandler(async (req, res, next) => {
  const customerId = req.params.customerId;

  if (!req.body.connections) {
    return next(new AppError("No Connection Provided", 400));
  }

  let validRows;
  try {
    validRows = typeof req.body.connections === "string" ? JSON.parse(req.body.connections) : req.body.connections;
  } catch (error) {
    return next(new AppError("Invalid connections data format", 400));
  }

  if (!validRows || validRows.length === 0) {
    return next(new AppError("No valid connections to process", 400));
  }

  const customer = await Customer.findById(customerId);
  if (!customer) {
    return next(new AppError("Customer not found", 404));
  }

  if (req.user.role === ROLES.EMPLOYEE && !customer.managedBy.equals(req.user._id)) {
    return next(new AppError("You can only create orders for your own customers", 403));
  }

  // Billing profile for the whole batch; printed on the PO / CAF (first profile when none is chosen).
  let billingProfileId = singleBillingProfileId(customer);
  if (req.body.billingProfileId) {
    if (!customer.billingProfile.id(req.body.billingProfileId)) {
      return next(new AppError("Selected billing address does not belong to this customer", 400));
    }
    billingProfileId = req.body.billingProfileId;
  }
  const billing = billingProfileId ? customer.billingProfile.id(billingProfileId) : customer.billingProfile?.[0];

  const usedOpportunityIds = new Set();
  const opportunityIds = validRows.map(() => {
    let opportunityId;
    do { opportunityId = generateOpportunityId(); } while (usedOpportunityIds.has(opportunityId));
    usedOpportunityIds.add(opportunityId);
    return opportunityId;
  });

  const batchId = new mongoose.Types.ObjectId();
  const batchNumber = await newBatchNumber();
  const documentRows = validRows.map((row, index) => ({
    opportunityId: opportunityIds[index],
    serviceType: row.serviceType,
    bandwidth: row.bandwidth,
    ratePerMb: row.ratePerMb,
    mrc: row.calculatedMrc || row.mrc || 0,
    otc: row.otc || 0,
    aEndBtsId: row.AbtsId,
    aEndAddress: row.Aaddress,
    bEndBtsId: row.BbtsId,
    bEndAddress: row.Baddress,
    ipCount: row.ipCount,
  }));

  const generatedAt = new Date();
  const [generatedPo, generatedCaf] = await Promise.all([
    createGeneratedBulkPo({ batchNumber, customer, billing, connections: documentRows }),
    createGeneratedBulkCaf({ batchNumber, customer, billing, connections: documentRows }),
  ]);

  // Already-signed copies attached at creation apply to every connection in the batch.
  const signedPo = await storeSignedFile(req.files?.purchaseOrder?.[0], "crm/connections/purchaseOrders", req.user._id);
  const signedCaf = await storeSignedFile(req.files?.caf?.[0], "crm/connections/cafs", req.user._id);

  let sharedBusinessAgreement = null;
  if (req.files.businessAgreement && req.files.businessAgreement[0]) {
    const baUpload = await uploadDocument(req.files.businessAgreement[0], "crm/connections/businessAgreements");
    sharedBusinessAgreement = {
      fileName: req.files.businessAgreement[0].originalname,
      url: baUpload.url,
      publicId: baUpload.publicId,
      storage: baUpload.storage
    };
  }

  const connectionsToInsert = validRows.map((row, index) => ({
    opportunityId: opportunityIds[index],
    fabCircuitId: opportunityIds[index],
    customer: customer._id,
    billingProfileId,
    bulkBatch: batchId,
    createdBy: req.user._id,
    serviceType: row.serviceType,
    bandwidth: row.bandwidth,
    remarks: row.remarks || "",
    generatedDocuments: {
      po: { ...generatedPo, generatedAt },
      caf: { ...generatedCaf, generatedAt },
    },
    purchaseOrders: signedPo ? [{ ...toConnectionDoc(signedPo), requestType: "CREATED" }] : [],
    caf: toConnectionDoc(signedCaf) || undefined,
    businessAgreement: sharedBusinessAgreement || undefined,
    technicalDetails: {
      aEnd: {
        btsId: row.AbtsId,
        address: row.Aaddress,
        latitude: row.Alatitude,   
        longitude: row.Alongitude, 
      },
      bEnd: {
        btsId: row.BbtsId,
        address: row.Baddress,
        latitude: row.Blatitude,   
        longitude: row.Blongitude, 
      },
      telcoProvider: row.telcoProvider,
    },
    commercials: {
      mrc: row.calculatedMrc || row.mrc || 0,
      ratePerMb: row.ratePerMb || 0,
      otc: row.otc || 0,
      advance: row.advance || 0,
    },
    // The sheet's "Per IP Cost" is the per-IP rate; ips.cost stores the total.
    ips: buildIps({ count: row.ipCount, totalCost: (Number(row.ipCount) || 0) * (Number(row.ipCost) || 0), perIpCost: row.ipCost }),
    status: "Pending",

    history: [{
      action: "CREATED",
      performedBy: req.user._id,
      date: new Date(),
      note: `Order created (bulk batch ${batchNumber})`,
      serviceType: row.serviceType,
      bandwidth: row.bandwidth,
       technicalDetails: {
      aEnd: {
        btsId: row.AbtsId,
        address: row.Aaddress,
        latitude: row.Alatitude,   
        longitude: row.Alongitude, 
      },
      bEnd: {
        btsId: row.BbtsId,
        address: row.Baddress,
        latitude: row.Blatitude,   
        longitude: row.Blongitude, 
      },
      telcoProvider: row.telcoProvider,
    },
      commercials: {
        mrc: row.calculatedMrc || row.mrc || 0,
        ratePerMb: row.ratePerMb || 0,
        otc: row.otc || 0,
        advance: row.advance || 0,
      },
      ips: buildIps({ count: row.ipCount, totalCost: (Number(row.ipCount) || 0) * (Number(row.ipCost) || 0), perIpCost: row.ipCost }),
    }],
  }))

  const createdConnections = await Connection.create(connectionsToInsert);
  const batch = await BulkBatch.create({
    _id: batchId,
    batchNumber,
    customer: customer._id,
    billingProfileId,
    createdBy: req.user._id,
    connections: createdConnections.map((conn) => conn._id),
    generatedDocuments: { po: generatedPo, caf: generatedCaf, generatedAt },
    signedDocuments: { po: signedPo || undefined, caf: signedCaf || undefined },
  });
  ioHelper.broadcastChange("connections_mutated", {
    action: "CREATE",
    id: batch._id
  });

  try {
    const processedOpportunityIds = createdConnections.map(conn => conn.opportunityId);
    const populated = await withCreatedBy(createdConnections[0]._id);

    await emailQueue.add(
      "sendEmail",
      {
        type: "WELCOME_BULK",
        data: {
          opportunityIds: processedOpportunityIds,
          createdByEmail: populated.createdBy?.email
        },
        user: req.user,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      }
    );
    logger.info("Bulk welcome email queued successfully", { count: processedOpportunityIds.length });
  } catch (error) {
    logger.error("Failed to queue WELCOME_BULK email", { error: error.message });
  }

  res.status(201).json({
    success: true,
    message: `${createdConnections.length} connections created — download the unsigned PO and CAF for batch ${batchNumber}`,
    data: createdConnections,
    batch,
  });

});

// Employees may only see and change bulk batches of customers they manage.
const canAccessCustomer = (user, customer) =>
  user.role !== ROLES.EMPLOYEE || Boolean(customer?.managedBy?.equals(user._id));

const BATCH_CONNECTION_FIELDS = "bulkBatch opportunityId serviceType bandwidth status caf purchaseOrders history.action";
// Deleted and cancelled connections no longer need signed documents, so batches ignore them.
const LIVE_BATCH_CONNECTION = { $nin: ["Deleted", "Cancelled"] };

const summarizeBatch = (batch, connections) => ({
  _id: batch._id,
  batchNumber: batch.batchNumber,
  createdAt: batch.createdAt,
  createdBy: batch.createdBy,
  generatedDocuments: batch.generatedDocuments,
  signedDocuments: batch.signedDocuments,
  removedCount: Math.max(batch.connections.length - connections.length, 0),
  connections: connections.map((conn) => ({
    _id: conn._id,
    opportunityId: conn.opportunityId,
    serviceType: conn.serviceType,
    bandwidth: conn.bandwidth,
    status: conn.status,
    signedDocumentsComplete: hasSignedDocuments(conn),
    locked: areSignedDocumentsLocked(conn),
  })),
});

const getCustomerBulkBatches = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findById(req.params.customerId).select("managedBy");
  if (!customer) return next(new AppError("Customer not found", 404));
  if (!canAccessCustomer(req.user, customer)) {
    return next(new AppError("You can only view bulk orders of your own customers", 403));
  }

  const batches = await BulkBatch.find({ customer: customer._id })
    .sort({ createdAt: -1 })
    .populate("createdBy", "name email")
    .lean();
  const connections = await Connection.find({ bulkBatch: { $in: batches.map((b) => b._id) }, status: LIVE_BATCH_CONNECTION })
    .select(BATCH_CONNECTION_FIELDS)
    .lean();

  res.status(200).json({
    success: true,
    // A batch whose connections were all deleted or cancelled has nothing left to sign.
    batches: batches
      .map((batch) => summarizeBatch(batch, connections.filter((conn) => String(conn.bulkBatch) === String(batch._id))))
      .filter((batch) => batch.connections.length > 0),
  });
});

// Uploads the signed CAF and/or PO once and puts them on every connection of the batch that
// hasn't been approved yet. Approved connections keep the documents they were approved with.
const uploadBulkSignedDocuments = asyncHandler(async (req, res, next) => {
  const batch = await BulkBatch.findById(req.params.batchId);
  if (!batch) return next(new AppError("Bulk batch not found", 404));

  const customer = await Customer.findById(batch.customer).select("managedBy");
  if (!canAccessCustomer(req.user, customer)) {
    return next(new AppError("You can only upload documents for your own customers", 403));
  }

  const cafFile = req.files?.caf?.[0];
  const poFile = req.files?.purchaseOrder?.[0];
  if ((!cafFile || cafFile.size === 0) && (!poFile || poFile.size === 0)) {
    return next(new AppError("Please attach the signed CAF and/or signed PO", 400));
  }

  const connections = await Connection.find({ bulkBatch: batch._id, status: LIVE_BATCH_CONNECTION });
  if (connections.length === 0) {
    return next(new AppError("Every connection in this batch has been deleted or cancelled", 400));
  }
  const open = connections.filter((conn) => !areSignedDocumentsLocked(conn));
  if (open.length === 0) {
    return next(new AppError("Every connection in this batch has already been approved — signed documents can no longer be changed", 400));
  }

  const signedCaf = await storeSignedFile(cafFile, "crm/connections/cafs", req.user._id);
  const signedPo = await storeSignedFile(poFile, "crm/connections/purchaseOrders", req.user._id);

  for (const conn of open) {
    const labels = applySignedDocuments(conn, { caf: toConnectionDoc(signedCaf), po: toConnectionDoc(signedPo) });
    conn.history.push({
      action: "SIGNED_DOCUMENT_UPLOADED",
      performedBy: req.user._id,
      date: new Date(),
      note: `Signed ${labels.join(" & ")} uploaded for bulk batch ${batch.batchNumber}`,
    });
    await conn.save();
  }

  if (signedCaf) batch.signedDocuments.caf = signedCaf;
  if (signedPo) batch.signedDocuments.po = signedPo;
  await batch.save();

  ioHelper.broadcastChange("connections_mutated", { action: "UPDATE", id: batch._id });

  const skipped = connections.filter((conn) => areSignedDocumentsLocked(conn)).map((conn) => conn.opportunityId);
  const uploadedLabel = [signedCaf && "CAF", signedPo && "PO"].filter(Boolean).join(" & ");
  logger.info("Bulk signed documents uploaded", {
    batchNumber: batch.batchNumber, documents: uploadedLabel, applied: open.length, skipped: skipped.length, by: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: `Signed ${uploadedLabel} added to ${open.length} connection${open.length === 1 ? "" : "s"}`
      + (skipped.length ? ` (${skipped.length} already approved, left unchanged)` : ""),
    applied: open.map((conn) => conn.opportunityId),
    skipped,
    batch: summarizeBatch(batch.toObject(), connections),
  });
});

/* Developers APIs */
const activeBulkConnectionTemplate = asyncHandler(async (req, res, next) => {
  const customers = await Customer.find({ isActive: true }).select("name email").sort({ name: 1 });
  const activators = await User.find({ role: { $in: ["project_manager"] }, isActive: true }).select("email");

  const customerList = customers.map(c => `${c.name} (${c.email})`);
  const activatorList = activators.map(u => u.email);

  const workbook = new ExcelJS.Workbook();

  const refSheet = workbook.addWorksheet("Reference Data", { state: "hidden" });

  customerList.forEach((text, i) => { refSheet.getCell(`A${i + 1}`).value = text; });
  activatorList.forEach((text, i) => { refSheet.getCell(`C${i + 1}`).value = text; });

  const worksheet = workbook.addWorksheet("Connection Upload");

  worksheet.columns = [
    { header: "Customer Name & Email*", key: "customerEmail", width: 70 },
    { header: "Activated By Email*", key: "activatedByEmail", width: 30 },
    { header: "Service Type*", key: "serviceType", width: 15 },
    { header: "Bandwidth", key: "bandwidth", width: 15 },
    { header: "A-End BTS ID", key: "aBtsId", width: 15 },
    { header: "A-End Address", key: "aAddress", width: 35 },
    { header: "B-End BTS ID", key: "bBtsId", width: 15 },
    { header: "B-End Address", key: "bAddress", width: 35 },
    { header: "Telco Provider", key: "provider", width: 15 },
    { header: "Telco Circuit ID", key: "telcoCircuitId", width: 20 },
    { header: "MRC", key: "mrc", width: 10 },
    { header: "Rate per MB", key: "rpm", width: 12 },
    { header: "OTC", key: "otc", width: 10 },
    { header: "Advance(Optional)", key: "advance", width: 10 },
    { header: "IP Count(Optional)", key: "ipCount", width: 10 },
    { header: "IP Cost(Optional)", key: "ipCost", width: 10 },
  ];

  worksheet.columns.forEach(col => col.protection = { locked: false });

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4A90E2" } };
  headerRow.eachCell(cell => cell.protection = { locked: true });

  const custFormula = customerList.length > 0 ? [`'Reference Data'!$A$1:$A$${customerList.length}`] : ['"No Customers"'];
  const activatorFormula = activatorList.length > 0 ? [`'Reference Data'!$C$1:$C$${activatorList.length}`] : ['"No Activators"'];

  for (let i = 2; i <= 1000; i++) {
    worksheet.getCell(`A${i}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: custFormula,
      showErrorMessage: false
    };

    worksheet.getCell(`B${i}`).dataValidation = {
      type: "list",
      allowBlank: false,
      formulae: activatorFormula,
      showErrorMessage: true,
      errorTitle: "Strict Selection Required",
      error: "You must select an activator from the dropdown list."
    };
    worksheet.getCell(`C${i}`).dataValidation = { type: "list", allowBlank: false, formulae: ['"DNC,Mix,ILL,Peering"'] };
    worksheet.getCell(`I${i}`).dataValidation = { type: "list", allowBlank: true, formulae: ['"Airtel,TCL,Vodafone,Jio,Other"'] };
    worksheet.getCell(`K${i}`).value = { formula: `D${i}*L${i}` };
  }

  await worksheet.protect("admin_secret_password", {
    selectLockedCells: true, selectUnlockedCells: true, formatCells: true, formatColumns: true,
    formatRows: true, insertRows: true, insertColumns: false, deleteRows: true, deleteColumns: false,
  });

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", "attachment; filename=Bulk_Connection_Template.xlsx");
  await workbook.xlsx.write(res);
  res.end();
});

const previewActiveBulkConnections = asyncHandler(async (req, res, next) => {
  if (!req.file) return next(new AppError("Please upload an Excel file", 400));

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(req.file.buffer);
  const worksheet = workbook.getWorksheet("Connection Upload");

  const validRecords = [];
  const invalidRecords = [];

  const customers = await Customer.find({}).select("email name _id managedBy billingProfile._id");
  const toMapped = (c) => ({ id: c._id, managedBy: c.managedBy, billingProfileId: singleBillingProfileId(c) });
  const customerEmailMap = new Map(customers.map(c => [c.email.toLowerCase(), toMapped(c)]));
  const customerNameMap = new Map(customers.map(c => [c.name.toLowerCase().trim(), toMapped(c)]))

  const users = await User.find({}).select("email _id");
  const userMap = new Map(users.map(u => [u.email.toLowerCase(), u._id.toString()]));

  const validServices = ["DNC", "Mix", "ILL", "Peering", "IP"];
  const validProviders = ["Airtel", "TCL", "Vodafone", "Jio", "Other"];

  const extractEmail = (rawText) => {
    if (!rawText) return null;
    const match = rawText.match(/\(([^)]+)\)/);
    return match ? match[1].toLowerCase().trim() : rawText.toLowerCase().trim();
  };

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    const rawCustomerInput = row.getCell(1).text?.trim();
    if (!rawCustomerInput) return;

    const record = {
      customerEmail: extractEmail(row.getCell(1).text),
      activatedByEmail: row.getCell(2).text?.trim().toLowerCase(),
      serviceType: row.getCell(3).text?.trim(),
      bandwidth: row.getCell(4).text?.trim(),
      aBtsId: row.getCell(5).text?.trim(),
      aAddress: row.getCell(6).text?.trim(),
      bBtsId: row.getCell(7).text?.trim(),
      bAddress: row.getCell(8).text?.trim(),
      provider: row.getCell(9).text?.trim(),
      telcoCircuitId: row.getCell(10).text?.trim(),
      mrc: parseFloat(row.getCell(11).value) || 0,
      rpm: parseFloat(row.getCell(12).value) || 0,
      otc: parseFloat(row.getCell(13).value) || 0,
      advance: parseFloat(row.getCell(14).value) || 0,
      ipCount: parseInt(row.getCell(15).value) || 0,
      ipCost: parseFloat(row.getCell(16).value) || 0,
    };

    const errors = [];

    let customerId, creatorId, billingProfileId = null;
    if (rawCustomerInput) {
      const emailMatch = rawCustomerInput.match(/\(([^)]+)\)/);
      const extractedEmail = emailMatch ? emailMatch[1].toLowerCase().trim() : null;

      if (extractedEmail && customerEmailMap.has(extractedEmail)) {
        const mapped = customerEmailMap.get(extractedEmail);
        customerId = mapped.id;
        creatorId = mapped.managedBy;
        billingProfileId = mapped.billingProfileId;
      }
      else if (customerEmailMap.has(rawCustomerInput.toLowerCase())) {
        const mapped = customerEmailMap.get(rawCustomerInput.toLowerCase());
        customerId = mapped.id;
        creatorId = mapped.managedBy;
        billingProfileId = mapped.billingProfileId;
      }
      else if (customerNameMap.has(rawCustomerInput.toLowerCase())) {
        const mapped = customerNameMap.get(rawCustomerInput.toLowerCase());
        customerId = mapped.id;
        creatorId = mapped.managedBy;
        billingProfileId = mapped.billingProfileId;
      }
      else {
        errors.push(`Customer '${rawCustomerInput}' not found. Please check spelling or use the dropdown.`);
      }
    } else {
      errors.push("Customer is required");
    }

    let activatorId;
    if (!record.activatedByEmail || !userMap.has(record.activatedByEmail)) {
      errors.push(`Activated By Email missing or not found in DB`);
    } else {
      activatorId = userMap.get(record.activatedByEmail);
    }

    if (!validServices.includes(record.serviceType)) errors.push(`Invalid Service Type: ${record.serviceType}`);
    if (record.provider && !validProviders.includes(record.provider)) errors.push(`Invalid Telco Provider: ${record.provider}`);

    if (record.serviceType === "ILL" && (!record.aBtsId || !record.aAddress)) {
      errors.push("ILL requires A-End BTS ID and Address");
    }

    if (errors.length > 0) {
      invalidRecords.push({ row: rowNumber, data: record, errors });
    } else {
      const calculatedMrc = record.bandwidth && record.rpm ? (parseInt(record.bandwidth) * parseFloat(record.rpm)) : 0;
      // "IP Cost" may be entered as a per-IP rate or a total; the MRC decides (ips.cost stores the total).
      const { totalCost: ipTotalCost, perIpCost: ipPerIpCost } = classifyIpCost({
        count: record.ipCount, cost: record.ipCost, bandwidth: record.bandwidth, ratePerMb: record.rpm, mrc: record.mrc || calculatedMrc,
      });
      validRecords.push({
        customer: customerId,
        billingProfileId,
        createdBy: creatorId,
        activatedBy: activatorId,
        serviceType: record.serviceType,
        bandwidth: record.bandwidth,
        telecoCircuitId: record.telcoCircuitId,
        technicalDetails: {
          aEnd: { btsId: record.aBtsId, address: record.aAddress },
          bEnd: { btsId: record.bBtsId, address: record.bAddress },
          telcoProvider: record.provider
        },
        commercials: {
          mrc: record.mrc || calculatedMrc, ratePerMb: record.rpm, otc: record.otc, advance: record.advance
        },
        ips: buildIps({ count: record.ipCount, totalCost: ipTotalCost, perIpCost: ipPerIpCost }),
        status: "Active",
        acceptanceDate: new Date(),
        history: [{
          action: "ACTIVATED",
          performedBy: creatorId,
          note: "Migrated via Bulk Admin Upload",
          serviceType: record.serviceType,
          bandwidth: record.bandwidth
        }]
      });
    }
  });

  res.status(200).json({ success: true, validCount: validRecords.length, invalidCount: invalidRecords.length, data: { validRecords, invalidRecords } });
});

const commitActiveBulkConnections = asyncHandler(async (req, res, next) => {
  const { connections } = req.body;

  if (!connections || !Array.isArray(connections) || connections.length === 0) {
    return next(new AppError("Please provide an array of valid connection objects", 400));
  }

  const connectionsWithIds = connections.map(conn => {
    const oppId = generateOpportunityId();
    return {
      ...conn,
      opportunityId: oppId,
      fabCircuitId: oppId
    };
  });

  const insertedConnections = await Connection.insertMany(connectionsWithIds, { ordered: false });

  res.status(201).json({
    success: true,
    message: `Successfully imported and activated ${insertedConnections.length} connections!`,
  });
});

module.exports = {
  getCustomerBulkBatches,
  uploadBulkSignedDocuments,
  downloadTemplate,
  uploadBulkConnections,
  createBulkConnections,
  activeBulkConnectionTemplate,
  previewActiveBulkConnections,
  commitActiveBulkConnections
};
