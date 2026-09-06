import { type Currency, SUPPORTED_CURRENCIES } from "@/api/client";
import { validateSalaryAmount } from "@/lib/salaryValidation";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CreateEmployeeFormValues {
  fullName: string;
  email: string;
  title: string;
  department: string;
  country: string;
  level: string;
  hireDate: string;
  salaryAmount: string;
  salaryCurrency: string;
}

export type CreateEmployeeFormErrors = Partial<Record<keyof CreateEmployeeFormValues, string>>;

export const emptyCreateEmployeeForm: CreateEmployeeFormValues = {
  fullName: "",
  email: "",
  title: "",
  department: "",
  country: "",
  level: "",
  hireDate: "",
  salaryAmount: "",
  salaryCurrency: "",
};

// Mirrors the server-side required fields and salary rules in
// employees.service.ts (createEmployee). Client-side validation is a UX
// nicety only — the backend still enforces its own rules regardless of
// what the client sends.
export function validateCreateEmployeeForm(values: CreateEmployeeFormValues): CreateEmployeeFormErrors {
  const errors: CreateEmployeeFormErrors = {};

  if (!values.fullName.trim()) errors.fullName = "Full name is required.";

  if (!values.email.trim()) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(values.email)) errors.email = "Enter a valid email address.";

  if (!values.title.trim()) errors.title = "Title is required.";
  if (!values.department) errors.department = "Select a department.";
  if (!values.country) errors.country = "Select a country.";
  if (!values.level) errors.level = "Select a level.";
  if (!values.hireDate) errors.hireDate = "Hire date is required.";

  const amountError = validateSalaryAmount(values.salaryAmount);
  if (amountError) errors.salaryAmount = amountError;

  if (!values.salaryCurrency || !SUPPORTED_CURRENCIES.includes(values.salaryCurrency as Currency)) {
    errors.salaryCurrency = "Select a currency.";
  }

  return errors;
}
