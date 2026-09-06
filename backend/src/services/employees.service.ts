import type Database from "better-sqlite3";

export interface ListEmployeesParams {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
  country?: string;
  level?: string;
}

export interface CurrentSalary {
  amount: number;
  currency: string;
  effective_date: string;
}

export interface ListEmployeesResult {
  data: (Record<string, unknown> & { salary: CurrentSalary | null })[];
  page: number;
  limit: number;
  total: number;
}

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export function listEmployees(db: Database.Database, params: ListEmployeesParams): ListEmployeesResult {
  const page = params.page && params.page > 0 ? Math.floor(params.page) : DEFAULT_PAGE;
  const limit = params.limit && params.limit > 0 ? Math.min(Math.floor(params.limit), MAX_LIMIT) : DEFAULT_LIMIT;
  const offset = (page - 1) * limit;

  const conditions: string[] = [];
  const values: Record<string, string> = {};

  if (params.search) {
    conditions.push("(e.full_name LIKE @search OR e.email LIKE @search)");
    values.search = `%${params.search}%`;
  }
  if (params.department) {
    conditions.push("e.department = @department");
    values.department = params.department;
  }
  if (params.country) {
    conditions.push("e.country = @country");
    values.country = params.country;
  }
  if (params.level) {
    conditions.push("e.level = @level");
    values.level = params.level;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM employees e ${whereClause}`).get(values) as { count: number }
  ).count;

  const rows = db
    .prepare(
      `SELECT e.*, s.amount AS salary_amount, s.currency AS salary_currency, s.effective_date AS salary_effective_date
       FROM employees e
       LEFT JOIN salaries s ON s.employee_id = e.id AND s.is_current = 1
       ${whereClause}
       ORDER BY e.full_name ASC
       LIMIT @limit OFFSET @offset`,
    )
    .all({ ...values, limit, offset }) as (Record<string, unknown> & {
    salary_amount: number | null;
    salary_currency: string | null;
    salary_effective_date: string | null;
  })[];

  const data = rows.map(({ salary_amount, salary_currency, salary_effective_date, ...employee }) => ({
    ...employee,
    salary:
      salary_amount != null
        ? { amount: salary_amount, currency: salary_currency as string, effective_date: salary_effective_date as string }
        : null,
  }));

  return { data, page, limit, total };
}

export interface EmployeeWithSalary {
  id: number;
  full_name: string;
  email: string;
  gender: string;
  department: string;
  title: string;
  level: string;
  country: string;
  manager_id: number | null;
  hire_date: string;
  status: string;
  created_at: string;
  updated_at: string;
  salary: CurrentSalary | null;
}

export function getEmployeeById(db: Database.Database, id: number): EmployeeWithSalary | undefined {
  const row = db
    .prepare(
      `SELECT e.*, s.amount AS salary_amount, s.currency AS salary_currency, s.effective_date AS salary_effective_date
       FROM employees e
       LEFT JOIN salaries s ON s.employee_id = e.id AND s.is_current = 1
       WHERE e.id = @id`,
    )
    .get({ id }) as
    | (Record<string, unknown> & {
        salary_amount: number | null;
        salary_currency: string | null;
        salary_effective_date: string | null;
      })
    | undefined;

  if (!row) return undefined;

  const { salary_amount, salary_currency, salary_effective_date, ...employee } = row;

  return {
    ...(employee as Omit<EmployeeWithSalary, "salary">),
    salary:
      salary_amount != null
        ? { amount: salary_amount, currency: salary_currency as string, effective_date: salary_effective_date as string }
        : null,
  };
}

export class ValidationError extends Error {}

const SUPPORTED_CURRENCIES = ["USD", "GBP", "INR", "EUR"];

export interface CreateEmployeeInput {
  full_name: string;
  email: string;
  gender: string;
  department: string;
  title: string;
  level: string;
  country: string;
  manager_id?: number | null;
  hire_date: string;
  salary: { amount: number; currency: string };
}

export function createEmployee(db: Database.Database, input: CreateEmployeeInput): EmployeeWithSalary {
  if (!(input.salary.amount > 0)) {
    throw new ValidationError("Salary amount must be positive");
  }
  if (!SUPPORTED_CURRENCIES.includes(input.salary.currency)) {
    throw new ValidationError(`Currency must be one of ${SUPPORTED_CURRENCIES.join(", ")}`);
  }

  const { lastInsertRowid } = db
    .prepare(
      `INSERT INTO employees (full_name, email, gender, department, title, level, country, manager_id, hire_date)
       VALUES (@full_name, @email, @gender, @department, @title, @level, @country, @manager_id, @hire_date)`,
    )
    .run({
      full_name: input.full_name,
      email: input.email,
      gender: input.gender,
      department: input.department,
      title: input.title,
      level: input.level,
      country: input.country,
      manager_id: input.manager_id ?? null,
      hire_date: input.hire_date,
    });

  db.prepare(
    `INSERT INTO salaries (employee_id, amount, currency, effective_date, is_current)
     VALUES (@employee_id, @amount, @currency, @effective_date, 1)`,
  ).run({
    employee_id: lastInsertRowid,
    amount: input.salary.amount,
    currency: input.salary.currency,
    effective_date: input.hire_date,
  });

  return getEmployeeById(db, Number(lastInsertRowid)) as EmployeeWithSalary;
}

export class NotFoundError extends Error {}

export interface UpdateSalaryInput {
  amount: number;
  currency: string;
}

export function updateSalary(db: Database.Database, employeeId: number, input: UpdateSalaryInput): EmployeeWithSalary {
  if (!(input.amount > 0)) {
    throw new ValidationError("Salary amount must be positive");
  }
  if (!SUPPORTED_CURRENCIES.includes(input.currency)) {
    throw new ValidationError(`Currency must be one of ${SUPPORTED_CURRENCIES.join(", ")}`);
  }

  const employee = db.prepare("SELECT id FROM employees WHERE id = @id").get({ id: employeeId });
  if (!employee) {
    throw new NotFoundError(`Employee ${employeeId} not found`);
  }

  const effectiveDate = new Date().toISOString().slice(0, 10);

  const applyUpdate = db.transaction(() => {
    db.prepare("UPDATE salaries SET is_current = 0 WHERE employee_id = @employeeId AND is_current = 1").run({
      employeeId,
    });
    db.prepare(
      `INSERT INTO salaries (employee_id, amount, currency, effective_date, is_current)
       VALUES (@employeeId, @amount, @currency, @effectiveDate, 1)`,
    ).run({ employeeId, amount: input.amount, currency: input.currency, effectiveDate });
  });
  applyUpdate();

  return getEmployeeById(db, employeeId) as EmployeeWithSalary;
}

export function deactivateEmployee(db: Database.Database, id: number): EmployeeWithSalary {
  const result = db
    .prepare("UPDATE employees SET status = 'inactive', updated_at = datetime('now') WHERE id = @id")
    .run({ id });

  if (result.changes === 0) {
    throw new NotFoundError(`Employee ${id} not found`);
  }

  return getEmployeeById(db, id) as EmployeeWithSalary;
}

// Deliberately excludes status (use deactivateEmployee) and salary fields
// (use updateSalary) — those go through their own endpoints.
const UPDATABLE_PROFILE_FIELDS = [
  "full_name",
  "email",
  "gender",
  "department",
  "title",
  "level",
  "country",
  "manager_id",
  "hire_date",
] as const;

export type UpdateEmployeeInput = Partial<Record<(typeof UPDATABLE_PROFILE_FIELDS)[number], unknown>>;

export function updateEmployee(db: Database.Database, id: number, input: UpdateEmployeeInput): EmployeeWithSalary {
  const fieldsToUpdate = UPDATABLE_PROFILE_FIELDS.filter((field) => field in input);

  if (fieldsToUpdate.length === 0) {
    if (!getEmployeeById(db, id)) {
      throw new NotFoundError(`Employee ${id} not found`);
    }
    return getEmployeeById(db, id) as EmployeeWithSalary;
  }

  const setClause = fieldsToUpdate.map((field) => `${field} = @${field}`).join(", ");
  const values: Record<string, unknown> = { id };
  for (const field of fieldsToUpdate) values[field] = input[field];

  const result = db.prepare(`UPDATE employees SET ${setClause}, updated_at = datetime('now') WHERE id = @id`).run(values);

  if (result.changes === 0) {
    throw new NotFoundError(`Employee ${id} not found`);
  }

  return getEmployeeById(db, id) as EmployeeWithSalary;
}
