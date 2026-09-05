# Requirements — Employee Salary Management (ACME Org)

## Goal
Give ACME's HR Manager a web-based system to manage salary data for 10,000 employees across multiple countries, replacing the current spreadsheet-based process, and to answer basic aggregate questions about how the org pays people.

## Persona
**HR Manager** — needs to look up, search, and update employee/salary records quickly, add new employees, and view pay trends by department and country without exporting to Excel.

## Scope & Features (In)
- Employee CRUD: view, search, filter (department/country/level), create, update, soft-delete
- Salary field per employee (amount + currency), editable with server-side validation
- Server-side pagination and search — required at this scale (10k+ rows)
- Basic analytics: average salary & headcount by department; average salary & total payroll by country
- Seed script generating 10,000 realistic employees across 4 countries, 6 departments, 5 levels

## Deliberately Out of Scope (and why)

| Cut | Reasoning |
|---|---|
| Authentication / RBAC | Out of domain for this exercise; assumed single trusted HR-admin. Would be first addition in production (SSO + role-based access), given salary data sensitivity. |
| Salary history / audit trail | Only current salary stored. Schema is forward-compatible (salary is its own table, not a column), but tracking historical changes adds scope not required for v1. |
| Bulk CSV import/export | High real-world value but orthogonal to demonstrating core engineering judgment in the time available. |
| Currency conversion/normalization | Salaries reported per native currency. Cross-currency comparisons require exchange-rate sourcing and date-of-conversion decisions — flagged as a real gap, not ignored. |
| Advanced analytics (pay equity, outlier detection) | Confirmed basic-tier scope (avg/total by dept & country). Deeper statistical analysis is valuable but a distinct, larger feature. |
| Notifications / approval workflows | Not needed for a single-admin tool at this scope. |

## Non-Functional Requirements
- Must stay responsive at 10,000+ employee records (indexed queries, server-side pagination — no full client-side loads)
- All salary mutations validated server-side regardless of client-side checks
- Tests must be fast, deterministic, and runnable without a live server or network access

## Assumptions
- Countries: US (USD), UK (GBP), India (INR), Germany (EUR)
- Departments: Engineering, Sales, Marketing, HR, Finance, Operations
- Levels: L1–L5
- Default pagination: 25 records/page

Full technical detail: see `docs/TRD.md`.
