import type Database from "better-sqlite3";
import { Router } from "express";
import { getSummary } from "../services/analytics.service.js";
import { ValidationError } from "../services/employees.service.js";

// Accepts either a single value (?department=Engineering) or a repeated
// param (?department=Engineering&department=Sales) for side-by-side
// comparison — anything else (a nested object from the query parser) is
// not a supported filter shape and is dropped.
function parseFilterParam(value: unknown): string | string[] | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value as string[];
  return undefined;
}

// Thin HTTP layer only — parse request, call services/analytics.service.ts, format response.
export function createAnalyticsRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/summary", (req, res) => {
    try {
      res.json(
        getSummary(db, {
          department: parseFilterParam(req.query.department),
          country: parseFilterParam(req.query.country),
          level: parseFilterParam(req.query.level),
        }),
      );
    } catch (err) {
      if (err instanceof ValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  });

  return router;
}
