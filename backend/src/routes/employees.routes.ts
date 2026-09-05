import type Database from "better-sqlite3";
import { Router } from "express";
import { getEmployeeById, listEmployees } from "../services/employees.service.js";

// Thin HTTP layer only — parse request, call services/employees.service.ts, format response.
// Still TODO: POST /, PATCH /:id, PATCH /:id/salary, DELETE /:id.
export function createEmployeesRouter(db: Database.Database): Router {
  const router = Router();

  router.get("/", (req, res) => {
    const { page, limit, search, department, country, level } = req.query;

    const result = listEmployees(db, {
      page: page !== undefined ? Number(page) : undefined,
      limit: limit !== undefined ? Number(limit) : undefined,
      search: typeof search === "string" ? search : undefined,
      department: typeof department === "string" ? department : undefined,
      country: typeof country === "string" ? country : undefined,
      level: typeof level === "string" ? level : undefined,
    });

    res.json(result);
  });

  router.get("/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Invalid employee id" });
      return;
    }

    const employee = getEmployeeById(db, id);
    if (!employee) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }
    res.json(employee);
  });

  return router;
}
