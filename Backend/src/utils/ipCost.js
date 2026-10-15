// ips.cost must be the TOTAL charge for all IPs. Older bulk uploads stored the per-IP rate instead.
// The MRC tells them apart, because MRC = bandwidth × rate per Mb + total IP charges.
const classifyIpCost = ({ count, cost, bandwidth, ratePerMb, mrc }) => {
  const ipCount = Number(count) || 0;
  const ipCost = Number(cost) || 0;

  // One IP or no cost: per-IP rate and total are the same number.
  if (ipCount <= 1 || ipCost === 0) return { basis: "total", totalCost: ipCost };

  const base = (Number(bandwidth) || 0) * (Number(ratePerMb) || 0);
  const target = Math.round(Number(mrc) || 0);
  const matchesTotal = Math.round(base + ipCost) === target;
  const matchesPerIp = Math.round(base + ipCount * ipCost) === target;

  if (matchesPerIp && !matchesTotal) return { basis: "per-ip", totalCost: ipCount * ipCost };
  if (matchesTotal && !matchesPerIp) return { basis: "total", totalCost: ipCost };
  return { basis: "ambiguous", totalCost: ipCost };
};

module.exports = { classifyIpCost };
