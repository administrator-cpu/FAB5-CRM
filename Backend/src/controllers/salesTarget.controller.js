const SalesTarget = require("../models/salesTarget.model");
const User = require("../models/userModel");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const ROLES = require("../constants/roles");

// Normalizes any date to the 1st 00:00:00 UTC of its month. Uses UTC
// getters/constructor throughout so the result is identical no matter what
// timezone the server runs in, and matches the plain "YYYY-MM-01" date
// strings the frontend sends (which JS parses as UTC midnight).
const toMonthStart = (dateInput) => {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
};

const isoDate = (d) => {
  const date = new Date(d);
  return isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
};

// Reshapes a flat list of target docs into { [employeeId]: { [monthStartISO]: targetMbps } }
// — the exact shape the frontend's targetService already expects. Any
// record with a missing/invalid monthStart (e.g. a leftover from the old
// weekly-target schema) is skipped rather than crashing the request.
const groupByEmployee = (targets) => {
  const grouped = {};
  targets.forEach((t) => {
    const key = isoDate(t.monthStart);
    if (!key) return;
    const empId = String(t.employee?._id || t.employee);
    if (!grouped[empId]) grouped[empId] = {};
    grouped[empId][key] = t.targetMbps;
  });
  return grouped;
};

// GET /api/sales-targets
// Admin: every employee's targets. Employee: only their own.
const getAllTargets = asyncHandler(async (req, res) => {
  const filter = req.user.role === ROLES.ADMIN ? {} : { employee: req.user._id };
  const targets = await SalesTarget.find(filter).lean();
  res.status(200).json({ success: true, data: groupByEmployee(targets) });
});

// GET /api/sales-targets/:employeeId
// Admin can view anyone; employees can only view themselves.
const getEmployeeTargets = asyncHandler(async (req, res, next) => {
  const { employeeId } = req.params;

  if (req.user.role !== ROLES.ADMIN && String(req.user._id) !== employeeId) {
    return next(new AppError("Forbidden: you can only view your own targets", 403));
  }

  const targets = await SalesTarget.find({ employee: employeeId }).lean();
  const map = {};
  targets.forEach((t) => {
    const key = isoDate(t.monthStart);
    if (key) map[key] = t.targetMbps;
  });

  res.status(200).json({ success: true, data: map });
});

// PUT /api/sales-targets  { employeeId, monthStart, targetMbps }
// Admin only. Upserts — setting a target for a month that already has one overwrites it.
const setMonthlyTarget = asyncHandler(async (req, res, next) => {
  const { employeeId, monthStart, targetMbps } = req.body;

  if (!employeeId || !monthStart || targetMbps === undefined || targetMbps === null) {
    return next(new AppError("employeeId, monthStart and targetMbps are required", 400));
  }
  if (isNaN(Number(targetMbps)) || Number(targetMbps) < 0) {
    return next(new AppError("targetMbps must be a non-negative number", 400));
  }

  const employee = await User.findById(employeeId).select("_id role isActive");
  if (!employee) return next(new AppError("Employee not found", 404));
  if (employee.isActive === false) {
    return next(new AppError("Cannot set a target for a deactivated employee", 400));
  }

  const normalizedMonthStart = toMonthStart(monthStart);
  if (!normalizedMonthStart) return next(new AppError("Invalid monthStart date", 400));

  const target = await SalesTarget.findOneAndUpdate(
    { employee: employeeId, monthStart: normalizedMonthStart },
    { targetMbps: Number(targetMbps), setBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    success: true,
    message: "Monthly target saved",
    data: { employeeId, monthStart: isoDate(target.monthStart), targetMbps: target.targetMbps },
  });
});

// DELETE /api/sales-targets  { employeeId, monthStart }
// Admin only.
const deleteMonthlyTarget = asyncHandler(async (req, res, next) => {
  const { employeeId, monthStart } = req.body;
  if (!employeeId || !monthStart) {
    return next(new AppError("employeeId and monthStart are required", 400));
  }

  const normalizedMonthStart = toMonthStart(monthStart);
  await SalesTarget.deleteOne({ employee: employeeId, monthStart: normalizedMonthStart });

  res.status(200).json({ success: true, message: "Target removed" });
});

module.exports = { getAllTargets, getEmployeeTargets, setMonthlyTarget, deleteMonthlyTarget };