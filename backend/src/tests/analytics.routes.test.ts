import type Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createConnection } from "../db/connection.js";

function insertEmployee(
  db: Database.Database,
  opts: { fullName: string; department: string; country: string; status: "active" | "inactive"; amount: number; currency: string },
): void {
  const email = `${opts.fullName.toLowerCase().replace(/\s+/g, ".")}@acme.test`;
  const { lastInsertRowid: id } = db
    .prepare(
      `INSERT INTO employees (full_name, email, department, title, level, country, hire_date, status)
       VALUES (@fullName, @email, @department, 'Employee', 'L2', @country, '2022-01-01', @status)`,
    )
    .run({ fullName: opts.fullName, email, department: opts.department, country: opts.country, status: opts.status });

  db.prepare(
    `INSERT INTO salaries (employee_id, amount, currency, effective_date, is_current)
     VALUES (@id, @amount, @currency, '2022-01-01', 1)`,
  ).run({ id, amount: opts.amount, currency: opts.currency });
}

describe("GET /api/analytics/summary", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createConnection(":memory:");
    insertEmployee(db, { fullName: "Alice Johnson", department: "Engineering", country: "US", status: "active", amount: 100000, currency: "USD" });
    insertEmployee(db, { fullName: "Carol Diaz", department: "Sales", country: "US", status: "active", amount: 80000, currency: "USD" });
    insertEmployee(db, { fullName: "Eve Ocean", department: "Engineering", country: "US", status: "inactive", amount: 60000, currency: "USD" });
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  it("returns headcount/average by department and average/total by country, active employees only", async () => {
    const res = await request(app).get("/api/analytics/summary");

    expect(res.status).toBe(200);
    expect(res.body.by_department).toEqual([
      { department: "Engineering", headcount: 1, average_salary: 100000 },
      { department: "Sales", headcount: 1, average_salary: 80000 },
    ]);
    expect(res.body.by_country).toEqual([{ country: "US", average_salary: 90000, total_payroll: 180000 }]);
  });
});
