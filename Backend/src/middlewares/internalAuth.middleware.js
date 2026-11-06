/**
 * Guards internal service-to-service routes (e.g. the BI Server pulling
 * the nightly CRM snapshot). Not for browser/user-facing auth — this is
 * a shared-secret check between trusted backend services.
 *
 * Set INTERNAL_API_KEY in the CRM app's environment, and configure the
 * BI Server's cron job to send the same value in the x-internal-api-key
 * header on its GET request.
 *
 * Swap-out note: if you move to mTLS or an IP allowlist later, this
 * middleware is the only file that needs to change — the route/
 * controller below don't need to know how auth is implemented.
 */
const { safeCompare } = require("../utils/security");

const requireInternalApiKey = (req, res, next) => {
  const providedKey = req.headers["x-internal-api-key"];
  const expectedKey = process.env.INTERNAL_API_KEY;

  if (!expectedKey) {
    // Fail closed: if the env var isn't set, refuse everything rather
    // than silently allowing unauthenticated access.
    console.error("[INTERNAL-AUTH] INTERNAL_API_KEY is not configured on this server.");
    return res.status(500).json({ success: false, message: "Internal auth misconfigured." });
  }

  if (!safeCompare(providedKey, expectedKey)) {
    return res.status(401).json({ success: false, message: "Unauthorized internal request." });
  }

  next();
};

module.exports = { requireInternalApiKey };
