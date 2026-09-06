import type Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createConnection } from "../db/connection.js";

function insertEmployee(
  db: Database.Database,
  opts: {
    fullName: string;
    department: string;
    country: string;
    level?: string;
    status: "active" | "inactive";
    amount: number;
    currency: string;
  },
): void {
  const email = `${opts.fullName.toLowerCase().replace(/\s+/g, ".")}@acme.test`;
  const { lastInsertRowid: id } = db
    .prepare(
      `INSERT INTO employees (full_name, email, department, title, level, country, hire_date, status)
       VALUES (@fullName, @email, @department, 'Employee', @level, @country, '2022-01-01', @status)`,
    )
    .run({
      fullName: opts.fullName,
      email,
      department: opts.department,
      level: opts.level ?? "L2",
      country: opts.country,
      status: opts.status,
    });

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
    db.prepare("INSERT INTO exchange_rates (currency, rate_to_usd, as_of_date) VALUES ('GBP', 2, '2026-01-01')").run();
    insertEmployee(db, { fullName: "Alice Johnson", department: "Engineering", country: "US", level: "L2", status: "active", amount: 100000, currency: "USD" });
    insertEmployee(db, { fullName: "Carol Diaz", department: "Sales", country: "US", level: "L3", status: "active", amount: 80000, currency: "USD" });
    insertEmployee(db, { fullName: "Bob Smith", department: "Engineering", country: "UK", level: "L2", status: "active", amount: 40000, currency: "GBP" });
    insertEmployee(db, { fullName: "Eve Ocean", department: "Engineering", country: "US", level: "L2", status: "inactive", amount: 60000, currency: "USD" });
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  it("returns USD-normalized KPIs and department/country breakdowns, active employees only, when unfiltered", async () => {
    const res = await request(app).get("/api/analytics/summary");

    expect(res.status).toBe(200);
    expect(res.body.kpis).toEqual({
      totalPayrollUSD: 260000,
      activeHeadcount: 3,
      avgSalaryUSD: 86666.67,
      medianSalaryUSD: 80000,
    });
    expect(res.body.byDepartment).toEqual([
      { department: "Engineering", headcount: 2, avgSalaryUSD: 90000, medianSalaryUSD: 90000 },
      { department: "Sales", headcount: 1, avgSalaryUSD: 80000, medianSalaryUSD: 80000 },
    ]);
    expect(res.body.byCountry).toEqual([
      { country: "UK", avgSalaryUSD: 80000, medianSalaryUSD: 80000, totalPayrollUSD: 80000 },
      { country: "US", avgSalaryUSD: 90000, medianSalaryUSD: 90000, totalPayrollUSD: 180000 },
    ]);
  });

  it("scopes the summary to a department filter", async () => {
    const res = await request(app).get("/api/analytics/summary").query({ department: "Engineering" });

    expect(res.status).toBe(200);
    expect(res.body.kpis.activeHeadcount).toBe(2);
    expect(res.body.byDepartment).toEqual([
      { department: "Engineering", headcount: 2, avgSalaryUSD: 90000, medianSalaryUSD: 90000 },
    ]);
  });

  it("scopes the summary to a country filter", async () => {
    const res = await request(app).get("/api/analytics/summary").query({ country: "US" });

    expect(res.status).toBe(200);
    expect(res.body.kpis).toEqual({
      totalPayrollUSD: 180000,
      activeHeadcount: 2,
      avgSalaryUSD: 90000,
      medianSalaryUSD: 90000,
    });
    expect(res.body.byCountry).toEqual([{ country: "US", avgSalaryUSD: 90000, medianSalaryUSD: 90000, totalPayrollUSD: 180000 }]);
  });

  it("scopes the summary to a level filter", async () => {
    const res = await request(app).get("/api/analytics/summary").query({ level: "L3" });

    expect(res.status).toBe(200);
    expect(res.body.kpis).toEqual({
      totalPayrollUSD: 80000,
      activeHeadcount: 1,
      avgSalaryUSD: 80000,
      medianSalaryUSD: 80000,
    });
    expect(res.body.byDepartment).toEqual([{ department: "Sales", headcount: 1, avgSalaryUSD: 80000, medianSalaryUSD: 80000 }]);
  });

  it("combines department, country, and level filters with AND semantics", async () => {
    const res = await request(app).get("/api/analytics/summary").query({ department: "Engineering", country: "US", level: "L2" });

    expect(res.status).toBe(200);
    expect(res.body.kpis).toEqual({
      totalPayrollUSD: 100000,
      activeHeadcount: 1,
      avgSalaryUSD: 100000,
      medianSalaryUSD: 100000,
    });
  });

  it("returns zeroed KPIs and empty breakdowns when a filter matches no one", async () => {
    const res = await request(app).get("/api/analytics/summary").query({ department: "Marketing" });

    expect(res.status).toBe(200);
    expect(res.body.kpis).toEqual({ totalPayrollUSD: 0, activeHeadcount: 0, avgSalaryUSD: 0, medianSalaryUSD: 0 });
    expect(res.body.byDepartment).toEqual([]);
    expect(res.body.byCountry).toEqual([]);
    expect(res.body.distributionByCountry).toEqual([]);
  });
});
