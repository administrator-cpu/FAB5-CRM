const express = require("express");
const {
  searchCustomersForInvoice, getCustomerProfileForInvoice, getDashboardConnections, getConnectionBillingHistory,
  getCustomerConnectionsForInvoice, getSamadhanCustomerWithConnections, getSamadhanCustomerWithConnectionsv2,
  checkOpportunityExists
} = require("../controllers/invoiceIntegration.controller");

const router = express.Router();

const protectInternal = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && apiKey === process.env.INTERNAL_CRM_SECRET) {
    return next();
  }
  return res.status(401).json({ status: 'fail', message: 'Unauthorized internal request' });
};

// All routes prefixed with /api/crm in app.js
router.get("/customers", protectInternal, searchCustomersForInvoice);
router.get("/connections/check/:opportunityId", protectInternal, checkOpportunityExists);
router.get("/customers/:id", protectInternal, getCustomerProfileForInvoice);
router.get("/customers/:id/connections", protectInternal, getCustomerConnectionsForInvoice);
router.get("/:id/billing-history", protectInternal, getConnectionBillingHistory);
router.get("/:id/dashboard-connections", protectInternal, getDashboardConnections);
router.get("/samadhan/customer-connections", protectInternal, getSamadhanCustomerWithConnections);
router.get("/v2/samadhan/customer-connections", protectInternal, getSamadhanCustomerWithConnectionsv2);
module.exports = router;