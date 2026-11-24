// Turns Node's generic "fetch failed" into the actual reason (the code hides in error.cause).

const REASONS = {
  ENOTFOUND: "host name not found (wrong URL or DNS problem)",
  EAI_AGAIN: "DNS lookup failed (temporary DNS problem)",
  ECONNREFUSED: "connection refused (service down or wrong port)",
  ECONNRESET: "connection was reset by the other side",
  ETIMEDOUT: "connection timed out",
  EHOSTUNREACH: "host unreachable (network or firewall problem)",
  ENETUNREACH: "network unreachable from this server",
  UND_ERR_CONNECT_TIMEOUT: "connection timed out",
  UND_ERR_HEADERS_TIMEOUT: "no response (timed out waiting for the reply)",
  UND_ERR_SOCKET: "connection dropped while talking to the server",
  CERT_HAS_EXPIRED: "the server's SSL certificate has expired",
  DEPTH_ZERO_SELF_SIGNED_CERT: "the server uses a self-signed SSL certificate",
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: "the server's SSL certificate can't be verified",
  ERR_TLS_CERT_ALTNAME_INVALID: "the server's SSL certificate is for a different domain (wrong URL, or the domain moved)",
};

/**
 * @param {Error} error - what fetch threw
 * @param {string} url - the URL that was being fetched
 * @returns {{host: string, code: string, reason: string}}
 */
const describeFetchError = (error, url) => {
  let host = "";
  try { host = new URL(url).host; } catch { host = String(url || ""); }
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return { host, code: "TIMEOUT", reason: "no response in time (request timed out)" };
  }
  const cause = error?.cause;
  const code = cause?.code || cause?.cause?.code || error?.code || "";
  const reason = REASONS[code] || cause?.message || error?.message || "unknown network error";
  return { host, code, reason };
};

module.exports = { describeFetchError };
