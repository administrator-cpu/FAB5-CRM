const fs = require("fs/promises");
const { STORAGE_DRIVERS, resolveLocalPath } = require("../config/storage");
const { PAGE } = require("../utils/pdfLayout");
const logger = require("../utils/logger");

// e-Hastakshar machine API (see their CRM_API_INTEGRATION_GUIDE): one PDF + signers per request.
const API_URL = (process.env.EHASTAKSHAR_API_URL || "https://api.ehastakshar.in").replace(/\/+$/, "");
const SEND_PATH = "/api/v1/esign/send";
const MAX_ATTEMPTS = 3;

// e-Hastakshar stamps every page; a page without a position gets the stamp at its default spot.
// pctX / pctY are the stamp's top-left corner as a fraction of the page (0..1, from the top-left).
const STAMP = { width: 140, height: 70 };
const STAMP_GAP = 10;
const DEFAULT_SPOT = { pctX: 0.72, pctY: 0.86 };
// e-Hastakshar clamps pctX to 0.04..0.72, so a stamp's left edge must stay inside that band.
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

const isConfigured = () => Boolean(process.env.EHASTAKSHAR_API_KEY);

// Reads a stored document (local disk or Cloudinary) into a Buffer.
const readStoredDocument = async (document) => {
  if (document.storage === STORAGE_DRIVERS.LOCAL) {
    const absPath = resolveLocalPath(document.publicId);
    if (!absPath) throw new Error("Stored document path is invalid");
    return fs.readFile(absPath);
  }
  const response = await fetch(document.url);
  if (!response.ok) throw new Error(`Could not fetch stored document (${response.status})`);
  return Buffer.from(await response.arrayBuffer());
};

/**
 * Sends one PDF to e-Hastakshar for signing. Signers sign in array order: e-Hastakshar emails the
 * first one straight away and each next one only after the previous one has signed.
 * Retries on 429 as their guide asks (Retry-After seconds).
 * @param {object} params
 * @param {Buffer} params.pdf
 * @param {string} params.fileName
 * @param {string} params.title
 * @param {"CAF"|"PO"} params.docType - for logging
 * @param {{name: string, email: string}[]} params.signers - in signing order
 * @param {object} [params.layout] - { signatureBoxes, pageCount } recorded when the PDF was generated
 * @returns {Promise<object>} e-Hastakshar's response ({ transactionId, documentId, status, expiresAt, signers })
 */
const sendForSigning = async ({ pdf, fileName, title, docType, signers: signerList, layout }) => {
  if (!isConfigured()) throw new Error("EHASTAKSHAR_API_KEY is not configured");

  // e-Hastakshar asks for GPS and a webcam photo on every signature.
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
    // Where e-Hastakshar posts the signed PDF once every signer is done (esignWebhook.controller).
    if (process.env.EHASTAKSHAR_CALLBACK_URL) form.append("callbackUrl", process.env.EHASTAKSHAR_CALLBACK_URL);

    const response = await fetch(`${API_URL}${SEND_PATH}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.EHASTAKSHAR_API_KEY}` },
      body: form,
    });

    if (response.status === 429 && attempt < MAX_ATTEMPTS) {
      const waitSeconds = parseInt(response.headers.get("retry-after") || "1", 10) || 1;
      await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000));
      continue;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      logger.error("e-Hastakshar send failed", { status: response.status, docType, response: data });
      // Their own message, prefixed so it's clear it came from e-Hastakshar and with which status.
      const error = new Error(`e-Hastakshar returned ${response.status}${data.message ? `: ${data.message}` : ""}`);
      error.statusCode = response.status;
      throw error;
    }
    return data;
  }
  throw new Error("e-Hastakshar rate limit: please try again in a moment");
};

module.exports = { MAX_SIGNERS, isConfigured, readStoredDocument, sendForSigning, signaturePositions };
