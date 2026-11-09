const express = require("express");
const upload = require("../middlewares/uploadMiddleware");
const { protect, authorize } = require("../middlewares/authMiddleware");
const ROLES = require("../constants/roles");
const { updateDashboardMetricsPostResponse } = require("../middlewares/realtimeMiddleware");
const {
  downloadTemplate, uploadBulkConnections, createBulkConnections,
  activeBulkConnectionTemplate, previewActiveBulkConnections, commitActiveBulkConnections,
  getCustomerBulkBatches, uploadBulkSignedDocuments, sendBatchForEsign,
} = require("../controllers/bulkConnection.controller");

const router = express.Router();
router.get("/download-template", protect, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), downloadTemplate);
router.post("/upload", protect,updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), upload.single("file"), uploadBulkConnections);
router.post(
  "/:customerId/create",
  protect,updateDashboardMetricsPostResponse,
  authorize(ROLES.EMPLOYEE, ROLES.ADMIN),
  upload.fields([
    { name: "purchaseOrder", maxCount: 1 },
    { name: "businessAgreement", maxCount: 1 },
    { name: "caf", maxCount: 1 },
  ]),
  createBulkConnections
);
// Bulk batches: one unsigned PO / CAF per upload; the signed copies are uploaded once for the whole batch.
router.get("/:customerId/batches", protect, authorize(ROLES.EMPLOYEE, ROLES.ADMIN, ROLES.OWNER), getCustomerBulkBatches);
router.patch(
  "/batches/:batchId/signed-documents",
  protect, updateDashboardMetricsPostResponse,
  authorize(ROLES.EMPLOYEE, ROLES.ADMIN),
  upload.fields([{ name: "caf", maxCount: 1 }, { name: "purchaseOrder", maxCount: 1 }]),
  uploadBulkSignedDocuments
);
// Sends the batch CAF / PO for eSign; the signed copies are applied to the batch by the e-Hastakshar callback.
router.post("/batches/:batchId/esign", protect, updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), sendBatchForEsign);
router.get(
  "/bulk-template",
  protect,
  authorize(ROLES.ADMIN, ROLES.OWNER),
  activeBulkConnectionTemplate
);

router.post(
  "/bulk-preview",
  protect,updateDashboardMetricsPostResponse,
  authorize(ROLES.ADMIN, ROLES.OWNER),
  upload.single("file"),
  previewActiveBulkConnections
);

router.post(
  "/bulk-commit",
  protect,updateDashboardMetricsPostResponse,
  authorize(ROLES.ADMIN),
  commitActiveBulkConnections
);

module.exports = router;