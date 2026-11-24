const mongoose = require("mongoose");
const { SignatureBoxSchema, EsignRequestSchema } = require("./esignRequest.schema");

const documentFields = {
  fileName: String,
  url: String,
  publicId: String,
  storage: { type: String, enum: ["cloudinary", "local"] },
};
// pageCount / signatureBoxes place the eSign stamps on the batch PDF's signature lines.
const GeneratedDocumentSchema = new mongoose.Schema({
  ...documentFields,
  pageCount: Number,
  signatureBoxes: [SignatureBoxSchema],
}, { _id: false });
const SignedDocumentSchema = new mongoose.Schema({
  ...documentFields,
  uploadedAt: Date,
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
}, { _id: false });

const BulkBatchSchema = new mongoose.Schema(
  {
    batchNumber: { type: String, required: true, unique: true, trim: true },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "Customer", required: true },
    billingProfileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    connections: [{ type: mongoose.Schema.Types.ObjectId, ref: "Connection" }],
    generatedDocuments: {
      po: { type: GeneratedDocumentSchema, default: undefined },
      caf: { type: GeneratedDocumentSchema, default: undefined },
      generatedAt: { type: Date },
    },
    signedDocuments: {
      po: { type: SignedDocumentSchema, default: undefined },
      caf: { type: SignedDocumentSchema, default: undefined },
    },
    // eSign requests for the batch CAF / PO; once signed, the copy goes to every unapproved connection.
    esignRequests: [EsignRequestSchema],
  },
  { timestamps: true },
);

BulkBatchSchema.index({ customer: 1, createdAt: -1 });
// e-Hastakshar's callback finds the batch by the documentId it returned when we sent the PDF.
BulkBatchSchema.index({ "esignRequests.documentId": 1 }, { sparse: true });

module.exports = mongoose.model("BulkBatch", BulkBatchSchema);