# Live testing: inputs and acceptance checklist

The application features have local automated coverage. This checklist is for controlled **staging testing**, followed by a separate production launch decision. It is not launch approval. Read [implementation progress](implementation-progress.md), [staging deployment](staging-deployment.md), [recovery](recovery-runbook.md) and the [release gate](release-gate.md) for evidence and limitations. No real charges or remote deployment have been performed.

## 1. Keys and secrets to supply securely

Use ignored local `.env` files for development and your hosting secret manager for staging. Never put filled values in chat, Git, browser bundles, screenshots or issue reports. Separate staging and production accounts/data. The empty templates are [root development settings](../.env.example) and [staging settings](../deploy/staging.env.example).

| Setting | What you need to obtain | Used by | Current state |
| --- | --- | --- | --- |
| `PAYSTACK_SECRET_KEY` | Secret **test** key (`sk_test_…`) from your verified Nigerian Paystack business | Server checkout initialization, transaction/refund verification and webhook HMAC | Awaiting your account/key; no real Paystack test transaction verified |
| `RESEND_API_KEY` | API key with email-send permission | Transactional mail worker | Not configured or provider-tested |
| `EMAIL_FROM` | Verified agency sender, such as `Psycocity <admissions@your-domain>` | All transactional emails | Sender domain and SPF/DKIM required; configure DMARC too |
| `CLOUDINARY_CLOUD_NAME` | Separate staging cloud/account name | Authenticated private images | Not configured or provider-tested |
| `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Server credentials for that cloud | Private upload/read/remove | Never expose the secret or provider-signed private URLs to browsers |
| `OUTBOX_ENCRYPTION_KEY` | Base64 encoding of **32 cryptographically random bytes** | Encrypted queued email and domain-separated staff MFA encryption | Local development key exists; create stable staging key and restricted backup |
| `MONGODB_URI` | Authenticated TLS URI to a separate writable replica-set DB, least-privilege user, network allowlist | Web, both workers and index setup | Local replica-set tested; hosted DB and recovery needed |

Generate the master key once using a secure password/secret management process (for example `openssl rand -base64 32` on your own trusted machine) and store it immediately. Do not rotate it by replacing its value: existing MFA/outbox requires a tested decrypt/re-encrypt migration. Keep the key backup separate from the database backup.

The current hosted-checkout design **does not need** a Paystack public key, a separate Paystack webhook secret, JWT signing secret, Google Calendar key, Google Meet OAuth secret or SMS API key. Sessions are opaque server-stored tokens; webhook signatures use the Paystack secret. External meeting links are created by agency staff. Staff passwords, authenticator seeds and recovery codes belong to individual staff accounts, not a shared application environment variable.

## 2. Hosting and runtime settings

| Setting/item | Staging requirement |
| --- | --- |
| `NODE_ENV=production` | Run compiled production builds |
| `DEPLOYMENT_STAGE=staging` | Explicitly isolate test integrations while using a production runtime |
| `PAYSTACK_ENVIRONMENT=test` | Required with test Paystack secrets in the staging production runtime |
| `APP_ORIGIN` | Exact HTTPS origin, no path/query; used for CSRF, emails and callback origin |
| `SERVE_WEB=true` | Serve compiled React and API from the same origin |
| `PORT=3001` | Internal container port; public access goes through TLS proxy |
| `EMAIL_TRANSPORT=resend` | Real staging email adapter; production runtime refuses local sink |
| `STORAGE_DRIVER=cloudinary` | Authenticated private image adapter; production runtime refuses local files |
| `POLICIES_APPROVED=false` initially | Keep real registration disabled until agency approval; set true deliberately for approved controlled staging collection |
| `IMAGE` / `STAGING_ENV_FILE` | Reviewed immutable image digest and absolute path to restricted staging configuration for Compose |
| `TRUST_PROXY_CIDRS` | Optional comma-separated verified proxy peer IPs/narrow CIDRs; blank leaves forwarded IPs untrusted. Close direct client access to app ports. |
| Domain/DNS/TLS | Agency-owned domain, valid certificate, proxy host validation, appropriate body/time limits and known IP/rate-limit architecture |
| Hosting/registry/CI credentials | Depend on chosen provider; no hosting target has been selected or provisioned |
| Backups, monitoring, alert destinations | Restricted encrypted backup storage, retention, key custody, named operator and tested alerts/restore/rollback |

Live (`sk_live_…`) secrets are currently rejected. `DEPLOYMENT_STAGE=production` is deliberately gated. After successful staging/provider checks, a reviewed change must implement and verify durable live-versus-test domain isolation across payment attempts, verification, settlement, refunds, membership eligibility and receipt labels before live charging is enabled. Changing a key-prefix check alone is insufficient. No production resources should be created or deployed as part of filling this checklist.

## 3. Agency information and decisions

- [ ] Legal/business agency name, Nigerian contact details, support/admissions email, physical address and safeguarding contact.
- [ ] Approved logo/wordmark and licensed photographs, image permissions/model consent, final editorial copy. Current abstract artwork is original placeholder branding.
- [ ] Approved privacy notice, terms, refund/cancellation policy, retention/deletion policy and 16–17 guardian-consent/safeguarding process. The application currently discloses draft policy status.
- [ ] Academy duration, curriculum, instructors, hybrid delivery arrangements, venue, cohort capacity and agency-defined attendance/assessment completion criteria. Thresholds start unset; configure them before completion review.
- [ ] Assignment instructions/deadlines/required status and certificate wording; the platform makes no external accreditation claim.
- [ ] Representation-review policy for completed adults, professional casting workflow, booking-enquiry response owner and fee/refund support process.
- [ ] Individual staff emails, MFA/recovery custody, incident owner, backup owner, RPO/RTO targets and operator escalation contacts.

Confirmed product rules remain: applications are free; accepted academy applicants pay **₦50,000 total tuition/assessment**; accepted established applicants pay **₦30,000 assessment/onboarding**; verified payment precedes a single-use email-bound registration key. Academy is 16+ with guardian consent for minors; representation is 18+ with explicit approval. Completion alone creates no public listing and no second fee. All staff have equal operational access through individual MFA accounts.

## 4. Local verification before staging

- [ ] Pull the intended feature branch/revision; use pinned Node/npm, `npm ci`, start the isolated test replica set and run `npm run check`.
- [ ] Review current test exit statuses/artifacts. Zero tests, old reports, skipped or blocked checks are not passes.
- [ ] Run `npm run test:recovery` after build. It uses uniquely owned synthetic `_test` databases in the local test container and restores into a different namespace. It verifies a protected application, cross-owner denial, unique indexes, replica readiness and encrypted mail using a separately held key.
- [ ] Build/scan the Docker image and record its digest. A local image build/smoke passed after resolving the cloud build proxy; registry/npm access and scanning in your deployment environment still need verification.
- [ ] Review desktop/mobile automated accessibility and rendering attachments. These are unthrottled local lab samples; manual screen-reader review, real devices/networks and field Web Vitals remain outstanding.

## 5. Staging connection and provider checks

Use synthetic consenting testers and permitted provider test instruments. Recheck current official Paystack transaction, webhook and refund documentation. Access to those docs from this cloud environment previously returned HTTP 403.

1. **Infrastructure:** start index setup, web, mail and payment workers; confirm migration success, external HTTPS `/api/v1/ready`, worker health and correct origin/cookies. Repeat index setup safely. Verify that no local adapter is accepted by the production runtime.
2. **Staff access:** bootstrap the first named staff account with the trusted CLI, `npm run admin:bootstrap -- --email your-staff-email`; verify actual mail, password setup, authenticator enrollment/recovery, invitation/revocation, individual audit trails and last-secured-admin protection.
3. **Email:** verify sender-domain DNS, real delivery and spam placement, expiry, bounded retries, original dedupe keys, dead-letter inspection and safe reissue. Exercise a provider outage/crash and inspect provider logs before retrying old jobs outside provider idempotency windows.
4. **Media:** verify authenticated Cloudinary originals/thumbnails are not anonymously accessible, image type/size/pixel controls, EXIF/GPS removal, one-use upload grants, cross-account denial, retention, deletion and public photo revocation on hide/suspension. Course resources/submissions currently accept private **UTF-8 text files up to 64 KB**, plus controlled HTTPS learning links; PDF/video/office uploads are unsupported.
5. **Paystack:** configure HTTPS `https://YOUR-STAGING-ORIGIN/api/v1/paystack/webhook`. Verify callback origin and outbound provider reachability. Test exact **5,000,000** and **3,000,000 kobo**, NGN, reference/offer/account/amount matching, valid/invalid signatures, forged callbacks, pending/failed/successful transactions, browser closure, delayed/duplicate webhooks, expired offers, reconciliation and verified refund evidence. A callback or screenshot never proves payment.
6. **Recovery:** demonstrate hosted DB restore into a separate protected staging target with the same stable key, private-media recovery, staff MFA recovery and a protected journey. Keep mail/live payment workers disconnected from restored production data. Record measured restore time, counts/indexes and rollback rehearsal. Configure monitoring alerts to a named person.

## 6. Complete user journeys and privacy checks

- [ ] Adult academy: draft → private photos → submit → staff assessment/acceptance → real test payment → emailed single-use key → distinct student activation → private profile → cohort enrolment.
- [ ] Minor academy: verify guardian consent before submission and recheck withdrawal/age at payment/activation. Run the complete controlled journey, including suspension/withdrawal denial. Under-18 students cannot receive representation.
- [ ] Established model: assessment/acceptance → exact test fee → key/activation → catalogue draft/photos → staff exact-revision approval → anonymous roster/detail/gallery → booking enquiry → staff response workflow.
- [ ] Enquiries: contact/booking acknowledgement/reference without reservation, input/rate limits, safe notification outage recovery, assignment, staff-only notes and outcome audit.
- [ ] Professional casting: only active paid represented adults receive model casting invitations/RSVP/outcomes; admission appointments stay separate.
- [ ] Academy: capacity races, cohort isolation, Lagos timetable changes/cancellations/reminders, protected meeting links, revoked-enrolment download denial, resources, attendance corrections/private reasons, assignment deadlines/revisions/assessment, configured completion, adult representation request/approval and separate portfolio publication.
- [ ] Certificates: only configured criteria plus staff-approved completion/issuance; private print/export, duplicate protection and revocation; no public student detail lookup.
- [ ] Operations: structured draft/preview/publish cannot execute HTML/scripts; public changes appear without stale cache; failed mail retry cannot change financial state or revive expired credentials.
- [ ] Privacy/security: session logout/reset/revocation, CSRF/Origin, staff MFA, role/cross-account denial, stale-version conflicts, no private fields in public SSR/JSON/images/logs, keyboard/reduced-motion/contrast/touch checks and approved retention procedure.

## 7. Launch decision

Record checker, date, deployment digest, sanitized evidence, result and remediation for every item. Provider fixtures and local mail/files are not evidence of real external integration. Remote deployment, real test providers, managed recovery, policy approval and live payment enablement remain **blocked/pending**, not passed. Finish the [release gate](release-gate.md) and obtain a separate production decision before any real applicant collection or charge.
