import type Database from "better-sqlite3";
import { Router } from "express";
import { getAnalyticsSummary } from "../services/analytics.service.js";

// Thin HTTP layer only — parse request, call services/analytics.service.ts, format response.
export function createAnalyticsRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/summary", (_req, res) => {
    res.json(getAnalyticsSummary(db));
  });

  return router;
}
