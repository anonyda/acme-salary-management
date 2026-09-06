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

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    amount,
  );
}

// Stat-tile figures use auto-compact notation (e.g. $620.2M) — full digits
// on a headline number are harder to parse at a glance than 3 significant figures.
export function formatCompactUSD(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
}
