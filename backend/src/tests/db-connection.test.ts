import { describe, expect, it } from "vitest";
import { createConnection } from "../db/connection.js";

describe("createConnection", () => {
  it("creates employees and salaries tables", () => {
    const db = createConnection(":memory:");

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row: any) => row.name);

    expect(tables).toEqual(expect.arrayContaining(["employees", "salaries"]));
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
});
