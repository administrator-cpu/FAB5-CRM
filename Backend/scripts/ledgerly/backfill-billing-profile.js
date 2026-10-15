// Sets billingProfileId on existing connections whose customer has exactly one billing profile.
// Connections of customers with several (or no) profiles are listed and left unchanged.
// Dry run by default:  node scripts/ledgerly/backfill-billing-profile.js
// Write changes:       node scripts/ledgerly/backfill-billing-profile.js --apply
const { APPLY, connect, disconnect } = require("./db");
const Connection = require("../../src/models/connectionModel");
const Customer = require("../../src/models/customerModel");

const run = async () => {
  await connect();
  console.log(APPLY ? "Mode: APPLY (writing changes)\n" : "Mode: DRY RUN (no changes; add --apply to write)\n");

  const connections = await Connection.find({ billingProfileId: { $in: [null] } }).select("opportunityId customer status").lean();
  const customerIds = [...new Set(connections.map((c) => String(c.customer)))];
  const customers = await Customer.find({ _id: { $in: customerIds } }).select("name billingProfile._id").lean();
  const customerById = new Map(customers.map((c) => [String(c._id), c]));

  const toSet = [];
  const multiple = [];
  const none = [];
  for (const conn of connections) {
    const profiles = customerById.get(String(conn.customer))?.billingProfile || [];
    if (profiles.length === 1) toSet.push({ conn, billingProfileId: profiles[0]._id });
    else if (profiles.length > 1) multiple.push(conn);
    else none.push(conn);
  }

  console.log(`Connections without billingProfileId: ${connections.length}`);
  console.log(`  customer has exactly one profile (will be set): ${toSet.length}`);
  console.log(`  customer has several profiles (left for manual choice): ${multiple.length}`);
  console.log(`  customer has no profile (left as is): ${none.length}`);

  if (multiple.length > 0) {
    console.log("\nNeed a manual choice (customer has several billing profiles):");
    multiple.forEach((c) => console.log(`  ${c.opportunityId}  ${c.status}  customer=${customerById.get(String(c.customer))?.name}`));
  }

  if (!APPLY) return;

  let updated = 0;
  for (const { conn, billingProfileId } of toSet) {
    // updateOne bumps updatedAt (schema timestamps), so Ledgerly re-syncs these connections.
    const result = await Connection.updateOne({ _id: conn._id, billingProfileId: { $in: [null] } }, { $set: { billingProfileId } });
    updated += result.modifiedCount;
  }
  console.log(`\nUpdated ${updated} connection(s).`);
};

run()
  .catch((err) => { console.error("Failed:", err.message); process.exitCode = 1; })
  .finally(disconnect);
