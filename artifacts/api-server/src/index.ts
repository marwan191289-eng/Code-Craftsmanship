import app from "./app";
import { logger } from "./lib/logger";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, "0.0.0.0", () => {
  logger.info({ port }, "Server listening");
});

server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;
server.requestTimeout = 120000;
server.maxConnections = 1000;

server.on("error", (err: NodeJS.ErrnoException) => {
  logger.error({ err }, "Server error");
  if (err.code === "EADDRINUSE") {
    logger.error({ port }, "Port already in use");
    process.exit(1);
  }
});

process.on("SIGTERM", () => {
  logger.info("SIGTERM received — graceful shutdown");
  server.close(() => {
    logger.info("Server closed");
    process.exit(0);
  });
  setTimeout(() => {
    logger.warn("Force shutdown after timeout");
    process.exit(1);
  }, 10000);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received — graceful shutdown");
  server.close(() => process.exit(0));
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled rejection");
});
