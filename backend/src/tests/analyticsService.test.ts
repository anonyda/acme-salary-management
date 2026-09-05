import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConnection } from "../db/connection.js";
import { getAnalyticsSummary } from "../services/analytics.service.js";

function insertEmployee(
  db: Database.Database,
  opts: {
    fullName: string;
    department: string;
    country: string;
    status: "active" | "inactive";
    amount: number;
    currency: string;
  },
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

// Fixture: Engineering has one active US employee (100000 USD), one active
// UK employee (60000 GBP), and one INACTIVE US employee (60000 USD, must be
// excluded). Sales has one active US employee (80000 USD) and one active UK
// employee (50000 GBP). Cross-currency averaging within a department is a
// known, documented limitation (TRD section 4.2 — no currency conversion),
// not something this test is trying to hide.
describe("getAnalyticsSummary", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createConnection(":memory:");
    insertEmployee(db, {
      fullName: "Alice Johnson",
      department: "Engineering",
      country: "US",
      status: "active",
      amount: 100000,
      currency: "USD",
    });
    insertEmployee(db, {
      fullName: "Bob Smith",
      department: "Engineering",
      country: "UK",
      status: "active",
      amount: 60000,
      currency: "GBP",
    });
    insertEmployee(db, {
      fullName: "Carol Diaz",
      department: "Sales",
      country: "US",
      status: "active",
      amount: 80000,
      currency: "USD",
    });
    insertEmployee(db, {
      fullName: "Dave Lee",
      department: "Sales",
      country: "UK",
      status: "active",
      amount: 50000,
      currency: "GBP",
    });
    insertEmployee(db, {
      fullName: "Eve Ocean",
      department: "Engineering",
      country: "US",
      status: "inactive",
      amount: 60000,
      currency: "USD",
    });
  });

  afterEach(() => {
    db.close();
  });

  it("computes headcount and average salary by department, excluding inactive employees", () => {
    const result = getAnalyticsSummary(db);

    expect(result.by_department).toHaveLength(2);
    expect(result.by_department).toEqual(
      expect.arrayContaining([
        { department: "Engineering", headcount: 2, average_salary: 80000 },
        { department: "Sales", headcount: 2, average_salary: 65000 },
      ]),
    );
  });

  it("computes average salary and total payroll by country, excluding inactive employees", () => {
    const result = getAnalyticsSummary(db);

    expect(result.by_country).toHaveLength(2);
    expect(result.by_country).toEqual(
      expect.arrayContaining([
        { country: "US", average_salary: 90000, total_payroll: 180000 },
        { country: "UK", average_salary: 55000, total_payroll: 110000 },
      ]),
    );
  });
});
