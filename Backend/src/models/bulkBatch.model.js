const mongoose = require("mongoose");

const documentFields = {
  fileName: String,
  url: String,
  publicId: String,
  storage: { type: String, enum: ["cloudinary", "local"] },
};
const GeneratedDocumentSchema = new mongoose.Schema(documentFields, { _id: false });
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
  },
  { timestamps: true },
);

BulkBatchSchema.index({ customer: 1, createdAt: -1 });

module.exports = mongoose.model("BulkBatch", BulkBatchSchema);