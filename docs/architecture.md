# Architecture & Trade-offs

This document walks through the significant technical decisions made while designing and building the system, what alternatives I considered, and what trade-offs I accepted. The goal isn't just to list what got built, but to explain why, so a reviewer can follow the reasoning rather than just the outcome.

---

## 1. Backend: Node.js + TypeScript + Express

**Alternatives considered:** NestJS, which gives you more structure and dependency injection out of the box, and Fastify, which has better raw throughput.

**Decision:** Express plus TypeScript.

**Reasoning:** NestJS's decorator-based DI and module system really earn their keep at large team scale, but for a single-service app of this size, that structure is mostly ceremony. Express, combined with a disciplined manual split between routes and services (more on that below), gets me the same testability without the framework overhead.

**Trade-off accepted:** I don't get built-in dependency injection or module boundaries. I'm enforcing that through convention instead, documented in `CLAUDE.md`. If the codebase grew a lot, this would be worth revisiting.

---

## 2. Database: SQLite via `better-sqlite3`, raw SQL, no ORM

**Alternatives considered:** PostgreSQL, and layering Prisma or Drizzle on top of SQLite as an ORM.

**Decision:** Raw SQL via `better-sqlite3`, no ORM, no Postgres.

**Reasoning:** 10,000 rows just isn't a scale problem for SQLite. This system also effectively has one writer, a single HR admin, so I'm never really exercising the concurrent-write strengths that make Postgres worth reaching for. Raw SQL keeps my queries transparent and avoids the overhead of learning and configuring an ORM for a dataset this small.

**Trade-off accepted:** SQLite is single-writer and doesn't scale horizontally the way a managed Postgres instance would. There's also no migration tooling: adding the `ExchangeRate` table was a straightforward idempotent `CREATE TABLE IF NOT EXISTS` addition, but adding the `gender` column later meant editing `schema.sql`'s existing `CREATE TABLE` statement directly, which only takes effect for a fresh database — an already-populated one has to be deleted and reseeded rather than migrated in place. That's fine at this scope, but it's a production gap worth naming: a real multi-user launch would move to Postgres with proper versioned migrations before scaling past a single admin user.

---

## 3. Frontend: React + Vite + TypeScript + shadcn/ui + recharts

**Alternatives considered:** Next.js for the framework, MUI or Ant Design for components.

**Decision:** Vite (no SSR or SEO need for an internal admin tool), shadcn/ui, and recharts.

**Reasoning:** shadcn gives you unstyled, composable primitives instead of an opinionated pre-styled library, so I get more control over visual polish without a lot of extra code. recharts fits naturally with React state, which matters for a dashboard that has to re-render whenever a filter changes.

**Trade-off accepted:** shadcn asks for more manual composition per component than something like MUI would. I write more code, but I get more control over how it looks.

---

## 4. Data model: Salary as its own table, not a column on Employee

**Alternative considered:** putting `salary_amount` and `salary_currency` directly on the Employee table.

**Decision:** Give Salary its own table, with one row per employee marked as current.

**Reasoning:** Salary history is explicitly out of scope for this build, but keeping salary as its own table costs nothing right now, and it means adding history later (multiple rows per employee instead of overwriting the current one) is a natural extension rather than a schema migration down the road.

**Trade-off accepted:** Every employee read now needs a join instead of a single-table lookup. That's negligible at 10,000 rows once you index on `employee_id`.

---

## 5. Currency: store native, normalize at read time

**Alternative considered:** storing every salary pre-converted to USD, or converting once on write and discarding the native value.

**Decision:** `Salary.amount` and `Salary.currency` always hold the employee's actual native-currency salary. A seeded `ExchangeRate` table provides the USD conversion factors, used only by the analytics layer, at query time.

**Reasoning:** An employee's contractual salary is a fact. It shouldn't quietly drift or lose precision because of an exchange rate assumption baked in when the row was written. Keeping native values as the source of truth, with conversion isolated to one read-path service, keeps that logic auditable and in one place instead of scattered around the codebase.

**Trade-off accepted:** Analytics queries are more involved now. They have to join to `ExchangeRate`, convert, and then aggregate, instead of just aggregating pre-converted numbers. My rates are also a static seeded snapshot rather than something fetched live, which I'm fine with for this exercise but want to flag honestly: real usage would need periodic rate refreshes and rate versioning by date, since a rate used for March payroll shouldn't silently change just because someone looks it up in June.

---

## 6. Median computed in application code, not in SQL

**Alternative considered:** approximating a median in SQL using window functions.

**Decision:** The service layer sorts the normalized values per group in TypeScript and computes the median directly.

**Reasoning:** SQLite has no native `MEDIAN()` or `PERCENTILE_CONT`, and a window-function workaround would have been harder to read and harder to test in isolation, without being meaningfully faster at this data volume. Computing it in TypeScript keeps the logic in one small function I can unit test on its own, including the annoying edge cases like odd versus even counts.

**Trade-off accepted:** I'm pulling the full set of values per group into application memory instead of letting the database handle it. That's fine at 10,000 rows. At a much larger scale, I'd want to lean on an in-database percentile function, which Postgres offers and SQLite doesn't.

---

## 7. Service layer kept separate from HTTP routes

**Decision:** Routes only parse the request and format the response. All the actual business logic, pagination, filtering, validation, aggregation, lives in `/services` and gets called from the routes.

**Reasoning:** This is what makes the core logic testable through fast, deterministic unit tests that never need to spin up an HTTP server.

**Trade-off accepted:** An extra layer of indirection for what's still a fairly small app. I think it's worth it. It's cheap to set up early, it pays for itself in test speed and clarity, and it mirrors how a bigger, real system would actually be organized.

---

## 8. Soft delete instead of hard delete

**Decision:** Removing an employee sets `status` to inactive rather than deleting the row outright.

**Reasoning:** Hard-deleting an employee would orphan their Salary row, or force cascading deletes that destroy data I might still care about. Soft delete also matches how real HR systems tend to handle terminations. It's a recorded event, not an erasure.

**Trade-off accepted:** Every "active employees" query now needs an explicit status filter. I mitigated that with an index on `status`.

---

## 9. Server-side pagination, search, and filtering

**Decision:** The employee list endpoint paginates, searches, and filters on the server. The frontend never pulls down the full dataset.

**Reasoning:** At 10,000-plus rows, this isn't optional. Fetching everything and filtering it in the browser would be slow to load and a waste of bandwidth on every request.

**Trade-off accepted:** More API surface (page, limit, search, and filter query params) and more frontend state to manage (debounced search, filter state, page state) than a simpler "fetch everything, filter in JS" approach would need. I accepted that because the simpler approach fails the stated performance requirement outright.

---

## 10. Deliberate scope cuts

**Decision:** I considered and explicitly deferred authentication and RBAC, salary history, live FX rate fetching, a natural-language query interface, bulk CSV import and export, notifications and approval workflows, and adjusted or controlled pay-equity analysis. The full reasoning for each is in `requirements.md` and section 4.2 of `TRD.md`.

**Reasoning:** The common thread across all of them is that each one is a genuinely valuable feature in a production HR tool, but each is also a meaningfully separate chunk of work from demonstrating core engineering judgment on the primary CRUD and analytics flows, within a tight time budget.

---

## 11. Gender field: stored, but not analyzed (a decision I reversed)

**What happened:** Partway through the build, I added a `gender` field to the Employee schema. It's a standard HR data point, and an increasingly regulated one too (think UK gender pay gap reporting, or the EU Pay Transparency Directive). I initially planned a gender pay-gap view for the dashboard, then walked that back before building it.

**Reasoning for the reversal:** A raw average or median salary comparison by gender, without controlling for level, tenure, or department mix, can be genuinely misleading. It can overstate a gap or hide one, depending on how those other factors happen to fall. Rather than ship a comparison that could be mistaken for a rigorous equity analysis when it isn't one, I kept the field (it's cheap and keeps the schema forward-compatible) but held off on the analytics view until it can be done properly, either clearly labeled as a raw, unadjusted number, or built as an actual controlled analysis.

**Why this is worth documenting:** it's a real example of judgment overriding an initial plan partway through, based on a legitimate concern that came up during design.