import { type Currency, SUPPORTED_CURRENCIES } from "@/api/client";

// Mirrors the server-side rule in employees.service.ts (createEmployee /
// updateSalary): amount must be positive. Client-side validation is a UX
// nicety only — the backend still enforces this regardless of what the
// client sends.
export function validateSalaryAmount(amountInput: string): string | null {
  if (amountInput.trim() === "") return "Enter a salary amount.";

  const amount = Number(amountInput);
  if (Number.isNaN(amount)) return "Salary amount must be a number.";
  if (!(amount > 0)) return "Salary amount must be positive.";

  return null;
}

export function validateSalaryForm(amountInput: string, currency: string): string | null {
  const amountError = validateSalaryAmount(amountInput);
  if (amountError) return amountError;
  if (!SUPPORTED_CURRENCIES.includes(currency as Currency)) return "Select a valid currency.";

  return null;
}
