// READ-ONLY. Volume numbers for Ledgerly: connections by status, customers, providers in use,
// and first activations per month. Usage: node scripts/ledgerly/counts.js
const { connect, disconnect } = require("./db");
const Connection = require("../../src/models/connectionModel");
const Customer = require("../../src/models/customerModel");

const LIVE_STATUSES = ["Active", "Notice Period"];

const run = async () => {
  await connect();

  const byStatus = await Connection.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }, { $sort: { count: -1 } }]);
  console.log("\nConnections by status:");
  byStatus.forEach((s) => console.log(`  ${String(s._id).padEnd(15)} ${s.count}`));

  const [totalCustomers, activeCustomers, multiProfileCustomers, noProfileCustomers] = await Promise.all([
    Customer.countDocuments({}),
    Customer.countDocuments({ isActive: true }),
    Customer.countDocuments({ "billingProfile.1": { $exists: true } }),
    Customer.countDocuments({ "billingProfile.0": { $exists: false } }),
  ]);
  console.log(`\nCustomers: ${totalCustomers} total, ${activeCustomers} active`);
  console.log(`  with more than one billing profile: ${multiProfileCustomers}`);
  console.log(`  with no billing profile:            ${noProfileCustomers}`);

  const providers = await Connection.aggregate([
    { $match: { status: { $in: LIVE_STATUSES } } },
    { $group: { _id: "$technicalDetails.telcoProvider", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  console.log(`\nProviders in use (Active + Notice Period): ${providers.length}`);
  providers.forEach((p) => console.log(`  ${String(p._id || "(not set)").padEnd(15)} ${p.count}`));

  const firstActivations = await Connection.aggregate([
    { $unwind: "$history" },
    { $match: { "history.action": "ACTIVATED", "history.date": { $type: "date" } } },
    { $group: { _id: "$_id", firstActivatedAt: { $min: "$history.date" } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m", date: "$firstActivatedAt", timezone: "Asia/Kolkata" } }, count: { $sum: 1 } } },
    { $sort: { _id: -1 } },
    { $limit: 12 },
  ]);
  console.log("\nNew activations per month (first activation, last 12 months with data):");
  firstActivations.forEach((m) => console.log(`  ${m._id}  ${m.count}`));

  const missingBilling = await Connection.countDocuments({ status: { $in: LIVE_STATUSES }, billingProfileId: { $in: [null] } });
  console.log(`\nLive connections without billingProfileId: ${missingBilling}`);
};

run()
  .catch((err) => { console.error("Failed:", err.message); process.exitCode = 1; })
  .finally(disconnect);
