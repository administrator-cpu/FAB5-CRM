const express = require("express");
const {
  getAllTargets,
  getEmployeeTargets,
  setWeeklyTarget,
  deleteWeeklyTarget,
} = require("../controllers/salesTarget.controller");
const { protect, authorize } = require("../middlewares/authMiddleware");
const ROLES = require("../constants/roles");

const router = express.Router();

router.use(protect);

// Admin sees everyone's targets; employees get their own targets filtered
// server-side inside the controller.
router.get("/", getAllTargets);
router.get("/:employeeId", getEmployeeTargets);

// Only admins can set or remove targets.
router.put("/", authorize(ROLES.ADMIN), setWeeklyTarget);
router.delete("/", authorize(ROLES.ADMIN), deleteWeeklyTarget);

module.exports = router;
