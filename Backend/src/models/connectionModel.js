const mongoose = require("mongoose");
const generateOpportunityId = require("../services/opportunityId.service");

// A signature line drawn on a generated PDF: 1-based page, points from the top-left (y = the line).
const SignatureBoxSchema = new mongoose.Schema({
  page: Number,
  x: Number,
  y: Number,
  width: Number,
}, { _id: false });

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
      "SIGNED_DOCUMENT_UPLOADED",
      "ESIGN_SENT",
      "ESIGN_COMPLETED",
      "ESIGN_UPDATED",
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
    perIpCost: { type: Number },
  },
  providerCost: {
    mrc: { type: Number },
    ratePerMb: { type: Number },
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
    // The customer's billing profile (GSTIN / billing address) this connection bills to.
    billingProfileId: { type: mongoose.Schema.Types.ObjectId, default: null },
    bulkBatch: { type: mongoose.Schema.Types.ObjectId, ref: "BulkBatch", default: null },
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
    // ips.count = number of IPs, ips.cost = TOTAL charge for all IPs, ips.perIpCost = charge per IP.
    ips: {
      count: { type: Number, default: 0 },
      cost: { type: Number, default: 0 },
      perIpCost: { type: Number, default: 0 },
    },
    purchaseOrder: {
      fileName: String,
      url: String,
      publicId: String,
      storage: { type: String, enum: ["cloudinary", "local"] }, // absent = cloudinary (legacy)
      uploadedAt: { type: Date }
    },
    purchaseOrders: [
      {
        fileName: String,
        url: String,
        publicId: String,
        storage: { type: String, enum: ["cloudinary", "local"] }, // absent = cloudinary (legacy)
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
      storage: { type: String, enum: ["cloudinary", "local"] }, // absent = cloudinary (legacy)
      uploadedAt: { type: Date, default: Date.now }
    },
    // Unsigned CAF / PO generated at creation, handed to the customer for signing.
    // The signed copies uploaded later become the official `caf` / `purchaseOrders` (CREATED) documents.
    // pageCount / signatureBoxes (where each signature line was drawn) place the eSign stamps.
    generatedDocuments: {
      caf: {
        fileName: String,
        url: String,
        publicId: String,
        storage: { type: String, enum: ["cloudinary", "local"] },
        generatedAt: { type: Date },
        pageCount: Number,
        signatureBoxes: [SignatureBoxSchema],
      },
      po: {
        fileName: String,
        url: String,
        publicId: String,
        storage: { type: String, enum: ["cloudinary", "local"] },
        generatedAt: { type: Date },
        pageCount: Number,
        signatureBoxes: [SignatureBoxSchema],
      },
    },
    // eSign requests sent to e-Hastakshar for the generated CAF / PO, newest last. Sending a document
    // again adds a new entry; the signed copy still comes back through uploadSignedDocuments for now.
    esignRequests: [
      {
        docType: { type: String, enum: ["CAF", "PO"], required: true },
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
        // Signed PDF received from e-Hastakshar; also applied as the official CAF / PO while the order is unapproved.
        signedDocument: {
          fileName: String,
          url: String,
          publicId: String,
          storage: { type: String, enum: ["cloudinary", "local"] },
          receivedAt: Date,
        },
      },
    ],
    // RMACD (Charge Deviation Form) per upgrade / downgrade / shifting request: generated unsigned,
    // then the customer-signed copy is uploaded. historyEntryId links it to the request's history entry.
    rmacdForms: [
      {
        requestType: { type: String, enum: ["UPGRADE", "DOWNGRADE", "SHIFTING"] },
        historyEntryId: { type: mongoose.Schema.Types.ObjectId },
        unsigned: {
          fileName: String,
          url: String,
          publicId: String,
          storage: { type: String, enum: ["cloudinary", "local"] },
          generatedAt: { type: Date },
        },
        signed: {
          fileName: String,
          url: String,
          publicId: String,
          storage: { type: String, enum: ["cloudinary", "local"] },
          uploadedAt: { type: Date },
        },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    businessAgreement: {
      fileName: String,
      url: String,
      publicId: String,
      storage: { type: String, enum: ["cloudinary", "local"] }, // absent = cloudinary (legacy)
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
ConnectionSchema.index(
  { telecoCircuitId: 1, "technicalDetails.telcoProvider": 1 },
  {unique: true, partialFilterExpression: { telecoCircuitId: { $type: "string", $regex: /./ } }}
);
ConnectionSchema.index({ customer: 1 });
ConnectionSchema.index({ bulkBatch: 1 }, { partialFilterExpression: { bulkBatch: { $type: "objectId" } } });
ConnectionSchema.index({ status: 1 });
ConnectionSchema.index({ createdBy: 1 });
// e-Hastakshar's callback finds the connection by the documentId it returned when we sent the PDF.
ConnectionSchema.index({ "esignRequests.documentId": 1 }, { sparse: true });
ConnectionSchema.index({ createdAt: -1 });
// Incremental sync (Ledgerly) pages by (updatedAt, _id).
ConnectionSchema.index({ updatedAt: 1, _id: 1 });

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
