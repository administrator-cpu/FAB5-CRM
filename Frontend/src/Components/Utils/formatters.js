export const currencyFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0
});

export const formatCurrency = (val) => currencyFormatter.format(val || 0);

// Compact "₹ Cr" formatter used across the Reports dashboard KPI cards
export const formatCr = (val) => `₹${((val || 0) / 1e7).toFixed(2)} Cr`;

// Compact bandwidth formatter (Mbps -> Gbps once it's large enough)
export const formatBandwidth = (mbps) => {
  const v = Number(mbps) || 0;
  if (v >= 1000) return `${(v / 1000).toFixed(2)} Gbps`;
  return `${v.toLocaleString('en-IN')} Mbps`;
};