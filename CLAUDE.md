# CLAUDE.md

This file gives Claude Code persistent context for this repository. Read `docs/TRD.md` and `docs/requirements.md` for full detail — this file is the summary + working rules.

## Project

Employee Salary Management software for ACME org (10,000 employees, multiple countries). Built for HR Managers to replace spreadsheet-based salary tracking with a searchable web app plus basic pay analytics.

Full spec: `docs/TRD.md`
One-page scope doc: `docs/requirements.md`

## Tech Stack (do not deviate without discussion)

- **Backend:** Node.js + TypeScript + Express, `better-sqlite3` for the database (raw SQL — no ORM)
- **Frontend:** React + Vite + TypeScript + shadcn/ui + recharts (for analytics charts)
- **Testing:** Vitest everywhere; Supertest for backend route tests; React Testing Library for frontend components
- **Seed data:** `@faker-js/faker`
- **Deploy target:** frontend → Vercel, backend → Railway (backend needs a persistent filesystem for SQLite, which rules out serverless)

## Folder Structure

```
/backend
  /src
    /db          → schema.sql, connection.ts, seed.ts
    /routes       → thin HTTP layer only, no business logic
    /services    → business logic (pagination, validation, aggregation) — unit-testable in isolation
    /tests
/frontend
  /src
    /components
    /api          → API client
    /tests
/docs
  TRD.md
  requirements.md
  architecture.md
  AI_USAGE.md
```

Keep `routes` thin — they should parse the request, call a `services` function, and format the response. All logic that needs testing belongs in `services`, so tests never need to spin up an HTTP server for core-logic coverage.

## Engineering Rules

1. **Test-first for core logic.** For anything in `/services` (pagination, filtering, validation, aggregation), write the failing test before the implementation. Don't write implementation and tests in the same pass — write the test, show it failing, then implement.
2. **Small, incremental commits.** One logical change per commit (e.g., "add employee list service + tests," not "add backend"). Commit history is a graded deliverable — do not batch multiple features into one commit.
3. **No ORM.** Use raw SQL via `better-sqlite3` prepared statements. Keep queries readable and parameterized (never string-concatenate user input into SQL).
4. **Validate server-side**, regardless of client-side validation — salary amount must be positive, currency must be one of the supported set, employee must exist.
5. **Server-side pagination always.** Never fetch the full employee table into the client. Default page size 25, configurable via query param, capped at a sane max (e.g., 100).
6. **Soft delete only.** Setting an employee to `inactive` is a status update, not a row deletion.
7. **Keep scope aligned with `docs/TRD.md` section 4.2 (out of scope).** Do not add auth, salary history, CSV import, or currency conversion unless explicitly asked — these are deliberate cuts, not oversights.

## AI Usage Logging

After any session involving a non-trivial design or debugging decision, add an entry to `docs/AI_USAGE.md` — prompt used, why, and outcome. Don't skip this; it's an explicit deliverable.

## When Unsure

If a requirement is ambiguous or a decision isn't covered above or in the TRD, stop and ask rather than guessing — flag it back in chat instead of picking a default silently.
