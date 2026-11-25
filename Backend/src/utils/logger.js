const { createLogger, format, transports } = require("winston");
const path = require("path");
const { currentRequest } = require("./requestContext");
const { combine, timestamp, printf, colorize, errors, json } = format;

const isProduction = process.env.NODE_ENV === "production";

// Adds the route, IP, user and request id of the request being handled (see requestContext),
// unless the log call already gave them.
const addRequestContext = format((info) => {
  const req = currentRequest();
  // http lines (one per request, from morgan) already name the route in their message.
  if (!req || info.request) return info;
  info.method ??= req.method;
  info.path ??= req.originalUrl;
  info.ip ??= req.ip;
  if (req.user?.email) info.user ??= req.user.email;
  info.requestId ??= req.requestId;
  return info;
});

// Console (what `pm2 logs` shows): one readable entry per event, e.g.
// 24/11/2026, 12:47:22 pm  ERROR  Could not reach DIVSign | POST /api/connection/66f1…/esign | ip 49.36.12.7 | user priya@fab5network.com | req 602e4d5c
//     docType=CAF_PO  host=api.divsign.in  code=ENOTFOUND  reason="host name not found (wrong URL or DNS problem)"
// 24/11/2026, 12:47:22 pm  ERROR  ✗ FAILED  POST /api/connection/66f1…/esign -> 502 in 142 ms | ip 49.36.12.7 | user priya@fab5network.com | req 602e4d5c
const CONTEXT_KEYS = ["method", "path", "ip", "user", "userId", "requestId", "timestamp", "level", "message", "stack", "request"];
const formatValue = (value) => {
  if (value === null || value === undefined) return String(value);
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  return /\s/.test(text) ? `"${text}"` : text;
};
const readableLine = printf((info) => {
  const time = new Date(info.timestamp || Date.now()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const where = [
    info.method && info.path ? `${info.method} ${info.path}` : info.path,
    info.ip && `ip ${info.ip}`,
    (info.user || info.userId) && `user ${info.user || info.userId}`,
    info.requestId && `req ${String(info.requestId).slice(0, 8)}`,
  ].filter(Boolean);
  const details = Object.keys(info)
    .filter((key) => !CONTEXT_KEYS.includes(key))
    .map((key) => `${key}=${formatValue(info[key])}`);
  let line = `${time}  ${info.level}  ${info.message}`;
  if (where.length) line += ` | ${where.join(" | ")}`;
  if (details.length) line += `\n    ${details.join("  ")}`;
  if (info.stack && info[Symbol.for("level")] === "error") line += `\n    ${info.stack}`;
  return line;
});

// Level in capitals (ERROR, WARN, …) before colouring, so the colour codes stay intact.
const upperLevel = format((info) => {
  info.level = info.level.toUpperCase();
  return info;
});
const consoleFormat = isProduction
  ? combine(upperLevel(), readableLine)
  : combine(upperLevel(), colorize({ level: true }), readableLine);

const logger = createLogger({
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    http: 3,
    debug: 4
  },
  level: isProduction ? "http" : "debug",
  format: combine(timestamp(), errors({ stack: true }), addRequestContext()),
  transports: [
    new transports.Console({ format: consoleFormat }),
    // Files stay JSON (one object per line) for tools that parse them.
    new transports.File({
      filename: path.join("logs", "error.log"),
      level: "error",
      format: json(),
      maxsize: 5 * 1024 * 1024, // 5MB,
      maxFiles: 5,
    }),
    new transports.File({
      filename: path.join("logs", "combined.log"),
      format: json(),
      maxsize: 10 * 1024 * 1024, // 10MB,
      maxFiles: 5,
    })
  ],
  exitOnError: false,
});

module.exports = logger;
