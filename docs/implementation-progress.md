# Implementation progress

## B01 — Runtime and workspace

Status: complete. Scope: reproducible runtime, TypeScript npm workspaces, minimal SSR web application and API, development proxy, production entry point and integrated HTTP smoke checks.

### Implemented and connected

- Pinned Node 24.19.0 and npm 11.9.0, exact direct dependency versions, and npm lockfile.
- `apps/web` uses React 19 and React Router 7.18.4 framework mode with server rendering. No `react-router-dom` dependency.
- `apps/api` uses Express and TypeScript. `/api/v1/health` returns process liveness only; unknown API paths return JSON 404.
- `npm run dev` starts both services and proxies same-origin `/api/*` requests from the Vite web server to Express.
- `npm run build` builds the API and web bundles. `NODE_ENV=production npm start` serves both the SSR application and API through Express.
- The homepage checks the API after hydration and displays connected/unavailable status. It does not accept applications or imply completed business features.
- Smoke commands start their own processes, check real HTTP boundaries and stop those processes. `ReadMe.md` documents setup, verification, modes, ports and configuration.

### Validation

Passed in the current cloud instance:

- Clean installation with `npm ci` from the lockfile.
- `npm run typecheck`: API and generated React Router route types.
- `npm run build`: API output, web client assets and SSR bundle.
- `npm run smoke:dev`: health through development proxy, server-rendered page content, client asset, JSON API 404 and web 404.
- `npm run smoke:production`: same checks through the built Express production entry point.
- `npm audit`: zero vulnerabilities across the full dependency tree after upgrading concurrently to patched version 9.2.5.
- Invalid `PORT` startup: exits with a clear error instead of silently choosing a port.
- `git diff --check`: no whitespace errors.

### Findings and limitations

The initial full audit identified vulnerable shell-quote through concurrently 9.2.1. Updated concurrently to 9.2.5 and reran both smoke modes successfully.

React Router's default SSR entry requires explicit `@react-router/node` and `isbot` dependencies. They are declared and locked so type generation no longer tries to install missing runtime packages automatically.

The current React Router v7/Vite combination emits upstream `envFile` deprecation and v8 future-behavior notices. These are warnings; type checks and both build/runtime modes pass. No v8 migration was attempted.

HTTP smoke checks verify real served HTML, API and client-asset availability. They do not execute browser hydration, so the visual API status transition is not claimed as browser-automated validation. B02 adds browser automation and the broader test/lint/CI baseline.

MongoDB, Tailwind design-system components, TanStack Query, authentication, applications, payments and production deployment remain unimplemented as planned. No production services were provisioned and no live payments were made. Existing specs.md and prompts.md were preserved.

### Handoff at B01 completion

B02 — Automated baseline: add type/lint/build CI, meaningful unit/API tests and a browser smoke journey around the connected B01 foundation. Do not begin database or business-feature implementation until its scheduled chunk.

## B02 — Automated baseline

Status: complete in the current instance. Requirement mapping: B02 and the validation/quality portions of PR-12. No business features or MongoDB dependency were introduced.

### Implemented and connected

- Added ESLint flat configuration for JavaScript/TypeScript and React hook rules; warnings fail the lint gate. Generated output, browser artifacts and caches are excluded.
- Added Vitest and Supertest against actual production modules. Extracted Express construction into `createApp` and port validation into `parsePort`; the live server imports both, and tests import those same implementations.
- Added 12 port-validation unit cases and four API integration cases for health JSON, framework-header suppression, unknown endpoints and unsupported methods. No database or persistent listener is required.
- Added Playwright against the built production server on port 3101, with desktop and mobile Chromium projects. Five journeys run in each: real hydration/API success, controlled 503 health failure, malformed success body, web 404/home navigation, and JSON API 404.
- Playwright starts/stops its server, refuses an existing server, uses zero retries, and saves failure screenshots/traces. A shared CLI wrapper uses a writable ignored browser cache. An explicit executable-path override supports an already-installed compatible Chromium.
- Added `npm run check`, combining lint, all TypeScript checks (including test/config files), unit/API tests, build, development/production HTTP smoke checks and browser tests.
- Added GitHub Actions CI for pushes and pull requests with locked install, pinned runtime/npm, managed Chromium installation, the same check command, least-required repository permissions, concurrency cancellation, timeout and failure artifacts.
- Updated README with normal and restricted-cloud verification commands and test/port/cache behavior. Fixed existing smoke-script lint issues without changing its functional checks.

### Executed validation

- `npm ci`: passed with the updated lockfile.
- `npm audit`: zero vulnerabilities.
- `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium npm run check`: passed after final restoration of the failure probe.
- Vitest: **16 passed**, two test files, no failed/skipped cases.
- Playwright: **10 passed** across desktop/mobile emulation, no failed/skipped cases.
- Integrated gate also passed lint, type checking, production build and both HTTP smoke modes.
- Deliberately changed the expected default port to the wrong value and ran the same `npm run check` command: it exited 1 at the failing test. Restored the file byte-for-byte, then reran the complete gate successfully. The false assertion is not present in the repository.
- Test-runner cleanup left no application/test server running after completion.

### Limits and follow-up

The managed Chromium download was rejected with HTTP 403 `Domain forbidden` for cdn.playwright.dev. Browser tests were actually executed using existing `/usr/bin/chromium` version 154.0.8037.57 with the explicit `PLAYWRIGHT_EXECUTABLE_PATH` override; they were not skipped or replaced with HTTP-only checks. This differs from Playwright 1.64.1's matched browser build. CI is configured to install that matched build, but no remote GitHub Actions execution is claimed: changes have not been pushed as part of this task.

Upstream React Router/Vite deprecation/future notices remain non-failing. Intentional unknown-page tests produce expected route-not-found server messages; Chromium also requests an absent favicon. No speculative branding or runtime changes were added to suppress those messages.

### Next chunk

B03 — Database and API shell: introduce reproducible replica-set MongoDB, database-dependent readiness and validated environment configuration while preserving these connected checks.

## B03 — Database and API shell

Status: implemented and validated in the current cloud instance. Scope: actual replica-set MongoDB, configuration, readiness, safe errors, connection lifecycle and integrated developer/test startup. No application/business collections or authentication features were introduced.

### Implemented and connected

- Added `compose.yaml` with the official MongoDB 8.0.17 image pinned by digest. Both services initialize/elect a single-node `rs0` replica set and expose ports only on host loopback.
- Development database: port 27017, named persistent volume. Test database: port 27018, separate disposable tmpfs storage. Startup commands are idempotent; stop commands preserve the development volume.
- Added Mongoose connection lifecycle with bounded connection/probe timeouts, no buffered commands, disabled automatic indexing, replica-set/session capability checks and safe diagnostics.
- Added validated `NODE_ENV`, `PORT` and MongoDB URI configuration. Only development has a local database default; production/test API startup requires an explicit named non-system database. Invalid values never appear in configuration errors.
- Added `/api/v1/ready` returning 200 only for a responsive writable replica set, otherwise 503. Existing `/api/v1/health` remains independent process liveness.
- API starts live but unready when the configured database is unavailable, retries initial connection and supports recovery. Shutdown cancels retries and closes HTTP/MongoDB with a deadline.
- Added safe unexpected-error middleware that returns generic errors and avoids logging raw driver errors, including after response headers have been sent.
- Both API startup modes read the root optional `.env`. Updated `.env.example`, README, smoke scripts and Playwright readiness configuration. Automated application processes use the separate test URI explicitly, not a production application binding.
- Added `test:database` to the shared gate. CI starts its isolated replica set before the gate and stops it afterward. `npm test` remains database-independent.

### Validation evidence

- Both Docker services started healthy. Repeated development/test startup commands succeeded without reinitializing or deleting existing development storage.
- `npm ci`, lint, TypeScript checks and production builds passed.
- Unit/API tests: **33 passed** across four files, including config validation, secret redaction, readiness failure, liveness independence and safe errors.
- Real MongoDB integration tests: **5 passed**, including topology/ping, transaction commit, transaction rollback, readiness after disconnection and an unreachable service.
- Browser tests: **10 passed** across desktop/mobile Chromium. Development and production HTTP smoke checks also wait for actual database readiness and pass.
- Ran the actual production API against the disposable test service, stopped that service, then restarted it: readiness changed **200 → 503 → 200**, while liveness remained 200. SIGTERM produced clean exit code 0. The test service was restored healthy afterward.
- Ran documented `npm run dev` against the development service: direct and proxied readiness returned 200 and the SSR homepage loaded. Stopped only the web/API processes started for validation.
- Full dependency audit reported zero vulnerabilities after the Mongoose addition.

### Reusable cloud configuration

Saved the `install_script` and `start_skill` draft fields with locked installation/build and explicit replica-set/service restart/readiness instructions, including the existing system-Chromium option. Saving was confirmed; it does not publish a snapshot or run the scripts. Review/save the draft in environment settings and publish the environment to activate it. Fresh-task restoration has not been independently tested. Containers and connections must be recreated, not assumed to survive.

### Limits

Local Compose databases are unauthenticated development/test infrastructure, not a production database deployment. Production hosting, credentials, backup policy and live deployment remain later work. Browser tests use the existing explicitly selected Chromium because managed downloads remain blocked in this environment. GitHub Actions configuration was validated through its shared local command; no remote Actions run is claimed. Existing upstream React Router/Vite notices and expected unknown-route messages remain non-failing.

### Next chunk

B04 — Brand and navigation: apply the visual design tokens and accessible navigation/primitives to the connected foundation. Do not add admissions or payments prematurely.

## B04 — Brand and navigation / B05 — Public brochure

Status: complete. Added Tailwind v4, self-hosted OFL font assets (Manrope and Cormorant Garamond through Fontsource), soft-gold/ivory/charcoal tokens, responsive layouts, keyboard skip navigation, reusable consumed buttons/feedback, mobile menu, footer, and original abstract SVG editorial art/favicon. No placeholder subjects are presented as agency models.

Connected homepage, joining-track comparison, hybrid academy information, FAQ and clearly unpublished policy pages. Applicant/member/admin entry points and catalogue/contact/booking routes truthfully explain unavailable functionality until their implementation chunks. Prices, age boundaries, guardian consent, free submission and payment after acceptance are disclosed. No invented business contacts or curriculum commitments. API status moved from the landing page to `/status`; its real connectivity/failure tests remain in place.

Validation: lint, type checks, production build, development/production HTTP smoke checks and 16 desktop/mobile browser tests passed. Public tests cover track CTAs, price/process disclosure, keyboard skip navigation, horizontal overflow and policy/invitation disclosures. No application collection or payments enabled.

Next: B06, shared API contracts and TanStack Query integration.

## B06 — Shared API contracts

Status: complete. Added the consumed `@psycocity/validation` workspace with runtime Zod health/readiness/error schemas; API validation, stable safe error codes and bounded correlation IDs; a schema-validating same-origin API client; and request-scoped TanStack Query providers. `/status` is its real first consumer, including cancellation, retry control and manual refresh. Shared contracts build/watch before API/web consumers. Documented future list bounds and SSR/query ownership in `docs/api-conventions.md` without adding unused pagination code.

Validation: 35 unit/API cases, five real database cases, 16 desktop/mobile browser cases, lint/type/build checks and both HTTP smoke modes passed. Invalid request/query and malformed response coverage remain explicit, and updated error tests assert the new contract plus request ID. No global private query cache or duplicate loader requests.

Next: B07 identity persistence and authorization primitives, followed by the email job foundation and applicant access.

## B07 — Identity persistence and authorization

Status: complete. Added strict user/session/purpose-bound auth-token models with normalized unique identifiers, hashed credentials, explicit repeatable unique/TTL index setup and no automatic index deletion. Added Argon2id hashing (64 MiB, three iterations), salted verification, strong opaque sessions, expiration/revocation, ownership-scoped revocation and role middleware. The actual API now consumes identity services through a safe authenticated `/api/v1/auth/me`; no test login backdoor or public role assignment exists.

Validation: 37 unit/API tests and 12 real-database tests passed; lint and type checks passed. Database tests exercise actual unique indexes, absent/duplicate usernames, hashes and safe current-user projection, unauthorized/staff-role denial, foreign-session revocation denial, expired/suspended access and token uniqueness. Ran the development index command twice successfully without deleting data. Public registration/UI follows B09, after B08 email jobs.

## B08 — Email job foundation

Status: complete for local/test development. Added encrypted durable MongoDB outbox, atomic leases/reclaim, deduplication, five-attempt bounded retry/backoff and sanitized delivery metadata. Worker discards sensitive payload after successful send. Runnable worker and local smoke command consume the actual queue. Development sink writes private ignored mail files idempotently; local transport and generated keys are prohibited in production. Added a real Resend adapter without sending external email or inventing provider credentials.

Validation: lint/type checks, explicit index setup and actual local enqueue/delivery smoke passed. Unit suites have 39 cases; database suites have 17 cases, including encrypted persistence, deduplication, retry, concurrent claim, abandoned lease and retry exhaustion. Production sink/key safeguards and ciphertext authentication/tampering checks pass. Resend credentials/domain verification and a real-provider delivery check remain production prerequisites; local development proceeds through the explicit test-only adapter.

Next: B09 applicant authentication and browser flows, reusing the existing identity and mail services.

## B09 — Applicant authentication

Status: complete for local/test workflows. Connected registration, email verification/resend, email/username sign-in, logout, reset request and one-time password reset to real UI, shared schemas, transactional identity/token/outbox services and the durable worker. Login rotates the current session; password reset revokes all existing sessions. Added Mongo-backed rate limits, strict server inputs, safe account-enumeration responses, origin/custom-header checks, session-bound CSRF for authenticated logout, secure production cookies and sensitive-page no-index/referrer controls. No password/session is stored in browser localStorage.

Live registration is disabled until explicitly approved policies, production origin and email transport are configured. Local forms are labelled for synthetic development data. Production forbids local mail/key generation. Existing member/admin access remains unavailable until its own invitation/MFA chunks. `/apply` now reaches applicant registration and the real dashboard, keeping member activation separate.

Validation: lint/type/build checks, 39 unit/API cases, 25 database cases and 20 desktop/mobile browser cases passed. Browser tests actually register, read only synthetic recipient mail from the local delivery sink, consume verification, sign in, sign out and reset through delivered links; prior session denial is verified. API tests cover transactional rollback on enqueue failure, duplicates, role injection, cross-origin/CSRF denial, one-time/purpose-bound links, generic errors, secure cookies and rate limiting. E2E runs create an isolated owned `_test` database, clean only that fixture database, and stop their own app/worker processes. No live email delivery or live applicant collection claimed.

Next: B10 application draft API and dashboard wiring, then B11 accessible resumable forms.

## B10 — Application drafts / B11 — Resumable wizard

Status: complete. Verified applicants can create/resume separate academy and established-model drafts, with one active application per track, ownership-scoped reads/writes, bounded cursor pagination and optimistic version checks. Added strict shared draft schemas, server-side date/numeric validation, protected state fields and explicit draft locking. Blank Mongoose answer objects are retained rather than minimized away.

Connected dashboard draft actions/list and an accessible six-step wizard for personal information, location, measurements, experience, track-specific background and draft review. Added save/pending/error/unsaved feedback, reload/resume, focus management, navigation protection, calendar-accurate Lagos-time age guidance and guardian requirements. Successful saves preserve edits made while a request is in flight; stale saves return conflict rather than overwriting data. Submission/payment remain unavailable pending photos/consent/submission chunks.

Validation: lint/type/build checks, 42 unit/API tests, 29 database tests and 22 desktop/mobile browser cases passed. Tests verify both tracks, uniqueness, cross-owner denial, incomplete draft saves, stale/version/state protection, invalid dates/measurements, cursor limits, saved field reload and separate track resume. Existing auth/reset flows continue passing.

Next: B12 private application photo uploads.

## B12 — Private photo uploads

Status: complete for local/test workflow. Added bounded one-time, owner-bound five-minute upload grants; pre-body authorization/rate limiting; actual decoder/MIME/dimension/animation checks; safe WebP normalization and thumbnails with EXIF/GPS removed; private authenticated previews; transactional replacement/removal and ten-image portfolio limits. Attachment coordination does not overwrite answer versions. The wizard has a connected photographs step with real file requests, checking/error states and private previews. Added inactive/orphan cleanup command with a retention window and active-asset protection.

Local files are private ignored development storage, forbidden in production. Added an authenticated Cloudinary adapter with server-side signed transport/proxied private reads; Cloudinary bindings were checked and are absent, so no external upload/read integration is claimed. Production storage remains disabled until configured. No public original/private photo URLs are returned.

Validation: lint/type/build checks, 45 unit/API tests, 34 database cases and 22 desktop/mobile browser cases passed. Tests cover re-encoding and metadata stripping, invalid/oversized/mismatched images, expired/replayed/foreign grants, owner-only actual image bytes, replacement, quotas and cleanup retaining active photos. Browser journey uploads a synthetic image and confirms its private preview actually decodes. Owned E2E assets are removed with the fixture database.

Next: B13 guardian consent, including requiring valid consent before collecting minor applicants’ photos.

## B13 — Guardian consent

Status: complete for local/test workflow. Added guardian invitations and limited public previews, explicit adult/authority declarations, email-possession evidence, versioned consent bound to applicant name/date, expiry/replay/decline handling, separate withdrawal capability and durable confirmation email. Guardian tokens are not identity sessions. Evidence is retained without TTL deletion; replacing details invalidates old consent. Withdrawal adds an application hold and prevents new uploads, including previously issued grants. The private owner workflow and guardian decision/withdrawal screens are connected to the actual services.

Validation: 38 real-database cases passed, covering consent, declaration denial, replay, expiry, foreign-owner access, altered subject, declined/withdrawn permissions and blocking a pre-withdrawal upload grant. Existing 45 unit/API cases pass. Browser suite's 22 existing cases passed; a guardian fixture navigation race was isolated and fixed by waiting for the created application URL. Targeted guardian consent/withdrawal journeys then passed on desktop and mobile. No assertions were disabled. Actual landing-page desktop/mobile renders were visually inspected; unsupported arrow glyphs were replaced with SVG icons.

Next: B14 final validation, free application submission, immutable snapshots and applicant status history.

## B14 — Free submission and status history

Status: complete for local/test workflows. Added track-specific final validation, Nigerian state/phone normalization, required photo/guardian checks, explicit versioned declarations and server-derived requirements. Submission atomically stores an immutable revision, locks the current answers, retains referenced private images, appends status history and queues one acknowledgement. Replays return the existing result without duplicate records/messages. No payment is collected or required. Added private status/timeline/submitted-details screens and idempotent withdrawal preserving evidence/history.

Validation: 48 unit/API cases, 44 real-database cases and 28 desktop/mobile browser cases passed, alongside lint/types/build. Both complete track journeys fill the actual wizard, upload four synthetic photographs, accept declarations, submit, receive local acknowledgement and reload the locked application. DB checks cover minor consent snapshots, age/missing-photo/declaration denial, duplicate submissions, queue-failure rollback, withdrawal and retaining referenced assets through cleanup.

A full-form browser run found that schema property ordering could incorrectly leave a saved form marked dirty. Fixed semantic draft comparison with regression coverage; did not bypass the unsaved-change/consent protection. Submission fixture accounts avoid redundant signup requests so genuine abuse limits stay enabled. First-start key creation and local email writes are now atomic and race-tested. No live application collection, live provider email/storage, deployed policy approval or publication is claimed.

Next: B15 secure staff invitations, mandatory MFA and audit administration.

B14 browser revalidation completed after the semantic-save fix: all 28 desktop/mobile cases pass, including both complete submission journeys. Current unit/API count is 48 and real-database count is 44. The initial known-broken browser run was stopped after diagnosis; its interrupted/unrun tests were not counted as passed. The corrected full run completed successfully.

## B15 — Staff access, MFA and audit

Status: complete for local/test. Added trusted-operator one-time bootstrap (no HTTP bootstrap/public admin registration), email-bound staff invitations and safe existing-account activation. Staff sessions require authenticator MFA before operational access, rotate after verification, and support hashed single-use recovery codes. TOTP replay, expired challenges, credential-version races, encrypted secret handling and recent verification for access changes are enforced server-side. Transactional roster fencing protects the last active MFA-enrolled administrator even with simultaneous deactivation attempts or unenrolled pending staff.

Connected staff login/activation, locally generated QR setup, one-time recovery-code display, agency overview, staff invitation/revocation/deactivation and read-only audit history. Staff have equal permissions and individual attributable accounts. Deactivation revokes staff sessions without removing other memberships. Secrets/keys/recovery material are excluded from staff and audit DTOs. Audit actors are readable staff identifiers, not exposed credential material.

Validation: 48 unit/API cases, 51 real-database cases and 30 desktop/mobile browser cases passed with lint/type/build. Browser tests exercise actual authenticator setup, independent invited staff contexts, equal navigation/access, deactivation, audit and recovery. Database tests cover bootstrap/reissue/single-use, existing passwords, secret projections, pending-MFA denial, last-admin/concurrent revocation, recent verification and stale-credential session binding. Actual bootstrap CLI was exercised against an isolated synthetic database: first invocation queued one private invitation and duplicate setup failed; fixture data was removed. No real staff email was sent or production account invented.

Next: B16 admissions review, scoped corrections and audited review transitions.

## B16 — Admissions review and scoped corrections

Status: complete for local/test; verified in the combined B16/B17 regression gate below. Connected staff queue filters/pagination, private submitted snapshots/photos, actor-labelled history and staff-only notes. Optimistic review transitions reject stale versions and self-review. Requests name allowed fields and public instructions; owner API/UI enforce scoped answers and photo edits. Unsubmitted correction evidence remains private, and resubmission creates new immutable answer/media evidence while retaining the original. Consent holds allow guardian-only correction requests and block assessment. Save writes bind both the read version and state to prevent a concurrent state change from bypassing scope checks.

Added real database staff/applicant boundary tests and desktop/mobile browser correction-to-resubmission journeys. Browser journeys pass after fixing test navigation timing and using a precise saved-note selector; these failures were not counted as passing checks.

## B17 — Admission scheduling

Status: complete for local/test; combined regression verification passed. Added indexed admission events/invitations, staff event editor and roster, review-page slot assignment, applicant dashboard invitations/RSVP, attendance and applicant-visible outcomes. Transactional schedule fencing serializes reservations across events, enforcing audience, capacity, owner/event slot conflicts, consent eligibility and current versions. Staff cannot schedule/assess themselves. Event updates shift slots, revalidate, persist fresh RSVP state and enqueue version-deduplicated notifications; cancellation and withdrawal release reservations and remove private joining access. Scheduled assessments must use event attendance/outcome handling rather than the manual review shortcut.

Focused database verification: 5 B16/B17 cases pass, including simultaneous capacity reservations, private evidence/meeting access, scoped resubmission, stale/self-review denial, consent holds, reschedule/cancel, premature attendance, notification rollback and withdrawal slot release. Scheduling and corrections browser journeys pass on desktop and mobile. No live notification delivery or final admission/payment flow is claimed.


B16/B17 final gate: `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium npm run check` passed with lint, type checks, 48 unit/API tests, 56 database tests at that invocation, production build, development/production HTTP smoke checks and all 34 browser tests. A final full database run after adding the guardian correction-scope regression passed all 57 cases; focused revalidation of the final guardian scope changes passed lint, types and all 6 B16/B17 database cases. Production dependency audit (`npm audit --omit=dev`) reported zero vulnerabilities. Earlier browser failures were precise-selector/navigation issues and were corrected before the successful full run. No failing or skipped checks are counted as passed.

No live email/storage provider, final admission decision, Paystack payment, member activation or deployment is claimed. Local/test adapters and production policy restrictions remain explicit. Setup/navigation/behavior are documented in ReadMe.md. No changes were committed or pushed.

Next: B18 — acceptance/rejection/waitlist decisions, immutable fee/policy offers, configurable deadlines and renewal. Academy offers remain ₦50,000 and established-model offers ₦30,000, payable only after acceptance; no checkout button is enabled before B19.

## B18 — Admission decisions and immutable offers

Status: complete for local/test; combined regression gate passed. Staff review now supports assessed/waitlisted acceptance, rejection and waitlisting with applicant-visible reasons, actor audit and transactional decision email. Acceptance snapshots integer NGN fees (academy 5,000,000 kobo; established 3,000,000), track, terms text/version, deadline and application version. The UI labels 14 days as a suggested default, configurable per offer from 1–90 days. Owners see current/prior offers, exact terms and Lagos expiry in their application status.

One-active-offer and revision indexes plus application write conflicts protect simultaneous decisions/renewals. Submitted evidence/fee/terms/deadlines cannot be silently rewritten. Expired unpaid offers can be renewed preserving the original price/terms and prior revision; an unexpired, paid or unresolved-attempt offer cannot be replaced. Eligibility/guardian checks, self-review denial, ownership, version conflicts and email enqueue rollback are enforced at the API boundary. Five focused database cases pass. Desktop/mobile browser journeys passed the assessed → waitlisted → accepted → owner offer path before B19 wiring, without exposing a fake Pay button.

## B19 — Server-owned Paystack test checkout initialization

Status: implemented with synthetic adapter verification; real provider validation blocked by absent securely configured Paystack test secret and documentation access returning HTTP 403. Runtime integration uses native HTTPS fetch to Paystack hosted-checkout initialization with a test secret supplied through the environment. No live key or production checkout is accepted at this step. Browser regression explicitly clears the provider key, preventing unintended external requests. No provider credentials were invented or exposed; unit adapter credentials are isolated synthetic fixtures intercepted by mocked fetch.

Accepted owners must accept the current immutable offer terms. The API resolves fee/currency and creates a unique random reference/attempt before network calls. Application/offer fencing and one-active-attempt constraints protect concurrent/repeated requests. Existing checkout links resume the same attempt. Timeouts/malformed/mismatched provider responses leave a durable uncertain state and never silently initialize another reference; pending reconciliation blocks renewal. The return/polling page reads only owner-authorized server records and cannot grant payment success, roles or membership. Checkout destinations require the exact HTTPS checkout.paystack.com host without userinfo or alternate port. Unconfigured checkout is honestly unavailable; configured test checkout is explicitly labelled as such.

Focused checks passed: 54 unit/API cases including adapter request/destination/reference/configuration boundaries; 8 B18/B19 database cases including concurrent initialization, persistence before provider call, repeated reference reuse, uncertain-response recovery state, renewal lock, wrong-owner denial, expired/unaccepted offer denial, forged fee/terms/state rejection and no membership assignment. The full regression gate passed. B20 settlement and B21 reconciliation are intentionally not claimed as implemented; uncertain attempts currently need those follow-up capabilities before they can be resolved.


B18/B19 final verification: `PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium npm run check` passed lint, type checks, 54 unit/API tests, all 65 real-database cases, production build, development and production HTTP smoke checks, and all 34 desktop/mobile browser cases. Browser coverage extends the complete corrections journey through assessment, waitlisting, acceptance, owner fee/terms display and rejection of a forged-success callback reference. External checkout is disabled in browser tests and no real provider payment is claimed.

The first integrated gate stopped at a development smoke failure: the contracts watcher rewrote unchanged output, restarting the API during an assertion. Enabled incremental contract compilation with build metadata inside ignored dist so a prebuilt, unchanged watcher startup does not rewrite output. Verified identical output timestamps across repeated builds, then development smoke and the entire gate passed. Failed or unexecuted checks from the earlier run were not counted as passing.

Next dependency-ready chunk: B20 — verified settlement, followed by B21 reconciliation/receipts. Actual Paystack test-provider validation still requires a securely supplied test secret and access to official provider guidance/endpoints. Live charging and membership activation remain unavailable. No production deployment is authorized or performed.
