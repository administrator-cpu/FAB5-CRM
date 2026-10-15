const mongoose = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const Connection = require("../models/connectionModel");
const Customer = require("../models/customerModel");

// Read-only incremental sync for Ledgerly (pull). Records are paged by (updatedAt ASC, _id ASC);
// the cursor encodes the last (updatedAt, _id) so equal timestamps never skip or repeat records.
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

const encodeCursor = (doc) =>
  Buffer.from(JSON.stringify({ u: doc.updatedAt.toISOString(), i: String(doc._id) })).toString("base64url");

const decodeCursor = (cursor) => {
  try {
    const { u, i } = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const updatedAt = new Date(u);
    if (Number.isNaN(updatedAt.getTime()) || !mongoose.isValidObjectId(i)) return null;
    return { updatedAt, id: new mongoose.Types.ObjectId(i) };
  } catch {
    return null;
  }
};

// Validates updatedSince / cursor / limit and builds the page filter.
const parsePageParams = (query) => {
  const { updatedSince, cursor } = query;

  const since = updatedSince ? new Date(updatedSince) : new Date(0);
  if (Number.isNaN(since.getTime())) throw new AppError("updatedSince must be an ISO date", 400);

  const limit = query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new AppError(`limit must be an integer between 1 and ${MAX_LIMIT}`, 400);
  }

  const filter = { updatedAt: { $gte: since } };
  if (cursor) {
    const last = decodeCursor(cursor);
    if (!last) throw new AppError("Invalid cursor", 400);
    filter.$or = [
      { updatedAt: { $gt: last.updatedAt } },
      { updatedAt: last.updatedAt, _id: { $gt: last.id } },
    ];
  }
  return { filter, limit };
};

// Fetches one page (limit + 1 to know whether another page follows).
const fetchPage = async (Model, query, select) => {
  const { filter, limit } = parsePageParams(query);
  const docs = await Model.find(filter).select(select).sort({ updatedAt: 1, _id: 1 }).limit(limit + 1).lean();
  const page = docs.slice(0, limit);
  const nextCursor = docs.length > limit ? encodeCursor(page[page.length - 1]) : null;
  return { page, nextCursor };
};

const idOrNull = (value) => (value ? String(value) : null);

const historyDates = (history, action) =>
  history.filter((h) => h.action === action && h.date).map((h) => new Date(h.date)).sort((a, b) => a - b);

const pickCommercials = (c = {}) => ({ mrc: c.mrc ?? null, ratePerMb: c.ratePerMb ?? null, otc: c.otc ?? null, advance: c.advance ?? null });
const pickIps = (ips = {}) => ({ count: ips.count ?? 0, totalCost: ips.cost ?? 0 });
const pickProviderCost = (p) => (p && (p.mrc !== undefined || p.ratePerMb !== undefined)
  ? { mrc: p.mrc ?? null, ratePerMb: p.ratePerMb ?? null }
  : null);

// Live values as of the last activation. Each field comes from the latest ACTIVATED entry that recorded it
// (rate-revision and bulk-migration entries record only some fields), falling back to the current record.
const buildLastActivatedSnapshot = (conn, activations) => {
  if (activations.length === 0) return null;
  const latestWith = (field) => [...activations].reverse().find((h) => h[field] !== undefined && h[field] !== null && h[field] !== "");

  const serviceType = latestWith("serviceType")?.serviceType ?? conn.serviceType;
  const bandwidth = latestWith("bandwidth")?.bandwidth ?? conn.bandwidth;
  const commercials = latestWith("commercials")?.commercials ?? conn.commercials;
  const ips = latestWith("ips")?.ips ?? conn.ips;
  const providerCost = [...activations].reverse().map((h) => pickProviderCost(h.providerCost)).find(Boolean) ?? null;

  return {
    serviceType,
    bandwidth,
    commercials: pickCommercials(commercials),
    ips: pickIps(ips),
    providerCost,
  };
};

const toSyncConnection = (conn) => {
  const history = conn.history || [];
  const activations = history.filter((h) => h.action === "ACTIVATED");
  const activationDates = historyDates(history, "ACTIVATED");
  const terminationDates = historyDates(history, "TERMINATED");

  return {
    crmConnectionId: String(conn._id),
    opportunityId: conn.opportunityId ?? null,
    fabCircuitId: conn.fabCircuitId ?? null,
    customerId: idOrNull(conn.customer),
    billingProfileId: idOrNull(conn.billingProfileId),
    status: conn.status,
    serviceType: conn.serviceType ?? null,
    bandwidth: conn.bandwidth ?? null,
    telcoProvider: conn.technicalDetails?.telcoProvider ?? null,
    telecoCircuitId: conn.telecoCircuitId || null,
    commercials: pickCommercials(conn.commercials),
    providerCost: pickProviderCost(conn.providerCost),
    ips: pickIps(conn.ips),
    technicalDetails: {
      aEnd: conn.technicalDetails?.aEnd ?? null,
      bEnd: conn.technicalDetails?.bEnd ?? null,
    },
    firstActivatedAt: activationDates[0] ?? null,
    lastActivatedAt: activationDates[activationDates.length - 1] ?? null,
    lastActivatedSnapshot: buildLastActivatedSnapshot(conn, activations),
    terminatedAt: terminationDates[terminationDates.length - 1] ?? null,
    updatedAt: conn.updatedAt,
  };
};

const toSyncCustomer = (customer) => ({
  crmCustomerId: String(customer._id),
  name: customer.name,
  customerType: customer.customerType ?? null,
  email: customer.email ?? null,
  mobile: customer.mobile ?? null,
  person: customer.person ?? null,
  isActive: customer.isActive !== false,
  billingProfiles: (customer.billingProfile || []).map((profile) => ({
    billingProfileId: String(profile._id),
    label: profile.label ?? null,
    gstNumber: profile.gstNumber || null,
    address: {
      street: profile.address?.street ?? null,
      city: profile.address?.city ?? null,
      state: profile.address?.state ?? null,
      pincode: profile.address?.pincode ?? null,
    },
  })),
  updatedAt: customer.updatedAt,
});

// GET /api/crm/sync/connections — every connection updated since updatedSince, in any status
// (cancelled / rejected / deleted / disconnected included so Ledgerly can deactivate them).
const syncConnections = asyncHandler(async (req, res) => {
  const { page, nextCursor } = await fetchPage(Connection, req.query,
    "opportunityId fabCircuitId customer billingProfileId status serviceType bandwidth technicalDetails " +
    "telecoCircuitId commercials providerCost ips history.action history.date history.serviceType history.bandwidth " +
    "history.commercials history.ips history.providerCost updatedAt");
  res.status(200).json({ success: true, data: page.map(toSyncConnection), nextCursor });
});

// GET /api/crm/sync/customers — every customer updated since updatedSince (inactive ones included).
const syncCustomers = asyncHandler(async (req, res) => {
  const { page, nextCursor } = await fetchPage(Customer, req.query,
    "name customerType email mobile person isActive billingProfile updatedAt");
  res.status(200).json({ success: true, data: page.map(toSyncCustomer), nextCursor });
});

module.exports = {
  syncConnections,
  syncCustomers,
  // exported for tests
  parsePageParams,
  encodeCursor,
  toSyncConnection,
  toSyncCustomer,
};
