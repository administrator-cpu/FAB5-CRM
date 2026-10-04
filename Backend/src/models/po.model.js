const mongoose = require("mongoose");

const companyPoSchema = new mongoose.Schema({
  poNumber: { type: String, required: true, unique: true }, //FAB5/2026-27/0001
  financialYear: { type: String, required: true },
  connections: [{ type: mongoose.Schema.Types.ObjectId, ref: "Connection" }],
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },

  pdfUrl: { type: String },
  excelUrl: { type: String },
  storage: { type: String, enum: ["cloudinary", "local"] }, // absent = cloudinary (legacy)

}, { timestamps: true });

module.exports = mongoose.model("CompanyPO", companyPoSchema);
