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

  it("skips employee/salary seeding when the requested count already exists", () => {
    const db = createConnection(":memory:");
    seedDatabase(db, 50);

    const firstEmployee = db.prepare("SELECT full_name FROM employees WHERE id = 1").get() as { full_name: string };

    // A second run with the same (already-met) count must be a true no-op
    // for employees/salaries — not just "happens to land on 50 again".
    seedDatabase(db, 50);

    const employeeCount = db.prepare("SELECT COUNT(*) AS n FROM employees").get() as { n: number };
    const employeeAfter = db.prepare("SELECT full_name FROM employees WHERE id = 1").get() as { full_name: string };

    expect(employeeCount.n).toBe(50);
    expect(employeeAfter.full_name).toBe(firstEmployee.full_name);
    db.close();
  });

  it("always upserts the fixed exchange rates, even when employee seeding is skipped", () => {
    const db = createConnection(":memory:");
    seedDatabase(db, 50);
    seedDatabase(db, 50); // employees already exist — should skip, but rates still upsert

    const rates = db
      .prepare("SELECT currency, rate_to_usd FROM exchange_rates ORDER BY currency")
      .all() as { currency: string; rate_to_usd: number }[];

    expect(rates).toEqual([
      { currency: "EUR", rate_to_usd: 1.09 },
      { currency: "GBP", rate_to_usd: 1.27 },
      { currency: "INR", rate_to_usd: 0.012 },
    ]);
    db.close();
  });
});
