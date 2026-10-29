# SEC-04/2B.2 — Global catalogs, planning only (29/10/2026)

Eleven previously unclassified writes now have planning entries. The active central HTTP write gate remains deny-by-default. No handler, migration, data mutation, deployment, or production credential changes are included.

| Routes | Count | Planning permission |
| --- | ---: | --- |
| POST/PATCH/DELETE machine-set-types | 3 | catalog.assets.manage |
| POST/PATCH/DELETE machine-subset-types | 3 | catalog.assets.manage |
| POST/PATCH/DELETE andon-categories | 3 | catalog.reasons.manage |
| POST/PATCH failure-classifications | 2 | catalog.classifications.manage |

Remaining unmigrated inventory: 24 routes (35 - 11), not 24 active central endpoints.

Risk review before enabling any route:
1. Restrict global catalog writes to a full machine-scope administrator, or define a rigorously approved global privilege model; never treat module-global as authorization.
2. Revalidate principal, session, workstation approval, module and action permission inside a single transaction with advisory locks.
3. Preserve machine set/subset references and semantics of DELETE (soft inactivation when in use); check existing unique code, usage, and active dependency rules after locks.
4. Preserve category historical call references, active-call and assigned-technician checks, category grouping and BI attribution.
5. Preserve classification immutable value and reserved-exclusion analyticsDisposition (test classification must never be included in maintenance KPIs).
6. Append actor, workstation, reason, before/after to durable audit inside same database transaction; fail closed and rollback on audit failure.
7. Test concurrent updates, replay, stale session, wrong module, limited machine scope, deletion with historical references, and rollback with PostgreSQL test database only.
8. Retain existing legacy handlers until migration is explicitly approved; do not activate central mutations as a side effect of this planning registry.

Validation supplied: static Node test for all 11 registry entries, isolated permissions, inventory reconciliation and deny-by-default middleware. CI not yet observed at authoring. No merge or deploy.
