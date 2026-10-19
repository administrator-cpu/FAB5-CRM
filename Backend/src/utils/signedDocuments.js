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

module.exports = { hasSignedDocuments, areSignedDocumentsLocked, applySignedDocuments };
