const mongoose = require("mongoose");
const generateOpportunityId = require("../services/opportunityId.service");

const HistoryEntrySchema = new mongoose.Schema({
  action: {
    type: String,
    enum: [
      "CREATED",
      "APPROVED",
      "REJECTED",
      "GENERATION",
      "ACTIVATED",
      "CANCELLED",
      "UPGRADE",
      "DOWNGRADE",
      "RATE_REVISION",
      "RATE_REVISION_APPROVED",
      "SHIFTING",
      "IP_ADDITION",
      "EDITED",
      "DISCONNECT_INITIATED",
      "EXTENDED",
      "RETAINED",
      "TERMINATED",
      "TRANSFERRED",
      "DELETED",
    ],
    required: true,
  },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  note: { type: String, trim: true },
  date: { type: Date, default: Date.now },

  serviceType: { type: String, enum: ["DNC", "Mix", "ILL", "Peering", "IP"], },
  bandwidth: { type: String },
  technicalDetails: {
    aEnd: {
      btsId: { type: String, trim: true },
      address: { type: String, trim: true },
      latitude: { type: String, trim: true },
      longitude: { type: String, trim: true },
    },
    bEnd: {
      btsId: { type: String, trim: true },
      address: { type: String, trim: true },
      latitude: { type: String, trim: true },
      longitude: { type: String, trim: true },
    },
    telcoProvider: {
      type: String,
      enum: ["Airtel", "TCL", "Vodafone", "Jio", "Other"],
    },
  },
  commercials: {
    mrc: { type: Number, default: 0 },
    ratePerMb: { type: Number, default: 0 },
    otc: { type: Number, default: 0 },
    advance: { type: Number, default: 0 },
  },
  ips: {
    count: { type: Number, default: 0 },
    cost: { type: Number, default: 0 },
  },
  terminationDetails: {
    raiseDate: { type: Date },
    finalDate: { type: Date },
    reason: { type: String, trim: true },
  },
});

// 3. THE MAIN CONNECTION SCHEMA
const ConnectionSchema = new mongoose.Schema(
  {
    opportunityId: {
      type: String,
      trim: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: [true, "Customer is required"],
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Creator is required"],
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    activatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // --- SERVICE DETAILS ---
    serviceType: {
      type: String,
      enum: ["DNC", "Mix", "ILL", "Peering", "IP"],
      required: [true, "Service Type is required"],
    },
    bandwidth: { type: String },

    // --- TECHNICAL DETAILS ---
    technicalDetails: {
      aEnd: {
        btsId: { type: String, trim: true },
        address: { type: String, trim: true },
        latitude: { type: String, trim: true },
        longitude: { type: String, trim: true },
      },
      bEnd: {
        btsId: { type: String, trim: true },
        address: { type: String, trim: true },
        latitude: { type: String, trim: true },
        longitude: { type: String, trim: true },
      },
      telcoProvider: {
        type: String,
        enum: ["Airtel", "TCL", "Vodafone", "Jio", "Other"],
      },
    },

    // --- COMMERCIALS ---
    commercials: {
      mrc: { type: Number, default: 0 }, // Monthly Recurring Charge
      ratePerMb: { type: Number, default: 0 },
      otc: { type: Number, default: 0 }, // One Time Charge
      advance: { type: Number, default: 0 }, // Advance Payment
    },
    providerCost: {
      mrc: { type: Number, default: 0 },
      ratePerMb: { type: Number, default: 0 },
      updatedAt: { type: Date },
    },
    isIpAdditionRequest: {
      type: Boolean,
      default: false
    },
    ips: {
      count: { type: Number, default: 0 },
      cost: { type: Number, default: 0 },
    },
    purchaseOrder: {
      fileName: String,
      url: String,
      publicId: String,
      uploadedAt: { type: Date }
    },
    purchaseOrders: [
      {
        fileName: String,
        url: String,
        publicId: String,
        requestType: {
          type: String,
          enum: ["CREATED", "UPGRADE", "DOWNGRADE", "SHIFTING", "IP_ADDITION"],
          // required: true
        },
        uploadedAt: { type: Date, default: Date.now },
      }
    ],
    caf: {
      fileName: String,
      url: String,
      publicId: String,
      uploadedAt: { type: Date, default: Date.now }
    },
    businessAgreement: {
      fileName: String,
      url: String,
      publicId: String,
      uploadedAt: { type: Date, default: Date.now }
    },
    remarks: {
      type: String,
      trim: true,
      maxlength: [500, "Remarks cannot exceesd 500 characters"],
    },
    fabCircuitId: { type: String, trim: true },
    telecoCircuitId: { type: String, trim: true },
    acceptanceDate: { type: Date },

    scheduledRateRevision: {
      mrc: Number,
      ratePerMb: Number,
      effectiveDate: Date
    },

    // --- SYSTEM FIELDS ---
    status: {
      type: String,
      enum: ["Pending", "Approved", "Generation", "Active", "Notice Period", "Disconnected", "Rejected", "Cancelled", "Deleted"],
      default: "Pending",
    },

    rejectionDetails: {
      reason: { type: String, trim: true },
      rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      rejectedAt: { type: Date },
    },

    terminationDetails: {
      raiseDate: { type: Date },
      finalDate: { type: Date },
      reason: { type: String, trim: true },
    },

    // --- THE TRACKER ---
    history: [HistoryEntrySchema],
  },
  { timestamps: true },
);

ConnectionSchema.index({ opportunityId: 1 }, { unique: true });
ConnectionSchema.index({ customer: 1 });
ConnectionSchema.index({ status: 1 });
ConnectionSchema.index({ createdBy: 1 });
ConnectionSchema.index({ createdAt: -1 });

ConnectionSchema.pre("save", async function (next) {
  if (this.isNew && !this.opportunityId) {
    const id = generateOpportunityId();
    this.opportunityId = id;;
    this.fabCircuitId = id;
  }
  next();
});
ConnectionSchema.index({ createdAt: -1, status: 1 });
ConnectionSchema.index({ status: 1, "commercials.mrc": 1 });
module.exports = mongoose.model("Connection", ConnectionSchema);
