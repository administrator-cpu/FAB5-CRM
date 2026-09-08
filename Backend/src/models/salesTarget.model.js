const mongoose = require("mongoose");

const SalesTargetSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Employee is required"],
    },
    weekStart: {
      type: Date,
      required: [true, "Week start date is required"],
    },
    targetMbps: {
      type: Number,
      required: [true, "Target bandwidth (Mbps) is required"],
      min: [0, "Target cannot be negative"],
    },
    setBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

SalesTargetSchema.index({ employee: 1, weekStart: 1 }, { unique: true });

module.exports = mongoose.model("SalesTarget", SalesTargetSchema);
