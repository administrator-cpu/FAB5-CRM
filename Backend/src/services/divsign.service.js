const fs = require("fs/promises");
const { STORAGE_DRIVERS, resolveLocalPath } = require("../config/storage");
const { PAGE } = require("../utils/pdfLayout");
const logger = require("../utils/logger");
const { describeFetchError } = require("../utils/networkError");

// DIVSign (formerly e-Hastakshar) machine API, see their CRM_API_INTEGRATION_GUIDE: one PDF + signers per request.

// Settings are DIVSIGN_*; the old EHASTAKSHAR_* names still work until the servers' .env are renamed.
const setting = (name) => process.env[`DIVSIGN_${name}`] || process.env[`EHASTAKSHAR_${name}`];

// Their API moved to api.divsign.in with the rename; DIVSIGN_API_URL overrides it.
const API_URL = (setting("API_URL") || "https://api.divsign.in").replace(/\/+$/, "");
const SEND_PATH = "/api/v1/esign/send";
const MAX_ATTEMPTS = 3;
// A hung connection fails with a clear "timed out" instead of leaving the request waiting.
const FETCH_TIMEOUT_MS = 60 * 1000;

// DIVSign stamps every page; a page without a position gets the stamp at its default spot.
// pctX / pctY are the stamp's top-left corner as a fraction of the page (0..1, from the top-left).
const STAMP = { width: 140, height: 70 };
const STAMP_GAP = 10;
const DEFAULT_SPOT = { pctX: 0.72, pctY: 0.86 };
// DIVSign clamps pctX to 0.04..0.72, so a stamp's left edge must stay inside that band.
const X_RANGE = { min: 0.04 * PAGE.width, max: 0.72 * PAGE.width };
// Signers stand side by side on the signature line, so this many fit across the page.
const MAX_SIGNERS = 3;

const round = (value) => Math.round(value * 10000) / 10000;

// Left edges for each signer's stamp in a row that starts at firstX: signer 1 at firstX, then one
// stamp further left each time, or further right once the left side runs out of page.
const rowSlots = (firstX) => {
  const step = STAMP.width + STAMP_GAP;
  const candidates = [firstX];
  for (let i = 1; candidates.length < 2 * MAX_SIGNERS + 1; i++) candidates.push(firstX - i * step, firstX + i * step);
  return candidates.filter((x) => x >= X_RANGE.min && x <= X_RANGE.max).slice(0, MAX_SIGNERS);
};

/**
 * Stamp positions for one signer: on pages with one of our signature lines the stamp sits on that
 * line; every other page keeps the default bottom-right spot. Signers sit side by side (see rowSlots),
 * so stamps never cover each other.
 * @param {{signatureBoxes?: {page:number,x:number,y:number,width:number}[], pageCount?: number}} layout
 *   recorded when the PDF was generated (PDFs generated before this have neither: default placement).
 * @param {number} signerIndex - 0-based signing order
 */
const signaturePositions = (layout, signerIndex) => {
  const boxes = layout?.signatureBoxes || [];
  const pageCount = layout?.pageCount || 0;
  if (!boxes.length || !pageCount) return [];

  const positions = [];
  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
    const box = boxes.find((b) => b.page === pageNumber);
    if (box) {
      const x = rowSlots(box.x + (box.width - STAMP.width) / 2)[signerIndex];
      const y = box.y - STAMP.height - 4;
      positions.push({ pageNumber, pctX: round(x / PAGE.width), pctY: round(y / PAGE.height) });
    } else if (signerIndex > 0) {
      const x = rowSlots(DEFAULT_SPOT.pctX * PAGE.width)[signerIndex];
      positions.push({ pageNumber, pctX: round(x / PAGE.width), pctY: DEFAULT_SPOT.pctY });
    }
  }
  return positions;
};

const isConfigured = () => Boolean(setting("API_KEY"));

// Reads a stored document (local disk or Cloudinary) into a Buffer.
const readStoredDocument = async (document) => {
  if (document.storage === STORAGE_DRIVERS.LOCAL) {
    const absPath = resolveLocalPath(document.publicId);
    if (!absPath) throw new Error("Stored document path is invalid");
    return fs.readFile(absPath);
  }
  let response;
  try {
    response = await fetch(document.url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  } catch (error) {
    const { host, code, reason } = describeFetchError(error, document.url);
    logger.error("Could not download the stored PDF to send for eSign", { host, code, reason, url: document.url });
    throw new Error(`couldn't download the stored PDF from ${host}: ${reason}`);
  }
  if (!response.ok) {
    logger.error("Stored PDF download failed", { status: response.status, url: document.url });
    throw new Error(`couldn't download the stored PDF (storage returned ${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
};

/**
 * Sends one PDF to DIVSign for signing. Signers sign in array order: DIVSign emails the
 * first one straight away and each next one only after the previous one has signed.
 * Retries on 429 as their guide asks (Retry-After seconds).
 * @param {object} params
 * @param {Buffer} params.pdf
 * @param {string} params.fileName
 * @param {string} params.title
 * @param {"CAF"|"PO"} params.docType - for logging
 * @param {{name: string, email: string}[]} params.signers - in signing order
 * @param {object} [params.layout] - { signatureBoxes, pageCount } recorded when the PDF was generated
 * @returns {Promise<object>} DIVSign's response ({ transactionId, documentId, status, expiresAt, signers })
 */
const sendForSigning = async ({ pdf, fileName, title, docType, signers: signerList, layout }) => {
  if (!isConfigured()) throw new Error("DIVSIGN_API_KEY is not configured");

  // DIVSign asks for GPS and a webcam photo on every signature.
  const signers = signerList.map((signer, index) => ({
    name: signer.name,
    email: signer.email,
    requireGps: true,
    requirePhoto: true,
    signaturePositions: signaturePositions(layout, index),
  }));

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const form = new FormData();
    form.append("file", new Blob([pdf], { type: "application/pdf" }), fileName);
    form.append("title", title);
    form.append("signers", JSON.stringify(signers));
    // Where DIVSign posts the signed PDF once every signer is done (esignWebhook.controller).
    if (setting("CALLBACK_URL")) form.append("callbackUrl", setting("CALLBACK_URL"));

    let response;
    try {
      response = await fetch(`${API_URL}${SEND_PATH}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${setting("API_KEY")}` },
        body: form,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
    } catch (error) {
      // Never reached DIVSign (DNS, refused, timeout, SSL…): say where and why instead of "fetch failed".
      const { host, code, reason } = describeFetchError(error, API_URL);
      logger.error("Could not reach DIVSign", { docType, host, code, reason, url: `${API_URL}${SEND_PATH}` });
      throw new Error(`couldn't reach DIVSign at ${host}: ${reason}`);
    }

    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const waitSeconds = parseInt(response.headers.get("retry-after") || "1", 10) || 1;
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      continue;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      logger.error("DIVSign rejected the document", { docType, status: response.status, reason: data.message || data.error, response: data });
      // Their own message, prefixed so it's clear it came from DIVSign and with which status.
      const error = new Error(`DIVSign returned ${response.status}${data.message ? `: ${data.message}` : ""}`);
      error.statusCode = response.status;
      throw error;
    }
    return data;
  }
  throw new Error("DIVSign rate limit: please try again in a moment");
};

module.exports = { MAX_SIGNERS, setting, isConfigured, readStoredDocument, sendForSigning, signaturePositions };
