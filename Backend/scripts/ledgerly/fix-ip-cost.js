// Makes ips.cost the TOTAL IP charge and fills ips.perIpCost on existing connections.
// Older bulk uploads stored the per-IP rate in ips.cost; they are found with the MRC check
// (MRC = bandwidth × rate + IP charges): first on the current values, then — if those are ambiguous —
// on the connection's earliest history snapshot with the same IPs. Ambiguous rows are listed and left unchanged.
// Every other connection with IPs gets ips.perIpCost = total ÷ count.
// Dry run by default:  node scripts/ledgerly/fix-ip-cost.js
// Write changes:       node scripts/ledgerly/fix-ip-cost.js --apply
const { APPLY, connect, disconnect } = require("./db");
const Connection = require("../../src/models/connectionModel");
const { classifyIpCost, buildIps } = require("../../src/utils/ipCost");

const classifyConnection = (conn) => {
  const { count, cost } = conn.ips || {};
  const current = classifyIpCost({
    count, cost, bandwidth: conn.bandwidth, ratePerMb: conn.commercials?.ratePerMb, mrc: conn.commercials?.mrc,
  });
  if (current.basis !== "ambiguous") return { ...current, via: "current values" };

  // Earliest snapshot that recorded the same IPs and the commercials of that time.
  const snapshot = (conn.history || []).find((h) =>
    h.ips && Number(h.ips.count) === Number(count) && Number(h.ips.cost) === Number(cost) && h.commercials?.mrc);
  if (!snapshot) return { ...current, via: "no usable snapshot" };

  const original = classifyIpCost({
    count, cost, bandwidth: snapshot.bandwidth, ratePerMb: snapshot.commercials.ratePerMb, mrc: snapshot.commercials.mrc,
  });
  return { ...original, via: `${snapshot.action} snapshot` };
};

const run = async () => {
  await connect();
  console.log(APPLY ? "Mode: APPLY (writing changes)\n" : "Mode: DRY RUN (no changes; add --apply to write)\n");

  const candidates = await Connection.find({ "ips.count": { $gt: 0 } })
    .select("opportunityId status bandwidth commercials ips history.action history.bandwidth history.commercials history.ips")
    .lean();

  const perIp = [];
  const ambiguous = [];
  const alreadyTotal = [];
  for (const conn of candidates) {
    const result = classifyConnection(conn);
    if (result.basis === "per-ip") perIp.push({ conn, ...result });
    else if (result.basis === "ambiguous") ambiguous.push({ conn, ...result });
    else alreadyTotal.push(conn);
  }
  // Rows whose cost is already the total but that have no per-IP rate stored yet.
  const needPerIp = alreadyTotal.filter((conn) => !conn.ips.perIpCost && Number(conn.ips.cost) > 0);

  console.log(`Connections with IPs: ${candidates.length}`);
  console.log(`  already the total: ${alreadyTotal.length} (per-IP rate to fill in: ${needPerIp.length})`);
  console.log(`  per-IP rate (will be converted to total): ${perIp.length}`);
  console.log(`  ambiguous (left unchanged, check manually): ${ambiguous.length}`);

  if (perIp.length > 0) {
    console.log("\nWill convert (opportunity, IP count, stored cost → total, decided from):");
    perIp.forEach(({ conn, totalCost, via }) =>
      console.log(`  ${conn.opportunityId}  ${conn.ips.count} × ${conn.ips.cost} → ${totalCost}  (${via})`));
  }
  if (ambiguous.length > 0) {
    console.log("\nAmbiguous (opportunity, bandwidth, rate, MRC, IP count, stored cost):");
    ambiguous.forEach(({ conn }) =>
      console.log(`  ${conn.opportunityId}  ${conn.bandwidth} Mbps  rate ${conn.commercials?.ratePerMb}  MRC ${conn.commercials?.mrc}  IPs ${conn.ips.count}  cost ${conn.ips.cost}`));
  }

  if (!APPLY) return;

  let converted = 0;
  for (const { conn, totalCost } of perIp) {
    const { count, cost } = conn.ips;
    // Fix the record and every history snapshot that carries the same per-IP value.
    const result = await Connection.updateOne(
      { _id: conn._id, "ips.count": count, "ips.cost": cost },
      { $set: {
        "ips.cost": totalCost, "ips.perIpCost": cost,
        "history.$[snap].ips.cost": totalCost, "history.$[snap].ips.perIpCost": cost,
      } },
      { arrayFilters: [{ "snap.ips.count": count, "snap.ips.cost": cost }] },
    );
    converted += result.modifiedCount;
  }

  let filled = 0;
  for (const conn of needPerIp) {
    const { perIpCost } = buildIps({ count: conn.ips.count, totalCost: conn.ips.cost });
    const result = await Connection.updateOne({ _id: conn._id, "ips.cost": conn.ips.cost }, { $set: { "ips.perIpCost": perIpCost } });
    filled += result.modifiedCount;
  }
  console.log(`\nConverted ${converted} connection(s) to totals; filled the per-IP rate on ${filled}.`);
};

run()
  .catch((err) => { console.error("Failed:", err.message); process.exitCode = 1; })
  .finally(disconnect);
