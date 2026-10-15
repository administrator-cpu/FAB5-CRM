const ExcelJS = require('exceljs');
const { generateTemplate } = require('../services/bulkConnection.service');
const { uploadDocument } = require('../services/upload.service');
const { createGeneratedCaf } = require('../services/caf.service');
const generateOpportunityId = require('../services/opportunityId.service');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');
const Connection = require('../models/connectionModel');
const User = require('../models/userModel');
const Customer = require('../models/customerModel');
const emailQueue = require("../queue/email.queue");
const ROLES = require('../constants/roles');
const { classifyIpCost } = require('../utils/ipCost');

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

const createBulkConnections = asyncHandler(async (req, res, next) => {
  const customerId = req.params.customerId;

  if (!req.files || !req.files.purchaseOrder || !req.files.purchaseOrder[0]) {
    return next(new AppError("Purchase order is required", 400));
  }
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

  const poUpload = await uploadDocument(req.files.purchaseOrder[0], "crm/connections/purchaseOrders");
  const sharedPurchaseOrders = [{
    fileName: req.files.purchaseOrder[0].originalname,
    url: poUpload.url,
    publicId: poUpload.publicId,
    storage: poUpload.storage,
    requestType: "CREATED",
  }];

  // A CAF uploaded with the batch is shared by every row; otherwise each connection gets its own generated CAF.
  let sharedCaf = null;
  if (req.files.caf && req.files.caf[0] && req.files.caf[0].size > 0) {
    const cafUpload = await uploadDocument(req.files.caf[0], "crm/connections/cafs");
    sharedCaf = {
      fileName: req.files.caf[0].originalname,
      url: cafUpload.url,
      publicId: cafUpload.publicId,
      storage: cafUpload.storage
    };
  }

  const usedOpportunityIds = new Set();
  const rowMeta = [];
  for (const row of validRows) {
    let opportunityId;
    do { opportunityId = generateOpportunityId(); } while (usedOpportunityIds.has(opportunityId));
    usedOpportunityIds.add(opportunityId);

    const caf = sharedCaf || await createGeneratedCaf({
      opportunityId,
      customer,
      connection: {
        serviceType: row.serviceType,
        bandwidth: row.bandwidth,
        ratePerMb: row.ratePerMb,
        aEndBtsId: row.AbtsId,
        aEndAddress: row.Aaddress,
        bEndBtsId: row.BbtsId,
        bEndAddress: row.Baddress,
        ipCount: row.ipCount,
      },
    });
    rowMeta.push({ opportunityId, caf });
  }

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
    opportunityId: rowMeta[index].opportunityId,
    fabCircuitId: rowMeta[index].opportunityId,
    customer: customer._id,
    billingProfileId: singleBillingProfileId(customer),
    createdBy: req.user._id,
    serviceType: row.serviceType,
    bandwidth: row.bandwidth,
    remarks: row.remarks || "",
    purchaseOrders: sharedPurchaseOrders,
    caf: rowMeta[index].caf,
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
    // The sheet's "Per IP Cost" is a per-IP rate; ips.cost stores the total.
    ips: {
      count: row.ipCount || 0,
      cost: (Number(row.ipCount) || 0) * (Number(row.ipCost) || 0)
    },
    status: "Pending",

    history: [{
      action: "CREATED",
      performedBy: req.user._id,
      date: new Date(),
      note: "Order created",
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
      ips: {
        count: row.ipCount || 0,
        cost: (Number(row.ipCount) || 0) * (Number(row.ipCost) || 0)
      },
    }],
  }))

  const createdConnections = await Connection.create(connectionsToInsert);
  ioHelper.broadcastChange("connections_mutated", {
  action: "CREATE", 
  id: createdConnections._id
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
    message: "Connections created successfully",
    data: createdConnections
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
      const { totalCost: ipTotalCost } = classifyIpCost({
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
        ips: { count: record.ipCount, cost: ipTotalCost },
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
  downloadTemplate,
  uploadBulkConnections,
  createBulkConnections,
  activeBulkConnectionTemplate,
  previewActiveBulkConnections,
  commitActiveBulkConnections
};
