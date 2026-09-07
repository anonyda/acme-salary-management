# AI Usage Log

This project was built end-to-end with Claude Code, across two phases: an initial build session
implementing the backend and frontend stage by stage, and a longer follow-up session covering
environment fixes, a codebase review, feature work, deployment, and live production debugging.
This log summarizes the process, the prompting approach, and the practices used to keep the AI's
output correct: not a transcript of every prompt, but the ones that shaped the design or caught a
real problem.

---

## Phase 1: Planning, before any code

`docs/TRD.md` and `docs/requirements.md` were written first, before opening Claude Code for
implementation, committed as the very first commit (`1dddbe9`), alongside `CLAUDE.md`
(`80321b8`) defining the tech stack, folder structure, and engineering rules (test-first, small
commits, server-side validation, no ORM, soft delete, median-in-code) that every later prompt was
written against.

## Phase 2: Implementation

Built incrementally, service by service: a failing test written and confirmed red first, then the
implementation, then a checkpoint (run it, `curl` it, inspect the DB directly) before moving on
and committing. Representative prompt, for the pattern repeated across every service:

> Write a failing Vitest test in src/tests/employeeService.test.ts for a listEmployees service
> function: it should support pagination (page/limit), search by name/email, and filter by
> department/country/level, returning `{ data, page, limit, total }`... Do not implement the
> service yet, show me the failing test first.
>
> *(review the test)* → "Now implement src/services/employeeService.ts to make that test pass,
> using raw SQL via better-sqlite3."

| Stage | What | Commit(s) |
|---|---|---|
| 1 | Backend scaffold, `/health` | `1201d95` |
| 2 | Schema (Employee/Salary/ExchangeRate) + connection | `53c2d5a` |
| 3 | Seed script, 10,000 employees | `dd53636` |
| 4 | `listEmployees` (test-first) | `dddbe71` |
| 5–6 | Remaining CRUD + salary endpoints, routes wired | `246aee4`, `8f16d89`, `c1935c7`, `845409a`, `37f3665` |
| 7 | Analytics summary; rewritten mid-course once the KPI/median/currency-normalization scope was finalized | `6137736`, `9124840`, `faf0282`, `18a64f6` |
| 8–11 | Frontend scaffold, employee table, detail/edit modal, add-employee form | `619d597`, `2a42526`, `ec796ea`, `d0ee94c` |
| 12 | Analytics dashboard: KPI cards, department/country breakdowns, distribution chart, interactive filters | `6559621`, `77fbabf`, `6ded0bb`, `de8833c`, `74361b2`, `3251df4` |

**Known gap:** a level breakdown chart and a payroll-share visualization by department were
planned but aren't in the codebase. Checked directly (`grep` for `levelBreakdown`, `Pie`, `Donut`
across the analytics service and the dashboard component: no matches; `level` exists only as a
filter, not its own breakdown). Flagged, not yet resolved; open decision on whether to build it or
document it as a scope cut before submission.

## Phase 3: Extended session: setup, review, features, deployment

A second, longer Claude Code CLI session picked up from here. Rather than log every prompt, the
notable arcs:

- **Environment correctness, verified not assumed.** `better-sqlite3` segfaulted on Node 20
  (reproduced directly: `npm install` succeeded with only a warning, but opening a database
  crashed the process). Root-caused to the pinned version's actual `engines` requirement rather
  than guessed; fixed the version and the misleading `engines.node` range in `package.json`.
- **Full codebase review before more feature work**: architecture patterns, best-practice gaps,
  optimization opportunities, presented as a prioritized list before touching code. Found (and
  later fixed) that only salary amount/currency were validated server-side; every other field
  relied on a raw SQLite constraint throwing an uncaught 500 with a leaked stack trace.
- **Server-side validation + error middleware**, test-first: ~30 failing tests written before the
  fix (invalid enums, missing/malformed fields, duplicate email, self-referencing manager),
  confirmed red, then implemented.
- **UX polish pass**, prompted directly: "Review the app for basic UX polish: loading states,
  empty states, error states, and responsive layout. Fix anything broken." Found and fixed 5 real
  issues (a stale "OK" status during a health recheck, a table that blanked on every reload
  instead of dimming stale data, missing retry affordances on failed loads, a pagination footer
  that could overflow on mobile, a cramped form grid). Landed as 5 separate, focused commits
  rather than one, for a clearer history.
- **Deployment (Railway + Vercel), debugged live against real failures**, not assumed to work
  after following the guide once. In order: `better-sqlite3` requires Node ≥22, not the ≥20 the
  repo declared (Railway defaulted to 20); the build system turned out to be Railpack, not
  Nixpacks, with its own env var for pinning Node version (found via web search rather than
  assumed from memory, since getting a fast-moving platform detail wrong wastes a deploy cycle);
  a custom Build Command was silently skipping the TypeScript build entirely; `tsc` doesn't copy
  `schema.sql` into `dist/` (only ever caught because the compiled build was actually run and
  hit, not just `tsx` in dev); a CORS `Access-Control-Allow-Origin` mismatch (confirmed by curling
  the backend directly with the frontend's real `Origin` header, twice: first a wrong URL, then a
  trailing-slash mismatch); and, in the end, the root cause of a whole debugging detour turned out
  to be a commit that had been made but never pushed. Caught by checking `git log
  origin/main..main` rather than continuing to guess at the frontend/backend code.
- **A real CSS bug, caught by actually looking, not reasoning about the source.** Moving the tab
  switcher into the header made `<main>` a flex item; combined with `mx-auto`, that silently
  switched it from block-level "always fill the container" sizing to shrink-to-fit, so the
  Employees and Analytics tabs rendered at different widths. Reasoning about the JSX alone hadn't
  caught this. Used the `run` skill's browser-driven verification pattern to actually measure the
  rendered page (see below): the pixel numbers made the bug obvious immediately.

---

## Skills used

- **`run`**: Claude Code's skill for launching and driving the actual app, not just reading its
  source. No project-specific runner skill existed yet, so it fell back to a Playwright-driven
  Chromium session (installed on demand): loaded the real dev server, measured `<main>`'s actual
  rendered bounding box on both tabs, and screenshotted them. That's what actually found the
  flex/shrink-to-fit bug above; several rounds of reasoning from the JSX and Tailwind classes
  alone had missed it.

## AI best practices applied

- **Test-first, enforced as a two-step process, not a suggestion.** Every service-layer change
  went: write the failing test → confirm it's actually red (and red for the right reason) →
  implement → confirm green. Caught in practice: writing a test, seeing it pass immediately, and
  recognizing that meant the test wasn't exercising anything new.
- **Empirical verification over trusting the model's own reasoning.** Repeated pattern:
  reproducing the Node 20 crash directly instead of trusting an `EBADENGINE` warning's severity;
  running the actual compiled production build (`npm run build && node dist/index.js`) instead of
  only ever testing via `tsx`; curling a live Railway backend directly with a specific `Origin`
  header to confirm a CORS diagnosis before proposing a fix; using a real browser to measure
  pixels rather than reasoning about flexbox from the JSX.
- **One logical change per commit**, checked via `git diff`/`git status` before committing, and
  split after the fact when two changes had landed in the same working session but didn't belong
  in one commit.
- **Stop and ask when a requirement is genuinely ambiguous**, rather than pick a default silently,
  e.g. before adding CORS support, confirming where the frontend was actually being deployed
  (Vercel, another Railway service, or not yet) rather than assuming, since the answer changed
  whether the work was needed at all right then.
