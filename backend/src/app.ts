import type Database from "better-sqlite3";
import express from "express";
import { createEmployeesRouter } from "./routes/employees.routes.js";

// TODO: mount /api/analytics router here once implemented.
export function createApp(db: Database.Database) {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.use("/api/employees", createEmployeesRouter(db));

  return app;
}
