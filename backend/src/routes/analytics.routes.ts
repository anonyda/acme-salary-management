import { Router } from "express";

// Thin HTTP layer only — parse request, call services/analytics.ts, format response.
// Endpoints per docs/TRD.md section 7:
//   GET /api/analytics/summary
export const analyticsRouter = Router();
