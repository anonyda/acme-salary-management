import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConnection } from "../db/connection.js";
import { calculateMedian, getSummary } from "../services/analytics.service.js";
import { ValidationError } from "../services/employees.service.js";

describe("calculateMedian", () => {
  it("returns the middle value for an odd-length sorted array", () => {
    expect(calculateMedian([90000, 90000, 120000])).toBe(90000);
  });

  it("averages the two middle values for an even-length sorted array", () => {
    expect(calculateMedian([1, 2, 3, 4])).toBe(2.5);
  });

  it("returns the single value for a one-record group", () => {
    expect(calculateMedian([50000])).toBe(50000);
  });

  it("returns 0 for an empty group", () => {
    expect(calculateMedian([])).toBe(0);
  });
});

// Fixture (all amounts convert to a clean 90000 USD except where noted, so
// expected sums/averages/medians are exact, not floating-point-fiddly):
//   Alice   | Engineering | US | L2 | active   | 90000   USD  -> 90000
//   Bob     | Engineering | UK | L2 | active   | 45000   GBP  -> 90000  (rate 2)
//   Eve     | Engineering | US | L3 | active   | 120000  USD  -> 120000
//   Carol   | Sales       | DE | L2 | active   | 60000   EUR  -> 90000  (rate 1.5)
//   Dave    | Sales       | IN | L2 | active   | 9000000 INR  -> 90000  (rate 0.01)
//   Frank   | Sales       | UK | L1 | INACTIVE | 40000   GBP  -> 80000  (excluded everywhere)
function seedFixture(db: Database.Database): void {
  db.prepare(
    "INSERT INTO exchange_rates (currency, rate_to_usd, as_of_date) VALUES ('GBP', 2, '2026-01-01'), ('EUR', 1.5, '2026-01-01'), ('INR', 0.01, '2026-01-01')",
  ).run();

  const employees: {
    fullName: string;
    gender: string;
    department: string;
    country: string;
    level: string;
    status: "active" | "inactive";
    amount: number;
    currency: string;
  }[] = [
    { fullName: "Alice Johnson", gender: "Female", department: "Engineering", country: "US", level: "L2", status: "active", amount: 90000, currency: "USD" },
    { fullName: "Bob Smith", gender: "Male", department: "Engineering", country: "UK", level: "L2", status: "active", amount: 45000, currency: "GBP" },
    { fullName: "Eve Ocean", gender: "Female", department: "Engineering", country: "US", level: "L3", status: "active", amount: 120000, currency: "USD" },
    { fullName: "Carol Diaz", gender: "Female", department: "Sales", country: "DE", level: "L2", status: "active", amount: 60000, currency: "EUR" },
    { fullName: "Dave Lee", gender: "Male", department: "Sales", country: "IN", level: "L2", status: "active", amount: 9_000_000, currency: "INR" },
    { fullName: "Frank Ocean", gender: "Male", department: "Sales", country: "UK", level: "L1", status: "inactive", amount: 40000, currency: "GBP" },
  ];

  for (const emp of employees) {
    const email = `${emp.fullName.toLowerCase().replace(/\s+/g, ".")}@acme.test`;
    const { lastInsertRowid: id } = db
      .prepare(
        `INSERT INTO employees (full_name, email, gender, department, title, level, country, hire_date, status)
         VALUES (@fullName, @email, @gender, @department, 'Employee', @level, @country, '2022-01-01', @status)`,
      )
      .run({ ...emp, email });

    db.prepare(
      `INSERT INTO salaries (employee_id, amount, currency, effective_date, is_current)
       VALUES (@id, @amount, @currency, '2022-01-01', 1)`,
    ).run({ id, amount: emp.amount, currency: emp.currency });
  }
}

describe("getSummary", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createConnection(":memory:");
    seedFixture(db);
  });

  afterEach(() => {
    db.close();
  });

  it("computes USD-normalized KPIs across active employees only", () => {
    const summary = getSummary(db);

    // Active USD values: 90000, 90000, 120000, 90000, 90000 (Frank excluded)
    expect(summary.kpis).toEqual({
      totalPayrollUSD: 480000,
      activeHeadcount: 5,
      avgSalaryUSD: 96000,
      medianSalaryUSD: 90000,
    });
  });

  it("computes department breakdown (avg/median/headcount), USD-normalized", () => {
    const summary = getSummary(db);

    expect(summary.byDepartment).toEqual([
      { department: "Engineering", headcount: 3, avgSalaryUSD: 100000, medianSalaryUSD: 90000 },
      { department: "Sales", headcount: 2, avgSalaryUSD: 90000, medianSalaryUSD: 90000 },
    ]);
  });

  it("computes country breakdown (avg/median/total payroll), USD-normalized", () => {
    const summary = getSummary(db);

    expect(summary.byCountry).toEqual([
      { country: "DE", avgSalaryUSD: 90000, medianSalaryUSD: 90000, totalPayrollUSD: 90000 },
      { country: "IN", avgSalaryUSD: 90000, medianSalaryUSD: 90000, totalPayrollUSD: 90000 },
      { country: "UK", avgSalaryUSD: 90000, medianSalaryUSD: 90000, totalPayrollUSD: 90000 },
      { country: "US", avgSalaryUSD: 105000, medianSalaryUSD: 105000, totalPayrollUSD: 210000 },
    ]);
  });

  it("computes salary distribution buckets by country, with all fixed bands always present", () => {
    const summary = getSummary(db);

    const us = summary.distributionByCountry.find((row) => row.country === "US");
    expect(us?.buckets).toEqual([
      { label: "$0–40k", count: 0 },
      { label: "$40k–80k", count: 0 },
      { label: "$80k–120k", count: 1 },
      { label: "$120k–160k", count: 1 },
      { label: "$160k–200k", count: 0 },
      { label: "$200k+", count: 0 },
    ]);

    const uk = summary.distributionByCountry.find((row) => row.country === "UK");
    expect(uk?.buckets.find((b) => b.label === "$80k–120k")?.count).toBe(1);
    expect(uk?.buckets.filter((b) => b.label !== "$80k–120k").every((b) => b.count === 0)).toBe(true);
  });

  it("excludes inactive employees from every figure", () => {
    const summary = getSummary(db);

    expect(summary.kpis.activeHeadcount).toBe(5);
    const uk = summary.byCountry.find((row) => row.country === "UK");
    // Only Bob (active, 90000) counts — Frank (inactive, 80000-equivalent) must not.
    expect(uk).toEqual({ country: "UK", avgSalaryUSD: 90000, medianSalaryUSD: 90000, totalPayrollUSD: 90000 });
  });

  it("scopes every figure to the department filter", () => {
    const summary = getSummary(db, { department: "Engineering" });

    expect(summary.kpis).toEqual({
      totalPayrollUSD: 300000,
      activeHeadcount: 3,
      avgSalaryUSD: 100000,
      medianSalaryUSD: 90000,
    });
    expect(summary.byDepartment).toEqual([
      { department: "Engineering", headcount: 3, avgSalaryUSD: 100000, medianSalaryUSD: 90000 },
    ]);
    expect(summary.byCountry).toEqual([
      { country: "UK", avgSalaryUSD: 90000, medianSalaryUSD: 90000, totalPayrollUSD: 90000 },
      { country: "US", avgSalaryUSD: 105000, medianSalaryUSD: 105000, totalPayrollUSD: 210000 },
    ]);
  });

  it("scopes every figure to the country filter", () => {
    const summary = getSummary(db, { country: "US" });

    expect(summary.kpis).toEqual({
      totalPayrollUSD: 210000,
      activeHeadcount: 2,
      avgSalaryUSD: 105000,
      medianSalaryUSD: 105000,
    });
    expect(summary.byDepartment).toEqual([
      { department: "Engineering", headcount: 2, avgSalaryUSD: 105000, medianSalaryUSD: 105000 },
    ]);
  });

  it("scopes every figure to the level filter", () => {
    const summary = getSummary(db, { level: "L2" });

    // Excludes Eve (L3) and Frank (L1, also inactive) — leaves Alice, Bob, Carol, Dave.
    expect(summary.kpis).toEqual({
      totalPayrollUSD: 360000,
      activeHeadcount: 4,
      avgSalaryUSD: 90000,
      medianSalaryUSD: 90000,
    });
  });

  it("combines multiple filters with AND semantics", () => {
    const summary = getSummary(db, { department: "Engineering", country: "US" });

    expect(summary.kpis).toEqual({
      totalPayrollUSD: 210000,
      activeHeadcount: 2,
      avgSalaryUSD: 105000,
      medianSalaryUSD: 105000,
    });
  });

  it("accepts an array of values for a filter, scoping every figure to their union", () => {
    const summary = getSummary(db, { country: ["US", "UK"] });

    // Alice (US), Bob (UK), Eve (US) — Carol (DE) and Dave (IN) excluded.
    expect(summary.kpis).toEqual({
      totalPayrollUSD: 300000,
      activeHeadcount: 3,
      avgSalaryUSD: 100000,
      medianSalaryUSD: 90000,
    });
    expect(summary.byCountry).toEqual([
      { country: "UK", avgSalaryUSD: 90000, medianSalaryUSD: 90000, totalPayrollUSD: 90000 },
      { country: "US", avgSalaryUSD: 105000, medianSalaryUSD: 105000, totalPayrollUSD: 210000 },
    ]);
    expect(summary.byDepartment).toEqual([
      { department: "Engineering", headcount: 3, avgSalaryUSD: 100000, medianSalaryUSD: 90000 },
    ]);
  });

  it("treats a single-element array filter the same as the equivalent scalar filter", () => {
    const arrayResult = getSummary(db, { department: ["Engineering"] });
    const scalarResult = getSummary(db, { department: "Engineering" });

    expect(arrayResult).toEqual(scalarResult);
  });

  it("treats an empty array filter the same as no filter", () => {
    const summary = getSummary(db, { department: [] });

    expect(summary.kpis.activeHeadcount).toBe(5);
  });

  it.each([
    ["department", "NotADept"],
    ["country", "XX"],
    ["level", "L99"],
  ])("rejects an invalid %s filter instead of silently matching nothing", (field, value) => {
    expect(() => getSummary(db, { [field]: value })).toThrow(ValidationError);
  });

  it("rejects an invalid value inside a multi-value filter array", () => {
    expect(() => getSummary(db, { country: ["US", "XX"] })).toThrow(ValidationError);
  });

  it("combines a multi-value filter with a scalar filter using AND semantics", () => {
    const summary = getSummary(db, { country: ["US", "UK"], level: "L2" });

    // Excludes Eve (L3) from the US/UK set — leaves Alice and Bob.
    expect(summary.kpis).toEqual({
      totalPayrollUSD: 180000,
      activeHeadcount: 2,
      avgSalaryUSD: 90000,
      medianSalaryUSD: 90000,
    });
  });

  it("returns zeroed KPIs and empty breakdowns when filters match no one", () => {
    const summary = getSummary(db, { department: "Marketing" });

    expect(summary.kpis).toEqual({
      totalPayrollUSD: 0,
      activeHeadcount: 0,
      avgSalaryUSD: 0,
      medianSalaryUSD: 0,
    });
    expect(summary.byDepartment).toEqual([]);
    expect(summary.byCountry).toEqual([]);
    expect(summary.distributionByCountry).toEqual([]);
  });
});
