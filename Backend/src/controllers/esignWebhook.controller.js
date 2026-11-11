const crypto = require("crypto");
const mongoose = require("mongoose");
const Connection = require("../models/connectionModel");
const BulkBatch = require("../models/bulkBatch.model");
const { uploadDocument } = require("../services/upload.service");
const { splitPdf } = require("../utils/pdfCombine");
const {
  areSignedDocumentsLocked, applySignedDocuments, hasSignedDocuments, isRmacdFormOpen,
} = require("../utils/signedDocuments");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const ioHelper = require("../utils/ioHelper.js");

// Statuses e-Hastakshar may report. COMPLETED (every signer has signed) must come with the signed PDF.
const COMPLETED_STATUSES = ["COMPLETED", "SIGNED"];
const OTHER_STATUSES = ["DECLINED", "EXPIRED", "CANCELLED"];

const FOLDERS = {
  CAF: "crm/connections/cafs", PO: "crm/connections/purchaseOrders", RMACD: "crm/connections/rmacd", CAF_PO: "crm/connections/esign",
};
const LABELS = { CAF_PO: "CAF & PO" };
const SAVE_ATTEMPTS = 3;
// Deleted and cancelled connections of a batch no longer need signed documents.
const LIVE_BATCH_CONNECTION = { $nin: ["Deleted", "Cancelled"] };

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

const isFinished = (request) => request.status === "COMPLETED" && Boolean(request.signedDocument?.url);

// Loads a document, applies mutate(doc) and saves; on a version conflict (another callback saved the
// same document meanwhile) reloads and tries again. mutate returns false to skip saving.
const saveWithRetry = async (load, mutate) => {
  for (let attempt = 1; ; attempt++) {
    const doc = await load();
    if (!doc || mutate(doc) === false) return doc;
    try {
      await doc.save();
      return doc;
    } catch (error) {
      if (!(error instanceof mongoose.Error.VersionError) || attempt >= SAVE_ATTEMPTS) throw error;
    }
  }
};

// Marks the eSign request as finished (COMPLETED with the signed PDF, or the reported status).
const recordOutcome = (request, { status, signedFile, partFiles, completedAt }) => {
  if (signedFile) {
    request.status = "COMPLETED";
    request.completedAt = completedAt;
    request.signedDocument = { ...signedFile, receivedAt: new Date() };
    for (const part of request.parts || []) {
      if (partFiles?.[part.docType]) part.signedDocument = partFiles[part.docType];
    }
  } else {
    request.status = status;
  }
};

// The signed CAF / PO to put on a connection, from the request's (split) signed files.
const cafPoDocs = (partFiles) => {
  const docs = {};
  if (partFiles.CAF) docs.caf = { ...partFiles.CAF, uploadedAt: new Date() };
  if (partFiles.PO) docs.po = { ...partFiles.PO, uploadedAt: new Date() };
  return docs;
};

// Connection CAF / PO / CAF_PO / RMACD: the signed PDF becomes the official copy while it can still change.
const applyToConnection = async (documentId, outcome) => {
  let result = { alreadyReceived: false, applied: false, docType: null };
  const connection = await saveWithRetry(
    () => Connection.findOne({ "esignRequests.documentId": documentId }),
    (conn) => {
      const request = conn.esignRequests.find((r) => r.documentId === documentId);
      result = { alreadyReceived: false, applied: false, docType: request.docType };
      if (isFinished(request)) {
        result.alreadyReceived = true;
        return false;
      }
      recordOutcome(request, outcome);

      const label = request.docType === "RMACD"
        ? `RMACD (${conn.rmacdForms.id(request.rmacdFormId)?.requestType || "change request"})`
        : LABELS[request.docType] || request.docType;
      if (!outcome.signedFile) {
        conn.history.push({
          action: "ESIGN_UPDATED",
          date: new Date(),
          note: `e-Hastakshar reported the ${label} eSign request as ${outcome.status.toLowerCase()}`,
        });
        return true;
      }

      if (!outcome.partFiles) {
        // A combined CAF & PO that couldn't be split: kept on the request; the copies need uploading by hand.
        conn.history.push({
          action: "ESIGN_COMPLETED",
          date: new Date(),
          note: `Signed ${label} received from e-Hastakshar, but it has fewer pages than were sent, so it couldn't be split into the CAF and PO. Upload the signed copies by hand.`,
        });
        return true;
      }
      if (request.docType === "RMACD") {
        const form = conn.rmacdForms.id(request.rmacdFormId);
        result.applied = isRmacdFormOpen(conn, form);
        if (result.applied) form.signed = { ...outcome.partFiles.RMACD, uploadedAt: new Date() };
      } else {
        // After approval (or once cancelled / deleted) the official documents stay as they are.
        result.applied = !areSignedDocumentsLocked(conn);
        if (result.applied) applySignedDocuments(conn, cafPoDocs(outcome.partFiles));
      }
      conn.history.push({
        action: "ESIGN_COMPLETED",
        date: new Date(),
        note: result.applied
          ? `Signed ${label} received from e-Hastakshar`
          : `Signed ${label} received from e-Hastakshar after it could no longer change; kept on the eSign request only`,
      });
      return true;
    },
  );
  return { ...result, connection };
};

// Bulk batch CAF / PO: kept on the batch and added to every connection of it that isn't approved yet.
const applyToBatch = async (documentId, outcome) => {
  let request = null;
  let alreadyReceived = false;
  const batch = await saveWithRetry(
    () => BulkBatch.findOne({ "esignRequests.documentId": documentId }),
    (doc) => {
      request = doc.esignRequests.find((r) => r.documentId === documentId);
      alreadyReceived = isFinished(request);
      if (alreadyReceived) return false;
      recordOutcome(request, outcome);
      for (const [docType, file] of Object.entries(outcome.partFiles || {})) {
        doc.signedDocuments[docType.toLowerCase()] = { ...file, uploadedAt: new Date() };
      }
      return true;
    },
  );
  const unsplit = Boolean(outcome.signedFile && !outcome.partFiles);
  if (alreadyReceived || !outcome.signedFile || unsplit) {
    return { alreadyReceived, applied: 0, skipped: 0, docType: request.docType, batch, unsplit };
  }

  const ids = await Connection.find({ bulkBatch: batch._id, status: LIVE_BATCH_CONNECTION }).distinct("_id");
  let applied = 0;
  let skipped = 0;
  for (const id of ids) {
    // Set on the attempt that is saved (a retry runs mutate again), then counted once.
    let locked = false;
    await saveWithRetry(
      () => Connection.findById(id),
      (conn) => {
        locked = areSignedDocumentsLocked(conn);
        if (locked) return false;
        const labels = applySignedDocuments(conn, cafPoDocs(outcome.partFiles));
        conn.history.push({
          action: "ESIGN_COMPLETED",
          date: new Date(),
          note: `Signed ${labels.join(" & ")} received from e-Hastakshar for bulk batch ${batch.batchNumber}`,
        });
        return true;
      },
    );
    if (locked) skipped += 1;
    else applied += 1;
  }
  return { alreadyReceived, applied, skipped, docType: request.docType, batch };
};

// POST /api/esign/webhooks/ehastakshar: e-Hastakshar calls this when a document we sent is fully
// signed (or declined / expired). The documentId says which connection / batch request it is.
const ehastaksharCallback = asyncHandler(async (req, res, next) => {
  const documentId = String(req.body.documentId || "").trim();
  if (!documentId) return next(new AppError("documentId is required", 400));

  const status = String(req.body.status || (req.file ? "COMPLETED" : "")).trim().toUpperCase();
  if (![...COMPLETED_STATUSES, ...OTHER_STATUSES].includes(status)) {
    return next(new AppError(`Unknown status "${status}". Use COMPLETED, DECLINED, EXPIRED or CANCELLED`, 400));
  }
  const completed = COMPLETED_STATUSES.includes(status);

  const [connection, batch] = await Promise.all([
    Connection.findOne({ "esignRequests.documentId": documentId }).select("esignRequests opportunityId"),
    BulkBatch.findOne({ "esignRequests.documentId": documentId }).select("esignRequests batchNumber"),
  ]);
  const owner = connection || batch;
  if (!owner) return next(new AppError("No eSign request found for this documentId", 404));
  const request = owner.esignRequests.find((r) => r.documentId === documentId);

  const transactionId = String(req.body.transactionId || "").trim();
  if (transactionId && request.transactionId && transactionId !== request.transactionId) {
    return next(new AppError("transactionId does not match this documentId", 400));
  }

  // e-Hastakshar retries until it gets a 2xx, so a repeat of a finished request just succeeds.
  if (isFinished(request)) {
    return res.status(200).json({ success: true, message: "Already received", documentId, applied: false });
  }

  // The signed PDF (and, for a combined CAF & PO, its two halves) is stored once, before anything is saved.
  const ref = connection?.opportunityId || batch?.batchNumber;
  let signedFile = null;
  let partFiles = null;
  if (completed) {
    const file = req.file;
    if (!file || file.size === 0) return next(new AppError("The signed PDF (file) is required for COMPLETED", 400));
    if (file.buffer.subarray(0, 5).toString() !== "%PDF-") return next(new AppError("file must be a PDF", 400));
    const uploaded = await uploadDocument({ ...file, mimetype: "application/pdf" }, FOLDERS[request.docType]);
    signedFile = { fileName: file.originalname || `${request.docType}_${ref}_signed.pdf`, ...uploaded };

    // A combined CAF & PO is split back into the two documents the CRM keeps; partFiles stays null if it can't be.
    if (request.docType === "CAF_PO") {
      const pieces = await splitPdf(file.buffer, request.parts).catch(() => null);
      if (pieces) {
        partFiles = {};
        for (const piece of pieces) {
          const stored = await uploadDocument(
            { buffer: piece.pdf, mimetype: "application/pdf", size: piece.pdf.length },
            FOLDERS[piece.docType],
          );
          partFiles[piece.docType] = { fileName: `${piece.docType}_${ref}_signed.pdf`, ...stored };
        }
      } else {
        logger.warn("Signed CAF & PO could not be split", { ref, documentId, parts: request.parts });
      }
    } else {
      partFiles = { [request.docType]: signedFile };
    }
  }
  const outcome = {
    status,
    signedFile,
    partFiles,
    completedAt: req.body.signedAt && !Number.isNaN(Date.parse(req.body.signedAt)) ? new Date(req.body.signedAt) : new Date(),
  };

  if (connection) {
    const result = await applyToConnection(documentId, outcome);
    if (result.alreadyReceived) {
      return res.status(200).json({ success: true, message: "Already received", documentId, applied: false });
    }
    ioHelper.broadcastChange("connections_mutated", { action: "UPDATE", id: result.connection._id });
    // Re-read so a CAF and PO arriving together both see each other's signed copy.
    const fresh = await Connection.findById(result.connection._id).select("caf purchaseOrders");
    logger.info("eSign callback processed", { opportunityId: result.connection.opportunityId, documentId, docType: result.docType, status, applied: result.applied });
    const label = LABELS[result.docType] || result.docType;
    return res.status(200).json({
      success: true,
      message: !completed
        ? `Status ${status} recorded`
        : !partFiles ? `Signed ${label} stored, but it couldn't be split (fewer pages than sent)`
          : result.applied ? `Signed ${label} saved` : `Signed ${label} stored; it could no longer change`,
      documentId,
      applied: result.applied,
      ...(result.docType !== "RMACD" && { signedDocumentsComplete: hasSignedDocuments(fresh || result.connection) }),
    });
  }

  const result = await applyToBatch(documentId, outcome);
  if (result.alreadyReceived) {
    return res.status(200).json({ success: true, message: "Already received", documentId, applied: false });
  }
  ioHelper.broadcastChange("connections_mutated", { action: "UPDATE", id: result.batch._id });
  logger.info("eSign callback processed", { batchNumber: result.batch.batchNumber, documentId, docType: result.docType, status, applied: result.applied, skipped: result.skipped });
  res.status(200).json({
    success: true,
    message: !completed
      ? `Status ${status} recorded`
      : result.unsplit
        ? `Signed ${LABELS[result.docType] || result.docType} stored for batch ${result.batch.batchNumber}, but it couldn't be split (fewer pages than sent)`
        : `Signed ${LABELS[result.docType] || result.docType} saved for batch ${result.batch.batchNumber}: added to ${result.applied} connection${result.applied === 1 ? "" : "s"}`
          + (result.skipped ? ` (${result.skipped} already approved, left unchanged)` : ""),
    documentId,
    applied: result.applied > 0,
    appliedConnections: result.applied,
    skippedConnections: result.skipped,
  });
});

module.exports = { verifyEhastakshar, ehastaksharCallback };
