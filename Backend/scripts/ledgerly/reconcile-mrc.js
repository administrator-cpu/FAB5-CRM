// Brings MRC in line with the corrected IP figures: MRC = bandwidth × rate per Mb + total IP cost.
//  - commercials.mrc and a pending scheduledRateRevision.mrc are recalculated;
//  - history snapshots taken since the last IP change (same number of IPs as now) get the corrected
//    IP figures and their MRC recalculated with that snapshot's own bandwidth and rate;
//  - snapshots from before the last IP change keep the values that were billed then;
//  - no history entry is added.
// Only connections with IPs are touched; connections without IPs are left as they are.
// Connections with no bandwidth or rate (other than IP-only services) are listed, not changed.
// Every change is written to scripts/ledgerly/logs/ (git-ignored) when applied.
// Dry run by default:  node scripts/ledgerly/reconcile-mrc.js
// Write changes:       node scripts/ledgerly/reconcile-mrc.js --apply
const fs = require("fs");
const path = require("path");
const { buildIps } = require("../../src/utils/ipCost");

const round2 = (value) => Math.round(value * 100) / 100;
const differs = (a, b) => Math.abs((Number(a) || 0) - (Number(b) || 0)) >= 0.01;

const expectedMrc = (bandwidth, ratePerMb, ipTotalCost) =>
  round2((Number(bandwidth) || 0) * (Number(ratePerMb) || 0) + (Number(ipTotalCost) || 0));

// Works out every change one connection needs. Pure: no database access.
const planConnection = (conn) => {
  const ips = buildIps({ count: conn.ips?.count, totalCost: conn.ips?.cost, perIpCost: conn.ips?.perIpCost || undefined });
  const bandwidth = Number(conn.bandwidth) || 0;
  const rate = Number(conn.commercials?.ratePerMb) || 0;
  const isIpOnly = conn.serviceType === "IP";

  if (ips.count <= 0) return { skip: "no IPs", changes: [] };

  if (!isIpOnly && (bandwidth <= 0 || rate <= 0)) {
    return { skip: "no bandwidth or rate per Mb to calculate from", changes: [] };
  }

  const changes = [];
  const set = (field, from, to) => { if (differs(from, to)) changes.push({ field, from: from ?? null, to }); };

  set("commercials.mrc", conn.commercials?.mrc, expectedMrc(bandwidth, rate, ips.cost));

  const pending = conn.scheduledRateRevision;
  if (pending && pending.ratePerMb !== undefined && pending.ratePerMb !== null) {
    set("scheduledRateRevision.mrc", pending.mrc, expectedMrc(bandwidth, pending.ratePerMb, ips.cost));
  }

  // Snapshots since the last IP change hold the current IP setup.
  const history = conn.history || [];
  const lastIpChange = history.map((h) => h.action === "IP_ADDITION").lastIndexOf(true);
  const skippedSnapshots = [];
  for (let i = Math.max(lastIpChange, 0); i < history.length; i++) {
    const snap = history[i];
    if (!snap.ips && !snap.commercials) continue;

    if (snap.ips && Number(snap.ips.count) !== ips.count) {
      skippedSnapshots.push({ index: i, action: snap.action, reason: `IP count ${snap.ips.count} differs from current ${ips.count}` });
      continue;
    }
    if (snap.ips) {
      set(`history.${i}.ips.cost`, snap.ips.cost, ips.cost);
      set(`history.${i}.ips.perIpCost`, snap.ips.perIpCost, ips.perIpCost);
    }

    const snapBandwidth = Number(snap.bandwidth) || 0;
    const snapRate = Number(snap.commercials?.ratePerMb) || 0;
    if (snap.commercials && (isIpOnly || (snapBandwidth > 0 && snapRate > 0))) {
      set(`history.${i}.commercials.mrc`, snap.commercials.mrc, expectedMrc(snapBandwidth, snapRate, ips.cost));
    }
  }

  return { changes, skippedSnapshots };
};

const main = async () => {
  const { APPLY, connect, disconnect } = require("./db");
  const Connection = require("../../src/models/connectionModel");

  try {
    await connect();
    console.log(APPLY ? "Mode: APPLY (writing changes)\n" : "Mode: DRY RUN (no changes; add --apply to write)\n");

    const connections = await Connection.find({ status: { $ne: "Deleted" }, "ips.count": { $gt: 0 } })
      .select("opportunityId status serviceType bandwidth commercials ips scheduledRateRevision history updatedAt")
      .lean();

    const toFix = [];
    const skipped = [];
    for (const conn of connections) {
      const plan = planConnection(conn);
      if (plan.skip) skipped.push({ conn, reason: plan.skip });
      else if (plan.changes.length > 0) toFix.push({ conn, ...plan });
      plan.skippedSnapshots?.forEach((s) => skipped.push({ conn, reason: `history #${s.index} (${s.action}): ${s.reason}` }));
    }

    console.log(`Connections with IPs checked: ${connections.length}`);
    console.log(`  need changes: ${toFix.length}`);
    console.log(`  skipped / need a manual look: ${skipped.length}`);

    toFix.forEach(({ conn, changes }) => {
      console.log(`\n${conn.opportunityId} (${conn.status})`);
      changes.forEach((c) => console.log(`  ${c.field}: ${c.from} → ${c.to}`));
    });
    if (skipped.length > 0) {
      console.log("\nSkipped:");
      skipped.forEach(({ conn, reason }) => console.log(`  ${conn.opportunityId}: ${reason}`));
    }

    if (!APPLY || toFix.length === 0) return;

    const logDir = path.join(__dirname, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `reconcile-mrc-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`);

    let updated = 0;
    let changedSince = 0;
    for (const { conn, changes } of toFix) {
      const $set = Object.fromEntries(changes.map((c) => [c.field, c.to]));
      // Only if the connection hasn't changed since it was read (history positions must still match).
      const result = await Connection.updateOne({ _id: conn._id, updatedAt: conn.updatedAt }, { $set });
      if (result.modifiedCount === 1) {
        updated += 1;
        fs.appendFileSync(logFile, JSON.stringify({
          at: new Date().toISOString(), crmConnectionId: String(conn._id), opportunityId: conn.opportunityId, changes,
        }) + "\n");
      } else {
        changedSince += 1;
        console.log(`  ${conn.opportunityId}: changed since it was read — skipped, run again`);
      }
    }
    console.log(`\nUpdated ${updated} connection(s); ${changedSince} changed while running.`);
    console.log(`Change log: ${logFile}`);
  } finally {
    await disconnect();
  }
};

if (require.main === module) {
  main().catch((err) => { console.error("Failed:", err.message); process.exitCode = 1; });
}

module.exports = { planConnection, expectedMrc };
