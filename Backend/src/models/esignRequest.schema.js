const mongoose = require("mongoose");

// A signature line drawn on a generated PDF: 1-based page, points from the top-left (y = the line).
// Saved with each generated document so eSign can place its stamp on it.
const SignatureBoxSchema = new mongoose.Schema({
  page: Number,
  x: Number,
  y: Number,
  width: Number,
}, { _id: false });

// One document sent to e-Hastakshar for signing (on a connection or a bulk batch), newest last.
// Sending a document again adds a new entry.
const EsignRequestSchema = new mongoose.Schema({
  docType: { type: String, enum: ["CAF", "PO", "RMACD"], required: true },
  // RMACD requests: the rmacdForms entry this was sent for.
  rmacdFormId: { type: mongoose.Schema.Types.ObjectId },
  provider: { type: String, default: "ehastakshar" },
  documentId: String,
  transactionId: String,
  // Signers in signing order; e-Hastakshar emails each one after the previous one has signed.
  signers: [
    {
      _id: false,
      order: Number,
      signerId: String,
      name: String,
      email: String,
    },
  ],
  // Single-signer fields on requests sent before multi-signer support.
  signerId: String,
  signerName: String,
  signerEmail: String,
  // PENDING when sent; COMPLETED once every signer has signed (set by the e-Hastakshar callback),
  // or whatever final status they report (DECLINED, EXPIRED, …).
  status: { type: String, default: "PENDING" },
  expiresAt: Date,
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  sentAt: { type: Date, default: Date.now },
  completedAt: Date,
  // Signed PDF received from e-Hastakshar; also applied as the official signed copy while it can still change.
  signedDocument: {
    fileName: String,
    url: String,
    publicId: String,
    storage: { type: String, enum: ["cloudinary", "local"] },
    receivedAt: Date,
  },
});

module.exports = { SignatureBoxSchema, EsignRequestSchema };
