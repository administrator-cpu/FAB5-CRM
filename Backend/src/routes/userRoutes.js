const express = require("express");
const { sendRegistrationOtp, verifyOtpAndRegister, loginUser, requestReset, verifyResetOtp, resetPassword, getUserProfile, updateUserProfile, logoutUser, getAllUser} = require("../controllers/userController");
const { protect, domainCheck } = require("../middlewares/authMiddleware");
const { authLimiter } = require("../middlewares/rateLimiter");
const router = express.Router();

/* 
════════════════════════════════════════════════════════════════════════════════
REGISTRATION — 2 steps
════════════════════════════════════════════════════════════════════════════════ 
*/
router.post("/register/send-otp", authLimiter, domainCheck, sendRegistrationOtp);
router.post("/register/verify", authLimiter, domainCheck, verifyOtpAndRegister);
router.post("/login", authLimiter, loginUser);
router.post("/logout", protect, logoutUser);

/* 
════════════════════════════════════════════════════════════════════════════════
PASSWORD RESET — 3 steps
════════════════════════════════════════════════════════════════════════════════
*/
router.post("/request-reset", authLimiter, requestReset);
router.post("/verify-reset-otp", authLimiter, verifyResetOtp);
router.patch("/reset-password", authLimiter, resetPassword);

// ════════════════════════════════════════════════════════════════════════════════
// PROTECTED ROUTES — require valid accessToken
// ════════════════════════════════════════════════════════════════════════════════
router.get("/me", protect, getUserProfile);
router.put("/me", protect, updateUserProfile);
router.get("/all", protect, getAllUser);


module.exports = router;