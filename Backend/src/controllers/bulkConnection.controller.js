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
const { canAccessCustomer } = require('../utils/access');

// Billing profile a bulk-created connection bills to: only unambiguous when the customer has exactly one.
const singleBillingProfileId = (customer) =>
  customer?.billingProfile?.length === 1 ? customer.billingProfile[0]._id : null;
const ioHelper = require('../utils/ioHelper');
const ehastakshar = require('../services/ehastakshar.service');
const esignSend = require('../services/esignSend.service');

const withCreatedBy = async (connectionId) => {
  return await Connection
    .findById(connectionId)
    .populate("createdBy", "name email");
};

const MAX_BULK_ROWS = 100;
const BULK_SERVICE_TYPES = ["ILL", "DNC", "Mix", "Peering"];
const ACTIVE_SERVICE_TYPES = ["DNC", "Mix", "ILL", "Peering", "IP"]; // migrated (already active) connections
const TELCO_PROVIDERS = ["Airtel", "TCL", "Vodafone", "Jio", "Other"];
const trimIfString = (value) => (typeof value === "string" ? value.trim() : value);

// Normalizes one bulk-upload row in place and returns its errors and the server-side MRC.
// Used by the preview and again by the create step, which receives the rows back from the browser.
const validateBulkRow = (row) => {
  const errors = [];

  const rawServiceType = String(row.serviceType || "").trim();
  const matchedType = BULK_SERVICE_TYPES.find((type) => type.toLowerCase() === rawServiceType.toLowerCase());
  const serviceType = matchedType || rawServiceType;
  row.serviceType = serviceType;

  const rawProvider = String(row.telcoProvider || "").trim();
  const matchedProvider = TELCO_PROVIDERS.find((p) => p.toLowerCase() === rawProvider.toLowerCase());
  row.telcoProvider = matchedProvider || rawProvider;

  for (const key of ["AbtsId", "Aaddress", "Alatitude", "Alongitude", "BbtsId", "Baddress", "Blongitude", "Blatitude"]) {
    row[key] = trimIfString(row[key]);
  }

  const bandwidth = Number(row.bandwidth || 0);
  const ratePerMb = Number(row.ratePerMb || 0);
  if (!ratePerMb || ratePerMb <= 0) errors.push("ratePerMb is required");
  const ipCount = Number(row.ipCount || 0);
  const ipCost = Number(row.ipCost || 0);
  const mrc = Number(row.mrc || 0);

  if (!serviceType) {
    errors.push("serviceType is required");
  } else if (!BULK_SERVICE_TYPES.includes(serviceType)) {
    errors.push(`Invalid service type. Allowed: ${BULK_SERVICE_TYPES.join(', ')}`);
  }

  if (!row.telcoProvider) {
    errors.push("TelcoProvider is required");
  } else if (!matchedProvider) {
    errors.push(`Invalid telcoProvider: '${rawProvider}'. Allowed: ${TELCO_PROVIDERS.join(', ')}`);
  }

  if (!bandwidth) errors.push("bandwidth is required");
  else if (!(bandwidth > 0)) errors.push("bandwidth must be a positive number");
  if (!(ipCount >= 0) || !(ipCost >= 0)) errors.push("IP count and IP cost cannot be negative");
  if (!(Number(row.otc || 0) >= 0) || !(Number(row.advance || 0) >= 0)) errors.push("OTC and advance cannot be negative");
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

  return { errors, calculatedMrc };
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

  if (rows.length > MAX_BULK_ROWS) {
    return res.status(400).json({
      success: false,
      message: `Maximum ${MAX_BULK_ROWS} rows allowed`,
    });
  }

  const validRows = [];
  const invalidRows = [];

  rows.forEach((row) => {
    const { errors, calculatedMrc } = validateBulkRow(row);

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

  if (!Array.isArray(validRows) || validRows.length === 0) {
    return next(new AppError("No valid connections to process", 400));
  }
  if (validRows.length > MAX_BULK_ROWS) {
    return next(new AppError(`Maximum ${MAX_BULK_ROWS} rows allowed`, 400));
  }

  // The rows come back from the browser, so the preview's checks are repeated here and the
  // MRC is always the server's own calculation.
  const rowErrors = [];
  validRows = validRows.map((row, index) => {
    const normalized = row && typeof row === "object" && !Array.isArray(row) ? { ...row } : {};
    const { errors, calculatedMrc } = validateBulkRow(normalized);
    if (errors.length) rowErrors.push(`Row ${normalized.excelRowNumber || index + 1}: ${errors.join(", ")}`);
    return { ...normalized, calculatedMrc };
  });
  if (rowErrors.length) {
    return next(new AppError(`Some rows are invalid. ${rowErrors.slice(0, 5).join("; ")}`, 400));
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
  esignRequests: batch.esignRequests || [],
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

// Sends the batch CAF and/or PO for eSign once; when signed, the e-Hastakshar callback adds the
// signed copies to every connection of the batch that hasn't been approved (like the upload above).
const sendBatchForEsign = asyncHandler(async (req, res, next) => {
  if (!ehastakshar.isConfigured()) return next(esignSend.notConfiguredError());

  const batch = await BulkBatch.findById(req.params.batchId);
  if (!batch) return next(new AppError("Bulk batch not found", 404));

  const customer = await Customer.findById(batch.customer).select("name managedBy");
  if (!canAccessCustomer(req.user, customer)) {
    return next(new AppError("You can only send documents for your own customers", 403));
  }

  const connections = await Connection.find({ bulkBatch: batch._id, status: LIVE_BATCH_CONNECTION });
  const open = connections.filter((conn) => !areSignedDocumentsLocked(conn));
  if (open.length === 0) {
    return next(new AppError("Every connection in this batch is approved, deleted or cancelled — nothing left to sign", 400));
  }

  const { signers, error } = esignSend.parseSigners(req.body);
  if (error) return next(error);

  const requested = Array.isArray(req.body.documents) ? req.body.documents : ["CAF", "PO"];
  const docTypes = ["CAF", "PO"].filter((docType) => {
    const key = docType.toLowerCase();
    return requested.includes(docType) && !batch.signedDocuments?.[key]?.url && batch.generatedDocuments?.[key]?.url;
  });
  if (docTypes.length === 0) return next(new AppError("There is no unsigned CAF or PO to send for this batch", 400));

  const outcome = await esignSend.sendDocuments({
    // Both unsigned: sent as one combined CAF & PO PDF, so the customer signs once.
    documents: esignSend.cafPoDocuments({
      docTypes,
      generatedOf: (docType) => batch.generatedDocuments[docType.toLowerCase()],
      customerName: customer?.name,
      ref: batch.batchNumber,
      titleSuffix: ` (${connections.length} links)`,
    }),
    signers,
    sentBy: req.user._id,
    logRef: batch.batchNumber,
  });

  if (outcome.sent.length > 0) {
    batch.esignRequests.push(...outcome.requests);
    await batch.save();
    const note = `Bulk batch ${batch.batchNumber} ${outcome.sent.join(" & ")} sent for eSign. Signing order: ${esignSend.signerSummary(signers)}`;
    await Connection.updateMany(
      { _id: { $in: open.map((conn) => conn._id) } },
      { $push: { history: { action: "ESIGN_SENT", performedBy: req.user._id, date: new Date(), note } } },
    );
    ioHelper.broadcastChange("connections_mutated", { action: "UPDATE", id: batch._id });
    logger.info("Bulk batch sent for eSign", { batchNumber: batch.batchNumber, documents: outcome.sent, by: req.user._id });
  }
  if (outcome.failure) return next(esignSend.failureError(outcome));

  res.status(200).json({
    success: true,
    message: esignSend.successMessage(outcome.sent, signers),
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

  // The rows come back from the browser, so each connection is rebuilt from the preview's fields
  // only: status and history are always set here, and ownership always follows the customer's manager.
  const idsOf = (key) => [...new Set(connections.map((conn) => String(conn?.[key] || "")))].filter((id) => mongoose.isValidObjectId(id));
  const [customers, activators] = await Promise.all([
    Customer.find({ _id: { $in: idsOf("customer") } }).select("managedBy billingProfile._id").lean(),
    User.find({ _id: { $in: idsOf("activatedBy") } }).select("_id").lean(),
  ]);
  const customerById = new Map(customers.map((c) => [String(c._id), c]));
  const activatorIds = new Set(activators.map((u) => String(u._id)));

  const text = (value) => (value === undefined || value === null ? undefined : String(value));
  const amount = (value) => (value === undefined || value === null || value === "" ? 0 : Number(value));
  const rowErrors = [];

  const connectionsWithIds = connections.map((conn, index) => {
    const label = `Row ${index + 1}`;
    const customer = customerById.get(String(conn?.customer));
    if (!customer) { rowErrors.push(`${label}: customer not found`); return null; }
    if (!activatorIds.has(String(conn.activatedBy))) { rowErrors.push(`${label}: activated-by user not found`); return null; }
    if (!ACTIVE_SERVICE_TYPES.includes(conn.serviceType)) { rowErrors.push(`${label}: invalid service type`); return null; }
    const provider = conn.technicalDetails?.telcoProvider;
    if (provider && !TELCO_PROVIDERS.includes(provider)) { rowErrors.push(`${label}: invalid telco provider`); return null; }

    const commercials = {
      mrc: amount(conn.commercials?.mrc),
      ratePerMb: amount(conn.commercials?.ratePerMb),
      otc: amount(conn.commercials?.otc),
      advance: amount(conn.commercials?.advance),
    };
    if (Object.values(commercials).some((value) => !Number.isFinite(value) || value < 0)) {
      rowErrors.push(`${label}: MRC, rate, OTC and advance must be zero or more`);
      return null;
    }

    const billingProfileId = (customer.billingProfile || []).some((p) => String(p._id) === String(conn.billingProfileId))
      ? conn.billingProfileId
      : null;
    const aEnd = conn.technicalDetails?.aEnd || {};
    const bEnd = conn.technicalDetails?.bEnd || {};
    const oppId = generateOpportunityId();
    return {
      opportunityId: oppId,
      fabCircuitId: oppId,
      customer: customer._id,
      billingProfileId,
      createdBy: customer.managedBy,
      activatedBy: conn.activatedBy,
      serviceType: conn.serviceType,
      bandwidth: text(conn.bandwidth),
      telecoCircuitId: text(conn.telecoCircuitId),
      technicalDetails: {
        aEnd: { btsId: text(aEnd.btsId), address: text(aEnd.address) },
        bEnd: { btsId: text(bEnd.btsId), address: text(bEnd.address) },
        telcoProvider: provider || undefined,
      },
      commercials,
      ips: buildIps({ count: conn.ips?.count, totalCost: conn.ips?.cost, perIpCost: conn.ips?.perIpCost || undefined }),
      status: "Active",
      acceptanceDate: new Date(),
      history: [{
        action: "ACTIVATED",
        performedBy: customer.managedBy,
        note: "Migrated via Bulk Admin Upload",
        serviceType: conn.serviceType,
        bandwidth: text(conn.bandwidth),
      }],
    };
  });

  if (rowErrors.length) {
    return next(new AppError(`Some rows are invalid. ${rowErrors.slice(0, 5).join("; ")}`, 400));
  }

  const insertedConnections = await Connection.insertMany(connectionsWithIds, { ordered: false });

  res.status(201).json({
    success: true,
    message: `Successfully imported and activated ${insertedConnections.length} connections!`,
  });
});

module.exports = {
  getCustomerBulkBatches,
  uploadBulkSignedDocuments,
  sendBatchForEsign,
  downloadTemplate,
  uploadBulkConnections,
  createBulkConnections,
  activeBulkConnectionTemplate,
  previewActiveBulkConnections,
  commitActiveBulkConnections
};
