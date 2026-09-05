-- Schema per docs/TRD.md section 6 (Data Model).
-- No seed data or migrations logic here — structure only.

CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  department TEXT NOT NULL CHECK (department IN ('Engineering', 'Sales', 'Marketing', 'HR', 'Finance', 'Operations')),
  title TEXT NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('L1', 'L2', 'L3', 'L4', 'L5')),
  country TEXT NOT NULL CHECK (country IN ('US', 'UK', 'IN', 'DE')),
  manager_id INTEGER REFERENCES employees(id),
  hire_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_employees_department ON employees(department);
CREATE INDEX IF NOT EXISTS idx_employees_country ON employees(country);
CREATE INDEX IF NOT EXISTS idx_employees_email ON employees(email);

CREATE TABLE IF NOT EXISTS salaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  amount REAL NOT NULL,
  currency TEXT NOT NULL CHECK (currency IN ('USD', 'GBP', 'INR', 'EUR')),
  effective_date TEXT NOT NULL,
  is_current INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_salaries_employee_id ON salaries(employee_id);

-- Enforces "only one current salary per employee" (TRD section 6).
CREATE UNIQUE INDEX IF NOT EXISTS idx_salaries_one_current_per_employee
  ON salaries(employee_id)
  WHERE is_current = 1;

-- Seeded fixed-snapshot rates for reporting-layer USD normalization (TRD
-- section 6/8.1). USD itself is the base (implicit rate of 1) and is
-- deliberately not stored here. One row per currency — the seed script
-- upserts (delete + reinsert) rather than accumulating a rate history;
-- no uniqueness constraint here since that's a seeding-time convention,
-- not a value SQLite needs to enforce.
CREATE TABLE IF NOT EXISTS exchange_rates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  currency TEXT NOT NULL CHECK (currency IN ('GBP', 'INR', 'EUR')),
  rate_to_usd REAL NOT NULL,
  as_of_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_exchange_rates_currency ON exchange_rates(currency);
