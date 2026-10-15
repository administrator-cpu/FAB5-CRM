const mongoose = require('mongoose');
const { INDIAN_STATES } = require ('../constants/states.js')

const BillingProfileSchema = new mongoose.Schema({
  label: { type: String, trim: true },
  gstNumber: {
    type: String,
    trim: true,
    uppercase: true,
  },
  address: {
    street: { type: String, trim: true, uppercase: true },
    city: { type: String, trim: true, uppercase: true },
    state: { type: String, trim: true, uppercase: true, enum:{values: INDIAN_STATES, message: "{VALUE} is not a recognized Indian State or Union Territory"} },
    pincode: {
      type: String,
      trim: true,
      uppercase: true,
      match: [/^\d{6}$/, "Please enter a valid pincode"],
    },
  },
});

const documentSchema = {
  documentType: String,
  fileName: String,
  url: String,
  publicId: String,
  storage: { type: String, enum: ["cloudinary", "local"] }, // absent = cloudinary (legacy)
  uploadedAt:{ type: Date, default: Date.now },
};

const CustomerSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please enter the company name"],
    trim: true,
    uppercase: true
  },
  person: {
    type: String,
    required: [true, "Please enter the person name"], // Contact Person
    trim: true
  },
  email: {
    type: String,
    required: [true, "Please enter an email"],
    trim: true,
    lowercase: true,
    match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email"],
  },
  mobile: {
    type: String,
    required: [true, "Please enter a mobile number"],
    trim: true,
    match: [/^[6-9]\d{9}$/, "Please enter a valid 10-digit mobile number"],
  },
  customerType: {
    type: String,
    enum: ["Enterprise", "ISP", "Operator", "Government"],
    required: [true, "Please select a customer type"],
  },
  documents: {
    companyDocuments: {
      type: [{
        ...documentSchema,
        documentType: {
          type: String,
          enum: ["Incorporation Certificate", "Company PAN", "ISP License"]
        }
      }],
      default: []
    },
    signatoryDocuments: {
      type: [{
        ...documentSchema,
        documentType: {
          type: String,
          enum: ["PAN", "AADHAAR"]
        }
      }],
      default: []
    }
  },

  billingProfile: [BillingProfileSchema],

  // Metadata
  managedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, "Customer must be assigned to an Employee"]
  },
  isActive: { type: Boolean, default: true }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

CustomerSchema.index({ customerType: 1})
CustomerSchema.index({ email: 1 });
CustomerSchema.index({ managedBy: 1 });
CustomerSchema.index({ isActive: 1 });
CustomerSchema.index({ createdAt: -1 });
CustomerSchema.index({ name: "text" })

CustomerSchema.virtual("connections", {
  ref: "Connection",
  localField: "_id",
  foreignField: "customer",
});
CustomerSchema.index({ createdAt: -1, managedBy: 1 });
// Incremental sync (Ledgerly) pages by (updatedAt, _id).
CustomerSchema.index({ updatedAt: 1, _id: 1 });

module.exports = mongoose.model('Customer', CustomerSchema);