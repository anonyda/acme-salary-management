import type { NextFunction, Request, Response } from "express";
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

  // Last-resort safety net: routes are expected to catch and translate their
  // own known errors (ValidationError -> 400, NotFoundError -> 404). This
  // exists so anything they don't recognize — a malformed-JSON body from
  // express.json(), or a genuinely unexpected bug — comes back as a plain
  // JSON error instead of Express's default HTML page, which dumps the
  // stack trace and absolute server file paths to the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof SyntaxError && "body" in err) {
      res.status(400).json({ error: "Malformed JSON in request body" });
      return;
    }
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
