const asyncHandler = require("../utils/asyncHandler");
const Connection = require("../models/connectionModel");
const { parsePageParams, encodeCursor } = require("./ledgerlySync.controller");

// GET /api/crm/connections — for Bahi Khata, which matches telco bills to connections by telco circuit ID.
// Every connection that was ever ACTIVATED, in any status, paged by (updatedAt, _id) like the Ledgerly sync.
// No addresses, coordinates, contacts, documents or full history.

// Statuses whose top-level values are the live ones (no change waiting).
const LIVE_TOP_LEVEL_STATUSES = ["Active", "Notice Period", "Disconnected"];

const SELECT =
  "opportunityId fabCircuitId customer serviceType bandwidth technicalDetails.telcoProvider telecoCircuitId " +
  "commercials.ratePerMb commercials.mrc providerCost status acceptanceDate terminationDetails updatedAt " +
  "history.action history.date history.note history.bandwidth history.commercials.ratePerMb " +
  "history.providerCost.ratePerMb history.telecoCircuitId";

const numberOrNull = (value) => (value === undefined || value === null || value === "" ? null : Number(value));
const dateOrNull = (value) => (value ? new Date(value) : null);
const positive = (value) => Number(value) > 0;

const sortedDates = (history, action) =>
  history.filter((h) => h.action === action && h.date).map((h) => new Date(h.date)).sort((a, b) => a - b);

// What is actually live: values from the latest ACTIVATED entry (array order = write order).
// Bulk-migrated and some older entries hold 0 rates, so each rate comes from the latest ACTIVATED entry
// with a real (> 0) value; when there is none, the top-level value is used only if it is live.
const buildLastActivatedSnapshot = (conn, activations) => {
  if (activations.length === 0) return null;
  const latestFirst = [...activations].reverse();
  const topLevelIsLive = LIVE_TOP_LEVEL_STATUSES.includes(conn.status);
  const fromTopLevel = (value) => (topLevelIsLive && positive(value) ? Number(value) : null);

  const bandwidthEntry = latestFirst.find((h) => h.bandwidth !== undefined && h.bandwidth !== null && h.bandwidth !== "");
  const fabEntry = latestFirst.find((h) => positive(h.commercials?.ratePerMb));
  const telcoEntry = latestFirst.find((h) => positive(h.providerCost?.ratePerMb));

  return {
    bandwidth: bandwidthEntry?.bandwidth ?? (topLevelIsLive ? conn.bandwidth ?? null : null),
    fabRatePerMb: fabEntry ? Number(fabEntry.commercials.ratePerMb) : fromTopLevel(conn.commercials?.ratePerMb),
    telcoRatePerMb: telcoEntry ? Number(telcoEntry.providerCost.ratePerMb) : fromTopLevel(conn.providerCost?.ratePerMb),
    activatedAt: dateOrNull(latestFirst[0].date),
  };
};

// Telco circuit IDs this connection had before its current one, oldest first. Taken from history
// snapshots (recorded from now on) and from "Telco Circuit ID changed: OLD → NEW" notes (admin edits,
// and re-activations with a new ID).
const CHANGED_NOTE = /Telco Circuit ID changed: (.+?) → (.+)$/;
const previousTelcoCircuitIds = (conn, history) => {
  const seen = [];
  const add = (id) => {
    const value = typeof id === "string" ? id.trim() : "";
    if (value && !seen.includes(value)) seen.push(value);
  };
  for (const entry of history) {
    const match = typeof entry.note === "string" ? entry.note.match(CHANGED_NOTE) : null;
    if (match) add(match[1]);
    add(entry.telecoCircuitId);
  }
  return seen.filter((id) => id !== (conn.telecoCircuitId || "").trim());
};

const buildTerminationDetails = (t) => (t && (t.raiseDate || t.finalDate || t.reason)
  ? { raiseDate: dateOrNull(t.raiseDate), finalDate: dateOrNull(t.finalDate), reason: t.reason || null }
  : null);

const toBahiKhataConnection = (conn) => {
  const history = conn.history || [];
  const activations = history.filter((h) => h.action === "ACTIVATED");
  const activationDates = sortedDates(history, "ACTIVATED");
  const terminationDates = sortedDates(history, "TERMINATED");
  const customer = conn.customer && typeof conn.customer === "object" && conn.customer._id ? conn.customer : null;
  const providerCost = conn.providerCost || {};

  return {
    crmConnectionId: String(conn._id),
    opportunityId: conn.opportunityId ?? null,
    fabCircuitId: conn.fabCircuitId ?? null,
    customer: {
      crmCustomerId: customer ? String(customer._id) : conn.customer ? String(conn.customer) : null,
      name: customer?.name ?? null,
    },
    serviceType: conn.serviceType ?? null,
    bandwidth: conn.bandwidth ?? null,
    telcoProvider: conn.technicalDetails?.telcoProvider ?? null,
    telecoCircuitId: conn.telecoCircuitId || null,
    previousTelecoCircuitIds: previousTelcoCircuitIds(conn, history),
    commercials: {
      ratePerMb: numberOrNull(conn.commercials?.ratePerMb),
      mrc: numberOrNull(conn.commercials?.mrc),
    },
    providerCost: {
      ratePerMb: numberOrNull(providerCost.ratePerMb),
      mrc: numberOrNull(providerCost.mrc),
      updatedAt: dateOrNull(providerCost.updatedAt),
    },
    status: conn.status,
    firstActivatedAt: activationDates[0] ?? null,
    acceptanceDate: dateOrNull(conn.acceptanceDate),
    terminationDetails: buildTerminationDetails(conn.terminationDetails),
    terminatedAt: terminationDates[terminationDates.length - 1] ?? null,
    lastActivatedSnapshot: buildLastActivatedSnapshot(conn, activations),
    updatedAt: conn.updatedAt,
  };
};

const listConnectionsForBahiKhata = asyncHandler(async (req, res) => {
  const { filter, limit } = parsePageParams(req.query);
  filter["history.action"] = "ACTIVATED";

  const docs = await Connection.find(filter)
    .select(SELECT)
    .populate("customer", "name")
    .sort({ updatedAt: 1, _id: 1 })
    .limit(limit + 1)
    .lean();

  const page = docs.slice(0, limit);
  const hasMore = docs.length > limit;
  res.status(200).json({
    success: true,
    data: page.map(toBahiKhataConnection),
    hasMore,
    nextCursor: hasMore ? encodeCursor(page[page.length - 1]) : null,
  });
});

module.exports = {
  listConnectionsForBahiKhata,
  // exported for tests
  toBahiKhataConnection,
};
