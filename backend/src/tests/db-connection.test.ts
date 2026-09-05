import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createConnection } from "../db/connection.js";

describe("createConnection", () => {
  it("creates employees, salaries, and exchange_rates tables", () => {
    const db = createConnection(":memory:");

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row: any) => row.name);

    expect(tables).toEqual(expect.arrayContaining(["employees", "salaries", "exchange_rates"]));
    db.close();
  });

  it("enforces one current salary per employee", () => {
    const db = createConnection(":memory:");

    db.prepare(
      "INSERT INTO employees (full_name, email, department, title, level, country, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run("Jane Doe", "jane@example.com", "Engineering", "Engineer", "L2", "US", "2024-01-01");

    const insertSalary = db.prepare(
      "INSERT INTO salaries (employee_id, amount, currency, effective_date, is_current) VALUES (1, ?, 'USD', '2024-01-01', 1)",
    );
    insertSalary.run(100000);

    expect(() => insertSalary.run(110000)).toThrow();
    db.close();
  });

  it("rejects USD (the implicit base) in exchange_rates via the currency CHECK constraint", () => {
    const db = createConnection(":memory:");

    db.prepare("INSERT INTO exchange_rates (currency, rate_to_usd, as_of_date) VALUES ('GBP', 1.27, '2026-01-01')").run();

    expect(() =>
      db.prepare("INSERT INTO exchange_rates (currency, rate_to_usd, as_of_date) VALUES ('USD', 1, '2026-01-01')").run(),
    ).toThrow();

    db.close();
  });

  it("re-applying the schema to an existing database preserves data and adds new tables", () => {
    const dir = mkdtempSync(join(tmpdir(), "acme-schema-test-"));
    const dbPath = join(dir, "test.sqlite");

    try {
      const db1 = createConnection(dbPath);
      db1
        .prepare(
          "INSERT INTO employees (full_name, email, department, title, level, country, hire_date) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run("Nina Patel", "nina.patel@acme.test", "Finance", "Financial Analyst", "L3", "IN", "2021-06-15");
      db1.close();

      // Simulate a server restart: re-applying schema.sql against an
      // already-populated database must not touch existing rows.
      const db2 = createConnection(dbPath);

      const employeeCount = (db2.prepare("SELECT COUNT(*) AS count FROM employees").get() as { count: number }).count;
      expect(employeeCount).toBe(1);

      const tables = db2
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((row: any) => row.name);
      expect(tables).toEqual(expect.arrayContaining(["employees", "salaries", "exchange_rates"]));

      db2.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
