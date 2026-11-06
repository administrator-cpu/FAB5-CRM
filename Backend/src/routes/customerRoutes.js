const express = require("express");
const multer = require("multer");
const upload = require("../middlewares/uploadMiddleware");
const ROLES = require("../constants/roles")
const {createCustomer,getAllCustomers,getCustomersById,getCustomersByEmp,disconnection,extension,retention,previewBulkCustomers,commitBulkCustomers,downloadCustomerTemplate,editCustomer,deleteCustomer,addBillingProfile,editBillingProfile,removeBillingProfile} = require("../controllers/customerController");
const { protect, authorize } = require("../middlewares/authMiddleware");
const { updateDashboardMetricsPostResponse } = require("../middlewares/realtimeMiddleware");
const router = express.Router();

const tempUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
router.get("/bulk-template", protect, authorize(ROLES.ADMIN), downloadCustomerTemplate);
router.post("/bulk-preview", protect,updateDashboardMetricsPostResponse, authorize(ROLES.ADMIN), tempUpload.single("file"), previewBulkCustomers);
router.post("/bulk-commit", protect,updateDashboardMetricsPostResponse, authorize(ROLES.ADMIN), commitBulkCustomers);
router.post("/create", protect,updateDashboardMetricsPostResponse,authorize(ROLES.EMPLOYEE),upload.fields([  { name: "companyDocuments", maxCount: 5 },  { name: "signatoryDocuments", maxCount: 5 },]),createCustomer);
router.get("/", protect, authorize(ROLES.ADMIN, ROLES.OWNER, ROLES.ORDER_GENERATION, ROLES.PROJECT_MANAGER), getAllCustomers);
router.get("/my", protect, authorize(ROLES.EMPLOYEE), getCustomersByEmp);
router.put("/:id", protect,updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN),upload.fields([  { name: "companyDocuments", maxCount: 5 },  { name: "signatoryDocuments", maxCount: 5 },]), editCustomer);
router.delete("/:id", protect,updateDashboardMetricsPostResponse, authorize(ROLES.ADMIN, ROLES.EMPLOYEE), deleteCustomer);
router.get("/:id", protect, getCustomersById);
router.post("/:id/disconnect", protect,updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN, ROLES.OWNER), disconnection);
router.put("/:id/extend", protect,updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN, ROLES.OWNER), extension);
router.put("/:id/retain", protect,updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN, ROLES.OWNER), retention);
router.post("/:customerId/billing-profile", protect,updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), addBillingProfile);
router.put("/:customerId/billing-profile/:profileId", protect,updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), editBillingProfile);
router.delete("/:customerId/billing-profile/:profileId", protect,updateDashboardMetricsPostResponse, authorize(ROLES.EMPLOYEE, ROLES.ADMIN), removeBillingProfile);

module.exports = router;
