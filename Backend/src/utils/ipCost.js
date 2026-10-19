// IPs on a connection: ips.count = number of IPs, ips.cost = TOTAL charge for all IPs,
// ips.perIpCost = charge per IP.

const round2 = (value) => Math.round(value * 100) / 100;

// Builds the ips object from a count and a total, with the per-IP rate given or derived (total ÷ count).
const buildIps = ({ count, totalCost, perIpCost }) => {
  const ipCount = Number(count) || 0;
  const total = Number(totalCost) || 0;
  const perIp = perIpCost !== undefined && perIpCost !== null && perIpCost !== ""
    ? Number(perIpCost) || 0
    : (ipCount > 0 ? round2(total / ipCount) : 0);
  return { count: ipCount, cost: total, perIpCost: perIp };
};

// MRC = bandwidth × rate per Mb + total IP charges.
const expectedMrc = (bandwidth, ratePerMb, ipTotalCost) =>
  round2((Number(bandwidth) || 0) * (Number(ratePerMb) || 0) + (Number(ipTotalCost) || 0));

// Older bulk uploads stored the per-IP rate in ips.cost instead of the total.
// The MRC tells them apart, because MRC = bandwidth × rate per Mb + total IP charges.
const classifyIpCost = ({ count, cost, bandwidth, ratePerMb, mrc }) => {
  const ipCount = Number(count) || 0;
  const ipCost = Number(cost) || 0;
  const asTotal = buildIps({ count: ipCount, totalCost: ipCost });

  // One IP or no cost: per-IP rate and total are the same number.
  if (ipCount <= 1 || ipCost === 0) return { basis: "total", totalCost: ipCost, perIpCost: asTotal.perIpCost };

  const base = (Number(bandwidth) || 0) * (Number(ratePerMb) || 0);
  const target = Math.round(Number(mrc) || 0);
  const matchesTotal = Math.round(base + ipCost) === target;
  const matchesPerIp = Math.round(base + ipCount * ipCost) === target;

  if (matchesPerIp && !matchesTotal) return { basis: "per-ip", totalCost: ipCount * ipCost, perIpCost: ipCost };
  if (matchesTotal && !matchesPerIp) return { basis: "total", totalCost: ipCost, perIpCost: asTotal.perIpCost };
  return { basis: "ambiguous", totalCost: ipCost, perIpCost: asTotal.perIpCost };
};

module.exports = { buildIps, classifyIpCost, expectedMrc };
