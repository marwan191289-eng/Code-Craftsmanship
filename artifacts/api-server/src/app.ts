import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
    autoLogging: {
      ignore: (req) => req.url?.startsWith("/api/proxy") && req.method === "GET",
    },
  }),
);

app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "OPTIONS", "HEAD"],
    allowedHeaders: ["Content-Type", "Authorization", "Range", "Accept", "X-Requested-With"],
    exposedHeaders: ["Content-Range", "Accept-Ranges", "Content-Length", "Content-Type", "X-Cache", "X-EPG-Cached"],
    maxAge: 86400,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  }),
);

app.options("/{*splat}", (_req, res) => {
  res.sendStatus(204);
});

app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "no-referrer");
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

app.use((req, res, next) => {
  const isStream =
    req.path.includes("/proxy") &&
    (req.query.url as string || "").toLowerCase().match(/\.(ts|mp4|mkv|avi|flv|webm|m4v)(\?|$)/);

  if (!isStream) {
    const timeout = setTimeout(() => {
      if (!res.headersSent) {
        res.status(408).json({ message: "Request timeout" });
      }
    }, 30000);
    res.on("finish", () => clearTimeout(timeout));
    res.on("close", () => clearTimeout(timeout));
  }
  next();
});

app.use("/api", router);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ message: "Not found" });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err }, "Unhandled error");
  if (!res.headersSent) {
    res.status(500).json({ message: "Internal server error" });
  }
});

export default app;
