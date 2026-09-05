import { describe, expect, it } from "vitest";
import { createConnection } from "../db/connection.js";
import { seedDatabase } from "../db/seed.js";

const DEPARTMENTS = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Operations"];
const LEVELS = ["L1", "L2", "L3", "L4", "L5"];
const COUNTRIES = ["US", "UK", "IN", "DE"];
const CURRENCY_BY_COUNTRY: Record<string, string> = { US: "USD", UK: "GBP", IN: "INR", DE: "EUR" };

describe("seedDatabase", () => {
  it("generates the requested number of employees, each with exactly one current salary", () => {
    const db = createConnection(":memory:");
    seedDatabase(db, 200);

    const employeeCount = db.prepare("SELECT COUNT(*) AS n FROM employees").get() as { n: number };
    const salaryCount = db.prepare("SELECT COUNT(*) AS n FROM salaries WHERE is_current = 1").get() as {
      n: number;
    };

    expect(employeeCount.n).toBe(200);
    expect(salaryCount.n).toBe(200);
    db.close();
  });

  it("assigns valid enum values and a salary in the correct native currency", () => {
    const db = createConnection(":memory:");
    seedDatabase(db, 200);

    const rows = db
      .prepare(
        `SELECT e.department, e.level, e.country, e.status, s.currency
         FROM employees e JOIN salaries s ON s.employee_id = e.id`,
      )
      .all() as { department: string; level: string; country: string; status: string; currency: string }[];

    for (const row of rows) {
      expect(DEPARTMENTS).toContain(row.department);
      expect(LEVELS).toContain(row.level);
      expect(COUNTRIES).toContain(row.country);
      expect(["active", "inactive"]).toContain(row.status);
      expect(row.currency).toBe(CURRENCY_BY_COUNTRY[row.country]);
    }
    db.close();
  });

  it("only assigns a manager who is already-inserted and more senior in the same department", () => {
    const db = createConnection(":memory:");
    seedDatabase(db, 500);

    const rows = db
      .prepare(
        `SELECT e.id, e.department, e.level, m.id AS manager_id, m.department AS manager_department, m.level AS manager_level
         FROM employees e LEFT JOIN employees m ON m.id = e.manager_id`,
      )
      .all() as {
      id: number;
      department: string;
      level: string;
      manager_id: number | null;
      manager_department: string | null;
      manager_level: string | null;
    }[];

    for (const row of rows) {
      if (row.manager_id === null) continue;
      expect(row.manager_id).toBeLessThan(row.id);
      expect(row.manager_department).toBe(row.department);
      expect(LEVELS.indexOf(row.manager_level as string)).toBeGreaterThan(LEVELS.indexOf(row.level));
    }
    db.close();
  });

  it("is re-runnable against the same connection without violating constraints", () => {
    const db = createConnection(":memory:");
    seedDatabase(db, 50);
    seedDatabase(db, 50);

    const employeeCount = db.prepare("SELECT COUNT(*) AS n FROM employees").get() as { n: number };
    expect(employeeCount.n).toBe(50);
    db.close();
  });
});
