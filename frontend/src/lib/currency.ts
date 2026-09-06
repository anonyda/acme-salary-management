import type { Currency } from "@/api/client";

const LOCALE_BY_CURRENCY: Record<Currency, string> = {
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  INR: "en-IN",
};

export function formatCurrency(amount: number, currency: Currency): string {
  return new Intl.NumberFormat(LOCALE_BY_CURRENCY[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}
