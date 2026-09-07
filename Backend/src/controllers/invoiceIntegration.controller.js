const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Customer = require("../models/customerModel");
const Connection = require("../models/connectionModel");
const { buildBillingTimeline } = require("../utils/billingTimelineHelper");

const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const searchCustomersForInvoice = asyncHandler(async (req, res, next) => {
  const { search, page = 1, limit = 15, sort = 'recent' } = req.query;
  const filter = { isActive: true };

  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: "i" } },
      { email: { $regex: search, $options: "i" } },
      { mobile: { $regex: search, $options: "i" } },
      { person: { $regex: search, $options: "i" } }
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const query = Customer.find(filter).select("name person email");
  if (sort === "alphabetical") {
    query.sort({ name: 1 });
  } else {
    query.sort({ createdAt: -1 });
  }

  const [customers, total] = await Promise.all([
    query
      .skip(skip)
      .limit(parseInt(limit)),
    Customer.countDocuments(filter)
  ]);

  res.status(200).json({
    customers,
    pagination: {
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

/* Get Full Customer & GST Profiles */
const getCustomerProfileForInvoice = asyncHandler(async (req, res, next) => {
  const customerId = req.params.id;

  const customer = await Customer.findById(customerId)
    .select("name person email mobile customerType billingProfile createdAt managedBy")
    .populate("managedBy", "name email");

  if (!customer) {
    return next(new AppError("Customer not found", 404));
  }

  res.status(200).json(customer);
});

/* Get Active Connections with History */
const getCustomerConnectionsForInvoice = asyncHandler(async (req, res, next) => {
  const customerId = req.params.id;

  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);

  const connections = await Connection.find({
    customer: customerId,
    status: { $nin: ["Deleted", "Rejected", "Cancelled"] },
    "history.action": "ACTIVATED"
  }).select(`
    opportunityId fabCircuitId serviceType bandwidth status
    technicalDetails commercials providerCost ips acceptanceDate
    terminationDetails history createdAt updatedAt
  `);

  const invoiceConnections = connections.reduce((acc, conn) => {
    if (conn.status === "Disconnected") {
      const terminatedLog = [...conn.history].reverse().find(h => h.action === "TERMINATED");
      const disconnectDate = terminatedLog ? terminatedLog.date : conn.terminationDetails?.finalDate;

      if (!disconnectDate || new Date(disconnectDate) < oneMonthAgo) {
        return acc;
      }
    }
    const isBillable = conn.status === "Active" || conn.status === "Notice Period" || conn.status !== "Disconnected";

    acc.push({
      crmConnectionId: conn._id.toString(),
      opportunityId: conn.opportunityId,
      fabCircuitId: conn.fabCircuitId,
      serviceType: conn.serviceType,
      bandwidth: conn.bandwidth,
      providerCost: conn.providerCost,
      status: conn.status,
      isBillable,
      acceptanceDate: conn.acceptanceDate,
      terminationDetails: conn.terminationDetails,
      commercials: conn.commercials,
      ips: conn.ips,
      technicalDetails: conn.technicalDetails,
      history: conn.history,
      createdAt: conn.createdAt,
      updatedAt: conn.updatedAt,
    });

    return acc;
  }, []);

  res.status(200).json({
    success: true,
    count: invoiceConnections.length,
    connections: invoiceConnections,
  });
});

const getConnectionBillingHistory = asyncHandler(async (req, res, next) => {
  const connection = await Connection.findById(req.params.id);

  if (!connection) {
    return next(new AppError("Connection not found", 404));
  }

  const now = new Date();
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const fullTimeline = buildBillingTimeline(connection);
  const currentState = fullTimeline.pop();

  const recentEvents = fullTimeline.filter(event => {
    const isRecentActivation = event.activatedOn && new Date(event.activatedOn) >= firstOfLastMonth;
    const isRecentRetained = event.retainedOn && new Date(event.retainedOn) >= firstOfLastMonth;
    const isRecentRaise = event.raisedOn && new Date(event.raisedOn) >= firstOfLastMonth;

    let isRecentFinal = false;
    if (event.type === 'NOTICE_PERIOD') {
      const effectiveEndDate = event._resolvedOn || event.finalDate;
      isRecentFinal = effectiveEndDate && new Date(effectiveEndDate) >= firstOfLastMonth;
    } else {
      isRecentFinal = event.finalDate && new Date(event.finalDate) >= firstOfLastMonth;
    }

    return isRecentActivation || isRecentRetained || isRecentRaise || isRecentFinal;
  });

  const cleanedEvents = recentEvents.map(event => {
    if (event._resolvedOn !== undefined) {
      const cleanEvent = { ...event };
      delete cleanEvent._resolvedOn;
      return cleanEvent;
    }
    return event;
  });

  let billingResponse = [];
  if (cleanedEvents.length > 0) {
    billingResponse = [...cleanedEvents, currentState];
  } else {
    billingResponse = [currentState];
  }

  res.status(200).json({
    success: true,
    crmConnectionId: connection._id,
    billingHistory: billingResponse
  });
});

const getDashboardConnections = async (req, res) => {
  const connections = await Connection.find(
    { customer: req.params.id },
    {
      history: 0
    }
  );

  res.json({
    count: connections.length,
    connections
  });
};

const getSamadhanCustomerWithConnections = asyncHandler(async (req, res, next) => {
  const { search } = req.query;

  if (!search) {
    return next(new AppError("Search parameter is required", 400));
  }

  const safeSearch = escapeRegex(search.trim());

  const customer = await Customer.findOne({
    name: { $regex: new RegExp(safeSearch, "i") },
    isActive: true
  });

  if (!customer) {
    return next(new AppError("Customer not found", 404));
  }

  const connections = await Connection.find({
    customer: customer._id,
    status: { $nin: ["Deleted", "Rejected", "Cancelled"] },
    $or: [
      { status: { $in: ["Approved", "Generation", "Active", "Notice Period"] } },
      { "history.action": "ACTIVATED" }
    ]
  }).select(`
    opportunityId fabCircuitId serviceType bandwidth status
    technicalDetails commercials ips acceptanceDate
    terminationDetails history
  `);

  const invoiceConnections = connections.map(conn => {
    const hasBeenActivated = conn.history?.some(h => h.action === "ACTIVATED");
    const isBillable = conn.status === "Active" || conn.status === "Notice Period" ||
      (hasBeenActivated && conn.status !== "Disconnected");

    return {
      crmConnectionId: conn._id.toString(),
      opportunityId: conn.opportunityId,
      fabCircuitId: conn.fabCircuitId,
      serviceType: conn.serviceType,
      bandwidth: conn.bandwidth,
      status: conn.status,
      isBillable,
      acceptanceDate: conn.acceptanceDate,
      terminationDetails: conn.terminationDetails,
      commercials: conn.commercials,
      ips: conn.ips,
      technicalDetails: conn.technicalDetails,
      history: conn.history
    };
  });

  res.status(200).json({
    success: true,
    customer: {
      customerId: customer._id.toString(),
      name: customer.name,
    },
    count: invoiceConnections.length,
    connections: invoiceConnections,
  });
});

const getSamadhanCustomerWithConnectionsv2 = asyncHandler(async (req, res, next) => {
  const { search } = req.query;

  if (!search) {
    return next(new AppError("Search parameter is required", 400));
  }

  const safeSearch = escapeRegex(search.trim());

  const customer = await Customer.findOne({
    name: { $regex: new RegExp(safeSearch, "i") },
    isActive: true
  });

  if (!customer) {
    return next(new AppError("Customer not found", 404));
  }

  const connections = await Connection.find({
    customer: customer._id,
    status: { $nin: ["Deleted", "Rejected", "Cancelled", "Disconnected"] },
    $or: [
      { status: { $in: ["Active", "Notice Period"] } },
      { "history.action": "ACTIVATED" }
    ]
  }).select(`
    opportunityId fabCircuitId serviceType bandwidth status
    technicalDetails commercials ips acceptanceDate
    terminationDetails history
  `);

  const activeConnections = [];

  for (const conn of connections) {
    const isCurrentlyActive = ["Active", "Notice Period"].includes(conn.status);
    const hasBeenActivated = conn.history?.some(h => h.action === "ACTIVATED");

    // Skip connections that are brand new and have never been live
    if (!isCurrentlyActive && !hasBeenActivated) {
      continue;
    }

    // Default payload setup
    let displayData = {
      crmConnectionId: conn._id.toString(),
      opportunityId: conn.opportunityId,
      fabCircuitId: conn.fabCircuitId,
      acceptanceDate: conn.acceptanceDate,
      terminationDetails: conn.terminationDetails,
      status: conn.status,
      serviceType: conn.serviceType,
      bandwidth: conn.bandwidth,
      commercials: conn.commercials,
      ips: conn.ips,
      technicalDetails: conn.technicalDetails,
    };

    // 3. The Snapshot Rollback: Masking pending changes
    const isTransitionalState = ["Pending", "Approved", "Generation"].includes(conn.status);

    if (isTransitionalState && hasBeenActivated) {
      // Find the most recent 'ACTIVATED' log by reversing the history array
      const lastActiveLog = [...conn.history].reverse().find(h => h.action === "ACTIVATED");

      if (lastActiveLog) {
        // Mask the status so the customer only sees "Active"
        displayData.status = "Active";

        // Roll back the displayed details to the last live snapshot
        displayData.serviceType = lastActiveLog.serviceType || conn.serviceType;
        displayData.bandwidth = lastActiveLog.bandwidth || conn.bandwidth;
        displayData.commercials = lastActiveLog.commercials || conn.commercials;
        displayData.ips = lastActiveLog.ips || conn.ips;
        displayData.technicalDetails = lastActiveLog.technicalDetails || conn.technicalDetails;
      }
    }

    activeConnections.push(displayData);
  }

  res.status(200).json({
    success: true,
    customer: {
      customerId: customer._id.toString(),
      name: customer.name,
    },
    count: activeConnections.length,
    connections: activeConnections,
  });
});

module.exports = {
  searchCustomersForInvoice,
  getCustomerProfileForInvoice,
  getCustomerConnectionsForInvoice,
  getConnectionBillingHistory,
  getDashboardConnections,
  getSamadhanCustomerWithConnections,
  getSamadhanCustomerWithConnectionsv2
};
