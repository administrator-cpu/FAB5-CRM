// src/config/config.io.js
const socketIO = require("socket.io");
const jwt = require("jsonwebtoken");
const ioHelper = require("../utils/ioHelper");
const User = require("../models/userModel");

const initSocket = (server) => {
  const allowedOrigins = [
    process.env.CLIENT_URL,
    "https://crm.fab5connect.com",
    "https://fab5connect.com",
    "http://localhost:5173",
    "https://fab-5-crm.vercel.app",
    "http://localhost:5174",
  ].filter(Boolean);

  const io = socketIO(server, {
    cors: {
      origin: allowedOrigins,
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Everything is inside try: a rejected promise here would be an unhandled rejection,
  // which shuts the server down (server.js).
  io.use(async (socket, next) => {
    try {
      let token = socket.handshake.auth?.token;

      if (!token && socket.handshake.headers?.cookie) {
        const match = socket.handshake.headers.cookie.match(/(?:^|;\s*)token=([^;]+)/);
        if (match) token = decodeURIComponent(match[1]);
      }

      if (!token || typeof token !== "string") return next(new Error("Authentication error"));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      // Role and account state come from the database, not the token, so a deactivated or
      // demoted user (or a token from before a password reset) gets no room.
      const user = await User.findById(decoded.id).select("role isActive tokenVersion").lean();
      if (!user || !user.isActive || (decoded.tv || 0) !== (user.tokenVersion || 0)) {
        return next(new Error("Authentication error"));
      }
      socket.user = { id: String(user._id), role: user.role };
      next();
    } catch (err) {
      next(new Error("Authentication error"));
    }
  });

  io.on("connection", (socket) => {
    const userId = socket.user.id || socket.user._id;
    
    if (socket.user.role === "admin" || socket.user.role === "owner") {
      socket.join("room:admin");
    } else if (socket.user.role === "employee" && userId) {
      socket.join(`room:employee:${userId}`);
    }
  });

  ioHelper.init(io);
  global.io = io;
  return io;
};

module.exports = initSocket;