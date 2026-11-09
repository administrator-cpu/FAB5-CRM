const ehastakshar = require("./ehastakshar.service");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");

// Shared by every "Send for eSign" endpoint (new connection CAF / PO, RMACD form, bulk batch CAF / PO).

/**
 * Validates the signers from a request body, in signing order: e-Hastakshar emails signer 2 only
 * after signer 1 has signed, and so on.
 * @returns {{signers: {name: string, email: string}[], error?: AppError}}
 */
const parseSigners = (body) => {
  const raw = Array.isArray(body?.signers) ? body.signers : [];
  if (raw.length === 0) return { error: new AppError("Add at least one signer", 400) };
  if (raw.length > ehastakshar.MAX_SIGNERS) {
    return { error: new AppError(`You can add up to ${ehastakshar.MAX_SIGNERS} signers`, 400) };
  }
  const signers = raw.map((signer) => ({
    name: String(signer?.name || "").trim(),
    email: String(signer?.email || "").trim().toLowerCase(),
  }));
  for (const [index, signer] of signers.entries()) {
    if (!signer.name || signer.name.length > 100) {
      return { error: new AppError(`Enter signer ${index + 1}'s name (up to 100 characters)`, 400) };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(signer.email)) {
      return { error: new AppError(`Enter a valid email for signer ${index + 1}`, 400) };
    }
  }
  if (new Set(signers.map((signer) => signer.email)).size !== signers.length) {
    return { error: new AppError("Each signer needs a different email", 400) };
  }
  return { signers };
};

// "1. Name (email), 2. …" for history notes.
const signerSummary = (signers) =>
  signers.map((signer, index) => `${index + 1}. ${signer.name} (${signer.email})`).join(", ");

/**
 * Sends documents one at a time; stops at the first failure, keeping the requests already sent.
 * @param {object} params
 * @param {{docType: "CAF"|"PO"|"RMACD", generated: object, title: string, fallbackName: string, extra?: object}[]} params.documents
 *   generated is the stored unsigned PDF (with its pageCount / signatureBoxes); extra is merged into the request.
 * @param {{name: string, email: string}[]} params.signers
 * @param {*} params.sentBy - user id
 * @param {string} params.logRef - opportunity / batch number for logs
 * @returns {Promise<{requests: object[], sent: string[], failure: {docType: string, message: string}|null}>}
 *   requests are ready to push onto an esignRequests array.
 */
const sendDocuments = async ({ documents, signers, sentBy, logRef }) => {
  const requests = [];
  const sent = [];
  for (const { docType, generated, title, fallbackName, extra } of documents) {
    try {
      const pdf = await ehastakshar.readStoredDocument(generated);
      const result = await ehastakshar.sendForSigning({
        pdf,
        fileName: generated.fileName || fallbackName,
        title,
        docType,
        signers,
        layout: generated,
      });
      requests.push({
        docType,
        ...extra,
        documentId: result.documentId,
        transactionId: result.transactionId,
        signers: signers.map((signer, index) => ({
          order: index + 1,
          // Matched by email in case e-Hastakshar returns them in another order.
          signerId: result.signers?.find((s) => String(s.email).toLowerCase() === signer.email)?.id,
          ...signer,
        })),
        status: result.status || "PENDING",
        expiresAt: result.expiresAt ? new Date(result.expiresAt) : undefined,
        sentBy,
        sentAt: new Date(),
      });
      sent.push(docType);
    } catch (error) {
      logger.error("eSign send failed", { ref: logRef, docType, error: error.message });
      return { requests, sent, failure: { docType, message: error.message } };
    }
  }
  return { requests, sent, failure: null };
};

// The error for a send that stopped partway ("CAF sent, but PO could not be sent …").
const failureError = ({ sent, failure }) => {
  const prefix = sent.length > 0 ? `${sent.join(" & ")} sent, but ` : "";
  return new AppError(`${prefix}${failure.docType} could not be sent for eSign: ${failure.message}`, 502);
};

const successMessage = (sent, signers) => (signers.length > 1
  ? `${sent.join(" & ")} sent for eSign to ${signers.length} signers; ${signers[0].email} signs first`
  : `${sent.join(" & ")} sent for eSign to ${signers[0].email}`);

const notConfiguredError = () => new AppError("eSign is not set up yet (EHASTAKSHAR_API_KEY is missing)", 503);

module.exports = { parseSigners, signerSummary, sendDocuments, failureError, successMessage, notConfiguredError };
