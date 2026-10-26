# Recovery and security operations

Use a named incident owner and an isolated restore target. Preserve the current database and provider evidence. Never run `mongorestore --drop` on the active database. No backup schedule, off-site archive, operator alert destination or managed recovery guarantee exists until configured in your hosting account.

## Backups and restore

Use the MongoDB host's snapshot/PITR service with retention approved by the agency. Back up private media and the stable encryption key separately; database-only backups cannot restore Cloudinary images or decrypt MFA/outbox without that key. Keep encrypted archives in restricted storage and test access/rotation. Choose business RPO/RTO before launch and record the measured restore time, restored revision and last recoverable timestamp.

For a logical backup, use MongoDB Database Tools with credentials from a restricted config file/secret store, not command history. Capture a consistent snapshot using the supported replica-set procedure (`--oplog` for an appropriate full replica-set backup; a partial `--db` dump is not a cross-collection point-in-time snapshot). Restore into a **new**, isolated database/cluster with an explicit namespace mapping. Verify backup integrity before restoration. Do not connect mail or live payment workers to restored production data during verification: they may deliver historic notifications or reconcile real transactions.

The local `npm run test:recovery` drill creates synthetic data in uniquely owned `_test` databases, uses the actual MongoDB dump/restore tools from the test container, restores into a separate namespace, authenticates a restored protected record through the real app, checks replica readiness/indexes and cleans up only its own namespaces. It proves the local logical restore path, not remote snapshots, provider assets, PITR or production RTO.

After an authorized staging restore, start the reviewed app against the isolated TLS replica set using the same encryption key and safe provider isolation. Verify `/ready`, individual staff MFA (not shared credentials), a private applicant record, payment evidence and paid member authorization. Confirm the restored collections' indexes. Compare record counts and known evidence. Record exit codes and sanitized observations; keep secrets/private payloads out of incident reports.

## Provider/worker outage

1. Inspect readiness, worker process health, `/admin/operations` counts and redacted logs. A web health response does not prove mail/reconciliation workers run.
2. For payment outages, leave offers/attempts/evidence intact. Never mark paid from callback parameters, screenshots or bank messages. Resume the payment worker; it re-verifies provider transactions and recovers expired leases. Independent paid-entitlement recovery repairs missed invitations without another charge. A refund under review retains its recorded state and requires provider evidence.
3. For mail failures, restore sender/domain/key/network configuration. Inspect `/admin/operations`; retry the existing unexpired failed job, preserving its dedupe key. A crash after provider acceptance is delivery-at-least-once: provider idempotency windows are finite, so operators must check provider logs before retrying very old jobs. Expired token payloads are scrubbed and cannot be resurrected; issue a replacement from admissions/member/staff workflows.
4. For private-media failures, deny access rather than return a public provider URL. Repair storage; use existing retention cleanup only after references have been checked. Do not delete submitted application evidence or approved portfolio images to free space.
5. Stop exposed credentials, rotate provider secrets and revoke compromised sessions. Preserve the encryption key unless following a tested decrypt/re-encrypt migration; simply replacing it loses access to stored MFA and queued emails. Staff deactivation must preserve at least one secured administrator.

Review CSRF/Origin, role ownership, paid entitlement, guardian consent, MFA, signature checks, stale versions, upload normalization, private-download revocation and log redaction after every security incident. Automated negative tests cover these boundaries using synthetic fixtures. Real provider outages, staff recovery, remote backup restoration and operator alert routing still require staging exercises and recorded ownership before launch.
