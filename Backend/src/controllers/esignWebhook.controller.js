const crypto = require("crypto");
const mongoose = require("mongoose");
const Connection = require("../models/connectionModel");
const { uploadDocument } = require("../services/upload.service");
const { areSignedDocumentsLocked, applySignedDocuments, hasSignedDocuments } = require("../utils/signedDocuments");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const ioHelper = require("../utils/ioHelper.js");

// Statuses e-Hastakshar may report. COMPLETED (every signer has signed) must come with the signed PDF.
const COMPLETED_STATUSES = ["COMPLETED", "SIGNED"];
const OTHER_STATUSES = ["DECLINED", "EXPIRED", "CANCELLED"];

const FOLDERS = { CAF: "crm/connections/cafs", PO: "crm/connections/purchaseOrders" };
const SAVE_ATTEMPTS = 3;

// Shared secret e-Hastakshar sends as "Authorization: Bearer <EHASTAKSHAR_WEBHOOK_SECRET>".
const verifyEhastakshar = (req, res, next) => {
  const expected = process.env.EHASTAKSHAR_WEBHOOK_SECRET;
  if (!expected) return next(new AppError("eSign callback is not configured", 503));

  const header = req.headers.authorization || "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return next(new AppError("Invalid callback credentials", 401));
  }
  next();
};

const findByDocumentId = (documentId) => Connection.findOne({ "esignRequests.documentId": documentId });

// POST /api/esign/webhooks/ehastakshar: e-Hastakshar calls this when a document we sent is fully
// signed (or declined / expired). The signed PDF is stored on the eSign request and, while the order
// is still unapproved, becomes the connection's official signed CAF / PO, as a manual upload would.
const ehastaksharCallback = asyncHandler(async (req, res, next) => {
  const documentId = String(req.body.documentId || "").trim();
  if (!documentId) return next(new AppError("documentId is required", 400));

  const status = String(req.body.status || (req.file ? "COMPLETED" : "")).trim().toUpperCase();
  if (![...COMPLETED_STATUSES, ...OTHER_STATUSES].includes(status)) {
    return next(new AppError(`Unknown status "${status}". Use COMPLETED, DECLINED, EXPIRED or CANCELLED`, 400));
  }
  const completed = COMPLETED_STATUSES.includes(status);

  let connection = await findByDocumentId(documentId);
  if (!connection) return next(new AppError("No eSign request found for this documentId", 404));
  let request = connection.esignRequests.find((r) => r.documentId === documentId);

  const transactionId = String(req.body.transactionId || "").trim();
  if (transactionId && request.transactionId && transactionId !== request.transactionId) {
    return next(new AppError("transactionId does not match this documentId", 400));
  }

  // e-Hastakshar retries until it gets a 2xx, so a repeat of a finished request just succeeds.
  if (request.status === "COMPLETED" && request.signedDocument?.url) {
    return res.status(200).json({ success: true, message: "Already received", documentId, applied: false });
  }

  // The signed PDF is stored once, before the save loop below.
  let signedFile = null;
  if (completed) {
    const file = req.file;
    if (!file || file.size === 0) return next(new AppError("The signed PDF (file) is required for COMPLETED", 400));
    if (file.buffer.subarray(0, 5).toString() !== "%PDF-") return next(new AppError("file must be a PDF", 400));
    const uploaded = await uploadDocument({ ...file, mimetype: "application/pdf" }, FOLDERS[request.docType]);
    signedFile = { fileName: file.originalname || `${request.docType}_${connection.opportunityId}_signed.pdf`, ...uploaded };
  }

  // The CAF and PO callbacks can arrive together for one connection; on a version conflict reload and retry.
  const receivedAt = new Date();
  let applied = false;
  for (let attempt = 1; ; attempt++) {
    applied = false;
    if (completed) {
      request.status = "COMPLETED";
      request.completedAt = req.body.signedAt && !Number.isNaN(Date.parse(req.body.signedAt))
        ? new Date(req.body.signedAt)
        : receivedAt;
      request.signedDocument = { ...signedFile, receivedAt };

      // After approval (or once the order is cancelled / deleted) the official documents stay as they are;
      // the signed copy is kept on the eSign request only.
      applied = !areSignedDocumentsLocked(connection);
      const labels = applied
        ? applySignedDocuments(connection, { [request.docType === "CAF" ? "caf" : "po"]: { ...signedFile, uploadedAt: receivedAt } })
        : [];
      connection.history.push({
        action: "ESIGN_COMPLETED",
        date: receivedAt,
        note: applied
          ? `Signed ${labels.join(" & ")} received from e-Hastakshar`
          : `Signed ${request.docType} received from e-Hastakshar after the order was locked; kept on the eSign request only`,
      });
    } else {
      request.status = status;
      connection.history.push({
        action: "ESIGN_UPDATED",
        date: receivedAt,
        note: `e-Hastakshar reported the ${request.docType} eSign request as ${status.toLowerCase()}`,
      });
    }

    try {
      await connection.save();
      break;
    } catch (error) {
      if (!(error instanceof mongoose.Error.VersionError) || attempt >= SAVE_ATTEMPTS) throw error;
      connection = await findByDocumentId(documentId);
      request = connection.esignRequests.find((r) => r.documentId === documentId);
      if (request.status === "COMPLETED" && request.signedDocument?.url) {
        return res.status(200).json({ success: true, message: "Already received", documentId, applied: false });
      }
    }
  }

  ioHelper.broadcastChange("connections_mutated", { action: "UPDATE", id: connection._id });
  // Re-read so a CAF and PO arriving together both see each other's signed copy.
  const fresh = await Connection.findById(connection._id).select("caf purchaseOrders");
  logger.info("eSign callback processed", { opportunityId: connection.opportunityId, documentId, docType: request.docType, status, applied });

  res.status(200).json({
    success: true,
    message: completed
      ? (applied ? `Signed ${request.docType} saved` : `Signed ${request.docType} stored; order already locked`)
      : `Status ${status} recorded`,
    documentId,
    applied,
    signedDocumentsComplete: hasSignedDocuments(fresh || connection),
  });
});

module.exports = { verifyEhastakshar, ehastaksharCallback };
