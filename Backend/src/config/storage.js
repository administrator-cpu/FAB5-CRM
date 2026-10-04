const path = require("path");
const logger = require("../utils/logger");

// STORAGE_DRIVER decides where NEW uploads go. Existing documents keep working
// regardless of this value — each document records its own `storage`.
const STORAGE_DRIVERS = { CLOUDINARY: "cloudinary", LOCAL: "local" };

// In development (localhost) uploads always go to Backend/storage, served by this server.
const IS_DEV = process.env.NODE_ENV === "development";
const DEV_UPLOAD_DIR = path.resolve(__dirname, "../../storage");
const DEV_FILE_BASE_URL = `http://localhost:${process.env.PORT || 4002}`;

const STORAGE_DRIVER = IS_DEV
  ? STORAGE_DRIVERS.LOCAL
  : (process.env.STORAGE_DRIVER || STORAGE_DRIVERS.CLOUDINARY).toLowerCase();
const UPLOAD_DIR = IS_DEV
  ? DEV_UPLOAD_DIR
  : (process.env.UPLOAD_DIR ? path.resolve(process.env.UPLOAD_DIR) : null);
const FILE_BASE_URL = (process.env.FILE_BASE_URL || (IS_DEV ? DEV_FILE_BASE_URL : "")).replace(/\/+$/, "");
const FILES_ROUTE = "/files";

if (!Object.values(STORAGE_DRIVERS).includes(STORAGE_DRIVER)) {
  throw new Error(`Invalid STORAGE_DRIVER "${STORAGE_DRIVER}" — use "local" or "cloudinary"`);
}

if (STORAGE_DRIVER === STORAGE_DRIVERS.LOCAL && !IS_DEV) {
  if (!process.env.UPLOAD_DIR || !path.isAbsolute(process.env.UPLOAD_DIR)) {
    throw new Error("UPLOAD_DIR must be set to an absolute path when STORAGE_DRIVER=local");
  }
  if (!FILE_BASE_URL) {
    throw new Error("FILE_BASE_URL is required when STORAGE_DRIVER=local");
  }
}

logger.info("Storage configured", { driver: STORAGE_DRIVER, uploadDir: UPLOAD_DIR, fileBaseUrl: FILE_BASE_URL });

// Resolves a stored local key (publicId) to an absolute path, refusing anything
// that would escape UPLOAD_DIR.
const resolveLocalPath = (key) => {
  if (!UPLOAD_DIR || !key) return null;
  const absPath = path.resolve(UPLOAD_DIR, key);
  if (!absPath.startsWith(UPLOAD_DIR + path.sep)) return null;
  return absPath;
};

module.exports = {
  STORAGE_DRIVERS,
  STORAGE_DRIVER,
  UPLOAD_DIR,
  FILE_BASE_URL,
  FILES_ROUTE,
  resolveLocalPath,
};