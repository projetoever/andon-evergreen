# PHASE 1B — Workstation completion diagnostics (read-only)

Date: 28/10/2026. Built on Phase 1A (#231).

## Scope
In **Hub > Administração > Workstations**, an authenticated legacy Admin can paste a maintenance call ID to inspect the *current attendance cycle's recorded workstation suffixes*, compare with the workstation making the request, and see why the existing restriction would accept or reject a completion.

The tool is advisory; the finish-maintenance endpoint independently authorizes the transition within its own transaction. It does not modify technician sessions, call state, workstation status, permissions, attendance or database settings.

### Security and privacy
- `GET /api/admin-auth/workstation-attendance-diagnostic` checks active Admin bearer session. Without authentication, returns 401 **before any database query**.
- If central access is active, returns 403 `central_admin_integration_pending`. It does not create a bypass around the central permissions system.
- Data returned: call and machine identifiers (call ID as suffix only), cycle index, active maintenance session count, current station suffix, status and registered participating workstation suffixes/names. **No full workstation IDs, login secrets, technician names, sessions tokens or IP addresses**.
- Cache-Control: no-store. Call ID format validated; invalid/missing call IDs rejected.
- Authentication guard is enforced by route handler, not by visibility of the UI. A client cannot turn this diagnostic into an authorization decision.
- Existing attendance rules are mirrored in a pure read-only diagnostic utility with regression tests for legacy, ended/active participation, old cycles, inactive station, restriction OFF and UUID mismatch.

### Usage
1. Enter the Hub through the existing administrator login.
2. Go to Workstations and paste the complete call ID shown on the machine's call detail panel.
3. Compare the reported station suffixes. A mismatch may arise from new browser origin, profile change, old cookie/localStorage conflict, or earlier session provenance.
4. If the backend denies a valid maintenance operation, do NOT overwrite historical session IDs or silently disable global restrictions. Escalate to controlled, audited recovery design after confirming the real cause.

## Release constraints
No schema migration, database mutation, Node-RED/GPIO, TLS/HTTP transport configuration, kiosk runtime or production deploy. Fase 1B is intended for validation in an isolated setup before rollout.
