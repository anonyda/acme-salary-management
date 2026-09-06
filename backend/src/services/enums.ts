// Single source of truth for the fixed value sets enforced by schema.sql's
// CHECK constraints, so employees.service.ts and analytics.service.ts don't
// each maintain their own copy that can silently drift out of sync.

export const DEPARTMENTS = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Operations"] as const;
export const LEVELS = ["L1", "L2", "L3", "L4", "L5"] as const;
export const COUNTRIES = ["US", "UK", "IN", "DE"] as const;
export const GENDERS = ["Male", "Female", "Non-binary", "Prefer not to say"] as const;
export const CURRENCIES = ["USD", "GBP", "INR", "EUR"] as const;

export type Department = (typeof DEPARTMENTS)[number];
export type Level = (typeof LEVELS)[number];
export type Country = (typeof COUNTRIES)[number];
export type Gender = (typeof GENDERS)[number];
export type Currency = (typeof CURRENCIES)[number];
