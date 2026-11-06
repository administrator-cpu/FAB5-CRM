const Customer = require("../models/customerModel");
const ROLES = require("../constants/roles");

// Employees may only work with customers they manage; other roles are not limited by customer.
// customer.managedBy may be an ObjectId or a populated user.
const canAccessCustomer = (user, customer) => {
  if (user.role !== ROLES.EMPLOYEE) return true;
  const managerId = customer?.managedBy?._id || customer?.managedBy;
  return Boolean(managerId) && String(managerId) === String(user._id);
};

// Same rule for a connection, through its customer (loaded when it isn't populated with managedBy).
const canAccessConnection = async (user, connection) => {
  if (user.role !== ROLES.EMPLOYEE) return true;
  const customer = connection.customer?.managedBy !== undefined
    ? connection.customer
    : await Customer.findById(connection.customer).select("managedBy").lean();
  return canAccessCustomer(user, customer);
};

// The Airtel / provider cost is internal margin data: employees never receive it.
const withoutProviderCost = (user, connection) => {
  if (user.role !== ROLES.EMPLOYEE) return connection;
  const data = typeof connection.toJSON === "function" ? connection.toJSON() : { ...connection };
  delete data.providerCost;
  if (Array.isArray(data.history)) {
    data.history = data.history.map(({ providerCost, ...entry }) => entry);
  }
  return data;
};

module.exports = { canAccessCustomer, canAccessConnection, withoutProviderCost };
