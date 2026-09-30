const express = require("express");
const ROLES = require("../constants/roles");
const upload = require("../middlewares/uploadMiddleware");
const { protect, authorize } = require("../middlewares/authMiddleware");
const {
  createConnection, connectionByCustomer, getConnectionById,
  getConnectionsByStatus, approveConnection, rejectConnection,
  editRejectedConnection, editRemark, migratePurchaseOrders, updateProviderCost,
  markAsGeneration, cancelConnection, deleteConnection, activateConnection,
  editConnection, updateCoordinates, shiftConnection, addIp, undoDisconnection,
  getProjectManagerReport, downloadDocument, transferConnections, removeTransferLog, checkDuplicateTelcoCircuitIds
} = require("../controllers/connectionController");
const { updateDashboardMetricsPostResponse } = require("../middlewares/realtimeMiddleware");

const router = express.Router();

router.post("/generate", updateDashboardMetricsPostResponse, protect, authorize(ROLES.ORDER_GENERATION, ROLES.ADMIN), markAsGeneration);

router.get("/project-report", protect, authorize(ROLES.PROJECT_MANAGER, ROLES.ADMIN), getProjectManagerReport);
/* DEVELOPER ONLY API */
router.post("/transfer", protect, authorize(ROLES.ADMIN), transferConnections);
router.post("/transfer/remove-log", protect, authorize(ROLES.ADMIN), removeTransferLog);
router.get("/duplicates/telco-ids", protect, authorize(ROLES.ADMIN, ROLES.OWNER), checkDuplicateTelcoCircuitIds);
/* END OF DEVELOPER ONLY API */
router.get("/details/:id", protect, getConnectionById);
router.get("/status/:status", protect, authorize(ROLES.EMPLOYEE, ROLES.ADMIN, ROLES.OWNER, ROLES.ORDER_GENERATION, ROLES.PROJECT_MANAGER), getConnectionsByStatus);

router.patch("/:id/approve", protect, updateDashboardMetricsPostResponse, authorize(ROLES.ADMIN, ROLES.OWNER), approveConnection);
router.patch("/:id/reject", protect, updateDashboardMetricsPostResponse, authorize(ROLES.ADMIN, ROLES.OWNER, ROLES.ORDER_GENERATION, ROLES.PROJECT_MANAGER), rejectConnection);
router.post("/:id/undo", protect, updateDashboardMetricsPostResponse, authorize(ROLES.ADMIN), undoDisconnection);
router.patch("/:id/delete", protect, updateDashboardMetricsPostResponse, authorize(ROLES.ADMIN), deleteConnection);
router.put("/:id/coordinates", protect, updateDashboardMetricsPostResponse, authorize(ROLES.ADMIN), updateCoordinates);
router.patch("/:id/edit-rejected", protect, updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), editRejectedConnection);
router.patch("/:id/cancel", protect, updateDashboardMetricsPostResponse, authorize(ROLES.PROJECT_MANAGER, ROLES.ADMIN), cancelConnection);
router.put("/:id/provider-cost", protect, updateDashboardMetricsPostResponse, authorize(ROLES.ORDER_GENERATION, ROLES.ADMIN), updateProviderCost);
router.patch("/:id/activate", protect, updateDashboardMetricsPostResponse, authorize(ROLES.PROJECT_MANAGER, ROLES.ADMIN), activateConnection);
router.patch("/:id/shift", protect, updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), upload.fields([{ name: "purchaseOrder", maxCount: 1 }]), shiftConnection);
router.put("/:id/edit", protect, updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), upload.fields([{ name: "purchaseOrder", maxCount: 1 }]), editConnection);
router.patch("/:id/remark", protect, updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), editRemark);
router.put("/:id/add-ip", protect, updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN, ROLES.OWNER), upload.fields([{ name: "purchaseOrder", maxCount: 1 }]), addIp);
router.post("/migrate-pos", protect, updateDashboardMetricsPostResponse, authorize(ROLES.ADMIN), migratePurchaseOrders);
router.post("/:customerId", protect, updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), upload.fields([{ name: "purchaseOrder", maxCount: 1 }, { name: "businessAgreement", maxCount: 1 }, { name: "caf", maxCount: 1 },]), createConnection);

router.get("/:customerId", protect, connectionByCustomer);
router.get('/download/:opportunityId/:docType', downloadDocument);

module.exports = router;