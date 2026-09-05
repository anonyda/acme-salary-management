import type Database from "better-sqlite3";

export interface ListEmployeesParams {
  page?: number;
  limit?: number;
  search?: string;
  department?: string;
  country?: string;
  level?: string;
}

export interface ListEmployeesResult {
  data: unknown[];
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
    conditions.push("(full_name LIKE @search OR email LIKE @search)");
    values.search = `%${params.search}%`;
  }
  if (params.department) {
    conditions.push("department = @department");
    values.department = params.department;
  }
  if (params.country) {
    conditions.push("country = @country");
    values.country = params.country;
  }
  if (params.level) {
    conditions.push("level = @level");
    values.level = params.level;
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const total = (
    db.prepare(`SELECT COUNT(*) AS count FROM employees ${whereClause}`).get(values) as { count: number }
  ).count;

  const data = db
    .prepare(`SELECT * FROM employees ${whereClause} ORDER BY full_name ASC LIMIT @limit OFFSET @offset`)
    .all({ ...values, limit, offset });

  return { data, page, limit, total };
}

export interface CurrentSalary {
  amount: number;
  currency: string;
  effective_date: string;
}

export interface EmployeeWithSalary {
  id: number;
  full_name: string;
  email: string;
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
