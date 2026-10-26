# Release decision record

Code completion and local tests do not authorize production. This document records the outstanding launch gate, not a claim that external checks passed. `DEPLOYMENT_STAGE=production` is deliberately rejected; only an explicitly isolated staging deployment can use Paystack test secrets with the production runtime. Live payment support must be enabled in a reviewed change after the checks below, preserving provider-domain separation in attempts, verification, settlement, refunds, memberships and receipt labels. Do not remove a key guard alone.

| Gate | Required evidence | State |
| --- | --- | --- |
| Source regression | Current revision lint/types, unit/API, real replica-set tests, builds, dev/production smoke, desktop/mobile journeys | Local results recorded in implementation-progress.md |
| Accessibility and performance | Automated audit, keyboard/reduced-motion/manual screen-reader review, image budgets, representative network/device lab and later field monitoring | Local automation only; wider manual/device/field checks needed |
| Restore | Separate restored DB, protected journey/index/ownership checks; encrypted MFA/outbox and private media recovery; chosen RPO/RTO | Local synthetic DB drill only; hosted/key/media exercises pending |
| Test providers | Actual Paystack test checkout/webhook/refund/reconciliation, real email sender delivery, private Cloudinary retrieval/revocation | Blocked by account credentials/network access |
| Infrastructure | HTTPS staging origin, isolated TLS replica set, image digest/scan, migration/rollback and worker health, alert destinations | Definitions supplied; remote provisioning/deployment not performed |
| Business/legal | Approved copy, agency contact/legal identity, terms/privacy/refunds/guardian safeguarding/retention; curriculum/venue/criteria | Agency input/approval required |
| Operations | Named staff/operator, MFA recovery custody, key backup/rotation, support/refund process, incident/monitoring responsibilities | Agency assignment and rehearsal required |
| Production payment enablement | Official current provider guidance reviewed, explicit live-vs-test persisted domain isolation, live key custody, separate production data/services, controlled provider-approved test and launch authorization | Intentionally closed; no live charge/deployment performed |

Record who checked each item, date, deployment digest, sanitized evidence location, outcome and any rollback trigger. Include a named acceptance of residual risks. An unchecked or blocked item is not passed. Do not use real applicants, minors, photographs or money to bypass incomplete privacy/provider checks. Use `docs/live-testing-checklist.md` for the input inventory and staging test sequence.
