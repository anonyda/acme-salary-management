import { Router } from "express";

// Thin HTTP layer only — parse request, call services/employees.ts, format response.
// Endpoints per docs/TRD.md section 7:
//   GET    /api/employees
//   GET    /api/employees/:id
//   POST   /api/employees
//   PATCH  /api/employees/:id
//   PATCH  /api/employees/:id/salary
//   DELETE /api/employees/:id
export const employeesRouter = Router();
