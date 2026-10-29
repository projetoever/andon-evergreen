# SEC-04/2B.3 — Guarded global catalog transaction (preparatory)

Date: 29 October 2026. Continues PR #262 and roadmap #232.

This server-side prototype composes a hashed central session lookup, user lock,
workstation lock, global catalog advisory lock, session revalidation,
module and permission preflight, reviewed server-only domain mutation callback,
and durable audit in one Prisma transaction.

**Operational boundary:** It is NOT wired to Fastify routes. Existing central
write requests remain denied. This does not prove end-to-end readiness:
specific adapters must preserve the legacy catalog referential constraints,
classification exclusions, history, delete semantics, and complete before/after
audit. A general callback from untrusted request data is prohibited.

Before connection: PostgreSQL isolated concurrency/rollback exercises,
review lock ordering against all existing writers and administrator revocation
paths, test historical references and reserved test classifications,
verify no audit failure can commit mutations, full CI, rollout/rollback plan.

No merge/deploy/migration or change to industrial services.
