import { type Currency, SUPPORTED_CURRENCIES } from "@/api/client";

// Mirrors the server-side rules in employees.service.ts (updateSalary):
// amount must be positive, currency must be one of the supported set.
// Client-side validation is a UX nicety only — the backend still enforces
// both regardless of what the client sends.
export function validateSalaryForm(amountInput: string, currency: string): string | null {
  if (amountInput.trim() === "") return "Enter a salary amount.";

  const amount = Number(amountInput);
  if (Number.isNaN(amount)) return "Salary amount must be a number.";
  if (!(amount > 0)) return "Salary amount must be positive.";
  if (!SUPPORTED_CURRENCIES.includes(currency as Currency)) return "Select a valid currency.";

  return null;
}
