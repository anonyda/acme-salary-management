import type Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createConnection } from "../db/connection.js";
import {
  createEmployee,
  deactivateEmployee,
  getEmployeeById,
  listEmployees,
  NotFoundError,
  updateEmployee,
  updateSalary,
  ValidationError,
} from "../services/employees.service.js";

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
  { fullName: "Alice Johnson", email: "alice.johnson@acme.test", department: "Engineering", country: "US", level: "L2", amount: 90000, currency: "USD" },
  { fullName: "Alicia Keys", email: "alicia.keys@acme.test", department: "Sales", country: "US", level: "L2", amount: 85000, currency: "USD" },
  { fullName: "Bob Smith", email: "bob.smith@acme.test", department: "Sales", country: "UK", level: "L1", amount: 40000, currency: "GBP" },
  { fullName: "Carol Diaz", email: "carol.diaz@acme.test", department: "Marketing", country: "IN", level: "L3", amount: 1_800_000, currency: "INR" },
  { fullName: "David Lee", email: "david.lee@acme.test", department: "Engineering", country: "UK", level: "L1", amount: 35000, currency: "GBP" },
  { fullName: "Frank Ocean", email: "frank.ocean@acme.test", department: "Marketing", country: "IN", level: "L1", amount: 700000, currency: "INR" },
  { fullName: "Grace Hopper", email: "grace.hopper@acme.test", department: "Engineering", country: "US", level: "L3", amount: 120000, currency: "USD" },
];

function seedFixture(db: Database.Database): void {
  const insertEmployee = db.prepare(`
    INSERT INTO employees (full_name, email, department, title, level, country, hire_date)
    VALUES (@fullName, @email, @department, 'Employee', @level, @country, '2022-01-01')
  `);
  const insertSalary = db.prepare(`
    INSERT INTO salaries (employee_id, amount, currency, effective_date, is_current)
    VALUES (@employeeId, @amount, @currency, '2022-01-01', 1)
  `);
  for (const employee of FIXTURE_EMPLOYEES) {
    const { lastInsertRowid: employeeId } = insertEmployee.run(employee);
    insertSalary.run({ employeeId, amount: employee.amount, currency: employee.currency });
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

  it("includes each employee's current salary, in native currency", () => {
    const result = listEmployees(db, {});

    expect(result.data.map((e: any) => ({ full_name: e.full_name, salary: e.salary }))).toEqual([
      { full_name: "Alice Johnson", salary: { amount: 90000, currency: "USD", effective_date: "2022-01-01" } },
      { full_name: "Alicia Keys", salary: { amount: 85000, currency: "USD", effective_date: "2022-01-01" } },
      { full_name: "Bob Smith", salary: { amount: 40000, currency: "GBP", effective_date: "2022-01-01" } },
      { full_name: "Carol Diaz", salary: { amount: 1_800_000, currency: "INR", effective_date: "2022-01-01" } },
      { full_name: "David Lee", salary: { amount: 35000, currency: "GBP", effective_date: "2022-01-01" } },
      { full_name: "Frank Ocean", salary: { amount: 700000, currency: "INR", effective_date: "2022-01-01" } },
      { full_name: "Grace Hopper", salary: { amount: 120000, currency: "USD", effective_date: "2022-01-01" } },
    ]);
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

describe("createEmployee", () => {
  let db: Database.Database;

  const validInput = {
    full_name: "Priya Rao",
    email: "priya.rao@acme.test",
    department: "Engineering",
    title: "Software Engineer",
    level: "L2",
    country: "US",
    hire_date: "2023-09-01",
    salary: { amount: 95000, currency: "USD" },
  };

  beforeEach(() => {
    db = createConnection(":memory:");
  });

  afterEach(() => {
    db.close();
  });

  it("creates an employee with an initial current salary", () => {
    const employee = createEmployee(db, validInput) as any;

    expect(employee).toMatchObject({
      full_name: "Priya Rao",
      email: "priya.rao@acme.test",
      department: "Engineering",
      salary: { amount: 95000, currency: "USD", effective_date: "2023-09-01" },
    });
    expect(employee.id).toBeTypeOf("number");

    const stored = getEmployeeById(db, employee.id);
    expect(stored).toEqual(employee);
  });

  it("rejects a non-positive salary amount", () => {
    expect(() => createEmployee(db, { ...validInput, salary: { amount: 0, currency: "USD" } })).toThrow(
      ValidationError,
    );
    expect(() => createEmployee(db, { ...validInput, salary: { amount: -500, currency: "USD" } })).toThrow(
      ValidationError,
    );
  });

  it("rejects an unsupported currency", () => {
    expect(() =>
      createEmployee(db, { ...validInput, salary: { amount: 95000, currency: "XXX" } }),
    ).toThrow(ValidationError);
  });
});

describe("updateSalary", () => {
  let db: Database.Database;
  const today = new Date().toISOString().slice(0, 10);

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

  it("inserts a new current salary and expires the old one, dated today", () => {
    const employee = updateSalary(db, 1, { amount: 2000000, currency: "INR" });

    expect(employee.salary).toEqual({ amount: 2000000, currency: "INR", effective_date: today });

    const salaryRows = db.prepare("SELECT amount, is_current FROM salaries WHERE employee_id = 1 ORDER BY id").all();
    expect(salaryRows).toEqual([
      { amount: 1800000, is_current: 0 },
      { amount: 2000000, is_current: 1 },
    ]);
  });

  it("rejects a non-positive salary amount and leaves the current salary unchanged", () => {
    expect(() => updateSalary(db, 1, { amount: 0, currency: "INR" })).toThrow(ValidationError);
    expect(() => updateSalary(db, 1, { amount: -100, currency: "INR" })).toThrow(ValidationError);

    const employee = getEmployeeById(db, 1);
    expect(employee?.salary?.amount).toBe(1800000);
  });

  it("rejects an unsupported currency", () => {
    expect(() => updateSalary(db, 1, { amount: 2000000, currency: "XXX" })).toThrow(ValidationError);
  });

  it("throws NotFoundError for an unknown employee id", () => {
    expect(() => updateSalary(db, 999, { amount: 2000000, currency: "INR" })).toThrow(NotFoundError);
  });
});

describe("deactivateEmployee", () => {
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

  it("sets status to inactive without deleting the row", () => {
    const employee = deactivateEmployee(db, 1);

    expect(employee.status).toBe("inactive");

    const rowCount = (db.prepare("SELECT COUNT(*) AS count FROM employees").get() as { count: number }).count;
    expect(rowCount).toBe(1);
  });

  it("throws NotFoundError for an unknown employee id", () => {
    expect(() => deactivateEmployee(db, 999)).toThrow(NotFoundError);
  });
});

describe("updateEmployee", () => {
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

  it("updates the provided profile fields and leaves the rest unchanged", () => {
    const employee = updateEmployee(db, 1, { full_name: "Nina R. Patel", department: "Operations" });

    expect(employee.full_name).toBe("Nina R. Patel");
    expect(employee.department).toBe("Operations");
    expect(employee.title).toBe("Financial Analyst");
    expect(employee.email).toBe("nina.patel@acme.test");
  });

  it("supports a partial update of a single field", () => {
    const employee = updateEmployee(db, 1, { email: "nina.updated@acme.test" });

    expect(employee.email).toBe("nina.updated@acme.test");
    expect(employee.full_name).toBe("Nina Patel");
  });

  it("ignores status and salary fields, even if included in the input", () => {
    const employee = updateEmployee(db, 1, { status: "inactive", full_name: "Nina Patel" } as any);

    expect(employee.status).toBe("active");
  });

  it("throws NotFoundError for an unknown employee id", () => {
    expect(() => updateEmployee(db, 999, { full_name: "Nobody" })).toThrow(NotFoundError);
  });
});
