const express = require("express");
const multer = require("multer");
const AppError = require("../utils/AppError");
const { verifyEhastakshar, ehastaksharCallback } = require("../controllers/esignWebhook.controller");

const router = express.Router();

// Signed PDF from e-Hastakshar (multipart field "file"); checked for a real PDF in the controller.
const signedPdf = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname !== "file") return cb(new AppError(`Unexpected file field "${file.fieldname}"`, 400));
    cb(null, true);
  },
});

// Turns multer's errors (file too large, …) into a 400 the caller can read.
const receiveSignedPdf = (req, res, next) =>
  signedPdf.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) return next(new AppError(`Upload rejected: ${err.message}`, 400));
    next(err);
  });

// Called by e-Hastakshar (server to server), so it uses the shared secret instead of a user login.
router.post("/webhooks/ehastakshar", verifyEhastakshar, receiveSignedPdf, ehastaksharCallback);

module.exports = router;
