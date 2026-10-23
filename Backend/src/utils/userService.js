const User = require("../models/userModel");
const Customer = require("../models/customerModel");
const Connection = require("../models/connectionModel");
const ROLES = require("../constants/roles");

// GET /api/users/all feeds the dashboard lists and analytics, which only need each connection's
// summary and the history fields used for revenue (action, date, bandwidth, commercials, ips).
// history.note is kept: the master Excel export reads it for the "Old Bandwidth" column.
// Documents and the rest of each history snapshot are fetched per connection when it's opened.
const CONNECTION_LIST_FIELDS = [
  "-generatedDocuments", "-rmacdForms", "-purchaseOrders", "-purchaseOrder", "-caf", "-businessAgreement",
  "-history.performedBy", "-history.technicalDetails", "-history.providerCost",
  "-history.terminationDetails",
].join(" ");
const CUSTOMER_SUMMARY_FIELDS = "name isActive";
const USER_SUMMARY_FIELDS = "name email role";
const USER_LIST_FIELDS = "name email phone dob role isActive isProfileComplete createdAt updatedAt";

const listConnections = (filter) =>
  Connection.find(filter)
    .select(CONNECTION_LIST_FIELDS)
    .populate("customer", CUSTOMER_SUMMARY_FIELDS)
    .populate("createdBy", USER_SUMMARY_FIELDS)
    .lean();

const getAllUserData = async (currentUser) => {
  if (currentUser.role === ROLES.EMPLOYEE) {
    const customers = await Customer.find({ managedBy: currentUser._id, isActive: true }).lean();
    const connections = await listConnections({
      customer: { $in: customers.map((c) => c._id) },
      status: { $ne: "Deleted" },
    });
    return { connections, customers };
  }

  if (currentUser.role === ROLES.ADMIN) {
    const [users, customers, connections] = await Promise.all([
      User.find().select(USER_LIST_FIELDS).lean(),
      Customer.find({ isActive: true }).populate("managedBy", USER_SUMMARY_FIELDS).lean(),
      listConnections({ status: { $ne: "Deleted" } }),
    ]);
    return { users, connections, customers };
  }

  if (currentUser.role === ROLES.OWNER) {
    return { connections: await listConnections({ status: "Pending" }) };
  }
  if (currentUser.role === ROLES.ORDER_GENERATION) {
    return { connections: await listConnections({ status: "Approved" }) };
  }
  if (currentUser.role === ROLES.PROJECT_MANAGER) {
    const connections = await Connection.find({ status: "Generation" })
      .select(`
        -commercials
        -history.commercials
        -history.ips
        -history.technicalDetails
        -history.terminationDetails
        -generatedDocuments -rmacdForms -purchaseOrders -purchaseOrder -caf -businessAgreement
      `)
      .populate("customer createdBy")
      .populate("history.performedBy", "name email")
      .lean();
    return { connections };
  }
  return {};
};

module.exports = { getAllUserData };
