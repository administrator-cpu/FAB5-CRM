// Signed CAF / PO rules shared by single-connection and bulk-batch uploads.

// Signed CAF + signed PO (the CREATED entry) are required before a new order can be approved.
const hasSignedDocuments = (connection) =>
  Boolean(connection.caf?.url) &&
  connection.purchaseOrders.some((po) => po.requestType === "CREATED" && po.url);

// Signed copies can be replaced until the order is first approved.
const areSignedDocumentsLocked = (connection) =>
  !["Pending", "Rejected"].includes(connection.status) ||
  connection.history.some((entry) => ["APPROVED", "ACTIVATED"].includes(entry.action));

// Puts the signed CAF and/or PO on the connection (replacing any earlier copy) and returns
// the labels for the history note, e.g. ["CAF", "PO (replaced)"].
const applySignedDocuments = (connection, { caf, po }) => {
  const labels = [];
  if (caf) {
    const replacing = Boolean(connection.caf?.url);
    connection.caf = { ...caf };
    labels.push(replacing ? "CAF (replaced)" : "CAF");
  }
  if (po) {
    const signedPo = { ...po, requestType: "CREATED" };
    const existingIndex = connection.purchaseOrders.findIndex((entry) => entry.requestType === "CREATED");
    if (existingIndex >= 0) {
      connection.purchaseOrders.splice(existingIndex, 1, signedPo);
      labels.push("PO (replaced)");
    } else {
      connection.purchaseOrders.unshift(signedPo);
      labels.push("PO");
    }
  }
  return labels;
};

const RMACD_REQUEST_TYPES = ["UPGRADE", "DOWNGRADE", "SHIFTING"];
const REQUEST_ACTIONS = ["CREATED", "UPGRADE", "DOWNGRADE", "SHIFTING", "RATE_REVISION", "IP_ADDITION"];

// The connection's current request entry and its RMACD form. form is null for request types without an
// RMACD, and for requests raised before RMACD forms existed (those stay approvable as before).
const currentRmacdForm = (connection) => {
  const entry = [...connection.history].reverse().find((h) => REQUEST_ACTIONS.includes(h.action));
  if (!entry || !RMACD_REQUEST_TYPES.includes(entry.action)) return { entry, form: null };
  const form = connection.rmacdForms.find((f) => String(f.historyEntryId) === String(entry._id));
  return { entry, form: form || null };
};

// A signed RMACD can be added / replaced only for the current request, until that request is approved.
const isRmacdFormOpen = (connection, form) => {
  const { entry, form: current } = currentRmacdForm(connection);
  if (!form || !current || String(current._id) !== String(form._id)) return false;
  const entryIndex = connection.history.indexOf(entry);
  const approvedSince = connection.history.slice(entryIndex + 1).some((h) => ["APPROVED", "ACTIVATED"].includes(h.action));
  return ["Pending", "Rejected"].includes(connection.status) && !approvedSince;
};

module.exports = {
  hasSignedDocuments, areSignedDocumentsLocked, applySignedDocuments, currentRmacdForm, isRmacdFormOpen,
};
