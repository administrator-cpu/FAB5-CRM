const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");
const { getRedis } = require("../config/cache");
const logger = require("../utils/logger")
const { safeCompare } = require("../utils/security");
const redis = getRedis();

let RedisStore;
try {
  const { RedisStore: RS } = require("rate-limit-redis");
  RedisStore = RS;
} catch {
  console.warn("rate-limit-redis not installed — using memory store. Run: npm install rate-limit-redis");
}

const isRedisReady = () => redis && redis.status === "ready";

const buildStore = (prefix = "rl:") => {
  if (RedisStore && isRedisReady()) {
    return new RedisStore({
      sendCommand: (...args) => redis.call(...args),
      prefix,
    });
  }
  logger.warn(`⚠️  Redis not ready — rate limiter [${prefix}] using memory store`);
  return undefined;
};

const skipIfRedisDown = (req) => {
  if (req.method === "OPTIONS") return true;
  if (!isRedisReady()) {
    logger.warn("⚠️  Redis unavailable — skipping rate limit check", {
      path: req.path,
      ip: req.ip,
    });
    return true;
  }
  return false;
};

const keyGenerator = (req) => req.ip;

const strictAuthPaths = [
  "/api/users/register/send-otp",
  "/api/users/register/verify",
  "/api/users/login",
  "/api/users/request-reset",
  "/api/users/verify-reset-otp",
  "/api/users/reset-password",
];

const authLimiter = rateLimit ({
  windowMs: 15 * 60 * 1000,
  limit: process.env.NODE_ENV === "production" ? 20 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  store: buildStore("rl:auth:"),
  skip: (req) => req.method === "OPTIONS",
  message: { success: false, message: "Too many attempts, please try again later." },
})

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator,
  store: buildStore("rl:global:"),
  message: { success: false, message: "Too many requests, please try again later." },
  // Only anonymous traffic is limited here: logged-in users and integrations (valid token or key)
  // are never throttled, so busy offices behind one IP aren't affected.
  skip: (req) => {
    return req.method === "OPTIONS"
      || strictAuthPaths.includes(req.path)
      || req.path === "/health"
      || req.path.startsWith("/files/")
      || hasValidCredentials(req);
  }
})

// True when the request carries a valid login token (header or cookie) or integration key.
const hasValidCredentials = (req) => {
  const authHeader = req.headers.authorization;
  const tokens = [
    authHeader?.startsWith("Bearer") ? authHeader.split(" ")[1] : null,
    req.cookies?.token,
  ].filter((token) => typeof token === "string" && token);
  for (const token of tokens) {
    try {
      jwt.verify(token, process.env.JWT_SECRET);
      return true;
    } catch {
      // try the next one
    }
  }
  const apiKey = req.headers["x-api-key"];
  return safeCompare(apiKey, process.env.INTERNAL_CRM_SECRET)
    || safeCompare(apiKey, process.env.LEDGERLY_API_KEY)
    || safeCompare(req.headers["x-internal-api-key"], process.env.INTERNAL_API_KEY);
};

module.exports = {
  authLimiter,
  globalLimiter
}