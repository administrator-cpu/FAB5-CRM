const crypto = require("crypto");

// Escapes user input so it matches literally inside a RegExp / $regex.
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Constant-time comparison for shared secrets (API keys). False when either value is missing.
const safeCompare = (provided, expected) => {
  if (typeof provided !== "string" || typeof expected !== "string" || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

module.exports = { escapeRegex, safeCompare };
