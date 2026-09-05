import { faker } from "@faker-js/faker";
import type Database from "better-sqlite3";
import { pathToFileURL } from "node:url";
import { createConnection } from "./connection.js";

// Deterministic output so the demo dataset (and its analytics numbers)
// are reproducible across machines and re-seeds.
faker.seed(42);

const DEPARTMENTS = ["Engineering", "Sales", "Marketing", "HR", "Finance", "Operations"] as const;
const LEVELS = ["L1", "L2", "L3", "L4", "L5"] as const;
const COUNTRIES = ["US", "UK", "IN", "DE"] as const;

type Department = (typeof DEPARTMENTS)[number];
type Level = (typeof LEVELS)[number];
type Country = (typeof COUNTRIES)[number];

const CURRENCY_BY_COUNTRY: Record<Country, string> = {
  US: "USD",
  UK: "GBP",
  IN: "INR",
  DE: "EUR",
};

// Fixed snapshot rates for USD-normalized reporting (TRD section 6/8.1) —
// not fetched from a live FX API. USD itself is the base and isn't stored
// (see schema.sql). Approximate, illustrative rates, not sourced market data.
const EXCHANGE_RATES: { currency: "GBP" | "INR" | "EUR"; rateToUsd: number }[] = [
  { currency: "GBP", rateToUsd: 1.27 },
  { currency: "EUR", rateToUsd: 1.09 },
  { currency: "INR", rateToUsd: 0.012 },
];
const EXCHANGE_RATE_AS_OF_DATE = "2026-01-01";

// [min, max] annual base salary in the country's native currency, per level.
// Approximate market bands, not sourced payroll data — chosen so the
// analytics views (avg by department/country) show believable, non-flat
// results, per docs/TRD.md section 11.
const SALARY_BANDS: Record<Country, Record<Level, [number, number]>> = {
  US: {
    L1: [60_000, 75_000],
    L2: [78_000, 95_000],
    L3: [100_000, 125_000],
    L4: [130_000, 160_000],
    L5: [165_000, 210_000],
  },
  UK: {
    L1: [32_000, 42_000],
    L2: [42_000, 55_000],
    L3: [55_000, 70_000],
    L4: [72_000, 90_000],
    L5: [95_000, 120_000],
  },
  DE: {
    L1: [45_000, 55_000],
    L2: [55_000, 68_000],
    L3: [68_000, 85_000],
    L4: [88_000, 110_000],
    L5: [115_000, 145_000],
  },
  IN: {
    L1: [600_000, 900_000],
    L2: [900_000, 1_400_000],
    L3: [1_400_000, 2_200_000],
    L4: [2_200_000, 3_500_000],
    L5: [3_500_000, 5_500_000],
  },
};

// Department-neutral role noun used to build a title from level + department.
const ROLE_NOUN_BY_DEPARTMENT: Record<Department, string> = {
  Engineering: "Software Engineer",
  Sales: "Account Executive",
  Marketing: "Marketing Specialist",
  HR: "HR Generalist",
  Finance: "Financial Analyst",
  Operations: "Operations Analyst",
};

const TITLE_PREFIX_BY_LEVEL: Record<Level, string> = {
  L1: "Associate",
  L2: "",
  L3: "Senior",
  L4: "Staff",
  L5: "Principal",
};

// Org shaped like a pyramid: more juniors than seniors.
const LEVEL_WEIGHTS: { weight: number; value: Level }[] = [
  { weight: 35, value: "L1" },
  { weight: 28, value: "L2" },
  { weight: 20, value: "L3" },
  { weight: 12, value: "L4" },
  { weight: 5, value: "L5" },
];

// Headcount weighted toward the org's larger markets (US, India).
const COUNTRY_WEIGHTS: { weight: number; value: Country }[] = [
  { weight: 35, value: "US" },
  { weight: 30, value: "IN" },
  { weight: 20, value: "UK" },
  { weight: 15, value: "DE" },
];

// A handful of past deactivations, so the "inactive" status/filter path
// has real data to exercise rather than being permanently empty.
const STATUS_WEIGHTS: { weight: number; value: "active" | "inactive" }[] = [
  { weight: 96, value: "active" },
  { weight: 4, value: "inactive" },
];

function buildTitle(department: Department, level: Level): string {
  const prefix = TITLE_PREFIX_BY_LEVEL[level];
  const roleNoun = ROLE_NOUN_BY_DEPARTMENT[department];
  return prefix ? `${prefix} ${roleNoun}` : roleNoun;
}

function buildEmail(fullName: string, index: number): string {
  const slug = fullName
    .toLowerCase()
    .replace(/[^a-z]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `${slug}.${index + 1}@acme-corp.test`;
}

function randomSalaryAmount(country: Country, level: Level): number {
  const [min, max] = SALARY_BANDS[country][level];
  return Math.round(faker.number.int({ min, max }) / 100) * 100;
}

// Tracks manager candidates seen so far, per department + level, so a
// manager can only be someone already-inserted and strictly more senior —
// satisfies the manager_id self-referencing FK without a second pass.
type ManagerPools = Record<Department, Record<Level, number[]>>;

function createEmptyManagerPools(): ManagerPools {
  const pools = {} as ManagerPools;
  for (const department of DEPARTMENTS) {
    pools[department] = { L1: [], L2: [], L3: [], L4: [], L5: [] };
  }
  return pools;
}

function pickManagerId(department: Department, level: Level, pools: ManagerPools): number | null {
  const levelIndex = LEVELS.indexOf(level);
  const candidates = LEVELS.slice(levelIndex + 1).flatMap((seniorLevel) => pools[department][seniorLevel]);
  if (candidates.length === 0) return null;
  return faker.helpers.arrayElement(candidates);
}

function seedEmployeesAndSalaries(db: Database.Database, count: number): void {
  db.exec("DELETE FROM salaries; DELETE FROM employees; DELETE FROM sqlite_sequence WHERE name IN ('employees', 'salaries');");

  const insertEmployee = db.prepare(`
    INSERT INTO employees (full_name, email, department, title, level, country, manager_id, hire_date, status)
    VALUES (@fullName, @email, @department, @title, @level, @country, @managerId, @hireDate, @status)
  `);
  const insertSalary = db.prepare(`
    INSERT INTO salaries (employee_id, amount, currency, effective_date, is_current)
    VALUES (@employeeId, @amount, @currency, @effectiveDate, 1)
  `);

  const seedAll = db.transaction((rowCount: number) => {
    const managerPools = createEmptyManagerPools();

    for (let i = 0; i < rowCount; i++) {
      const fullName = faker.person.fullName();
      const department = faker.helpers.arrayElement(DEPARTMENTS);
      const level = faker.helpers.weightedArrayElement(LEVEL_WEIGHTS);
      const country = faker.helpers.weightedArrayElement(COUNTRY_WEIGHTS);
      const status = faker.helpers.weightedArrayElement(STATUS_WEIGHTS);
      const hireDate = faker.date.past({ years: 8 }).toISOString().slice(0, 10);
      const managerId = pickManagerId(department, level, managerPools);

      const { lastInsertRowid: employeeId } = insertEmployee.run({
        fullName,
        email: buildEmail(fullName, i),
        department,
        title: buildTitle(department, level),
        level,
        country,
        managerId,
        hireDate,
        status,
      });

      insertSalary.run({
        employeeId,
        amount: randomSalaryAmount(country, level),
        currency: CURRENCY_BY_COUNTRY[country],
        effectiveDate: hireDate,
      });

      managerPools[department][level].push(Number(employeeId));

      if ((i + 1) % 2000 === 0) {
        console.log(`Seeded ${i + 1}/${rowCount} employees...`);
      }
    }
  });

  seedAll(count);
}

// Always replaces the 3 rows with fresh fixed-snapshot values — safe to
// call on every seed run, whether or not employee seeding ran this time.
function upsertExchangeRates(db: Database.Database): void {
  const deleteExisting = db.prepare("DELETE FROM exchange_rates WHERE currency = @currency");
  const insert = db.prepare(`
    INSERT INTO exchange_rates (currency, rate_to_usd, as_of_date)
    VALUES (@currency, @rateToUsd, @asOfDate)
  `);

  const upsertAll = db.transaction(() => {
    for (const { currency, rateToUsd } of EXCHANGE_RATES) {
      deleteExisting.run({ currency });
      insert.run({ currency, rateToUsd, asOfDate: EXCHANGE_RATE_AS_OF_DATE });
    }
  });

  upsertAll();
}

export function seedDatabase(db: Database.Database, count: number): void {
  const existingEmployeeCount = (db.prepare("SELECT COUNT(*) AS n FROM employees").get() as { n: number }).n;

  if (existingEmployeeCount >= count) {
    console.log(`Employees table already has ${existingEmployeeCount} rows (>= ${count}) — skipping employee/salary seeding.`);
  } else {
    seedEmployeesAndSalaries(db, count);
  }

  upsertExchangeRates(db);
}

const isMainModule = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  const DB_PATH = process.env.DB_PATH ?? "./data/acme.sqlite";
  const EMPLOYEE_COUNT = 10_000;

  const db = createConnection(DB_PATH);
  const start = Date.now();
  seedDatabase(db, EMPLOYEE_COUNT);
  db.close();

  console.log(`Seed run complete in ${Date.now() - start}ms → ${DB_PATH}`);
}
