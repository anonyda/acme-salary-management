# Technical Requirements Document (TRD)
## Employee Salary Management Software — ACME Org

**Author:** Nida Shaikh
**Date:** 05/09/26
**Status:** Complete - doubts clarified

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
| Authentication / RBAC | Confirmed out of scope by client: app is internal, user is an already-authorized, single HR Manager. Documented here as a future production consideration (SSO + role-based access), given salary data sensitivity. |
| Salary history / audit trail | Confirmed out of scope by client: only current salary per employee is required. Schema remains forward-compatible (salary is its own table, not a column), but historical revision tracking and merit-increase dates are deferred as future enhancements. |
| Bulk import/export (CSV/Excel) | High value in real use (this is literally what they're replacing) but orthogonal to demonstrating core engineering judgment; cut to protect time for correctness and tests. |
| Live/real-time exchange rates | Currency normalization to USD is in scope for reporting (see section 6/8), but rates are a seeded fixed snapshot rather than fetched from a live FX API — a reasonable simplification for this exercise. A production system would refresh and version rates by date. |
| Natural-language / AI query interface | Confirmed strictly optional stretch scope by client. Predefined visual dashboards (KPIs, breakdowns, distribution) cover the core MVP. |
| Advanced pay-equity analytics (outlier detection, gap analysis) | Core MVP is covered by KPI cards, department/country breakdowns, and salary distribution by country. Deeper statistical fairness analysis is a distinct, larger feature. |
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
├── gender            (enum: Male, Female, Non-binary, Prefer not to say)
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

ExchangeRate
├── id (PK)
├── currency          (GBP | INR | EUR — non-base currencies; USD is the base, rate = 1 implicitly)
├── rate_to_usd
├── as_of_date
```

Salary is a separate table (not a column on Employee) even though history isn't a v1 feature — this keeps the schema forward-compatible with salary history at near-zero extra cost now, versus a painful migration later.

`ExchangeRate` is seeded as a fixed snapshot (not fetched live) — individual employee records always display and edit in native currency; conversion to the USD base reporting currency happens only at the analytics/aggregation layer, using the latest seeded rate per currency.

## 7. API Design

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/employees?page=&limit=&search=&department=&country=&level=` | Paginated, filtered, searchable employee list |
| GET | `/api/employees/:id` | Single employee detail (with current salary) |
| POST | `/api/employees` | Create employee (with initial salary) |
| PATCH | `/api/employees/:id` | Update employee profile fields |
| PATCH | `/api/employees/:id/salary` | Update current salary (validates positive amount, valid currency) |
| DELETE | `/api/employees/:id` | Soft-delete (sets status = inactive) |
| GET | `/api/analytics/summary?department=&country=&level=` | KPI cards (total global payroll spend, active headcount, average salary, median salary — all normalized to USD), department breakdown (avg/median/headcount), country breakdown (avg/median/total payroll), salary distribution buckets by country. Accepts optional filters that scope all figures. |

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

## 8.1 Analytics Implementation Notes

- **Currency normalization:** `analyticsService` joins each salary's currency against `ExchangeRate` and converts to USD before any aggregation. Native-currency values are never altered — normalization happens only in the read path for reporting.
- **Median calculation:** SQLite has no native `MEDIAN()`/`PERCENTILE_CONT` aggregate. Rather than approximate it in SQL, the service layer fetches sorted USD-normalized amounts per group and computes the median in TypeScript. This keeps the SQL simple and the median logic independently unit-testable (odd/even count cases, single-record groups, empty groups).
- **Salary distribution by country:** implemented as bucketed histogram data (fixed USD bands, e.g., $0–40k, $40–80k, etc.) per country, so the frontend can render a comparable distribution chart across countries despite different native pay scales.

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
- Salaries generated from a per-country/per-level base band with variance, so analytics views (avg/median by department/country) produce believable, non-uniform results in the demo — not flat/random noise.
- `ExchangeRate` table seeded with fixed, realistic snapshot rates for GBP, INR, and EUR to USD.

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