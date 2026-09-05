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
