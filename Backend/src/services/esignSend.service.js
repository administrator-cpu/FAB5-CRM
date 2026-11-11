const ehastakshar = require("./ehastakshar.service");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { combinePdfs } = require("../utils/pdfCombine");

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
 * The documents to send for an order's unsigned CAF / PO: when both are unsigned they go as one
 * combined CAF_PO document (CAF pages first), so the customer gets one email and signs once.
 * @param {object} params
 * @param {("CAF"|"PO")[]} params.docTypes - the unsigned documents to send
 * @param {(docType: string) => object} params.generatedOf - stored unsigned PDF of a document
 * @param {string} params.customerName
 * @param {string} params.ref - opportunity id / batch number
 * @param {string} [params.titleSuffix]
 */
const cafPoDocuments = ({ docTypes, generatedOf, customerName, ref, titleSuffix = "" }) => {
  const title = (label) => `${label} - ${customerName || ""} - ${ref}${titleSuffix}`;
  if (docTypes.includes("CAF") && docTypes.includes("PO")) {
    return [{
      docType: "CAF_PO",
      components: ["CAF", "PO"].map((docType) => ({ docType, generated: generatedOf(docType) })),
      title: title("CAF & PO"),
      fallbackName: `CAF_PO_${ref}.pdf`,
    }];
  }
  return docTypes.map((docType) => ({
    docType,
    generated: generatedOf(docType),
    title: title(docType),
    fallbackName: `${docType}_${ref}.pdf`,
  }));
};

// Labels for messages / history: CAF_PO counts as "CAF" and "PO".
const docLabels = (docType) => (docType === "CAF_PO" ? ["CAF", "PO"] : [docType]);

// The PDF, stamp layout and (for combined documents) parts to send for one document entry.
const preparePdf = async ({ generated, components }) => {
  if (!components) {
    return { pdf: await ehastakshar.readStoredDocument(generated), layout: generated, fileName: generated.fileName };
  }
  const combined = await combinePdfs(await Promise.all(components.map(async ({ docType, generated: doc }) => ({
    docType,
    pdf: await ehastakshar.readStoredDocument(doc),
    layout: doc,
  }))));
  return { ...combined, fileName: null };
};

/**
 * Sends documents one at a time; stops at the first failure, keeping the requests already sent.
 * @param {object} params
 * @param {object[]} params.documents - { docType, generated, title, fallbackName, extra? } for one stored PDF
 *   (generated carries its pageCount / signatureBoxes), or { docType: "CAF_PO", components, title, fallbackName }
 *   from cafPoDocuments for a combined one; extra is merged into the request.
 * @param {{name: string, email: string}[]} params.signers
 * @param {*} params.sentBy - user id
 * @param {string} params.logRef - opportunity / batch number for logs
 * @returns {Promise<{requests: object[], sent: string[], failure: {docType: string, message: string}|null}>}
 *   requests are ready to push onto an esignRequests array; sent lists "CAF" / "PO" / "RMACD".
 */
const sendDocuments = async ({ documents, signers, sentBy, logRef }) => {
  const requests = [];
  const sent = [];
  for (const document of documents) {
    const { docType, title, fallbackName, extra } = document;
    try {
      const { pdf, layout, parts, fileName } = await preparePdf(document);
      const result = await ehastakshar.sendForSigning({
        pdf,
        fileName: fileName || fallbackName,
        title,
        docType,
        signers,
        layout,
      });
      requests.push({
        docType,
        ...(parts && { parts }),
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
      sent.push(...docLabels(docType));
    } catch (error) {
      logger.error("eSign send failed", { ref: logRef, docType, error: error.message });
      return { requests, sent, failure: { docType: docLabels(docType).join(" & "), message: error.message } };
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

module.exports = {
  parseSigners, signerSummary, cafPoDocuments, sendDocuments, failureError, successMessage, notConfiguredError,
};
