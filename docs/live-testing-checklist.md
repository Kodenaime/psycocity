# Live testing and launch checklist

This is a working inventory, not a production approval. Implementation and provider checks are tracked separately in implementation-progress.md. Update this checklist as the remaining prompts are completed.

## Secure configuration

| Setting | Purpose | Status |
| --- | --- | --- |
| PAYSTACK_SECRET_KEY | Paystack test initialization, verification and webhook HMAC | Awaiting verified test account; test mode only |
| RESEND_API_KEY / EMAIL_FROM | Actual transactional email from a verified agency domain | Not configured or provider-tested |
| CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET | Authenticated private image storage | Not configured or provider-tested |
| OUTBOX_ENCRYPTION_KEY | Stable base64 32-byte master key for encrypted outbox and staff MFA | Local-only generated key exists; secure deployment key and backup needed |
| MONGODB_URI | Provisioned MongoDB replica set with authentication/TLS and tested backup/restore | Local replica set tested; hosted deployment needed |
| APP_ORIGIN | Exact HTTPS deployed origin for cookies, CSRF, email links and callbacks | Local origin tested; deployed HTTPS origin needed |
| NODE_ENV / SERVE_WEB | Deployment runtime and same-origin SSR/API serving | Local development/production smoke tested |
| POLICIES_APPROVED | Enable real registration/collection after business approval | Production default disabled |

Enter secrets in ignored local .env or secure deployment settings, never chat/Git. No public Paystack key is required by the current server-initialized hosted checkout. Live charging remains disabled until the explicit launch gate is implemented and approved.

## Real provider checks after credentials are available

- Review current official Paystack transaction, webhook and refund guidance; environment documentation access currently returns HTTP 403.
- Test both exact NGN fees, valid/invalid signatures, failed/pending/successful payment, delayed webhook, browser closure, duplicate delivery, expired offer and reconciliation.
- Configure the public HTTPS /api/v1/paystack/webhook endpoint and callback origin; verify provider network access from deployment.
- Verify email domain/SPF/DKIM/DMARC, actual delivery, retry/dead-letter handling and invitation expiry/reissue.
- Verify Cloudinary private originals/thumbnails, authorized retrieval, metadata stripping, cleanup and public access only to approved assets.
- Test paid invitation and role activation with controlled accounts, never real applicants before policies are approved.

## Business and operations information

- Legal agency name, contact email/phone/address, licensed brand imagery and logo.
- Approved privacy, terms, refund/cancellation and minor guardian-consent policies, retention/deletion rules and safeguarding contacts.
- Academy duration, curriculum, instructors, cohort capacity, physical venue, hybrid meeting arrangements and completion criteria.
- Staff account owners, MFA enrollment/recovery, monitoring/incident contacts and key custody/rotation.
- Hosting/domain/DNS, HTTPS, backups, restore drill, monitoring, alerting and rollback plan.

## Completion gate

Remaining implementation prompts, security/accessibility/performance checks and production release review must be completed before this can be used as a final live-testing checklist. No deployment or real payment is authorized by this document.
