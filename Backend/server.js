require("dotenv").config();

const { app, server, io } = require("./src/app");
const connectDB = require("./src/config/db");
const { startReminderJob, startAutoTerminationJob, startRateRevisionJob } = require("./src/services/cronService")
const { shutDownRedis } = require("./src/config/cache");
const logger = require("./src/utils/logger")

const PORT = process.env.PORT || 4002;

const startServer = async () => {
  try {
    await connectDB();

    server.listen(PORT, () => {
      logger.info("✅ High-Performance HTTP & WebSocket Server Running", { port: PORT });
      startReminderJob();
      startAutoTerminationJob();
      startRateRevisionJob();
    });

    require("./src/workers/email.worker")

    let isShuttingDown = false;

    const gracefulShutdown = async (signal) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.warn(`${signal} received — shutting down gracefully`);

      const forceKillTimer = setTimeout(() => {
        logger.error("❌ Forced shutdown — timeout exceeded");
        process.exit(1);
      }, 15000);
      forceKillTimer.unref();

      try {
        if (io) {
          io.close();
          logger.info("Socket.IO server closed");
        }
        await new Promise((resolve) => {
          server.close(() => {
            logger.info("HTTP server closed");
            resolve();
          });
        });

        try {
          const mongoose = require("mongoose");
          await mongoose.connection.close(false);
          logger.info("✅ MongoDB disconnected gracefully");
        } catch (err) {
          logger.error("❌ MongoDB shutdown error", {
            error: err.message,
          });
        }

        try {
          await shutDownRedis();
          logger.info("✅ Redis disconnected gracefully");
        } catch (err) {
          logger.error("❌ Redis shutdown error", {
            error: err.message,
          });
        }

        clearTimeout(forceKillTimer);
        logger.info("✅ Shutdown complete");
        process.exit(0);

      } catch (err) {
        logger.error("❌ Graceful shutdown failed", {
          error: err.message,
          stack: err.stack,
        });

        clearTimeout(forceKillTimer);
        process.exit(1);
      }
    };

    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    process.on("unhandledRejection", (reason) => {
      logger.error("❌ Unhandled Rejection", {
        error: reason?.message || String(reason),
        stack: reason?.stack,
      });
      gracefulShutdown("unhandledRejection");
    });

    process.on("uncaughtException", (err) => {
      logger.error("❌ Uncaught Exception", {
        error: err.message,
        stack: err.stack,
      });
      gracefulShutdown("uncaughtException");
    });

  } catch (err) {
    logger.error("❌ Failed to start server", {
      error: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
};

startServer();