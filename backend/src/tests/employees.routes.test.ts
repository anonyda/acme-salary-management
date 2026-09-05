import type Database from "better-sqlite3";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app.js";
import { createConnection } from "../db/connection.js";

function seedFixture(db: Database.Database): void {
  db.prepare(`
    INSERT INTO employees (full_name, email, department, title, level, country, hire_date)
    VALUES ('Nina Patel', 'nina.patel@acme.test', 'Finance', 'Financial Analyst', 'L3', 'IN', '2021-06-15')
  `).run();
  db.prepare(`
    INSERT INTO salaries (employee_id, amount, currency, effective_date, is_current)
    VALUES (1, 1800000, 'INR', '2021-06-15', 1)
  `).run();

  db.prepare(`
    INSERT INTO employees (full_name, email, department, title, level, country, hire_date)
    VALUES ('Owen Reyes', 'owen.reyes@acme.test', 'Engineering', 'Software Engineer', 'L2', 'US', '2022-03-01')
  `).run();
  db.prepare(`
    INSERT INTO salaries (employee_id, amount, currency, effective_date, is_current)
    VALUES (2, 95000, 'USD', '2022-03-01', 1)
  `).run();
}

describe("employees routes", () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = createConnection(":memory:");
    seedFixture(db);
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("GET /api/employees", () => {
    it("returns the paginated envelope with all seeded employees", async () => {
      const res = await request(app).get("/api/employees");

      expect(res.status).toBe(200);
      expect(res.body.page).toBe(1);
      expect(res.body.limit).toBe(25);
      expect(res.body.total).toBe(2);
      expect(res.body.data).toHaveLength(2);
    });

    it("filters by department via query params", async () => {
      const res = await request(app).get("/api/employees?department=Engineering");

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.data[0].full_name).toBe("Owen Reyes");
    });
  });

  describe("GET /api/employees/:id", () => {
    it("returns the employee with their current salary", async () => {
      const res = await request(app).get("/api/employees/1");

      expect(res.status).toBe(200);
      expect(res.body.full_name).toBe("Nina Patel");
      expect(res.body.salary).toEqual({ amount: 1800000, currency: "INR", effective_date: "2021-06-15" });
    });

    it("returns 404 for an unknown id", async () => {
      const res = await request(app).get("/api/employees/999");
      expect(res.status).toBe(404);
    });

    it("returns 400 for a non-numeric id", async () => {
      const res = await request(app).get("/api/employees/not-a-number");
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/employees", () => {
    const validBody = {
      full_name: "Priya Rao",
      email: "priya.rao@acme.test",
      department: "Engineering",
      title: "Software Engineer",
      level: "L2",
      country: "US",
      hire_date: "2023-09-01",
      salary: { amount: 95000, currency: "USD" },
    };

    it("creates an employee and returns 201 with the created record", async () => {
      const res = await request(app).post("/api/employees").send(validBody);

      expect(res.status).toBe(201);
      expect(res.body.full_name).toBe("Priya Rao");
      expect(res.body.salary).toEqual({ amount: 95000, currency: "USD", effective_date: "2023-09-01" });
    });

    it("returns 400 for a non-positive salary amount", async () => {
      const res = await request(app)
        .post("/api/employees")
        .send({ ...validBody, salary: { amount: 0, currency: "USD" } });

      expect(res.status).toBe(400);
    });

    it("returns 400 for an unsupported currency", async () => {
      const res = await request(app)
        .post("/api/employees")
        .send({ ...validBody, salary: { amount: 95000, currency: "XXX" } });

      expect(res.status).toBe(400);
    });
  });

  describe("PATCH /api/employees/:id/salary", () => {
    it("updates the current salary and returns the employee", async () => {
      const res = await request(app).patch("/api/employees/1/salary").send({ amount: 2000000, currency: "INR" });

      expect(res.status).toBe(200);
      expect(res.body.salary.amount).toBe(2000000);
      expect(res.body.salary.currency).toBe("INR");
    });

    it("returns 400 for a non-positive salary amount", async () => {
      const res = await request(app).patch("/api/employees/1/salary").send({ amount: -1, currency: "INR" });
      expect(res.status).toBe(400);
    });

    it("returns 400 for an unsupported currency", async () => {
      const res = await request(app).patch("/api/employees/1/salary").send({ amount: 2000000, currency: "XXX" });
      expect(res.status).toBe(400);
    });

    it("returns 404 for an unknown employee id", async () => {
      const res = await request(app).patch("/api/employees/999/salary").send({ amount: 2000000, currency: "INR" });
      expect(res.status).toBe(404);
    });
  });
});
