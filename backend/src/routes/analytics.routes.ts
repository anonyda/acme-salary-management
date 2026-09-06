import type Database from "better-sqlite3";
import { Router } from "express";
import { getSummary } from "../services/analytics.service.js";

// Thin HTTP layer only — parse request, call services/analytics.service.ts, format response.
export function createAnalyticsRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/summary", (req, res) => {
    const { department, country, level } = req.query;
    res.json(
      getSummary(db, {
        department: typeof department === "string" ? department : undefined,
        country: typeof country === "string" ? country : undefined,
        level: typeof level === "string" ? level : undefined,
      }),
    );
  });

  return router;
}
