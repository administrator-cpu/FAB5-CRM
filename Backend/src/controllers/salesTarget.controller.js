const SalesTarget = require("../models/salesTarget.model");
const User = require("../models/userModel");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const ROLES = require("../constants/roles");

// Normalizes any date to the Monday 00:00:00 of its week (UTC-safe enough
// for weekly bucketing — mirrors the frontend's getWeekStartISO()).
const toWeekStart = (dateInput) => {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

const isoDate = (d) => new Date(d).toISOString().slice(0, 10);

// Reshapes a flat list of target docs into { [employeeId]: { [weekStartISO]: targetMbps } }
// — the exact shape the frontend's targetService already expects.
const groupByEmployee = (targets) => {
  const grouped = {};
  targets.forEach((t) => {
    const empId = String(t.employee?._id || t.employee);
    if (!grouped[empId]) grouped[empId] = {};
    grouped[empId][isoDate(t.weekStart)] = t.targetMbps;
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
  targets.forEach((t) => { map[isoDate(t.weekStart)] = t.targetMbps; });

  res.status(200).json({ success: true, data: map });
});

// PUT /api/sales-targets  { employeeId, weekStart, targetMbps }
// Admin only. Upserts — setting a target for a week that already has one overwrites it.
const setWeeklyTarget = asyncHandler(async (req, res, next) => {
  const { employeeId, weekStart, targetMbps } = req.body;

  if (!employeeId || !weekStart || targetMbps === undefined || targetMbps === null) {
    return next(new AppError("employeeId, weekStart and targetMbps are required", 400));
  }
  if (isNaN(Number(targetMbps)) || Number(targetMbps) < 0) {
    return next(new AppError("targetMbps must be a non-negative number", 400));
  }

  const employee = await User.findById(employeeId).select("_id role");
  if (!employee) return next(new AppError("Employee not found", 404));

  const normalizedWeekStart = toWeekStart(weekStart);
  if (!normalizedWeekStart) return next(new AppError("Invalid weekStart date", 400));

  const target = await SalesTarget.findOneAndUpdate(
    { employee: employeeId, weekStart: normalizedWeekStart },
    { targetMbps: Number(targetMbps), setBy: req.user._id },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.status(200).json({
    success: true,
    message: "Weekly target saved",
    data: { employeeId, weekStart: isoDate(target.weekStart), targetMbps: target.targetMbps },
  });
});

// DELETE /api/sales-targets  { employeeId, weekStart }
// Admin only.
const deleteWeeklyTarget = asyncHandler(async (req, res, next) => {
  const { employeeId, weekStart } = req.body;
  if (!employeeId || !weekStart) {
    return next(new AppError("employeeId and weekStart are required", 400));
  }

  const normalizedWeekStart = toWeekStart(weekStart);
  await SalesTarget.deleteOne({ employee: employeeId, weekStart: normalizedWeekStart });

  res.status(200).json({ success: true, message: "Target removed" });
});

module.exports = { getAllTargets, getEmployeeTargets, setWeeklyTarget, deleteWeeklyTarget };
