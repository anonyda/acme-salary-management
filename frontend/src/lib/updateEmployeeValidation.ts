import type { EmployeeWithSalary } from "@/api/client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface UpdateEmployeeFormValues {
  fullName: string;
  email: string;
  gender: string;
  title: string;
  department: string;
  country: string;
  level: string;
  hireDate: string;
  managerId: string;
}

export type UpdateEmployeeFormErrors = Partial<Record<keyof UpdateEmployeeFormValues, string>>;

export function employeeToUpdateForm(employee: EmployeeWithSalary): UpdateEmployeeFormValues {
  return {
    fullName: employee.full_name,
    email: employee.email,
    gender: employee.gender,
    title: employee.title,
    department: employee.department,
    country: employee.country,
    level: employee.level,
    hireDate: employee.hire_date,
    managerId: employee.manager_id != null ? String(employee.manager_id) : "",
  };
}

// Mirrors the server-side required fields in employees.service.ts
// (updateEmployee). Client-side validation is a UX nicety only — the
// backend still enforces its own rules (including manager existence,
// which needs a DB lookup this form can't do) regardless of what the
// client sends.
export function validateUpdateEmployeeForm(values: UpdateEmployeeFormValues): UpdateEmployeeFormErrors {
  const errors: UpdateEmployeeFormErrors = {};

  if (!values.fullName.trim()) errors.fullName = "Full name is required.";

  if (!values.email.trim()) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(values.email)) errors.email = "Enter a valid email address.";

  if (!values.gender) errors.gender = "Select a gender.";
  if (!values.title.trim()) errors.title = "Title is required.";
  if (!values.department) errors.department = "Select a department.";
  if (!values.country) errors.country = "Select a country.";
  if (!values.level) errors.level = "Select a level.";
  if (!values.hireDate) errors.hireDate = "Hire date is required.";

  if (values.managerId.trim() !== "" && !/^\d+$/.test(values.managerId.trim())) {
    errors.managerId = "Manager ID must be a whole number.";
  }

  return errors;
}
