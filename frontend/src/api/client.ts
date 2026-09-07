// Typed client for the backend defined in docs/TRD.md section 7.
// In dev, requests use bare relative paths and rely on the Vite dev proxy
// (vite.config.ts) to forward /api and /health to the backend. In a
// deployed build, frontend and backend are separate deployments (Vercel +
// Railway) with no such proxy, so VITE_API_BASE_URL (set at build time —
// Vite inlines VITE_* vars into the static bundle, so this must be
// configured in the frontend's build environment, not read at runtime)
// prefixes every request with the backend's actual origin instead.

export type Department = "Engineering" | "Sales" | "Marketing" | "HR" | "Finance" | "Operations";
export type Level = "L1" | "L2" | "L3" | "L4" | "L5";
export type Country = "US" | "UK" | "IN" | "DE";
export type Currency = "USD" | "GBP" | "INR" | "EUR";
export type Gender = "Male" | "Female" | "Non-binary" | "Prefer not to say";
export type EmployeeStatus = "active" | "inactive";

export interface CurrentSalary {
  amount: number;
  currency: Currency;
  effective_date: string;
}

export interface Employee {
  id: number;
  full_name: string;
  email: string;
  gender: Gender;
  department: Department;
  title: string;
  level: Level;
  country: Country;
  manager_id: number | null;
  hire_date: string;
  status: EmployeeStatus;
  created_at: string;
  updated_at: string;
  salary: CurrentSalary | null;
}

export type EmployeeWithSalary = Employee;

export const SUPPORTED_CURRENCIES: Currency[] = ["USD", "GBP", "INR", "EUR"];
export const SUPPORTED_GENDERS: Gender[] = ["Male", "Female", "Non-binary", "Prefer not to say"];
export const DEPARTMENTS: Department[] = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Operations"];
export const LEVELS: Level[] = ["L1", "L2", "L3", "L4", "L5"];
export const COUNTRIES: Country[] = ["US", "UK", "IN", "DE"];

export interface ListEmployeesParams {
  page?: number;
  limit?: number;
  search?: string;
  department?: Department;
  country?: Country;
  level?: Level;
}

export interface ListEmployeesResponse {
  data: Employee[];
  page: number;
  limit: number;
  total: number;
}

export interface CreateEmployeeInput {
  full_name: string;
  email: string;
  gender: Gender;
  department: Department;
  title: string;
  level: Level;
  country: Country;
  manager_id?: number | null;
  hire_date: string;
  salary: {
    amount: number;
    currency: Currency;
  };
}

export interface UpdateEmployeeInput {
  full_name?: string;
  email?: string;
  gender?: Gender;
  department?: Department;
  title?: string;
  level?: Level;
  country?: Country;
  manager_id?: number | null;
  hire_date?: string;
}

export interface UpdateSalaryInput {
  amount: number;
  currency: Currency;
}

export interface AnalyticsFilters {
  department?: Department | Department[];
  country?: Country | Country[];
  level?: Level | Level[];
}

export interface AnalyticsKpis {
  totalPayrollUSD: number;
  activeHeadcount: number;
  avgSalaryUSD: number;
  medianSalaryUSD: number;
}

export interface DepartmentBreakdown {
  department: Department;
  headcount: number;
  avgSalaryUSD: number;
  medianSalaryUSD: number;
}

export interface CountryBreakdown {
  country: Country;
  avgSalaryUSD: number;
  medianSalaryUSD: number;
  totalPayrollUSD: number;
}

export interface DistributionBucket {
  label: string;
  count: number;
}

export interface CountryDistribution {
  country: Country;
  buckets: DistributionBucket[];
}

export interface AnalyticsSummary {
  kpis: AnalyticsKpis;
  byDepartment: DepartmentBreakdown[];
  byCountry: CountryBreakdown[];
  distributionByCountry: CountryDistribution[];
}

export interface HealthStatus {
  status: string;
}

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? "";
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(res.status, body?.error ?? res.statusText);
  }

  return res.json() as Promise<T>;
}

function toQueryString(params: object): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) query.append(key, String(item));
    } else {
      query.set(key, String(value));
    }
  }
  const qs = query.toString();
  return qs ? `?${qs}` : "";
}

// Note: the backend's health check is mounted at /health, not /api/health.
export function checkHealth(): Promise<HealthStatus> {
  return request<HealthStatus>("/health");
}

export function listEmployees(params: ListEmployeesParams = {}): Promise<ListEmployeesResponse> {
  return request<ListEmployeesResponse>(`/api/employees${toQueryString(params)}`);
}

export function getEmployee(id: number): Promise<EmployeeWithSalary> {
  return request<EmployeeWithSalary>(`/api/employees/${id}`);
}

export function createEmployee(input: CreateEmployeeInput): Promise<EmployeeWithSalary> {
  return request<EmployeeWithSalary>("/api/employees", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateEmployee(id: number, input: UpdateEmployeeInput): Promise<EmployeeWithSalary> {
  return request<EmployeeWithSalary>(`/api/employees/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function updateSalary(id: number, input: UpdateSalaryInput): Promise<EmployeeWithSalary> {
  return request<EmployeeWithSalary>(`/api/employees/${id}/salary`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function deactivateEmployee(id: number): Promise<EmployeeWithSalary> {
  return request<EmployeeWithSalary>(`/api/employees/${id}`, { method: "DELETE" });
}

export function getAnalyticsSummary(params: AnalyticsFilters = {}): Promise<AnalyticsSummary> {
  return request<AnalyticsSummary>(`/api/analytics/summary${toQueryString(params)}`);
}
