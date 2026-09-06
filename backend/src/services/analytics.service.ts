import type Database from "better-sqlite3";

export interface AnalyticsFilters {
  department?: string | string[];
  country?: string | string[];
  level?: string | string[];
}

export interface Kpis {
  totalPayrollUSD: number;
  activeHeadcount: number;
  avgSalaryUSD: number;
  medianSalaryUSD: number;
}

export interface DepartmentBreakdown {
  department: string;
  headcount: number;
  avgSalaryUSD: number;
  medianSalaryUSD: number;
}

export interface CountryBreakdown {
  country: string;
  avgSalaryUSD: number;
  medianSalaryUSD: number;
  totalPayrollUSD: number;
}

export interface DistributionBucket {
  label: string;
  count: number;
}

export interface CountryDistribution {
  country: string;
  buckets: DistributionBucket[];
}

export interface AnalyticsSummary {
  kpis: Kpis;
  byDepartment: DepartmentBreakdown[];
  byCountry: CountryBreakdown[];
  distributionByCountry: CountryDistribution[];
}

// Fixed bands so every country's distribution chart uses the same x-axis,
// per docs/TRD.md section 8.1. Upper bound is exclusive (e.g. exactly
// 120000 falls in "$120k–160k", not "$80k–120k").
const DISTRIBUTION_BANDS: { label: string; min: number; max: number }[] = [
  { label: "$0–40k", min: 0, max: 40_000 },
  { label: "$40k–80k", min: 40_000, max: 80_000 },
  { label: "$80k–120k", min: 80_000, max: 120_000 },
  { label: "$120k–160k", min: 120_000, max: 160_000 },
  { label: "$160k–200k", min: 160_000, max: 200_000 },
  { label: "$200k+", min: 200_000, max: Infinity },
];

interface EmployeeSalaryRow {
  department: string;
  country: string;
  amount: number;
  currency: string;
}

// SQLite has no median aggregate — computed here from sorted, USD-converted
// values, per docs/TRD.md section 8.1. Callers must pass values pre-sorted.
export function calculateMedian(sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;

  const mid = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 0) {
    return (sortedValues[mid - 1] + sortedValues[mid]) / 2;
  }
  return sortedValues[mid];
}

function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function bucketFor(amountUSD: number): string {
  const band = DISTRIBUTION_BANDS.find((b) => amountUSD >= b.min && amountUSD < b.max);
  // Every real amount is non-negative and the last band has no upper bound,
  // so a match always exists.
  return band!.label;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// Normalizes a scalar-or-array filter value to an array, dropping an unset
// or empty filter to `null` (meaning "no filter" — matches everything).
function normalizeFilter(value: string | string[] | undefined): string[] | null {
  if (value === undefined) return null;
  const values = Array.isArray(value) ? value : [value];
  return values.length === 0 ? null : values;
}

// Builds an `IN (@p0, @p1, ...)` clause for a normalized filter, or "1=1"
// (always true) when there's no filter to apply — so a multi-value filter
// (comparing several departments/countries side by side) is just the
// single-value case with more than one placeholder.
function buildInClause(
  column: string,
  values: string[] | null,
  paramPrefix: string,
): { clause: string; params: Record<string, string> } {
  if (values === null) return { clause: "1=1", params: {} };

  const params: Record<string, string> = {};
  const placeholders = values.map((v, i) => {
    const key = `${paramPrefix}${i}`;
    params[key] = v;
    return `@${key}`;
  });
  return { clause: `${column} IN (${placeholders.join(", ")})`, params };
}

// KPIs, breakdowns, and distributions are all derived from the same
// filtered, active-only, USD-normalized set of current salaries, so every
// figure in the response is consistent with every other.
export function getSummary(db: Database.Database, filters: AnalyticsFilters = {}): AnalyticsSummary {
  const department = buildInClause("e.department", normalizeFilter(filters.department), "department");
  const country = buildInClause("e.country", normalizeFilter(filters.country), "country");
  const level = buildInClause("e.level", normalizeFilter(filters.level), "level");

  const rows = db
    .prepare(
      `SELECT e.department AS department, e.country AS country, s.amount AS amount, s.currency AS currency
       FROM employees e
       JOIN salaries s ON s.employee_id = e.id AND s.is_current = 1
       WHERE e.status = 'active'
         AND ${department.clause}
         AND ${country.clause}
         AND ${level.clause}`,
    )
    .all({ ...department.params, ...country.params, ...level.params }) as EmployeeSalaryRow[];

  const rateRows = db.prepare("SELECT currency, rate_to_usd AS rateToUsd FROM exchange_rates").all() as {
    currency: string;
    rateToUsd: number;
  }[];
  const rateByCurrency = new Map<string, number>(rateRows.map((r) => [r.currency, r.rateToUsd]));
  const toUSD = (amount: number, currency: string): number =>
    currency === "USD" ? amount : amount * (rateByCurrency.get(currency) ?? 1);

  const usdAmounts: number[] = [];
  const byDepartmentAmounts = new Map<string, number[]>();
  const byCountryAmounts = new Map<string, number[]>();

  for (const row of rows) {
    const usd = toUSD(row.amount, row.currency);
    usdAmounts.push(usd);

    if (!byDepartmentAmounts.has(row.department)) byDepartmentAmounts.set(row.department, []);
    byDepartmentAmounts.get(row.department)!.push(usd);

    if (!byCountryAmounts.has(row.country)) byCountryAmounts.set(row.country, []);
    byCountryAmounts.get(row.country)!.push(usd);
  }

  const sortedAll = [...usdAmounts].sort((a, b) => a - b);
  const kpis: Kpis = {
    totalPayrollUSD: roundCurrency(usdAmounts.reduce((sum, v) => sum + v, 0)),
    activeHeadcount: usdAmounts.length,
    avgSalaryUSD: roundCurrency(average(usdAmounts)),
    medianSalaryUSD: roundCurrency(calculateMedian(sortedAll)),
  };

  const byDepartment: DepartmentBreakdown[] = [...byDepartmentAmounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([department, amounts]) => {
      const sorted = [...amounts].sort((a, b) => a - b);
      return {
        department,
        headcount: amounts.length,
        avgSalaryUSD: roundCurrency(average(amounts)),
        medianSalaryUSD: roundCurrency(calculateMedian(sorted)),
      };
    });

  const byCountry: CountryBreakdown[] = [...byCountryAmounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([country, amounts]) => {
      const sorted = [...amounts].sort((a, b) => a - b);
      return {
        country,
        avgSalaryUSD: roundCurrency(average(amounts)),
        medianSalaryUSD: roundCurrency(calculateMedian(sorted)),
        totalPayrollUSD: roundCurrency(amounts.reduce((sum, v) => sum + v, 0)),
      };
    });

  const distributionByCountry: CountryDistribution[] = [...byCountryAmounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([country, amounts]) => {
      const counts = new Map<string, number>(DISTRIBUTION_BANDS.map((b) => [b.label, 0]));
      for (const usd of amounts) {
        const label = bucketFor(usd);
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      return {
        country,
        buckets: DISTRIBUTION_BANDS.map((b) => ({ label: b.label, count: counts.get(b.label) ?? 0 })),
      };
    });

  return { kpis, byDepartment, byCountry, distributionByCountry };
}
