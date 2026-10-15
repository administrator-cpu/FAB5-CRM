const crypto = require("crypto");
const logger = require("../utils/logger");

/**
 * Guards the Ledgerly sync endpoints. Ledgerly sends its own key (LEDGERLY_API_KEY) in the
 * x-api-key header — separate from INTERNAL_CRM_SECRET so each can be rotated independently.
 * Fails closed if the key isn't configured.
 */
const requireLedgerlyKey = (req, res, next) => {
  const expectedKey = process.env.LEDGERLY_API_KEY;
  if (!expectedKey) {
    logger.error("LEDGERLY_API_KEY is not configured — Ledgerly sync requests are refused");
    return res.status(500).json({ success: false, message: "Ledgerly auth misconfigured." });
  }

  const providedKey = req.headers["x-api-key"];
  const expected = Buffer.from(expectedKey);
  const provided = Buffer.from(typeof providedKey === "string" ? providedKey : "");
  if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }

  next();
};

module.exports = { requireLedgerlyKey };
