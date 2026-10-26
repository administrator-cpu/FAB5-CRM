const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError")
const User = require("../models/userModel");
const logger = require("../utils/logger")

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "None",
};

//  ─────────────────── Protect Middleware ────────────────────
const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies?.token) {
      token = req.cookies.token;
    }


    if (!token) {
      return res
        .status(401)
        .json({ message: "No token, authorization denied" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ email: decoded.email }).select(
      "-password"
    );

    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (!user.isActive) {
      return next(new AppError("Account disabled", 403));
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// ─────────────────── Authorize Middleware ──────────────────────  
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return next(new AppError("Forbidden: You don't have permission to access this resource", 403));
    }
    next();
  }
};

// ─────────────────── Domain Check Middleware ────────────────────
const domainCheck = (req, res, next) => {
  
  const { email } = req.body;
  if (!email) {
    return next(new AppError("Email is required", 400));
  }

  const allowedDomain = process.env.ALLOWED_EMAIL_DOMAIN;
  if (!allowedDomain) {
    logger.warn("ALLOWED_EMAIL_DOMAIN not set in environment — domain check skipped");
    return next();
  }

  const emailDomain = email.split("@")[1]?.toLowerCase();
  if (emailDomain !== allowedDomain.toLowerCase()) {
    return next(new AppError("Only company email addresses are allowed", 400));
  }
  next();
}

module.exports = { protect, authorize, cookieOptions, domainCheck };
