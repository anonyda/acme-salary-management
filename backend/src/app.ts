import type Database from "better-sqlite3";
import express from "express";
import { createAnalyticsRouter } from "./routes/analytics.routes.js";
import { createEmployeesRouter } from "./routes/employees.routes.js";

export function createApp(db: Database.Database) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/employees", createEmployeesRouter(db));
  app.use("/api/analytics", createAnalyticsRouter(db));

  return app;
}
