import express from "express";
import cors from "cors";
import morgan from "morgan";

import { connectMongo, closeMongo } from "./config/mongo.js";
import { ensureBucket } from "./config/minio.js";
import { parentRouter } from "./routes/parent.js";
import { childRouter } from "./routes/child.js";
import { syncRouter } from "./routes/sync.js";

const PORT = parseInt(process.env.PORT || "5000", 10);

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("combined"));

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "scraper-service" });
});

// Routes
app.use("/api/scraper/parent", parentRouter);
app.use("/api/scraper/child", childRouter);
app.use("/api/scraper/sync", syncRouter);

// Global error handler
app.use((err, req, res, _next) => {
  console.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

async function start() {
  try {
    await connectMongo();
    await ensureBucket();
    app.listen(PORT, () => {
      console.log(`[scraper-service] Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error("[scraper-service] Failed to start:", err.message);
    process.exit(1);
  }
}

process.on("SIGTERM", async () => {
  console.log("[scraper-service] SIGTERM received, shutting down...");
  await closeMongo();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("[scraper-service] SIGINT received, shutting down...");
  await closeMongo();
  process.exit(0);
});

start();
