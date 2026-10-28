# PHASE 1A — Workstation attendance safety, 28/10/2026

## Incident
After updating the server, an existing maintenance attendance was displayed as ineligible for completion on the operator's notebook; the client-side `MachineDetailPage` disabled the action before the API could evaluate it. The UI compared a cached workstation context with technician sessions, but the server is the authority at the transactional finish-maintenance endpoint.

### Root causes / hypotheses (production not inspected)
1. Before/after frontend migration, the workstation identity can be stored as both a site cookie (shared across ports for a hostname) and localStorage (scoped to origin). Different IDs can represent stale or conflicting enrollment, even on the same physical device.
2. The module access snapshot may arrive asynchronously and differ from the workstation registration result. An old client-side evaluation can be a false negative while the server could allow the request.
3. Completed technical sessions and multiple-maintainer participation have additional rules; matching a physical notebook by IP/hostname is not sufficient evidence of authorization.

### Safe changes
- The browser still displays its advisory workstation warning but does NOT disable the maintenance completion action for a suspected mismatch. It permits an attempt; the existing backend transaction continues to enforce the policy, including the active cycle and persisted workstation UUID.
- The completion action remains disabled while already submitting, avoiding duplicate requests.
- When a valid cookie and localStorage mirror disagree, preserve the existing origin-local UUID on that origin without overwriting the different cross-port cookie or creating a third UUID. This prevents a migration from silently changing which workstation owns an active attendance. Display the conflict to the administrator for supervised reconciliation. On an origin with no local identity, the cookie remains canonical across ports.
- If persisted identity is deleted/changed after the page cached it, the cached ID is no longer sent in new requests. Cookie-blocked browsers retain their existing mirror fallback.

### Regression tests
- Client no longer disables completion on advisory-only mismatch, backend still rejects unauthorized UUIDs.
- Cookie/mirror mismatch refuses silent identity mutation.
- A cached ID is invalidated if persistent storage disappears.
- Previous tests continue to exercise multiple maintainers, inactive workstations, legacy sessions and system tests.

## Production diagnosis / controlled recovery — next substep
- Do not modify old `technician_sessions.workstationId` rows or use IP/MAC as a substitute.
- Under authorized maintenance supervision, compare the call's current cycle session workstation UUIDs with the current browser UUID and workstation registration. Diagnose whether the mismatch began after a hostname/protocol switch or browser storage change.
- If the backend rejects a legitimate station, introduce a separately authorized and audited recovery procedure instead of disabling the whole authorization policy silently.
- If no identity is recoverable, a documented and time-limited supervised exception can be used only after explicit on-site approval; no automatic bypass is included in this PR.

## Security boundaries
- No migration, no update to the production database, no change to the backend permission check or authorization rules.
- No HTTPS configuration changes, deployment, service restart, GPIO or Node-RED alterations.
- Feature flag and system setting remain unchanged. Test in isolated environment first; then stage and supervise factory rollout.
