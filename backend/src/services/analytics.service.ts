import type Database from "better-sqlite3";

export interface DepartmentSummary {
  department: string;
  headcount: number;
  average_salary: number;
}

export interface CountrySummary {
  country: string;
  average_salary: number;
  total_payroll: number;
}

export interface AnalyticsSummary {
  by_department: DepartmentSummary[];
  by_country: CountrySummary[];
}

// Both aggregates cover active employees only (soft-deleted employees are
// excluded, since they no longer reflect current payroll cost).
export function getAnalyticsSummary(db: Database.Database): AnalyticsSummary {
  // Department averages mix native currencies across countries (e.g. USD
  // and GBP within Engineering) — no conversion/normalization is done,
  // per docs/TRD.md section 4.2, a documented scope cut, not an oversight.
  const by_department = db
    .prepare(
      `SELECT e.department AS department,
              COUNT(*) AS headcount,
              ROUND(AVG(s.amount), 2) AS average_salary
       FROM employees e
       JOIN salaries s ON s.employee_id = e.id AND s.is_current = 1
       WHERE e.status = 'active'
       GROUP BY e.department
       ORDER BY e.department`,
    )
    .all() as DepartmentSummary[];

  const by_country = db
    .prepare(
      `SELECT e.country AS country,
              ROUND(AVG(s.amount), 2) AS average_salary,
              ROUND(SUM(s.amount), 2) AS total_payroll
       FROM employees e
       JOIN salaries s ON s.employee_id = e.id AND s.is_current = 1
       WHERE e.status = 'active'
       GROUP BY e.country
       ORDER BY e.country`,
    )
    .all() as CountrySummary[];

  return { by_department, by_country };
}
