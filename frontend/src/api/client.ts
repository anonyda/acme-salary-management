// Typed client for the backend defined in docs/TRD.md section 7.
// Requests use relative paths and rely on the Vite dev proxy (vite.config.ts)
// to forward /api and /health to the backend during development.

export type Department = "Engineering" | "Sales" | "Marketing" | "HR" | "Finance" | "Operations";
export type Level = "L1" | "L2" | "L3" | "L4" | "L5";
export type Country = "US" | "UK" | "IN" | "DE";
export type Currency = "USD" | "GBP" | "INR" | "EUR";
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

export interface DepartmentSummary {
  department: Department;
  headcount: number;
  average_salary: number;
}

export interface CountrySummary {
  country: Country;
  average_salary: number;
  total_payroll: number;
}

export interface AnalyticsSummary {
  by_department: DepartmentSummary[];
  by_country: CountrySummary[];
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
  const res = await fetch(path, {
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
    if (value !== undefined && value !== "") query.set(key, String(value));
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

export function getAnalyticsSummary(): Promise<AnalyticsSummary> {
  return request<AnalyticsSummary>("/api/analytics/summary");
}
