# Technical Requirements Document (TRD)
## Employee Salary Management Software — ACME Org

**Author:** [Your Name]
**Date:** [Date]
**Status:** Draft — assumptions documented below where clarification was pending

---

## 1. Overview

ACME's HR team currently manages salary data for 10,000 employees across multiple countries via spreadsheets. This is slow, error-prone, and offers no way to answer aggregate questions about pay ("what's our average salary in Engineering vs Sales?", "what's our total payroll cost in Germany?").

This document specifies the technical design for a web-based Employee Salary Management system that replaces the spreadsheet workflow with a searchable, filterable system of record plus a basic analytics layer.

## 2. Goals

- Give the HR Manager a fast, reliable way to view, search, and update employee salary records at scale (10,000+ rows).
- Provide basic aggregate insight into how the org pays people, sliced by department and country.
- Demonstrate sound engineering practice: TDD, clean architecture, incremental delivery, and intentional use of AI tooling — this is as much an evaluation of process as of the finished product.

## 3. Persona

**HR Manager** — non-technical, comfortable with spreadsheets, needs:
- To look up any employee quickly (by name, department, country).
- To update an employee's salary when a raise happens.
- To add new employees as the org grows.
- To answer leadership questions like "how does our pay compare across departments/countries?" without exporting to Excel.

## 4. Scope

### 4.1 In Scope
- CRUD on employee records (create, view, update; soft-delete/deactivate rather than hard-delete)
- Salary field per employee, with currency
- Search employees by name/email
- Filter employees by department, country, level
- Server-side pagination (dataset is 10k+ rows — no client-side full-load)
- Basic analytics: average salary and headcount by department; average salary and total payroll by country
- Seed script generating 10,000 realistic employee + salary records

### 4.2 Explicitly Out of Scope (with reasoning)

| Cut | Reasoning |
|---|---|
| Authentication / RBAC | Assessment scope is the salary-management domain itself, not identity infrastructure. Assumed a single trusted HR-admin user. In production, this would be the first thing added (SSO + role-based access, since salary data is highly sensitive). |
| Salary history / audit trail | Only current salary is stored. A real HR tool would need point-in-time history for compliance and raise-tracking, but this adds meaningful schema/UI complexity for a time-boxed exercise. Noted as the top "next feature" candidate. |
| Bulk import/export (CSV/Excel) | High value in real use (this is literally what they're replacing) but orthogonal to demonstrating core engineering judgment; cut to protect time for correctness and tests. |
| Currency conversion/normalization | Salaries are stored and reported in their native currency. Cross-currency comparison (e.g., normalizing to USD) requires exchange-rate data and decisions about which rate/date to use — flagged as a real gap, not silently ignored. |
| Advanced analytics (pay equity/outlier detection) | Confirmed as basic-tier scope: avg/total by department and country only. Deeper statistical analysis (e.g., pay gap detection) is a distinct, valuable feature but out of scope here. |
| Notifications, approval workflows | Not needed for a single-admin tool at this scope. |

## 5. Assumptions (to be reconciled with any client clarification)

- **Countries covered:** 4 — United States (USD), United Kingdom (GBP), India (INR), Germany (EUR). Chosen for currency and salary-scale diversity.
- **Departments:** Engineering, Sales, Marketing, HR, Finance, Operations (6 total).
- **Levels/grades:** L1–L5 (junior to senior), used to generate realistic, non-random salary bands per country/department during seeding.
- **Pagination default:** 25 records per page, configurable via query param.
- **Employee status:** active/inactive flag; "delete" in the UI sets inactive rather than removing the row (avoids orphaning salary records, closer to real HR practice).

## 6. Data Model

```
Employee
├── id (PK)
├── full_name
├── email (unique)
├── department        (enum: Engineering, Sales, Marketing, HR, Finance, Operations)
├── title
├── level             (enum: L1–L5)
├── country            (enum: US, UK, IN, DE)
├── manager_id (FK → Employee.id, nullable)
├── hire_date
├── status            (active | inactive)
├── created_at / updated_at

Salary
├── id (PK)
├── employee_id (FK → Employee.id)
├── amount
├── currency          (USD | GBP | INR | EUR)
├── effective_date
├── is_current        (boolean — only one current salary per employee)
├── created_at
```

Salary is a separate table (not a column on Employee) even though history isn't a v1 feature — this keeps the schema forward-compatible with salary history at near-zero extra cost now, versus a painful migration later.

## 7. API Design

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/employees?page=&limit=&search=&department=&country=&level=` | Paginated, filtered, searchable employee list |
| GET | `/api/employees/:id` | Single employee detail (with current salary) |
| POST | `/api/employees` | Create employee (with initial salary) |
| PATCH | `/api/employees/:id` | Update employee profile fields |
| PATCH | `/api/employees/:id/salary` | Update current salary (validates positive amount, valid currency) |
| DELETE | `/api/employees/:id` | Soft-delete (sets status = inactive) |
| GET | `/api/analytics/summary` | Avg salary & headcount by department; avg salary & total payroll by country |

Response envelope for list endpoints includes `{ data, page, limit, total }` to support pagination UI.

## 8. Architecture

```
┌─────────────────┐        HTTPS        ┌──────────────────────┐        ┌──────────────┐
│  React + Vite    │  ───────────────▶  │  Express + TypeScript │ ──────▶ │  SQLite       │
│  (shadcn/ui)      │  ◀───────────────  │  (better-sqlite3)      │ ◀────── │  (file-based) │
│  Deployed: Vercel │        JSON         │  Deployed: Railway     │        └──────────────┘
└─────────────────┘                      └──────────────────────┘
```

- **Frontend/backend split** because `better-sqlite3` requires a persistent filesystem and a long-running process — incompatible with Vercel's serverless functions. Backend runs on Railway (persistent volume for the SQLite file); frontend is static and deploys cleanly to Vercel.
- **Service layer** (`/services`) separates business logic (pagination, validation, aggregation queries) from HTTP routing, so core logic is unit-testable without spinning up a server — supports fast, deterministic tests.
- **Raw SQL via `better-sqlite3`** instead of an ORM: at this scale (10k rows, single-writer, read-heavy) an ORM adds abstraction overhead without meaningful benefit; raw SQL keeps query performance/behavior transparent and easy to reason about.

## 9. Non-Functional Requirements

- Employee list queries must remain responsive (<300ms server-side) at 10k rows via proper indexing (on `department`, `country`, `email`) and server-side pagination — never load the full dataset into the client.
- Salary updates must be validated server-side (positive amount, valid currency, valid employee) regardless of client-side validation.
- Tests must run without network calls or a live server (in-memory/test SQLite DB, reset per test run).

## 10. Testing Strategy

- **Backend:** Vitest + Supertest. Unit tests on service-layer logic (pagination math, filter query building, salary validation, analytics aggregation correctness) + a smaller set of integration tests hitting the actual routes against a test DB.
- **Frontend:** Vitest + React Testing Library on key interactive components (search/filter behavior, salary edit form validation, pagination controls).
- Priority is meaningful coverage of core logic over raw coverage percentage — tests should catch real regressions, not pad a metric.

## 11. Seed Data

- `@faker-js/faker` generates 10,000 employees distributed realistically across the 4 countries, 6 departments, and 5 levels.
- Salaries generated from a per-country/per-level base band with variance, so analytics views (avg by department/country) produce believable, non-uniform results in the demo — not flat/random noise.

## 12. Deliverables Checklist

- [ ] This TRD + one-page requirements doc
- [ ] Architecture diagram (above, plus a rendered version)
- [ ] Git repo with incremental, meaningful commit history
- [ ] `AI_USAGE.md` — log of key prompts/decisions made with AI assistance
- [ ] Seed script (10,000 employees)
- [ ] Deployed, working frontend (Vercel) + backend (Railway)
- [ ] Test suite (backend + frontend)
- [ ] Demo video (3–5 min)
- [ ] README with setup/run instructions
