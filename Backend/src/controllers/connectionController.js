const mongoose = require("mongoose");
const archiver = require("archiver");
const CompanyPO = require("../models/po.model.js");
const { generateGlobalPoNumber, getPdfTemplatePath, generatePoExcel, generatePoPdf } = require("../utils/documentGenerators");
const Connection = require("../models/connectionModel");
const Customer = require("../models/customerModel");
const { uploadToCloudinary } = require("../services/upload.service");
const { sendConnectionEmail, sendChangeEmail } = require("../services/sendEmail");
const emailQueue = require("../queue/email.queue");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const ROLES = require("../constants/roles");
const ioHelper = require("../utils/ioHelper.js");

const buildSnapshot = (connection) => ({
  serviceType: connection.serviceType,
  bandwidth: connection.bandwidth,
  technicalDetails: connection.technicalDetails,
  commercials: connection.commercials,
  ips: connection.ips,
  terminationDetails: connection.terminationDetails || {},
});

const getRequestType = (historyArray) => {
  const recentHistory = [...historyArray].reverse();
  const definingAction = recentHistory.find(entry =>
    ["CREATED", "UPGRADE", "DOWNGRADE", "SHIFTING"].includes(entry.action)
  );
  return definingAction ? definingAction.action : "CREATED";
};

const withCreatedBy = async (connectionId) => {
  return await Connection
    .findById(connectionId)
    .populate("createdBy", "name email");
};

const createConnection = asyncHandler(async (req, res, next) => {
  const customerId = req.params.customerId;
  const {
    AbtsId, Aaddress, Alatitude, Alongitude,
    BbtsId, Baddress, Blatitude, Blongitude,
    telcoProvider,
    serviceType, bandwidth,
    mrc, otc, advance, ratePerMb, remarks,
    ipCount, ipCost,
  } = req.body;


  if (!bandwidth || !mrc) {
    return next(new AppError("mrc and Bandwidth are required", 400));
  }

  const customer = await Customer.findById(customerId);
  if (!customer) return next(new AppError("Customer not found", 404));

  if (req.user.role === ROLES.EMPLOYEE && !customer.managedBy.equals(req.user._id)) {
    return next(new AppError("You can only create orders for your own customers", 403));
  }

  if (!req.files || !req.files.purchaseOrder || !req.files.purchaseOrder[0] || req.files.purchaseOrder[0].size === 0) {
    return next(new AppError("A valid purchase order is required", 400));
  }
  if (!req.files || !req.files.caf || !req.files.caf[0] || req.files.caf[0].size === 0) {
    return next(new AppError("A valid CAF is required", 400));
  }

  let purchaseOrders = [];
  let businessAgreement = null;
  let caf = null;

  if (req.files) {
    if (req.files.purchaseOrder && req.files.purchaseOrder[0]) {
      const file = req.files.purchaseOrder[0];
      const uploaded = await uploadToCloudinary(file, "crm/connections/purchaseOrders");
      purchaseOrders.push({
        fileName: file.originalname,
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
        requestType: "CREATED"
      });
    }

    if (req.files.businessAgreement && req.files.businessAgreement[0]) {
      const file = req.files.businessAgreement[0];
      if (file.size > 0) {
        const uploaded = await uploadToCloudinary(file, "crm/connections/businessAgreements");
        businessAgreement = {
          fileName: file.originalname,
          url: uploaded.secure_url,
          publicId: uploaded.public_id,
        };
      }
    }

    if (req.files.caf && req.files.caf[0]) {
      const file = req.files.caf[0];
      const uploaded = await uploadToCloudinary(file, "crm/connections/cafs");
      caf = {
        fileName: file.originalname,
        url: uploaded.secure_url,
        publicId: uploaded.public_id,
      };
    }
  }

  const connection = await Connection.create({
    customer: customerId,
    createdBy: req.user._id,
    serviceType,
    bandwidth,
    remarks: remarks || "",
    purchaseOrders,
    businessAgreement: businessAgreement || undefined,
    caf,
    technicalDetails: {
      aEnd: { btsId: AbtsId, address: Aaddress, latitude: Alatitude, longitude: Alongitude },
      bEnd: { btsId: BbtsId, address: Baddress, latitude: Blatitude, longitude: Blongitude },
      telcoProvider,
    },
    commercials: {
      mrc: mrc || 0,
      ratePerMb: ratePerMb || 0,
      otc: otc || 0,
      advance: advance || 0,
    },
    ips: {
      count: ipCount || 0,
      cost: ipCost || 0
    },
    status: "Pending",
    history: [{
      action: "CREATED",
      performedBy: req.user._id,
      date: new Date(),
      note: "Order created",
      serviceType,
      bandwidth,
      technicalDetails: {
        aEnd: { btsId: AbtsId, address: Aaddress, latitude: Alatitude, longitude: Alongitude },
        bEnd: { btsId: BbtsId, address: Baddress, latitude: Blatitude, longitude: Blongitude },
        telcoProvider,
      },
      commercials: {
        mrc: mrc || 0,
        ratePerMb: ratePerMb || 0,
        otc: otc || 0,
        advance: advance || 0,
      },
      ips: {
        count: ipCount || 0,
        cost: ipCost || 0
      },
    }],
  });
  ioHelper.broadcastChange("connections_mutated", {
    action: "CREATE",
    id: connection._id
  });

  logger.info("Connection created", {
    opportunityId: connection.opportunityId,
    customerId,
    createdBy: req.user._id,
  });

  try {
    const populated = await withCreatedBy(connection._id);

    await emailQueue.add(
      "sendEmail",
      {
        type: "WELCOME",
        data: populated,
        user: req.user,
      },
      {
        attempts: 3,
        backoff: { type: "exponential", delay: 1000 },
      }
    );
  } catch (error) {
    logger.error("Failed to send WELCOME email", {
      opportunityId: connection.opportunityId,
      error: error.message,
    });
  }

  res.status(201).json({
    success: true,
    message: "Order created successfully",
    connection,
  });
});

const connectionByCustomer = asyncHandler(async (req, res, next) => {
  const customer = await Customer.findById(req.params.customerId);
  if (!customer) return next(new AppError("Customer not found", 404));

  if (req.user.role === ROLES.EMPLOYEE && !customer.managedBy.equals(req.user._id)) {
    return next(new AppError("You can only view your own customers", 403));
  }

  const connections = await Connection.find({
    customer: req.params.customerId,
    status: { $ne: "Deleted" },
  })
    .sort({ createdAt: -1 }).populate("customer");

  res.status(200).json({
    success: true,
    count: connections.length,
    connections,
  });
});

const getConnectionById = asyncHandler(async (req, res, next) => {
  const connection = await Connection.findOne({
    _id: req.params.id,
    status: { $ne: "Deleted" },
  }).populate("customer", "name email mobile person")
    .populate("createdBy", "name email role")
    .populate("approvedBy", "name email role")
    .populate("activatedBy", "name email role")
    .populate("history.performedBy", "name email role");

  if (!connection) return next(new AppError("Connection not found", 404));

  res.status(200).json({ success: true, connection });
});

const getConnectionsByStatus = asyncHandler(async (req, res, next) => {
  const { status } = req.params;
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 25;
  const skip = (page - 1) * limit;

  const validStatuses = ["Pending", "Approved", "Generation", "Active", "Notice Period", "Disconnected", "Rejected"];
  if (!validStatuses.includes(status)) {
    return next(new AppError(`Invalid status. Must be one of: ${validStatuses.join(", ")}`, 400));
  }

  if (req.user.role === ROLES.ORDER_GENERATION && status !== "Approved") {
    return next(new AppError("Order Generation can only view Approved orders", 403));
  }
  if (req.user.role === ROLES.PROJECT_MANAGER && status !== "Generation") {
    return next(new AppError("Project Manager can only view Generation orders", 403));
  }

  let query = { status };
  if (req.user.role === ROLES.EMPLOYEE) {
    const myCustomers = await Customer.find({ managedBy: req.user._id }, { _id: 1 });
    query.customer = { $in: myCustomers.map((c) => c._id) };
  }

  const [connections, total] = await Promise.all([
    Connection.find(query)
      .populate("customer", "name email mobile person managedBy")
      .populate("createdBy", "name email")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 }),
    Connection.countDocuments(query),
  ]);

  res.status(200).json({
    success: true,
    status,
    total,
    page,
    pages: Math.ceil(total / limit),
    connections,
  });
});

const approveConnection = asyncHandler(async (req, res, next) => {
  const connection = await Connection.findById(req.params.id);
  if (!connection) return next(new AppError("Connection not found", 404));

  if (connection.status !== "Pending") {
    return next(new AppError(`Cannot approve — current status is ${connection.status}`, 400));
  }
  if (connection.status === "Cancelled") {
    return next(new AppError(`Cannot approve a cancelled connection`, 400));
  }

  const recentHistory = [...connection.history].reverse();
  const definingAction = recentHistory.find(entry =>
    ["CREATED", "UPGRADE", "DOWNGRADE", "SHIFTING", "RATE_REVISION", "IP_ADDITION"].includes(entry.action)
  );
  const requestType = definingAction ? definingAction.action : null;

  const lastAction = connection.history[connection.history.length - 1]?.action;
  if (requestType === "RATE_REVISION") {
    if (!connection.scheduledRateRevision) {
      return next(new AppError("Scheduled rate revision data is missing from this connection.", 400));
    }

    const today = new Date();
    const firstOfNextMonth = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    connection.scheduledRateRevision.effectiveDate = firstOfNextMonth;
    connection.status = "Active";
    connection.remarks = "";
    connection.history.push({
      action: "ACTIVATED",
      performedBy: req.user._id,
      date: new Date(),
      note: `Rate Revision Approved. New rate will automatically activate on ${firstOfNextMonth.toLocaleDateString("en-IN", { day: 'numeric', month: 'short', year: 'numeric' })}.`,
      ...buildSnapshot(connection),
    });

    await connection.save();

    return res.status(200).json({
      success: true,
      message: "Rate Revision approved. New rates will apply on the 1st of next month.",
      opportunityId: connection.opportunityId,
      status: connection.status,
    });
  }

  connection.status = "Approved";
  connection.approvedBy = req.user._id;
  connection.history.push({
    action: "APPROVED",
    performedBy: req.user._id,
    date: new Date(),
    note: req.body.note || "Approved",
    ...buildSnapshot(connection),
  })
  await connection.save();
  ioHelper.broadcastChange("connections_mutated", {
    action: "UPDATE",
    id: connection._id
  });

  logger.info("Connection Approved", {
    opportunityId: connection.opportunityId,
    approvedBy: req.user._id,
  })

  try {
    const populated = await withCreatedBy(connection._id);
    await sendConnectionEmail("ORDER_APPROVED", populated, req.user);
  } catch (error) {
    logger.error("Failed to send ORDER_APPROVED email", {
      opportunityId: connection.opportunityId,
      error: error.message,
    });
  }

  res.status(200).json({
    success: true,
    message: "Connection Approved Successfully",
    opportunityId: connection.opportunityId,
    status: connection.status,
  });
});

const rejectConnection = asyncHandler(async (req, res, next) => {
  const { reason } = req.body
  if (!reason) return next(new AppError("Rejection reason is required", 400));

  const connection = await Connection.findById(req.params.id);
  if (!connection) return next(new AppError("Connection not found", 404));

  const nonRejectableStatuses = ["Active", "Notice Period", "Disconnected", "Rejected"];
  if (nonRejectableStatuses.includes(connection.status)) {
    return next(new AppError(`Cannot reject a connection with status: ${connection.status}`, 400));
  }

  connection.status = "Rejected";
  connection.rejectionDetails = {
    reason,
    rejectedBy: req.user._id,
    rejectedAt: new Date(),
  };
  connection.history.push({
    action: "REJECTED",
    performedBy: req.user._id,
    note: reason,
    ...buildSnapshot(connection),
  });
  await connection.save();

  ioHelper.broadcastChange("connections_mutated", {
    action: "REJECTED",
    id: connection._id
  });


  logger.info("Connection Rejected", {
    opportunityId: connection.opportunityId,
    rejectedBy: req.user._id,
    reason,
  })

  try {
    const populated = await withCreatedBy(connection._id);
    await sendConnectionEmail("ORDER_REJECTED", populated, req.user);
  } catch (error) {
    logger.error("Failed to send ORDER_REJECTED email", {
      opportunityId: connection.opportunityId,
      error: error.message,
    });
  }

  res.status(200).json({
    success: true,
    message: "Connection rejected",
    opportunityId: connection.opportunityId,
    status: connection.status,
  });
});

const updateProviderCost = asyncHandler(async (req, res, next) => {
  const { ratePerMb } = req.body;

  if (ratePerMb === undefined) {
    return next(new AppError("ratePerMb are required", 400));
  }

  const connection = await Connection.findById(req.params.id);
  if (!connection) {
    return next(new AppError("Connection not found", 404));
  }

  const bandwidth = Number(connection.bandwidth || 0);
  const ipCount = Number(connection.ips?.count || 0);
  const ipCost = Number(connection.ips?.cost || 0);
  const providedRate = Number(ratePerMb);

  const calculatedMrc = (providedRate * bandwidth) + (ipCount * ipCost)

  if (
    connection.providerCost?.ratePerMb === providedRate &&
    connection.providerCost?.mrc === connection.commercials.mrc
  ) {
    return res.status(200).json({
      success: true,
      message: "No changes detected. Provider cost remains the same.",
      providerCost: connection.providerCost
    });
  }

  connection.providerCost = {
    ratePerMb: providedRate,

    mrc: calculatedMrc,

    updatedAt: new Date(),
  };

  await connection.save();

  ioHelper.broadcastChange("connections_mutated", {
    action: "UPDATE",
    id: connection._id
  });

  logger.info("Provider cost updated", {
    opportunityId: connection.opportunityId,
    updatedBy: req.user._id,

    newMrc: calculatedMrc,
  });

  res.status(200).json({
    success: true,
    message: "Provider cost saved successfully",
    providerCost: connection.providerCost
  });
});

const markAsGeneration = asyncHandler(async (req, res, next) => {
  const { connectionIds } = req.body;

  if (!connectionIds || !Array.isArray(connectionIds) || connectionIds.length === 0) {
    return next(new AppError("Please select at least one connection", 400));
  }

  const validIds = connectionIds.filter(id => id && mongoose.isValidObjectId(id));
  if (validIds.length !== connectionIds.length) {
    return next(new AppError("One or more provided Connection IDs are invalid or empty.", 400));
  }

  const connections = await Connection.find({ _id: { $in: validIds } });
  if (connections.length !== validIds.length) {
    return next(new AppError("One or more connections could not be found", 404));
  }

  const unapproved = connections.filter(c => c.status !== "Approved");
  if (unapproved.length > 0) {
    return next(new AppError("All selected connections must be in 'Approved' status", 400));
  }

  const NLD_FAMILY = ["DNC", "Mix", "Peering"];
  const getServiceFamily = (serviceType) => {
    if (NLD_FAMILY.includes(serviceType)) return "NLD";
    return serviceType;
  };
  const baseServiceType = connections[0].serviceType;
  const baseServiceFamily = getServiceFamily(connections[0].serviceType);
  const baseRequestType = getRequestType(connections[0].history);
  const baseIsIpAddition = Boolean(connections[0].isIpAdditionRequest);

  for (const conn of connections) {
    const currentReqType = getRequestType(conn.history);
    const currentServiceFamily = getServiceFamily(conn.serviceType);
    const currentIsIpAddition = Boolean(conn.isIpAdditionRequest);
    if (currentIsIpAddition !== baseIsIpAddition) {
      return next(new AppError(`Mixed batches are not allowed! You cannot mix IP Addition requests with standard requests.`, 400));
    }

    if (currentServiceFamily !== baseServiceFamily || currentReqType !== baseRequestType) {
      return next(new AppError(`Mixed batches are not allowed! You cannot mix ${baseServiceFamily} (${connections[0].serviceType}) ${baseRequestType} with ${currentServiceFamily} (${conn.serviceType}) ${currentReqType}.`, 400));
    }

    if (!currentIsIpAddition) {
      if (!conn.providerCost || !conn.providerCost.mrc || conn.providerCost.mrc <= 0) {
        return next(new AppError(`Provider Cost is missing or zero for Connection ID: ${conn.opportunityId}. Please update the provider cost first!`, 400));
      }
    }

    const btsA = conn.technicalDetails?.aEnd?.btsId;
    const addrA = conn.technicalDetails?.aEnd?.address;
    const btsB = conn.technicalDetails?.bEnd?.btsId;
    const addrB = conn.technicalDetails?.bEnd?.address;

    if (conn.serviceType === "ILL") {
      if (!btsA || !addrA) {
        return next(new AppError(`A-End Details (BTS ID or Address) are missing for ILL Connection ID: ${conn.opportunityId}.`, 400));
      }
    } else {
      if (!btsA || !addrA || !btsB || !addrB) {
        return next(new AppError(`Both A-End and B-End Details are required for NLD connections. Missing on: ${conn.opportunityId}.`, 400));
      }
    }
  }

  const processedOpportunityIds = connections.map(c => c.opportunityId);

  if (baseIsIpAddition) {
    for (const connection of connections) {
      connection.status = "Generation";
      connection.history.push({
        action: "GENERATION",
        performedBy: req.user._id,
        date: new Date(),
        note: req.body.note || "IP Addition processing in Generation",
        ...buildSnapshot(connection),
      });

      await connection.save();
      ioHelper.broadcastChange("connections_mutated", {
        action: "GENERATION",
        id: connection._id
      });

      logger.info("Connection marked as Generation (IP Addition)", {
        opportunityId: connection.opportunityId,
        by: req.user._id,
      });
    }

    return res.status(200).json({
      success: true,
      message: "IP Addition requests successfully moved to Generation status.",
    });
  }

  let templatePath;
  try {
    templatePath = getPdfTemplatePath(baseServiceType, connections[0].history);
  } catch (error) {
    return next(error);
  }

  const { poNumber, financialYear } = await generateGlobalPoNumber();
  const safePoName = poNumber.replace(/\//g, '_');

  const excelBuffer = await generatePoExcel(connections);
  const pdfBuffer = await generatePoPdf(templatePath, poNumber);

  const excelUpload = await uploadToCloudinary({ buffer: excelBuffer }, "crm/company_pos");
  const pdfUpload = await uploadToCloudinary({ buffer: pdfBuffer }, "crm/company_pos");

  const companyPoRecord = await CompanyPO.create({
    poNumber: poNumber,
    financialYear: financialYear,
    connections: validIds,
    generatedBy: req.user._id,
    pdfUrl: pdfUpload.secure_url,
    excelUrl: excelUpload.secure_url
  });

  for (const connection of connections) {
    connection.status = "Generation";
    connection.history.push({
      action: "GENERATION",
      performedBy: req.user._id,
      date: new Date(),
      note: req.body.note || "Under provisioning",
      ...buildSnapshot(connection),
    });

    await connection.save()
    ioHelper.broadcastChange("connections_mutated", {
      action: "GENERATION",
      id: connection._id
    });
    logger.info("Connection marked as Generation", {
      opportunityId: connection.opportunityId,
      by: req.user._id,
    });
  }

  res.attachment(`${safePoName}.zip`);
  const archive = archiver("zip", { zlib: { level: 9 } });

  archive.on("error", (err) => {
    logger.error("Archiver error during ZIP creation", { error: err });
    if (!res.headersSent) return next(new AppError("Error generating ZIP file", 500));
  });

  archive.pipe(res);
  archive.append(pdfBuffer, { name: `${safePoName}.pdf` });
  archive.append(excelBuffer, { name: `${safePoName}.xlsx` });

  await archive.finalize();
});

const activateConnection = asyncHandler(async (req, res, next) => {
  const { telecoCircuitId, acceptanceDate } = req.body;

  if (!telecoCircuitId) return next(new AppError("Telecom Circuit ID (LSI ID) is required", 400));
  if (!acceptanceDate) return next(new AppError("Acceptance date is required", 400));

  const connection = await Connection.findById(req.params.id);
  if (!connection) return next(new AppError("Connection not found", 404));

  if (connection.status !== "Generation") {
    return next(new AppError(`Cannot activate — current status is ${connection.status}`, 400));
  }

  const formattedDate = new Date(acceptanceDate).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  connection.status = "Active";
  connection.telecoCircuitId = telecoCircuitId;
  connection.acceptanceDate = new Date(acceptanceDate);
  connection.remarks = "";
  connection.activatedBy = req.user._id;
  if (connection.isIpAdditionRequest) {
    connection.isIpAdditionRequest = false;
  }
  connection.history.push({
    action: "ACTIVATED",
    performedBy: req.user._id,
    date: new Date(acceptanceDate),
    note: `Activated on ${formattedDate}`,
    ...buildSnapshot(connection),
  });

  await connection.save();
  ioHelper.broadcastChange("connections_mutated", {
    action: "ACTIVATED",
    id: connection._id
  });

  logger.info("Connection activated", {
    opportunityId: connection.opportunityId,
    telecoCircuitId,
    acceptanceDate: formattedDate,
    activatedBy: req.user._id,
  });

  try {
    const populated = await withCreatedBy(connection._id);
    await sendConnectionEmail("ACTIVATED", populated, req.user);
  } catch (error) {
    logger.error("Failed to send ACTIVATED email", {
      opportunityId: connection.opportunityId,
      error: error.message,
    });
  }

  res.status(200).json({
    success: true,
    message: "Connection activated successfully",
    opportunityId: connection.opportunityId,
    fabCircuitId: connection.fabCircuitId,
    telecoCircuitId: connection.telecoCircuitId,
    status: connection.status,
  });
});

const editConnection = asyncHandler(async (req, res, next) => {
  const { serviceType, bandwidth, mrc, ratePerMb, remarks } = req.body;

  const connection = await Connection.findOne({
    _id: req.params.id,
    status: { $ne: "Deleted" },
  });
  if (!connection) return next(new AppError("Connection not found", 404));

  if (connection.status !== "Active") {
    return next(new AppError("Can only edit active connections", 400));
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    const customer = await Customer.findById(connection.customer);
    if (!customer?.managedBy.equals(req.user._id)) {
      return next(new AppError("You can only edit your own customers' connections", 403));
    }
  }
  const isRateRevision = ratePerMb !== undefined && Number(ratePerMb) !== Number(connection.commercials.ratePerMb) && (!bandwidth || Number(bandwidth) === Number(connection.bandwidth));
  if (isRateRevision) {
    const oldRate = connection.commercials.ratePerMb;
    const oldMrc = connection.commercials.mrc;
    const formattedOldMrc = new Intl.NumberFormat("en-IN").format(oldMrc);
    const formattedNewMrc = new Intl.NumberFormat("en-IN").format(mrc);
    connection.scheduledRateRevision = {
      mrc: mrc,
      ratePerMb: ratePerMb,
      date: new Date(),
    };
    connection.status = "Pending";
    connection.history.push({
      action: "RATE_REVISION",
      performedBy: req.user._id,
      date: new Date(),
      note: `Rate Revised ${oldRate} → ${ratePerMb} per MB.. (MRC: ₹${formattedOldMrc} → ₹${formattedNewMrc}). Scheduled for next billing cycle.`,
      ...buildSnapshot(connection),
    });
    await connection.save();

    return res.status(200).json({
      success: true,
      message: "Rate revision requested successfully",
      status: connection.status,
    })
  }

  const oldBandwidth = parseInt(connection.bandwidth);
  const newBandwidth = parseInt(bandwidth);
  const actionType = bandwidth && oldBandwidth > newBandwidth ? "DOWNGRADE" : "UPGRADE";

  if (connection.scheduledRateRevision) {
    connection.scheduledRateRevision = undefined
  }

  if (serviceType) connection.serviceType = serviceType;
  if (bandwidth) connection.bandwidth = bandwidth;
  if (mrc !== undefined) connection.commercials.mrc = mrc;
  if (ratePerMb !== undefined) connection.commercials.ratePerMb = ratePerMb;
  if (remarks) connection.remarks = remarks;

  if (!req.files && !req.files.purchaseOrder || !req.files.purchaseOrder[0]) {
    return next(new AppError("A Purchase Order (PO) document is mandatory for bandwidth modifications.", 400));
  }
  const poFile = req.files.purchaseOrder[0];
  const uploadResult = await uploadToCloudinary(poFile, "crm/connections/purchaseOrders");

  connection.purchaseOrders.push({
    fileName: poFile.originalname,
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    requestType: actionType
  });

  connection.status = "Pending";
  connection.history.push({
    action: actionType,
    performedBy: req.user._id,
    date: new Date(),
    note: `${actionType}: ${oldBandwidth} → ${newBandwidth}`,
    ...buildSnapshot(connection),
  });
  connection.providerCost = { mrc: 0, ratePerMb: 0 };
  await connection.save();
  ioHelper.broadcastChange("connections_mutated", {
    action: "UPDATE",
    id: connection._id
  });
  logger.info("Connection edited", {
    opportunityId: connection.opportunityId,
    createdBy: req.user._id,
    action: actionType
  })

  if (actionType === "UPGRADE" || actionType === "DOWNGRADE") {
    try {
      const populated = await withCreatedBy(connection._id);
      await sendChangeEmail(actionType, {
        opportunityId: populated.opportunityId,
        oldBandwidth,
        newBandwidth,
        createdBy: populated.createdBy,
      }, req.user);
    } catch (error) {
      logger.error(`Failed to send ${actionType} email`, {
        opportunityId: connection.opportunityId,
        error: error.message,
      });
    }
  }

  res.status(200).json({
    success: true,
    message: `${actionType} request submitted — awaiting approval`,
    opportunityId: connection.opportunityId,
  });
});

const editRejectedConnection = asyncHandler(async (req, res, next) => {
  const {
    AbtsId, Aaddress,
    BbtsId, Baddress,
    telcoProvider,
    serviceType, bandwidth,
    mrc, otc, advance, ratePerMb,
    ipCount, ipCost,
  } = req.body;

  const connection = await Connection.findById(req.params.id);
  if (!connection) return next(new AppError("Connection not found", 404));

  if (connection.status !== "Rejected" && connection.status !== "Pending") {
    return next(new AppError(`Cannot edit a connection with status: ${connection.status}`, 400));
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    const customer = await Customer.findById(connection.customer);
    if (!customer?.managedBy.equals(req.user._id)) {
      return next(new AppError("You can only edit your own customers' connections", 403));
    }
  }
  const previousStatus = connection.status;
  if (serviceType) connection.serviceType = serviceType;
  if (bandwidth) connection.bandwidth = bandwidth;

  if (AbtsId) connection.technicalDetails.aEnd.btsId = AbtsId;
  if (Aaddress) connection.technicalDetails.aEnd.address = Aaddress;
  if (BbtsId) connection.technicalDetails.bEnd.btsId = BbtsId;
  if (Baddress) connection.technicalDetails.bEnd.address = Baddress;
  if (telcoProvider) connection.technicalDetails.telcoProvider = telcoProvider;

  if (mrc) connection.commercials.mrc = mrc;
  if (ratePerMb) connection.commercials.ratePerMb = ratePerMb;
  if (otc) connection.commercials.otc = otc;
  if (advance) connection.commercials.advance = advance;
  if (ipCount) connection.ips.count = ipCount;
  if (ipCost) connection.ips.cost = ipCost;

  if (previousStatus === "Rejected") {
    connection.rejectionDetails = undefined;
  }

  connection.history.push({
    action: "EDITED",
    performedBy: req.user._id,
    note: "Re-Submitted",
    ...buildSnapshot(connection),
  });

  connection.status = "Pending";

  await connection.save();
  ioHelper.broadcastChange("connections_mutated", {
    action: "EDITED",
    id: connection._id
  });

  logger.info("Rejected connection edited", {
    opportunityId: connection.opportunityId,
    editedBy: req.user._id
  });

  res.status(200).json({
    success: true,
    message: "Connection edited and resubmitted for approval",
    opportunityId: connection.opportunityId,
    status: connection.status,
  });

});

const editRemark = asyncHandler(async (req, res, next) => {
  const { remarks } = req.body;
  const connectionId = req.params.id;

  if (remarks === undefined) {
    return next(new AppError("Please provide the remarks text", 400));
  }

  const connection = await Connection.findById(connectionId);
  if (!connection) {
    return next(new AppError("Connection not found", 404));
  }
  if (connection.status !== "Pending") {
    return next(new AppError(`Remarks can only be edited when the connection is in Pending state. Current status is ${connection.status}`, 400));
  }

  if (req.user.role !== "Admin" && connection.createdBy.toString() !== req.user._id.toString()) {
    return next(new AppError("You do not have permission to edit this connection's remarks", 403));
  }

  connection.remarks = remarks;
  await connection.save();
  ioHelper.broadcastChange("connections_mutated", {
    action: "UPDATE",
    id: connection._id
  });

  logger.info("Connection remarks updated", {
    opportunityId: connection.opportunityId,
    updatedBy: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: "Remarks updated successfully",
    remarks: connection.remarks,
  });
});

const cancelConnection = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;

  if (!reason) {
    return next(new AppError("Cancellation Reason is Required", 400));
  }

  const connection = await Connection.findById(req.params.id);
  if (!connection) return next(new AppError("Connection not found", 404));

  if (connection.status === "Cancelled") {
    return next(new AppError(`Already Cancelled`, 400));
  }

  if (connection.status === "Active" || connection.status === "Disconnected" || connection.status === "Notice Period") {
    return next(new AppError(`Cannot cancel a connection with status: ${connection.status}`, 400));
  }

  const hasBeenActivated = connection.history.some(h => h.action === "ACTIVATED");

  if (hasBeenActivated) {

    const lastActiveSnapshot = [...connection.history].reverse().find(h => h.action === "ACTIVATED");

    if (lastActiveSnapshot) {
      connection.bandwidth = lastActiveSnapshot.bandwidth;
      connection.serviceType = lastActiveSnapshot.serviceType;
      connection.commercials = lastActiveSnapshot.commercials;

      connection.status = "Active";

      connection.history.push(
        {
          action: "CANCELLED",
          performedBy: req.user._id,
          note: `Modification pipeline cancelled. Reason: ${reason}`,
          date: new Date(),
          ...buildSnapshot(connection),
        },
        {
          action: "ACTIVATED",
          performedBy: req.user._id,
          note: "Connection restored to previous active state.",
          date: new Date(),
          ...buildSnapshot(connection),
        }
      );
    }
  } else {
    connection.status = "Cancelled";
    connection.history.push({
      action: "CANCELLED",
      performedBy: req.user._id,
      note: reason,
      date: new Date(),
      ...buildSnapshot(connection),
    });
  }

  await connection.save();
  ioHelper.broadcastChange("connections_mutated", {
    action: "CANCELLED",
    id: connection._id
  });

  logger.info("Connection Cancelled/Reverted", {
    opportunityId: connection.opportunityId,
    cancelledBy: req.user._id,
    reason,
    wasReverted: hasBeenActivated
  });

  try {
    const populated = await withCreatedBy(connection._id);
    await sendConnectionEmail("CANCELLED", {
      opportunityId: populated.opportunityId,
      reason,
      createdBy: populated.createdBy,
    }, req.user);
  } catch (error) {
    logger.error("Failed to send CANCELLED email", {
      opportunityId: connection.opportunityId,
      error: error.message,
    });
  }

  res.status(200).json({
    success: true,
    message: hasBeenActivated ? "Modification cancelled. Connection restored to Active state." : "Connection Cancelled Successfully",
    status: connection.status,
  });
});

const shiftConnection = asyncHandler(async (req, res, next) => {
  const { ABtsId, BBtsId, Aaddress, Baddress, otc, remarks, Alatitude, Alongitude, Blongitude, Blatitude } = req.body;

  const connection = await Connection.findById(req.params.id);
  if (!connection) return next(new AppError("Connection not found", 404));

  if (connection.status !== "Active") {
    return next(new AppError("Cannot only shift an Active connections", 400));
  }

  if (req.user.role === ROLES.EMPLOYEE) {
    const customer = await Customer.findById(connection.customer);
    if (!customer?.managedBy.equals(req.user._id)) {
      return next(new AppError("You can only shift your own customers' connections", 403));
    }
  }

  if (!req.files || !req.files.purchaseOrder || !req.files.purchaseOrder[0]) {
    return next(new AppError("A Purchase Order document is required to process this shifting request", 400));
  }
  const poFile = req.files.purchaseOrder[0];
  const uploadedPo = await uploadToCloudinary(poFile, "crm/connections/purchaseOrders");
  connection.purchaseOrders.push({
    fileName: poFile.originalname,
    url: uploadedPo.secure_url,
    publicId: uploadedPo.public_id,
    requestType: "SHIFTING",
  })

  connection.technicalDetails = connection.technicalDetails || {};
  connection.technicalDetails.aEnd = connection.technicalDetails.aEnd || {};
  connection.technicalDetails.bEnd = connection.technicalDetails.bEnd || {};

  const currentAEnd = connection.technicalDetails?.aEnd?.btsId;
  const currentBEnd = connection.technicalDetails?.bEnd?.btsId;

  if (ABtsId) connection.technicalDetails.aEnd.btsId = ABtsId;
  if (Aaddress) connection.technicalDetails.aEnd.address = Aaddress;
  if (Alatitude) connection.technicalDetails.aEnd.latitude = Alatitude;
  if (Alongitude) connection.technicalDetails.aEnd.longitude = Alongitude;
  const isILL = connection.serviceType === "ILL";
  if (isILL) {
    connection.technicalDetails.bEnd = { btsId: "", address: "" };
  } else {
    if (BBtsId) connection.technicalDetails.bEnd.btsId = BBtsId;
    if (Baddress) connection.technicalDetails.bEnd.address = Baddress;
    if (Blatitude) connection.technicalDetails.bEnd.latitude = Blatitude;
    if (Blongitude) connection.technicalDetails.bEnd.longitude = Blongitude;
  }
  if (otc) connection.commercials.otc = otc;
  if (remarks) connection.remarks = remarks;
  connection.status = "Pending";
  connection.history.push({
    action: "SHIFTING",
    performedBy: req.user._id,
    date: new Date(),
    note: "Location shift requested",
    ...buildSnapshot(connection),
  });
  connection.providerCost = { mrc: 0, ratePerMb: 0 };
  await connection.save();

  ioHelper.broadcastChange("connections_mutated", {
    action: "SHIFTING",
    id: connection._id
  });

  logger.info("Connection shifted requested", {
    opportunityId: connection.opportunityId,
    by: req.user._id,
  })

  try {
    const populated = await withCreatedBy(connection._id);
    await sendChangeEmail("SHIFTING", {
      opportunityId: populated.opportunityId,
      currentAEnd: currentAEnd || "N/A",
      newAEnd: ABtsId || currentAEnd || "N/A",
      currentBEnd: currentBEnd || "N/A",
      newBEnd: BBtsId || currentBEnd || "N/A",
      createdBy: populated.createdBy,
    }, req.user);
  } catch (error) {
    logger.error("Failed to send SHIFTING email", {
      opportunityId: connection.opportunityId,
      error: error.message,
    });
  }

  res.status(200).json({
    success: true,
    message: "Shift request submitted — awaiting approval",
    opportunityId: connection.opportunityId
  });
});

const addIp = asyncHandler(async (req, res, next) => {
  const { count, cost, remarks } = req.body;
  if (!count || cost === undefined) return next(new AppError("Missing required fields", 400));

  const connection = await Connection.findById(req.params.id);
  if (!connection) return next(new AppError("Connection not found", 404));

  if (connection.status !== "Active") {
    return next(new AppError("Can only add IPs to Active connections", 400));
  }

  if (req.user.role === "Employee") { // Adjust ROLES.EMPLOYEE if needed
    const customer = await Customer.findById(connection.customer);
    if (!customer?.managedBy.equals(req.user._id)) {
      return next(new AppError("You can only modify your own customers' connections", 403));
    }
  }

  const currentIpCount = Number(connection.ips?.count) || 0;
  const currentIpCost = Number(connection.ips?.cost) || 0;

  const addedCount = Number(count);
  const addedCost = Number(cost);

  const newTotalCount = currentIpCount + addedCount;
  const newTotalCost = currentIpCost + addedCost;
  connection.ips = {
    count: newTotalCount,
    cost: newTotalCost
  };

  if (remarks) connection.remarks = remarks;

  if (!req.files && !req.files.purchaseOrder || !req.files.purchaseOrder[0]) {
    return next(new AppError("A Purchase Order document is required to process this IP addition request", 400));
  }

  const poFile = req.files.purchaseOrder[0];
  const uploadResult = await uploadToCloudinary(poFile, "crm/customer_pos");

  connection.purchaseOrders.push({
    fileName: poFile.originalname,
    url: uploadResult.secure_url,
    publicId: uploadResult.public_id,
    requestType: "IP_ADDITION"
  });

  connection.status = "Pending";
  connection.isIpAdditionRequest = true;
  connection.history.push({
    action: "IP_ADDITION",
    performedBy: req.user._id,
    date: new Date(),
    note: `Adding ${addedCount} IPs (₹${addedCost}). Total IPs will be ${newTotalCount} at ₹${newTotalCost}.`,
    ips: { count: newTotalCount, cost: newTotalCost },
    ...buildSnapshot(connection),
  });
  connection.providerCost = { mrc: 0, otc: 0, ratePerMb: 0 };
  await connection.save();

  if (global.ioHelper) {
    global.ioHelper.broadcastChange("connections_mutated", {
      action: "IP_ADDITION",
      id: connection._id
    });
  }

  logger.info("IP addition requested", {
    opportunityId: connection.opportunityId,
    count: addedCount,
    by: req.user._id
  });

  return res.status(200).json({
    success: true,
    message: "IP addition request submitted — awaiting approval",
    opportunityId: connection.opportunityId,
    ips: connection.ips,
  });
});

const getProjectManagerReport = asyncHandler(async (req, res, next) => {
  const connections = await Connection.find({})
    .select(
      // Added 'history' to the selection string
      "opportunityId fabCircuitId telecoCircuitId status serviceType bandwidth technicalDetails acceptanceDate createdAt terminationDetails customer createdBy history"
    )
    .populate("customer", "name")
    .populate("createdBy", "name")
    // Optional: Populate the user who performed the history action so you get their name instead of just an ID
    .populate("history.performedBy", "name")
    .lean();

  const reportData = connections.map(conn => ({
    _id: conn._id,
    customerName: conn.customer?.name || "Unknown Customer",
    salesManager: conn.createdBy?.name || "Unknown Manager",
    telecoCircuitId: conn.telecoCircuitId || "N/A",
    fabCircuitId: conn.fabCircuitId || "N/A",
    opportunityId: conn.opportunityId || "N/A",
    status: conn.status,
    serviceType: conn.serviceType,
    bandwidth: conn.bandwidth || "N/A",
    provider: conn.technicalDetails?.telcoProvider || "N/A",
    technicalDetails: conn.technicalDetails || "N/A",
    acceptanceDate: conn.acceptanceDate || null,
    createdAt: conn.createdAt,
    terminationDetails: conn.terminationDetails || {},

    // Formatting the history array to include bandwidth and other key details
    history: conn.history ? conn.history.map(entry => ({
      action: entry.action,
      date: entry.date,
      bandwidth: entry.bandwidth || "N/A", // Capturing the specific bandwidth from history
      performedBy: entry.performedBy?.name || "Unknown",
      note: entry.note || ""
    })) : []
  }));

  res.status(200).json({
    success: true,
    count: reportData.length,
    data: reportData
  });
});

const updateCoordinates = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { ALatitude, ALongitude, BLatitude, BLongitude } = req.body;

  if (req.user.role !== "admin") {
    return next(new AppError("Access denied. Only Admins can update GPS coordinates.", 403));
  }

  const connection = await Connection.findById(id);

  if (!connection) {
    return next(new AppError("Connection not found", 404));
  }

  connection.technicalDetails = connection.technicalDetails || {};
  connection.technicalDetails.aEnd = connection.technicalDetails.aEnd || {};
  connection.technicalDetails.bEnd = connection.technicalDetails.bEnd || {};

  if (ALatitude !== undefined) connection.technicalDetails.aEnd.latitude = ALatitude;
  if (ALongitude !== undefined) connection.technicalDetails.aEnd.longitude = ALongitude;

  if (BLatitude !== undefined) connection.technicalDetails.bEnd.latitude = BLatitude;
  if (BLongitude !== undefined) connection.technicalDetails.bEnd.longitude = BLongitude;

  connection.history.push({
    action: "EDITED",
    performedBy: req.user._id,
    date: new Date(),
    note: "Admin added/updated GPS coordinates",
    ...buildSnapshot(connection)
  });

  await connection.save();
  ioHelper.broadcastChange("connections_mutated", {
    action: "EDITED",
    id: connection._id
  });
  logger.info("Connection GPS coordinates updated", {
    opportunityId: connection.opportunityId,
    editedBy: req.user._id,
  });

  res.status(200).json({
    success: true,
    message: "Coordinates successfully added to connection",
    data: {
      opportunityId: connection.opportunityId,
      technicalDetails: connection.technicalDetails
    }
  });
});

const migratePurchaseOrders = asyncHandler(async (req, res, next) => {
  const connectionsToMigrate = await Connection.find({
    purchaseOrder: { $exists: true, $ne: null },
  });

  let migratedCount = 0;

  for (const conn of connectionsToMigrate) {
    if (conn.purchaseOrder && conn.purchaseOrder.url) {
      conn.purchaseOrders.push({
        fileName: conn.purchaseOrder.fileName,
        url: conn.purchaseOrder.url,
        publicId: conn.purchaseOrder.publicId,
        requestType: "CREATED",
        uploadedAt: conn.purchaseOrder.uploadedAt || conn.createdAt
      });

      conn.purchaseOrder = undefined;

      await conn.save({ validateBeforeSave: false });
      migratedCount++;
    }
    ioHelper.broadcastChange("connections_mutated", {
      action: "CREATED",
      id: conn._id
    });
  }

  res.status(200).json({
    success: true,
    message: `Database Migration Complete! Successfully moved ${migratedCount} POs to the new array structure.`,
  });
});

const deleteConnection = asyncHandler(async (req, res, next) => {
  const connection = await Connection.findById(req.params.id)
  if (!connection) {
    return next(new AppError("Connection Not Found", 400));
  }
  if (connection.status === "Deleted") {
    return next(new AppError("Connection Already Deleted", 400));
  }
  // if (connection.status !== "Pending") {
  //   return next(new AppError("Only Pending connections can be deleted", 400));
  // }
  // if (connection.history.length > 1) {
  //   return next(new AppError("This Connection has been approved previously, Cannot be deleted", 400));
  // }

  connection.status = "Deleted";
  connection.history.push({
    action: "DELETED",
    performedBy: req.user._id,
    note: "Connection Deleted",
    ...buildSnapshot(connection),
  })
  await connection.save();
  ioHelper.broadcastChange("connections_mutated", {
    action: "DELETED",
    id: connection._id
  });
  logger.info("Connection Deleted", {
    opportunityId: connection.opportunityId,
    deletedBy: req.user._id
  });
  res.status(200).json({
    success: true,
    message: "Connection Deleted Successfully",
  })
});

const downloadDocument = asyncHandler(async (req, res, next) => {
  const { opportunityId, docType } = req.params;
  const { field } = req.query;

  const connection = await Connection.findOne({ opportunityId });
  if (!connection) {
    return res.status(404).json({ message: "Connection not found" });
  }

  let cloudinaryUrl = "";
  let downloadName = "";

  if (docType === "caf") {
    cloudinaryUrl = connection.caf?.url;
    downloadName = `CAF_${opportunityId}`;
  } else if (docType === "businessAgreement") {
    cloudinaryUrl = connection.businessAgreement?.url;
    downloadName = `Business_Agreement_${opportunityId}`;
  } else if (docType === "po") {
    if (!connection.purchaseOrders || connection.purchaseOrders.length === 0) {
      return res.status(404).json({ message: "Document not found." });
    }
    let targetPO;
    if (field) {
      targetPO = connection.purchaseOrders.id(field);
    } else {
      targetPO = connection.purchaseOrders[purchaseOrders.length - 1];
    }
    if (!targetPO) {
      return res.status(404).json({ message: "Requested Document not found." });
    }
    cloudinaryUrl = targetPO.url;
    const requestTypeLabel = targetPO.requestType || "Doc";
    downloadName = `PO_${requestTypeLabel}_${opportunityId}`;
  } else {
    return res.status(400).json({ message: "Invalid document type requested" });
  }

  if (!cloudinaryUrl) {
    return res.status(404).json({ message: "This document has not been uploaded yet." });
  }

  const finalDownloadUrl = cloudinaryUrl.replace(
    '/upload/',
    `/upload/fl_attachment:${downloadName}/`
  );

  res.redirect(finalDownloadUrl);
});

/* DEVELOPER ONLY (TRANSFER CONNECTIONS) */
const transferConnections = asyncHandler(async (req, res, next) => {
  const { targetCustomerId, connectionIds, reason } = req.body;

  if (!targetCustomerId || !connectionIds || !Array.isArray(connectionIds) || connectionIds.length === 0) {
    return next(new AppError("Target Customer ID and an array of Connection IDs are required.", 400));
  }

  const targetCustomer = await Customer.findById(targetCustomerId);
  if (!targetCustomer) {
    return next(new AppError("Target customer not found.", 404));
  }

  const connections = await Connection.find({ _id: { $in: connectionIds } });

  if (connections.length !== connectionIds.length) {
    return next(new AppError("One or more connections could not be found.", 404));
  }

  for (const connection of connections) {
    const oldCustomerId = connection.customer; // Store old ID for the log

    connection.customer = targetCustomerId;

    connection.history.push({
      action: "TRANSFERRED",
      performedBy: req.user._id,
      date: new Date(),
      note: reason || `Connection ownership transferred to ${targetCustomer.name}`,
      ...buildSnapshot(connection),
    });

    await connection.save();

    logger.info("Connection Transferred", {
      opportunityId: connection.opportunityId,
      oldCustomer: oldCustomerId,
      newCustomer: targetCustomerId,
      transferredBy: req.user._id
    });
  }

  res.status(200).json({
    success: true,
    message: `Successfully transferred ${connections.length} connections to ${targetCustomer.name}.`,
  });
});

const removeTransferLog = asyncHandler(async (req, res, next) => {
  const { connectionIds } = req.body;

  if (!connectionIds || !Array.isArray(connectionIds) || connectionIds.length === 0) {
    return next(new AppError("An array of Connection IDs is required.", 400));
  }

  const connections = await Connection.find({ _id: { $in: connectionIds } });

  if (connections.length !== connectionIds.length) {
    return next(new AppError("One or more connections could not be found.", 404));
  }

  let removedCount = 0;

  for (const connection of connections) {
    const lastActionIndex = connection.history.length - 1;

    if (lastActionIndex >= 0 && connection.history[lastActionIndex].action === "TRANSFERRED") {

      connection.history.pop();

      await connection.save();
      removedCount++;

      logger.info("Connection TRANSFERRED log removed (Audit Scrub)", {
        opportunityId: connection.opportunityId,
        scrubbedBy: req.user._id
      });
    }
  }

  res.status(200).json({
    success: true,
    message: `Successfully removed the 'TRANSFERRED' log from ${removedCount} out of ${connections.length} connections.`,
  });
});

/* Get Back Disconnected Connections */
const undoDisconnection = asyncHandler(async (req, res, next) => {
  const connection = await Connection.findById(req.params.id);

  if (!connection) {
    return next(new AppError("Connection not found", 404));
  }

  if (connection.status !== "Disconnected") {
    return next(new AppError(`Can only undo a Disconnected connection. Current status is ${connection.status}`, 400));
  }

  while (
    connection.history.length > 0 &&
    ["TERMINATED", "DISCONNECT_INITIATED", "EXTENDED", "NOTICE_PERIOD"].includes(
      connection.history[connection.history.length - 1].action
    )
  ) {
    connection.history.pop();
  }

  connection.terminationDetails = {
    raiseDate: null,
    finalDate: null,
    reason: ""
  };

  connection.status = "Active";

  await connection.save();

  logger.info("Disconnection Erased (Surgical Rollback)", {
    opportunityId: connection.opportunityId,
    rolledBackBy: req.user._id
  });

  res.status(200).json({
    success: true,
    message: "Disconnection completely erased. Connection is Active again.",
    status: connection.status
  });
});

module.exports = {
  createConnection,
  connectionByCustomer,
  getConnectionById,
  getConnectionsByStatus,
  approveConnection,
  rejectConnection,
  updateProviderCost,
  markAsGeneration,
  cancelConnection,
  activateConnection,
  editRejectedConnection,
  editConnection,
  editRemark,
  updateCoordinates,
  migratePurchaseOrders,
  transferConnections,
  removeTransferLog,
  deleteConnection,
  shiftConnection,
  addIp,
  getProjectManagerReport,
  downloadDocument,
  undoDisconnection
};
