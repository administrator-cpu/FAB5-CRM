const mongoose = require("mongoose");
const crypto = require("crypto");
const bcrypt = require("bcrypt");
const ROLES = require("../constants/roles");



const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      trim: true,
      maxLength: [50, "Name cannot exceed 50 characters"],
    },
    email: {
      type: String,
      required: [true, "Please enter your email"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Please enter a valid email"],
    },
    password: {
      type: String,
      required: [true, "Please enter a password"],
      minlength: [8, "Password must be at least 8 characters"],
      match: [
        /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{8,}$/,
        "Password must contain at least one uppercase letter, one lowercase letter, and one number"
      ],
      select: false,
    },

    dob: { type: Date },
    phone: {
      type: String,
      trim: true,
      match: [/^[6-9]\d{9}$/, "Please enter a valid 10-digit Indian mobile number"]
    },
    adharNumber: {
      type: String,
      unique: true,
      trim: true,
      sparse: true,
      select: false,
      // ADHAAR number is 12 digits long and only contains numbers
      match: [/^\d{12}$/, "Please enter a valid 12-digit Aadhaar number"]
    },
    panNumber: {
      type: String,
      unique: true,
      uppercase: true,
      trim: true,
      sparse: true,
      select: false,
      // PAN number format: 5 letters, 4 digits, 1 letter (ABCDE1234F)
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, "Please enter a valid PAN number"]
    },

    role: {
      type: String,
      enum: Object.values(ROLES),
      default: ROLES.EMPLOYEE,
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isProfileComplete: {
      type: Boolean,
      default: false
    },

    resetPasswordToken: { type: String, select: false },
    resetPasswordExpire: { type: Date, select: false },

    refreshToken: { type: String, select: false },
    refreshTokenExpire: { type: Date, select: false },

    // Bumped on password reset / change; login tokens carry it, so older tokens stop working.
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ role: 1, createdAt: -1 });

userSchema.virtual("customers", {
  ref: "Customer",
  localField: "_id",
  foreignField: "managedBy",
});

userSchema.pre("save", async function (next) {
  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }
  if (this.isModified("refreshToken") && this.refreshToken) {
    this.refreshToken = crypto
      .createHash("sha256")
      .update(this.refreshToken)
      .digest("hex");
  }
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};
userSchema.index({ createdAt: -1 });

const User = mongoose.model("User", userSchema);
module.exports = User;
