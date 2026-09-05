import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConnection } from "../db/connection.js";
import { getEmployeeById, listEmployees } from "../services/employees.service.js";

// Small, deterministic fixture set (alphabetical by full_name, so
// pagination slices below are predictable):
//   1. Alice Johnson  | Engineering | US | L2
//   2. Alicia Keys    | Sales       | US | L2
//   3. Bob Smith      | Sales       | UK | L1
//   4. Carol Diaz     | Marketing   | IN | L3
//   5. David Lee      | Engineering | UK | L1
//   6. Frank Ocean    | Marketing   | IN | L1
//   7. Grace Hopper   | Engineering | US | L3
const FIXTURE_EMPLOYEES = [
  { fullName: "Alice Johnson", email: "alice.johnson@acme.test", department: "Engineering", country: "US", level: "L2" },
  { fullName: "Alicia Keys", email: "alicia.keys@acme.test", department: "Sales", country: "US", level: "L2" },
  { fullName: "Bob Smith", email: "bob.smith@acme.test", department: "Sales", country: "UK", level: "L1" },
  { fullName: "Carol Diaz", email: "carol.diaz@acme.test", department: "Marketing", country: "IN", level: "L3" },
  { fullName: "David Lee", email: "david.lee@acme.test", department: "Engineering", country: "UK", level: "L1" },
  { fullName: "Frank Ocean", email: "frank.ocean@acme.test", department: "Marketing", country: "IN", level: "L1" },
  { fullName: "Grace Hopper", email: "grace.hopper@acme.test", department: "Engineering", country: "US", level: "L3" },
];

function seedFixture(db: Database.Database): void {
  const insert = db.prepare(`
    INSERT INTO employees (full_name, email, department, title, level, country, hire_date)
    VALUES (@fullName, @email, @department, 'Employee', @level, @country, '2022-01-01')
  `);
  for (const employee of FIXTURE_EMPLOYEES) {
    insert.run(employee);
  }
}

describe("listEmployees", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createConnection(":memory:");
    seedFixture(db);
  });

  afterEach(() => {
    db.close();
  });

  it("defaults to page 1, limit 25, and returns all fixture rows sorted by name", () => {
    const result = listEmployees(db, {});

    expect(result.page).toBe(1);
    expect(result.limit).toBe(25);
    expect(result.total).toBe(7);
    expect(result.data.map((e: any) => e.full_name)).toEqual([
      "Alice Johnson",
      "Alicia Keys",
      "Bob Smith",
      "Carol Diaz",
      "David Lee",
      "Frank Ocean",
      "Grace Hopper",
    ]);
  });

  it("paginates using page and limit, keeping total as the full count", () => {
    const page1 = listEmployees(db, { page: 1, limit: 3 });
    const page2 = listEmployees(db, { page: 2, limit: 3 });
    const page3 = listEmployees(db, { page: 3, limit: 3 });

    expect(page1.data.map((e: any) => e.full_name)).toEqual(["Alice Johnson", "Alicia Keys", "Bob Smith"]);
    expect(page2.data.map((e: any) => e.full_name)).toEqual(["Carol Diaz", "David Lee", "Frank Ocean"]);
    expect(page3.data.map((e: any) => e.full_name)).toEqual(["Grace Hopper"]);

    for (const page of [page1, page2, page3]) {
      expect(page.total).toBe(7);
      expect(page.limit).toBe(3);
    }
  });

  it("searches by full name, case-insensitively", () => {
    const result = listEmployees(db, { search: "ali" });

    expect(result.total).toBe(2);
    expect(result.data.map((e: any) => e.full_name).sort()).toEqual(["Alice Johnson", "Alicia Keys"]);
  });

  it("searches by email", () => {
    const result = listEmployees(db, { search: "carol.diaz@acme.test" });

    expect(result.total).toBe(1);
    expect((result.data[0] as any).full_name).toBe("Carol Diaz");
  });

  it("filters by department", () => {
    const result = listEmployees(db, { department: "Engineering" });

    expect(result.total).toBe(3);
    expect(result.data.map((e: any) => e.full_name)).toEqual(["Alice Johnson", "David Lee", "Grace Hopper"]);
  });

  it("filters by country", () => {
    const result = listEmployees(db, { country: "US" });

    expect(result.total).toBe(3);
    expect(result.data.map((e: any) => e.full_name)).toEqual(["Alice Johnson", "Alicia Keys", "Grace Hopper"]);
  });

  it("filters by level", () => {
    const result = listEmployees(db, { level: "L1" });

    expect(result.total).toBe(3);
    expect(result.data.map((e: any) => e.full_name)).toEqual(["Bob Smith", "David Lee", "Frank Ocean"]);
  });

  it("combines multiple filters with AND semantics", () => {
    const result = listEmployees(db, { department: "Engineering", country: "US" });

    expect(result.total).toBe(2);
    expect(result.data.map((e: any) => e.full_name)).toEqual(["Alice Johnson", "Grace Hopper"]);
  });
});

describe("getEmployeeById", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createConnection(":memory:");
    db.prepare(`
      INSERT INTO employees (full_name, email, department, title, level, country, hire_date)
      VALUES ('Nina Patel', 'nina.patel@acme.test', 'Finance', 'Financial Analyst', 'L3', 'IN', '2021-06-15')
    `).run();
    db.prepare(`
      INSERT INTO salaries (employee_id, amount, currency, effective_date, is_current)
      VALUES (1, 1800000, 'INR', '2021-06-15', 1)
    `).run();
  });

  afterEach(() => {
    db.close();
  });

  it("returns the employee merged with their current salary", () => {
    const employee = getEmployeeById(db, 1) as any;

    expect(employee).toMatchObject({
      id: 1,
      full_name: "Nina Patel",
      email: "nina.patel@acme.test",
      department: "Finance",
      country: "IN",
      salary: {
        amount: 1800000,
        currency: "INR",
        effective_date: "2021-06-15",
      },
    });
  });

  it("returns undefined for an unknown id", () => {
    expect(getEmployeeById(db, 999)).toBeUndefined();
  });
});
