const express = require("express");
const {
  searchCustomersForInvoice, getCustomerProfileForInvoice, getDashboardConnections, getConnectionBillingHistory,
  getCustomerConnectionsForInvoice, getSamadhanCustomerWithConnections, getSamadhanCustomerWithConnectionsv2,
  checkOpportunityExists
} = require("../controllers/invoiceIntegration.controller");

const { syncConnections, syncCustomers } = require("../controllers/ledgerlySync.controller");
const { requireLedgerlyKey } = require("../middlewares/ledgerlyAuth.middleware");
const { safeCompare } = require("../utils/security");

const router = express.Router();

const protectInternal = (req, res, next) => {
  if (safeCompare(req.headers['x-api-key'], process.env.INTERNAL_CRM_SECRET)) {
    return next();
  }
  return res.status(401).json({ status: 'fail', message: 'Unauthorized internal request' });
};

// All routes prefixed with /api/crm in app.js
// Ledgerly incremental sync (read-only, its own LEDGERLY_API_KEY)
router.get("/sync/connections", requireLedgerlyKey, syncConnections);
router.get("/sync/customers", requireLedgerlyKey, syncCustomers);

router.get("/customers", protectInternal, searchCustomersForInvoice);
router.get("/connections/check/:opportunityId", protectInternal, checkOpportunityExists);
router.get("/customers/:id", protectInternal, getCustomerProfileForInvoice);
router.get("/customers/:id/connections", protectInternal, getCustomerConnectionsForInvoice);
router.get("/:id/billing-history", protectInternal, getConnectionBillingHistory);
router.get("/:id/dashboard-connections", protectInternal, getDashboardConnections);
router.get("/samadhan/customer-connections", protectInternal, getSamadhanCustomerWithConnections);
router.get("/v2/samadhan/customer-connections", protectInternal, getSamadhanCustomerWithConnectionsv2);
module.exports = router;