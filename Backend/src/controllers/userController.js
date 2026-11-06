const crypto = require("crypto");
const User = require("../models/userModel");
const jwt = require("jsonwebtoken");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const logger = require("../utils/logger");
const { getRedis } = require("../config/cache");
const { sendOTPEmail } = require("../services/sendEmail");
const { getAllUserData } = require("../utils/userService");
const { safeCompare } = require("../utils/security");
// const { generateAccessToken, generateRefreshToken, hashToken } = require("../services/tokenService");
const { cookieOptions } = require("../middlewares/authMiddleware");

// Signs the 7-day login token and sets it as a cookie. `tv` ties the token to the user's
// tokenVersion, so bumping tokenVersion (password reset / change) ends every older session.
const issueToken = (res, user) => {
  const token = jwt.sign(
    {
      id: user._id,
      email: user.email,
      role: user.role,
      tv: user.tokenVersion || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
  res.cookie("token", token, cookieOptions);
  return token;
};

// ───────────────── Helper ───────────────── 
const setRefreshTokenCookie = (res, token) => {
  res.cookie("refreshToken", token, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
const clearAuthCookies = (res) => {
  res.clearCookie("token", cookieOptions);
};

const safeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  phone: user.phone,
  dob: user.dob,
  isProfileComplete: user.isProfileComplete,
  isActive: user.isActive,
  createdAt: user.createdAt,
});

const redis = getRedis();
// ─────────────────── OTP Helpers ────────────────────
const OTP_EXPIRY_SECONDS = 600;
const OTP_MAX_ATTEMPTS = 5; // wrong entries before the code is discarded and a new one is needed
const OTP_SENDS_PER_HOUR = 5; // codes one address can be sent per hour

const hashOtp = (otp) => crypto.createHash("sha256").update(String(otp)).digest("hex");

const generateAndStoreOtp = async (key) => {
  const otp = crypto.randomInt(100000, 1000000).toString();
  await Promise.all([
    redis.set(`otp:${key}`, hashOtp(otp), "EX", OTP_EXPIRY_SECONDS),
    redis.del(`otp_attempts:${key}`),
  ]);
  return otp;
};
const verifyStoredOtp = async (key, otp) => {
  const stored = await redis.get(`otp:${key}`);
  if (!stored) return false;
  if (safeCompare(hashOtp(otp), stored)) {
    await redis.del(`otp_attempts:${key}`);
    return true;
  }
  const attempts = await redis.incr(`otp_attempts:${key}`);
  if (attempts === 1) await redis.expire(`otp_attempts:${key}`, OTP_EXPIRY_SECONDS);
  if (attempts >= OTP_MAX_ATTEMPTS) await redis.del(`otp:${key}`, `otp_attempts:${key}`);
  return false;
};
// Counts codes sent to one address in the last hour; false once the cap is reached.
const allowOtpSend = async (key) => {
  const sends = await redis.incr(`otp_sends:${key}`);
  if (sends === 1) await redis.expire(`otp_sends:${key}`, 60 * 60);
  return sends <= OTP_SENDS_PER_HOUR;
};
const tooManyOtpSends = () => new AppError("Too many codes requested for this email. Please try again in an hour.", 429);

/* 
════════════════════════════════════════════════════════════════════════════════
REGISTRATION — 2 steps
POST /api/users/register/send-otp   → validate domain + send OTP
POST /api/users/register/verify     → verify OTP + create account + issue tokens
════════════════════════════════════════════════════════════════════════════════ 
*/
// Step 1 : Send OTP to email for registration
const sendRegistrationOtp = asyncHandler(async (req, res, next) => {
  const email = req.body.email?.toLowerCase();
  const { password } = req.body;
  if (!email || !password) {
    return next(new AppError("Email and password are required", 400));
  }
  if (password.length < 8) {
    return next(new AppError("Password must be at least 8 characters", 400));
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError("An account already exists with this email", 409));
  }
  if (!(await allowOtpSend(email))) return next(tooManyOtpSends());

  const otp = await generateAndStoreOtp(email);
  try {
    await sendOTPEmail(email, otp)
  } catch (error) {
    await redis.del(`otp:${email}`);
    return next(new AppError("Failed to send OTP. Please try again.", 500));
  }
  logger.info("Registration OTP sent", { email });
  res.status(200).json({
    success: true,
    message: "OTP sent to email",
  });
});

// Step 2 : Verify OTP and complete registration 
const verifyOtpAndRegister = asyncHandler(async (req, res, next) => {

  const email = req.body.email?.toLowerCase();
  const { password, otp } = req.body;
  if (!email || !password || !otp) {
    return next(new AppError("Email, password and OTP are required", 400));
  }

  const isValidOtp = await verifyStoredOtp(email, otp);
  if (!isValidOtp) {
    return next(new AppError("Invalid or expired OTP", 400));
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return next(new AppError("An account with this email already exists", 409));
  }
  let user; 
  try {
    user = await User.create({
      email,
      password,
      ...(req.body.name && { name: req.body.name }),
    });
    await redis.del(`otp:${email}`);
  } catch (error) {
    await redis.del(`otp:${email}`);
    logger.error("Failed to create user", { email, error: error.message });
    return next(new AppError("Registration failed. Please try again.", 500));
  }

  // const accessToken = generateAccessToken(user);
  // const refreshToken = generateRefreshToken();

  // user.refreshToken = refreshToken;
  // user.refreshTokenExpire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const generateToken = issueToken(res, user);

  logger.info("User registered", { email, role: user.role });

  res.status(201).json({
    success: true,
    message: "Registration successful, Please Complete Your Profile",
    token: generateToken,
    user: safeUser(user),
    redirect: "/profile"
  })
});

/*
════════════════════════════════════════════════════════════════════════════════
LOGIN
POST /api/users/login
════════════════════════════════════════════════════════════════════════════════
*/
const loginUser = asyncHandler(async (req, res, next) => {

  const email = req.body.email?.toLowerCase();
  const { password } = req.body;
  if (!email || !password) {
    return next(new AppError("Email and password are required", 400));
  }

  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.matchPassword(password))) {
    return next(new AppError("Invalid email or password", 401));
  }

  if (!user.isActive) {
    return next(new AppError("Your account has been deactivated. Contact your administrator.", 401));
  }

  const generateToken = issueToken(res, user);

  logger.info("User logged in", { email, role: user.role });

  res.status(200).json({
    success: true,
    token: generateToken,
    user: safeUser(user),
    redirect: user.isProfileComplete ? "/dashboard" : "/profile"
  });
});

/*
════════════════════════════════════════════════════════════════════════════════
REFRESH TOKEN
POST /api/users/refresh
Called by frontend automatically when accessToken expires (401 received)
════════════════════════════════════════════════════════════════════════════════
*/
// const refreshAccessToken = asyncHandler(async (req, res, next) => {
//   const token = req.cookies?.refreshToken;
//   if (!token) {
//     return next(new AppError("Refresh token not found, Please log in or register", 401));
//   }

//   const hashedToken = hashToken(token);

//   const user = await User.findOne({
//     refreshToken: hashedToken,
//     refreshTokenExpire: { $gt: Date.now() }
//   });
//   if (!user) {
//     clearAuthCookies(res);
//     return next(new AppError("Invalid or expired refresh token, Please log in", 401));
//   }

//   if (!user.isActive) {
//     clearAuthCookies(res);
//     return next(new AppError("Your account has been deactivated.", 401));
//   }

//   const newAccessToken = generateAccessToken(user);
//   const newRefreshToken = generateRefreshToken();

//   user.refreshToken = hashToken(newRefreshToken);
//   user.refreshTokenExpire = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
//   await user.save({ validateModifiedOnly: true });

//   setRefreshTokenCookie(res, newRefreshToken);

//   logger.info("Access token refreshed", { userId: user._id });

//   res.status(200).json({
//     success: true,
//     accessToken: newAccessToken,
//   });
// });

/* 
════════════════════════════════════════════════════════════════════════════════
PASSWORD RESET — 3 steps
POST /api/users/request-reset     → send OTP
POST /api/users/verify-reset-otp  → verify OTP, issue reset token
PATCH /api/users/reset-password   → use reset token to set new password
════════════════════════════════════════════════════════════════════════════════
*/
// Step 1 : Send OTP to email
const requestReset = asyncHandler(async (req, res, next) => {

  const email = req.body.email?.toLowerCase();

  if (!email) {
    return next(new AppError("Email is required", 400));
  }
  // Checked before the lookup, so the limit applies the same way to unknown addresses.
  if (!(await allowOtpSend(`reset:${email}`))) return next(tooManyOtpSends());

  const user = await User.findOne({ email });
  if (!user) {
    return res.status(200).json({
      success: true,
      message: "If this email exists, an OTP has been sent",
    });
  }

  const otp = await generateAndStoreOtp(`reset:${email}`);
  try {
    await sendOTPEmail(email, otp)
  } catch (error) {
    await redis.del(`otp:reset:${email}`);
    logger.error("Failed to send reset OTP", { email, error: error.message });
    return next(new AppError("Failed to send OTP. Please try again.", 500));
  }
  logger.info("Reset OTP sent", { email });

  res.status(200).json({
    success: true,
    message: "If this email exists , an OTP has been sent"
  });
});

// Step 2 : Verify OTP
const verifyResetOtp = asyncHandler(async (req, res, next) => {

  const email = req.body.email?.toLowerCase();
  const { otp } = req.body;
  if (!email || !otp) return next(new AppError("Email and OTP are required", 400));

  const isValid = await verifyStoredOtp(`reset:${email}`, otp);
  if (!isValid) return next(new AppError("Invalid or expired OTP", 400));

  const resetToken = crypto.randomBytes(32).toString("hex");
  const hashedResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  await User.updateOne(
    { email },
    {
      resetPasswordToken: hashedResetToken,
      resetPasswordExpire: Date.now() + 10 * 60 * 1000, // 10 minutes
    }
  );
  await redis.del(`otp:reset:${email}`);

  logger.info("Reset OTP verified", { email });

  res.status(200).json({
    success: true,
    message: "OTP verified. Use the reset token to set your new password",
    resetToken
  });
});

// Step 3 : Reset password
const resetPassword = asyncHandler(async (req, res, next) => {
  const { resetToken, password } = req.body;

  if (!resetToken || !password) {
    return next(new AppError("Reset token and password are required", 400));
  }
  if (password.length < 8) {
    return next(new AppError("Password must be at least 8 characters", 400));
  }
  const hashedResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  const user = await User.findOne({
    resetPasswordToken: hashedResetToken,
    resetPasswordExpire: { $gt: Date.now() },
  }).select("+password");
  if (!user) return next(new AppError("Invalid or expired reset token", 400));

  user.password = password;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;

  user.refreshToken = undefined;
  user.refreshTokenExpire = undefined;

  // Ends every session that was logged in with the old password.
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();

  clearAuthCookies(res);

  logger.info("Password reset successfully", { email: user.email });

  res.status(200).json({
    success: true,
    message: "Password reset successful"
  });
});

/* 
════════════════════════════════════════════════════════════════════════════════
PROFILE
GET /api/users/me
════════════════════════════════════════════════════════════════════════════════ 
*/
const getUserProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user._id).select("+adharNumber +panNumber");
  if (!user) return next(new AppError("User not found", 404));

  res.status(200).json({
    success: true,
    user: {
      ...safeUser(user),
      adharNumber: user.adharNumber,
      panNumber: user.panNumber,
    },
    customers: user.customers,
  });
});

// GET /api/users/all
const getAllUser = asyncHandler(async (req, res, next) => {

  const data = await getAllUserData(req.user);

  res.status(200).json({
    success: true,
    ...data,
  });
});

// PUT /api/users/me
// Update user profile
const updateUserProfile = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.user.id).select("+password");
  if (!user) return next(new AppError("User not found", 404));

  const { name, dob, phone, adharNumber, panNumber } = req.body;

  if (!name || !dob || !phone || !adharNumber || !panNumber) {
    return next(new AppError("All fields are required", 400));
  }

  user.name = name || user.name;
  user.dob = dob || user.dob;
  user.phone = phone || user.phone;
  user.adharNumber = adharNumber || user.adharNumber;
  user.panNumber = panNumber || user.panNumber;
  user.isProfileComplete = true;

  const changingPassword = Boolean(req.body.password);
  if (changingPassword) {
    if (req.body.password.length < 8) {
      return next(new AppError("Password must be at least 8 characters", 400));
    }
    // A logged-in session alone isn't enough to change the password.
    if (!req.body.currentPassword || !(await user.matchPassword(String(req.body.currentPassword)))) {
      return next(new AppError("Current password is incorrect", 400));
    }
    user.password = req.body.password;
    user.tokenVersion = (user.tokenVersion || 0) + 1;
  }

  await user.save({ validateModifiedOnly: true });

  // Older sessions end with the password change; this one continues with a fresh token.
  const token = changingPassword ? issueToken(res, user) : undefined;

  logger.info("User profile updated", { email: user.email });

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    user: safeUser(user),
    ...(token && { token }),
    redirect: "/dashboard"
  });
});

/* 
════════════════════════════════════════════════════════════════════════════════
LOGOUT
POST /api/users/logout
════════════════════════════════════════════════════════════════════════════════
*/
const logoutUser = asyncHandler(async (req, res, next) => {
  clearAuthCookies(res);

  logger.info("User logged out", { userId: req.user?._id });

  res.status(200).json({
    success: true,
    message: "User logged out successfully",
  });
});

module.exports = {
  sendRegistrationOtp,
  verifyOtpAndRegister,
  loginUser,
  // refreshAccessToken,
  requestReset,
  verifyResetOtp,
  resetPassword,
  getUserProfile,
  updateUserProfile,
  logoutUser,
  getAllUser
};
