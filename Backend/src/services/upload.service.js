const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");
const {
  STORAGE_DRIVERS, STORAGE_DRIVER, FILE_BASE_URL, FILES_ROUTE, resolveLocalPath,
} = require("../config/storage");

// Only these types can be written to local disk (mirrors uploadMiddleware's allow-list).
const MIME_EXTENSIONS = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const isEmptyFile = (file) =>
  !file || !file.buffer || file.size === 0 || file.buffer.length === 0;

const uploadToCloudinary = (file, folder = "crm") => {
  return new Promise((resolve, reject) => {
    if (isEmptyFile(file)) {
      return reject(new Error("Empty file. Please cehck the file and try again"));
    }
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: "auto",
        use_filename: true,
        unique_filename: true,
        access_mode: "public"
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(file.buffer).pipe(stream);
  });
};

const uploadToLocal = async (file, folder = "crm", ext) => {
  if (isEmptyFile(file)) {
    throw new Error("Empty file. Please cehck the file and try again");
  }

  const extension = ext || MIME_EXTENSIONS[file.mimetype];
  if (!extension) {
    throw new Error(`Unsupported file type: ${file.mimetype || "unknown"}`);
  }

  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const key = path.posix.join(folder, yyyy, mm, `${crypto.randomUUID()}${extension}`);

  const absPath = resolveLocalPath(key);
  if (!absPath) throw new Error("Invalid upload folder");

  await fs.mkdir(path.dirname(absPath), { recursive: true });

  // Write to a temp file then rename, so a crash never leaves a half-written document.
  const tmpPath = `${absPath}.tmp-${crypto.randomUUID()}`;
  try {
    await fs.writeFile(tmpPath, file.buffer);
    await fs.rename(tmpPath, absPath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true });
    throw err;
  }

  return { url: `${FILE_BASE_URL}${FILES_ROUTE}/${key}`, publicId: key };
};

/**
 * Stores a document using the active STORAGE_DRIVER.
 * @param {object} file - multer file ({ buffer, mimetype, originalname, size }) or { buffer }
 * @param {string} folder - logical folder, e.g. "crm/connections/cafs"
 * @param {object} [options]
 * @param {string} [options.ext] - extension to use when the buffer has no mimetype (e.g. ".pdf")
 * @returns {Promise<{url: string, publicId: string, storage: string}>}
 */
const uploadDocument = async (file, folder = "crm", { ext } = {}) => {
  if (STORAGE_DRIVER === STORAGE_DRIVERS.LOCAL) {
    const { url, publicId } = await uploadToLocal(file, folder, ext);
    return { url, publicId, storage: STORAGE_DRIVERS.LOCAL };
  }

  const uploaded = await uploadToCloudinary(file, folder);
  return { url: uploaded.secure_url, publicId: uploaded.public_id, storage: STORAGE_DRIVERS.CLOUDINARY };
};

const deleteFromCloudinary = async (publicId) => {
  if (!publicId) return;
  return cloudinary.uploader.destroy(publicId);
};

module.exports = {
  uploadDocument,
  uploadToCloudinary,
  deleteFromCloudinary,
};
