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
