# ACME Salary Management

A web-based employee salary management system for ACME's HR Manager — replaces spreadsheet-based
tracking with a searchable app for 10,000+ employees across 4 countries, plus a basic pay analytics
dashboard (KPIs, department/country breakdowns, salary distribution), all normalized to USD.

Full spec: [`docs/TRD.md`](docs/TRD.md) · One-page scope: [`docs/requirements.md`](docs/requirements.md)

## Live demo

- **App:** https://acme-salary-management-anonydas-projects.vercel.app/
- **Walkthrough video:** https://www.loom.com/share/5c1f14c2a316499f869faf4bfaae3c42

## Tech stack

| Layer    | Stack |
|----------|-------|
| Backend  | Node.js + TypeScript + Express, `better-sqlite3` (raw SQL, no ORM) |
| Frontend | React + Vite + TypeScript + shadcn/ui + recharts |
| Testing  | Vitest (+ Supertest for backend routes, React Testing Library for components) |
| Seed data | `@faker-js/faker` (10,000 deterministic fake employees) |

## Prerequisites

- **Node.js 22+** (developed/tested on Node 24)
- npm (ships with Node)

> **Node version note:** the `better-sqlite3` version pinned in `backend/package.json`
> (`^13.0.3`) declares `engines.node: >=22` — **Node 20 is not just unsupported, it actively
> crashes.** `npm install` succeeds with only an `EBADENGINE` warning (npm doesn't block on it by
> default), but requiring the module and opening a database segfaults at runtime (reproduced:
> exit code `-1073741819` / `0xC0000005`, an access violation) rather than throwing a catchable
> JS error. Use Node 22 or 24, not 20.
>
> Separately: `better-sqlite3` ships a prebuilt native binary per supported Node version — if none
> exists for your Node version, `npm install` falls back to compiling from source via `node-gyp`,
> which requires a working Python 3.x + native build toolchain (a common source of install
> failures, especially on Windows with a broken/Store-alias `python`). If you're on an older
> `better-sqlite3` (pre-v13) and hit a compile error on install, bump the version rather than
> downgrading Node.

## Setup

Backend and frontend are independent npm projects — install and run each separately.

### 1. Backend

```bash
cd backend
npm install
npm run seed   # generates data/acme.sqlite with 10,000 employees + exchange rates
npm run dev    # starts the API on http://localhost:3001
```

Environment variables (optional — both have working defaults, see `backend/.env.example`):

| Var       | Default                 | Meaning |
|-----------|--------------------------|---------|
| `PORT`    | `3001`                   | API port |
| `DB_PATH` | `./data/acme.sqlite`     | SQLite file location |

There's no `.env` loader wired up — these are read from real process environment variables
(`process.env`), so `.env.example` is documentation, not something you need to copy unless you're
also adding a loader or exporting the values yourself.

Verify it's up:

```bash
curl http://localhost:3001/health
# {"status":"ok"}
```

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev    # starts Vite on http://localhost:5173
```

The Vite dev server proxies `/api` and `/health` to `http://localhost:3001` (see
`frontend/vite.config.ts`), so the backend must be running first. Open http://localhost:5173.

**Deploying the frontend separately from the backend** (e.g. Vercel + Railway): there's no dev
proxy in a deployed build, so set `VITE_API_BASE_URL` to the backend's origin (e.g.
`https://your-backend.up.railway.app`, no trailing slash) in the frontend's **build-time**
environment — Vite inlines `VITE_*` vars into the static bundle at build, they aren't read at
runtime. Locally/undeployed, leave it unset to keep using the dev proxy.

## Running tests

```bash
cd backend && npm test    # Vitest + Supertest, runs against an in-memory SQLite DB
cd frontend && npm test   # Vitest + React Testing Library
```

Both suites are fully deterministic and don't require a live server or network access.

## Other scripts

| Location  | Script         | Purpose |
|-----------|----------------|---------|
| `backend` | `npm run build`| Type-check + compile to `dist/` |
| `backend` | `npm start`    | Run the compiled build (`dist/index.js`) |
| `backend` | `npm run lint` | `tsc --noEmit` |
| `frontend`| `npm run build`| Type-check + production build |
| `frontend`| `npm run lint` | Oxlint |
| `frontend`| `npm run preview` | Preview the production build locally |

## Project structure

```
/backend
  /src
    /db        → schema.sql, connection.ts, seed.ts
    /routes    → thin HTTP layer only, no business logic
    /services  → business logic (pagination, validation, aggregation)
    /tests
/frontend
  /src
    /components
      /ui      → shadcn/ui primitives
    /api       → typed API client
    /hooks     → shared React hooks
    /lib       → validation, formatting, misc utilities
    /tests
/docs
  TRD.md
  requirements.md
  architecture.md
  AI_USAGE.md
```

## Deliberately out of scope

Auth/RBAC, salary history, CSV import/export, live FX rates, and an NL query interface are
intentional cuts, not oversights — see `docs/requirements.md` for the reasoning behind each.
