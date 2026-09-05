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
