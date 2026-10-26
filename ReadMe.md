# Psycocity

Modelling agency and hybrid academy platform. Product requirements: [specs.md](specs.md). Incremental implementation prompts: [prompts.md](prompts.md).

## Requirements

- Node **24.19.0** (`nvm install && nvm use`, or your version manager).
- npm **11.9.0**. Check `node --version` and `npm --version` before installing.
- Docker Engine and Docker Compose v2 for the local/test MongoDB replica sets.

## Install and develop

Run from the repository root:

```sh
npm ci
npm run db:up
npm run dev
```

The React Router development server uses port 5173. The Express API uses port 3001. Requests to `/api/*` on the web server are proxied to the API. The homepage checks `/api/v1/health` and reports connected/unavailable after hydration. Stop both processes with Ctrl+C.

The repository `.npmrc` uses an ignored local `.npm-cache` so installation also works when the cloud home directory is read-only. The cache is not part of the application.

## Verify

Install the matching Playwright Chromium build once, then run the complete gate:

```sh
npm run db:test:up
npm run browser:install
npm run check
```

On Linux CI, `npm run browser:install -- --with-deps` also installs system libraries. If browser downloads are restricted and a compatible Chromium is already installed, explicitly select it:

```sh
npm run db:test:up
PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium npm run check
```

The override is opt-in; CI uses Playwright's matching browser by default. The current cloud instance was validated with installed Chromium 154; downloading the matching Playwright browser was blocked by network policy. Playwright's browser cache defaults to ignored `.cache/ms-playwright`; `PLAYWRIGHT_BROWSERS_PATH` can override it.

`npm run check` runs lint, type checks, Vitest unit/API tests, real database/transaction tests, production builds, both HTTP smoke modes, then desktop/mobile Chromium browser tests. It stops at the first failure. The same command is used by `.github/workflows/ci.yml` for pushes and pull requests. GitHub CI execution is separate from local validation.

Individual commands:

```sh
npm run lint
npm run typecheck
npm test
npm run test:database
npm run test:watch
npm run build
npm run smoke:dev
npm run smoke:production
npm run test:e2e
```

Build first when running production smoke or E2E independently. Tests start and stop their own servers: keep ports 3001, 5173 and 3101 free. Playwright refuses to reuse an existing server and saves traces/screenshots on failure; inspect `playwright-report/` and `test-results/` (ignored by Git). CI uploads available browser failure artifacts. Test retries are disabled so failures remain visible.

- Vitest tests validate the actual startup port parser, not a copied implementation.
- Supertest tests call the same app factory used by the live server; they check real health and JSON error handlers without persistent listeners or MongoDB.
- Playwright tests use the built production server, exercise real hydration/API connectivity, controlled unavailable/malformed health responses, and 404 navigation on desktop/mobile viewports. Mobile emulation uses Chromium, not a physical device.
- HTTP smoke checks also retain coverage of the development proxy and built production assets.

The full check requires the test replica set on port 27018; plain `npm test` remains database-independent. No external service credentials are required for these isolated local services. Health is process liveness; `/api/v1/ready` separately verifies a writable replica set. Do not enable real application collection or payments at this stage.

## Run production build locally

```sh
npm run build
NODE_ENV=production MONGODB_URI="mongodb://127.0.0.1:27017/psycocity?replicaSet=rs0&directConnection=true" npm start
```

One Express process serves both the built server-rendered React application and `/api/v1/health` on port 3001. Production startup requires a successful build of both workspaces. Override the port with `PORT`; it must be 1–65535. Alternatively copy `.env.example` to `.env` and set `NODE_ENV=production` there for production startup. For normal development leave its mode as `development`. Never point tests at a production database.

Manual checks: request `/api/v1/health` through the web server and verify `{ "status": "ok", "service": "psycocity-api" }`; request `/` and confirm its HTML contains the Psycocity heading. An unknown `/api/*` path returns JSON 404, not the web document. Unknown web pages return 404. In the browser, the homepage reports API connected, or an honest unavailable state if the API stops.

## Layout and scope

- `apps/web`: React 19, React Router v7 framework mode and SSR.
- `apps/api`: TypeScript Express API and production web entry point.
- Shared packages will be added only when they have consumers.

Tailwind design primitives, TanStack Query, authentication, applications and payments are intentionally deferred to their planned chunks. This foundation does not accept applications or payments.

## MongoDB and API readiness

The Compose file pins MongoDB 8.0.17 by verified image digest. Each service initializes a single-node `rs0` replica set and waits for primary election; this supports actual transactions rather than emulating them on standalone MongoDB. Run the services on the same machine as Node. Host connections use `directConnection=true` because each container advertises its own loopback address.

| Service | Host port | Database | Storage |
| --- | --- | --- | --- |
| `mongodb` | 27017 | `psycocity` | Named development volume |
| `mongodb-test` | 27018 | `psycocity_test` | Disposable tmpfs; cleared on stop/restart |

These are local development/test services without authentication, bound to host loopback only. They are not production database deployment definitions. Production needs a provisioned authenticated replica set (or Atlas), appropriate TLS, backups and managed secrets. Do not expose these Compose services remotely or disable certificate verification.

```sh
npm run db:up           # Start/wait for the development replica set; repeatable
npm run db:test:up      # Start/wait for the separate test replica set; repeatable
npm run test:database   # Real ping/topology, commit/rollback and readiness tests
npm run db:test:stop    # Stop only the disposable test service
npm run db:stop         # Stop development MongoDB without deleting its volume
```

Do not use `docker compose down --volumes` as routine cleanup: it deletes the development volume. Inspect health with `docker compose --profile test ps`. If a port is occupied, resolve the existing service before changing configuration. Neither stopping command terminates an unrelated database.

### Configuration

Copy `.env.example` to `.env` only if you need overrides. Both API development and production commands load the root `.env`; explicit process variables take precedence. Browser-exposed configuration must never include a database URI.

| Variable | Rule |
| --- | --- |
| `NODE_ENV` | `development` (default), `test` or `production`; unknown values fail startup |
| `PORT` | Integer 1–65535; default 3001 |
| `MONGODB_URI` | Explicit non-system database name; local development URI defaults only in development; required in production/test API mode |
| `TEST_MONGODB_URI` | Optional process override for integration/smoke/E2E tests; defaults to the port-27018 URI ending in `psycocity_test` |
| `PLAYWRIGHT_EXECUTABLE_PATH` | Optional explicitly chosen local Chromium; does not affect application runtime |

`TEST_MONGODB_URI` is not automatically read from `.env`; export it when needed. Database transaction tests require the database name to end in `_test`, use a uniquely named test collection and delete only that collection. They never drop the database. Smoke/E2E servers receive the test URI explicitly and cannot silently inherit the application's production `MONGODB_URI`.

### Runtime behavior

- `GET /api/v1/health` returns 200 for a running process regardless of database availability.
- `GET /api/v1/ready` returns 200 with `{"status":"ready"}` only when the database responds as a writable replica set with sessions. It returns 503 with `{"status":"not_ready"}` otherwise and is not cached.
- Invalid configuration exits before the server starts with a field-specific error that excludes supplied secrets.
- A valid but unavailable database leaves the process live and unready. Initial connection retries run at five-second intervals; probes are bounded and the driver also handles reconnection. Standalone MongoDB cannot report ready.
- Unexpected API errors return generic JSON instead of exposing a driver stack or credentials.
- SIGINT/SIGTERM close the HTTP server, stop retry scheduling and close the database connection, with a bounded shutdown deadline.

Smoke and browser server startup now wait for database readiness. CI starts the test replica set before the shared check command and stops it afterward. Docker containers and live connections are not assumed to survive a restored cloud environment: rerun `npm run db:up` and, before validation, `npm run db:test:up`.

## API contracts and identity indexes

Shared runtime schemas live in `packages/validation`; root build/typecheck/dev commands prepare them before consumers. API conventions, query ownership and error/request-ID formats are documented in `docs/api-conventions.md`.

After starting development MongoDB, run `npm run db:indexes` before using identity persistence. It creates required unique/TTL indexes without dropping existing indexes or records and is safe to repeat. Resolve conflicting records explicitly if creation fails; do not delete user data to make a migration pass. For a deployed build the equivalent operator command is `node apps/api/dist/indexes.js` with explicit production configuration. A database connection alone does not run migrations.

## Durable email jobs (development)

`npm run worker:mail` processes MongoDB-backed jobs. `npm run mail:smoke` queues and delivers a harmless local-only test message through that same worker path. Run `npm run db:indexes` first. Local delivery writes private files under ignored `.local/mail`, not a public route or console log. Message files intentionally contain development links: treat them as private, use only synthetic data, and do not commit/share them.

Outbox payloads use authenticated AES-256-GCM encryption, atomic leased claims, unique deduplication keys, bounded retries and redacted failure codes. Delivered jobs discard their encrypted payload. Local key material is created once in ignored `.local/outbox-key` with restricted permissions; retain it while encrypted jobs exist. Never replace a key merely to bypass a decryption failure.

Production forbids the local sink and generated development keys. To use the Resend adapter later, configure `EMAIL_TRANSPORT=resend`, `RESEND_API_KEY`, a verified `EMAIL_FROM`, and a securely generated 32-byte base64 `OUTBOX_ENCRYPTION_KEY` through secret settings. No real-provider delivery has been verified or sent. Production defaults to disabled email until explicitly configured. Do not describe local delivery as a live provider test.

## Applicant accounts (local/test)

The development command now ensures indexes and starts the API, web server, shared-contract watcher and mail worker together. Start MongoDB first. `APP_ORIGIN` defaults to `http://localhost:5173`; set it explicitly if using a different origin, as JSON mutations enforce exact same-origin/custom-header checks. Do not weaken those checks to fix a mismatched development URL.

Registration, verification, login, logout and password reset are connected. Development emails appear only in private ignored `.local/mail` files. Open a synthetic recipient's link to verify/reset; links require an explicit confirmation action so merely opening email does not consume them. Member/admin registration is not public. Never put real applicant data into this development environment.

Live account registration remains disabled in production unless `POLICIES_APPROVED=true`, an HTTPS `APP_ORIGIN`, verified email configuration and a production outbox encryption key are explicitly configured. These flags do not constitute legal review; approved published policies must actually exist before enabling collection. Keep `EMAIL_TRANSPORT=disabled` until configured. `SERVE_WEB=true` permits the built web bundle in a test-mode API for local email browser tests; it does not permit the local email adapter in production mode.

Browser tests now run the built web application with an explicitly test-mode API and local worker, with production serving separately covered by HTTP smoke checks. By default the Playwright wrapper creates a uniquely owned disposable `_test` database on port 27018 and teardown removes only that fixture database. A user-provided `TEST_MONGODB_URI` is never automatically dropped. Test-runner logs/artifacts must not contain raw tokens; private synthetic mail fixtures are removed after their journeys.

## Private application photos

Development/test storage uses ignored `.local/media` files with restricted permissions. Original inputs are decoded and discarded; normalized private WebP images and thumbnails are retained. The app never exposes this directory statically. One-use upload grants expire in five minutes, previews require authenticated ownership (or later authorized staff), and photo metadata/content are validated on the server. UI limits match the server's 10 MB/200-pixel minimum and portfolio limits.

Run `npm run media:cleanup` to remove inactive rejected/deleted files and expired abandoned uploads older than 24 hours, at most 100 records per batch. Active photos are retained. Schedule this command in deployment operations later; repeat batches safely. Do not delete private directories manually when database references exist.

Production rejects local storage and defaults `STORAGE_DRIVER=disabled`. Cloudinary integration requires `STORAGE_DRIVER=cloudinary`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` through secure settings. The implemented adapter stores authenticated assets and serves authorized private bytes through the API. Its live behavior remains unverified until credentials are provided; no security checks are disabled for local validation.

## Guardian consent

Academy applicants aged 16–17 must save their name/birth date, then request a parent/legal-guardian email from the photographs step. The guardian makes an explicit adult/authority/processing-consent declaration using a separate purpose-bound link. Opening/previewing the link does not consume it, and it cannot be used to sign into the applicant account. Email proof is not independent verification of legal guardianship.

Consent evidence retains its policy version, subject fingerprint, verified/consented timestamps and declaration. Changing the saved name or birth date invalidates it. Replacements supersede old links. A separate confirmation-email link permits withdrawal within 30 days; later safeguarding/withdrawal procedures must be published before live collection. Withdrawal/decline puts a hold on further assessment and blocks new photo collection, including uploads authorized before the withdrawal. Evidence is not deleted by a TTL index.

Photos require eligible saved personal details and any applicable consent. Local/test flows use synthetic people and local delivery only. These controls do not replace reviewed policies, age/guardian assessment or a published safeguarding channel for production.

## Application submission

Verified applicants can save private academy/established-model drafts, complete the wizard and upload required views. Final review loads server-derived requirements and requires explicit accuracy/terms/privacy declarations. Submission is free and locks a versioned immutable record with exact photo and guardian-evidence references. A durable local acknowledgement is sent and the applicant sees status/history. Payment is not part of submission.

Photo cleanup retains assets referenced by submission evidence, even if later removed from an active draft. Withdrawal preserves assessment/financially relevant history; accepted applications need staff assistance until their offer/payment cancellation policy is implemented. Draft policies and synthetic local workflows do not authorize real applicant collection: production registration/collection remains disabled by default.

## Initial staff access and mandatory MFA

There is no public admin registration or HTTP bootstrap endpoint. With the development database and mail worker running, the trusted operator queues the first private staff invitation using:

```sh
npm run admin:bootstrap -- --email your-staff-email@example.com
```

Use your intended staff email; the example is not a supplied account. The command prints no passwords or invitation keys. In local mode, open only the intended recipient's private mail file. Accept the invitation, choose a password (or prove an existing account's current password), and enroll an authenticator. Recovery codes are displayed once and must be saved securely. All staff have equal operational access after MFA.

Bootstrap is one-time. Before the initial invitation is accepted, `--reissue` can replace only the original email's pending link; it cannot create a different initial administrator. Normal invitations/revocations/deactivation are then handled by MFA-verified staff. Sessions rotate after security verification, TOTP and recovery codes cannot be replayed, sensitive access changes require recent verification, and a transaction protects the last active MFA-enrolled admin from removal. Staff deactivation revokes administrative sessions/access while preserving other account memberships.

Staff secrets are encrypted using a purpose-derived key from the configured outbox master key. Production staff security is unavailable without that securely supplied key; development-only key generation is never permitted in production. If both authenticator and recovery codes are lost, use an operator-led identity-verified recovery process; there is no public MFA-reset bypass. Retain and back up encryption-key material separately from database backups under the production security policy.

## Admissions review and appointments

MFA-verified staff use **Admissions** to filter submitted applications, inspect the last submitted answers/photos, add private notes, shortlist or record an assessment, and request specific corrections. Unsubmitted drafts and correction photos are not available to other staff through review/image endpoints. Applicants can edit only requested fields; resubmission creates a new immutable snapshot and preserves earlier evidence. Staff cannot review or schedule their own application. Final admission decisions and payment offers follow in B18.

Under **Appointments**, create academy admission assessments or established-model admission castings with future event times, a capacity, delivery mode and private joining details. All editor/display times explicitly use Africa/Lagos (WAT, UTC+1). Assign individual slots from an eligible application's review page; reservations enforce event capacity, track, consent status and overlapping slots, including concurrent requests. Pending invitations reserve capacity; declining releases it, and later confirmation rechecks availability. Applicants see their own invitations and RSVP on the applicant dashboard.

Editing an event shifts assigned slots by the event start-time difference, rechecks conflicts and asks for a fresh RSVP. Reassign an individual slot from application review. Cancellation updates invitations and queues notification emails; withdrawing an application also cancels its unassessed appointments and releases reservations. Record attendance and an explicitly applicant-visible assessment outcome from the event invitation list after the appointment starts. Internal review notes remain separate. Notifications contain portal links rather than private meeting URLs, and transactions roll back changes if notification enqueue fails. The existing outbox worker delivers local synthetic email in development; no live email-provider delivery is implied.

## Admission decisions and test checkout

After assessment, staff can accept, reject or waitlist from the application review screen. Acceptance issues an immutable NGN fee/terms snapshot: academy ₦50,000; established-model track ₦30,000. The deadline form uses 14 days as a suggested default and accepts 1–90 days. Applicants see the decision, exact fee, terms and Lagos deadline in their application. Only expired, unpaid offers without an unresolved payment attempt can be renewed; renewal preserves prior fee/terms and keeps earlier evidence. Concurrent decisions/renewals cannot create two active offers. Decision notification enqueue is transactional.

Checkout is disabled unless a Paystack **test** secret is securely supplied as `PAYSTACK_SECRET_KEY` in development/test. Do not paste keys into chat, commit them, or use live keys. No public key is needed for server-initialized hosted checkout. Production checkout remains disabled until settlement and launch verification are implemented. Paystack documentation and real provider requests have not been verified from this environment (documentation access returns HTTP 403 and no test credential is configured).

With a configured test provider, accepted owners explicitly accept the current offer terms and continue to HTTPS `checkout.paystack.com`. Fees, currency and references come from the server. The payment attempt is persisted before the external request; simultaneous/repeated requests reuse it. A timeout, malformed response or unknown initialization result leaves a durable uncertain attempt and does not issue another reference or automatically retry charging. Such attempts block offer renewal pending reconciliation. The callback page only reads authenticated server-owned status; query strings and redirects cannot confirm payment or grant membership. Provider settlement/reconciliation follow in B20/B21. Automated provider tests inject a synthetic adapter/mock HTTP response and do not constitute a real Paystack integration check; browser tests force external checkout off.

## Verified test settlement, reconciliation and receipts

`POST /api/v1/paystack/webhook` consumes the **raw JSON bytes**, validates the `x-paystack-signature` SHA512 HMAC using the securely configured test secret, and durably deduplicates safe charge-event identifiers. It stores no card/authorization payload. The event queues verification; it never directly marks a payment successful. The server verifies the reference with Paystack and matches test domain, transaction reference, integer amount, NGN currency, payer email, application and offer metadata. Mismatches stay unpaid for staff review. No callback, staff action or client payload can manually set success.

`npm run dev` now also starts `npm run worker:payments`. For an independently managed local/test worker, ensure database indexes first, then run that command alongside the API and mail worker. Provider verification is idle when the provider is unconfigured; membership recovery can still process previously verified payments. It claims time-limited leases, uses bounded retry backoff and verifies unresolved attempts even if the browser is closed or the webhook is delayed. Expired worker leases can be reclaimed. Provider network calls happen outside database transactions. Settlement is transactional and deduplicated; late/expired-offer settlements, changed eligibility and unexpected charge identifiers are retained in staff review rather than discarded or granting access.

The applicant dashboard includes payment history, a private payment record, test receipt and refund updates. **Payments** in staff administration provides bounded filters, payment evidence, anomaly visibility and a “request provider reconciliation” action. Staff cannot manually mark payments successful. A verified charge remains recorded through email/receipt outages; immutable receipt creation and encrypted outbox enqueue retry separately without duplicate receipts. Test receipts are labelled explicitly. Successful settlement still grants no model/student role or membership invitation until B22.

Refund reconciliation records reference refunds already initiated with Paystack; this application does **not** initiate a refund at this step. Staff provide a provider refund ID and private note. The server independently fetches/matches provider transaction, refund ID, amount, currency and status. Only provider-confirmed processed amounts enter refund totals; transactions prevent duplicate counting or totals above the verified charge. Pending provider refunds are rechecked by the leased worker. Private staff notes never reach the applicant response. Refund notification failures do not erase verified refund truth and retry independently.

External integration remains unverified: no real provider keys are configured, official documentation access still returns HTTP 403, and all payment tests use signed synthetic fixtures/injected adapters or mocked provider HTTP. Review the current official [webhook guidance](https://paystack.com/docs/payments/webhooks/), [transaction API](https://paystack.com/docs/api/transaction/) and [refund API](https://paystack.com/docs/api/refund/) and run real test-account sandbox checks once access/credentials are available. Production charging remains disabled. Supply test secrets only through local ignored `.env` or secure environment settings; never paste them into chat or commit them.

## Paid invitations and separate member registration

The payment worker now provisions one durable membership entitlement per eligible verified paid application, including older successful payments from B20/B21. It retries invitation delivery independently of provider availability, so temporarily removing a test key does not lose a previously verified entitlement. Refunded, anomalous, unaccepted or consent-held payments cannot issue/register membership. A paid offer does not expire with its invitation: keys have a seven-day default expiry, and replacement never starts another payment.

Applicants see invitation status and a replacement-key action in their dashboard. Staff see pending membership controls on application review, can revoke a pending entitlement/key or restore/reissue to the original verified email, and cannot administer their own membership. Activated memberships are outside the pending-key revocation workflow. Reissue is rate limited and waits at least one minute after the previous issue. Old tokens and queued encrypted payloads are revoked/scrubbed. The portal never exposes/reconstructs a raw key from its hash; users receive it in their private email. Token-bearing outbox payloads have an explicit expiry and are removed after delivery, replacement, consumption or expiry cleanup.

`/member/activate` is a distinct registration step. Use the paid applicant's existing verified email and **current password** plus the single-use invitation key. A second identity/password is not created: the existing identity receives only the intended student or model membership. Token possession cannot overwrite a password or choose an admin/other role. An optional initial username supports email/username login; existing usernames are preserved. Registration consumes the invitation, grants the role/membership and rotates sessions atomically. Staff identities still require MFA after rotation.

`/member/login` and `/member/dashboard` provide separate member access, with student/model portal switching and a route back to applicant access. Applicant-only accounts do not gain member permissions by signing in. Member APIs recheck authoritative membership, paid entitlement, refund/reconciliation and consent/age eligibility; a cached role alone is insufficient. The next phase adds the actual private profile/catalogue editor. Authentication clears account-specific query caches when accounts change.

No live Paystack/account activation is claimed: verification remains limited to explicit local/test fixtures until real test keys and provider checks are available. Do not put keys or invitation tokens into Git or chat.

## Profiles, catalogue and enquiries

Student/model dashboards now have private contact profiles, separate from immutable applicant evidence. Represented adults also have a versioned professional editor with private portfolio uploads (20 images, JPEG/PNG/WebP, existing 10 MB/content/dimension/metadata checks), ordering/credits/alt text and cover selection. Save changes before submitting an immutable revision. Staff use **Portfolios** to compare/review/publish exact revisions; rejected later revisions preserve the last approved profile. Hide/unhide is separate from suspending login. Owners can privately preview approved revisions.

The public **Models** directory/detail pages render approved projections on the server and serve thumbnails through visibility/eligibility-checked URLs. Hidden profiles/images are unavailable on subsequent requests and responses use no-store. Public responses never serialize private contacts, birth dates, applicant snapshots or credentials. Booking links prefill only a currently public model preference.

**Contact** and **Booking** now persist rate-limited enquiries, acknowledge a reference and clearly avoid confirming/reserving a booking. The existing mail worker independently queues notifications, so an email outage does not lose a lead. Staff use **Enquiries** for assignment, private notes and versioned workflow/outcomes. Production collection remains subject to the policy gate.

See the working [live-testing and configuration checklist](docs/live-testing-checklist.md). It will be finalized after the remaining implementation phases; no live provider or production release is claimed.

### Academy and staff operations

The member student portal now links paid enrolments to private cohort homes. Staff manage capacity/archive policy in **Academy cohorts**, then use **Manage teaching** for Lagos-time hybrid sessions, resources, attendance corrections, progress, assignments and certificates. Configure actual completion criteria and thresholds before assessing completion. Adult representation requires a separate requested review and staff approval; the model profile still requires portfolio publication review. No second fee is collected by this transition.

Course files and assignment submissions currently support private UTF-8 text files up to 64 KB and approved HTTPS learning links. PDFs, video and arbitrary office uploads are not supported. Portfolio photos continue using the normalized private-image service. Certificate records can be printed privately; they do not claim outside accreditation and have no public personal-data lookup.

**Content & operations** manages structured homepage/academy draft/preview/publication, private operational counts and safe retries of unexpired failed email. It cannot mark payments successful or resurrect expired invitations.

### Deployment and release evidence

- [Staging deployment](docs/staging-deployment.md): executable Docker/Compose definitions, isolated services, additive index startup and rollback.
- [Recovery runbook](docs/recovery-runbook.md): `npm run test:recovery` uses the local test MongoDB container for an isolated synthetic dump/restore and protected-journey/index checks. Build first with `npm run build`.
- [Release gate](docs/release-gate.md): local verification versus blocked remote/provider/business checks. Live payments remain intentionally disabled.
- [Live-testing inputs and checklist](docs/live-testing-checklist.md): keys, secrets, agency information and required end-to-end staging tests. Enter secrets through ignored files/secret management, never chat or Git.

`NODE_ENV=production` can run test-mode Paystack only with explicit `DEPLOYMENT_STAGE=staging` and `PAYSTACK_ENVIRONMENT=test`; deployment preflight requires TLS MongoDB, HTTPS origin, private Cloudinary, Resend and the stable encryption key. Live keys are rejected. No remote resources have been provisioned or deployed by these changes.
