# Psycocity — Incremental Code-Generation Prompts

This file implements the blueprint in [specs.md](specs.md). It contains 40 separate prompts, mapped one-to-one to B01–B40. Paste one complete `text` block into the coding LLM at a time. The prompts are intentionally implementation instructions, not claims that features already exist.

## How to use this sequence

1. Start with B01 and inspect the result before continuing. Complete dependencies before dependent prompts; do not assume previous code is correct merely because a prompt ran.
2. Each prompt includes its own context, smaller implementation steps, integration requirements and verification gate. Where a prompt has several steps, implement and validate them in order; split into focused commits or PRs as needed.
3. Run a prompt against the current repository, not a fresh scaffold. Preserve working behavior and user changes. A failed prerequisite requires repair or a concrete blocker report, not another parallel implementation.
4. The specification is authoritative for business behavior. If existing code conflicts, diagnose and correct within scope; ask only when a real product decision prevents progress.
5. Do not execute every prompt in one turn. Advance only after the current gate is met. Independent infrastructure can be prepared earlier when its listed dependencies are complete.
6. Keep incomplete later capabilities unavailable with honest UI states. Do not ship fake success, broken links, unused modules or disconnected handlers. Foundation-only services must have a real runtime, command or integration test consumer immediately and receive their product consumer in subsequent prompts.
7. For each completed prompt, update `docs/implementation-progress.md` with scope, requirement/chunk ID, integration points, commands/results, limitations and the next chunk. Create this progress file in B01 and keep it concise; never record credentials or token values.

The shared rules are repeated inside each prompt so individual blocks remain usable without copying this introduction. Production policies, credentials and live approval remain external prerequisites; test-mode development can proceed without inventing them.

## Delivery groups

- B01–B06: reproducible foundation, visual system and public brochure.
- B07–B14: identity and complete unpaid application submission.
- B15–B23: administration, decisions, verified payment and paid member activation.
- B24–B29: model representation, public catalogue, enquiries and professional castings.
- B30–B35: academy operations, learning extensions and content/staff tooling.
- B36–B40: deployment evidence, end-to-end validation, hardening and launch gates.

Core agency launch can defer B30–B34 if its scope is stated accurately; rerun affected release gates when academy features ship. B36 may run after its dependencies to provide staging earlier. Sequential numbering is the simplest default, not a requirement to delay all staging work until academy completion.

---

## Prompt 01 — Runtime and workspace

Blueprint: **B01** · Prerequisites: **None**

```text
Implement B01 — Runtime and workspace in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: None.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Pin Node and package manager.
2. Create TypeScript npm workspaces.
3. Add web/API development commands and lockfile.

Chunk-specific engineering and integration requirements:
Use React Router v7 framework mode with React 19 and TypeScript so public SSR is possible later. Use react-router, not react-router-dom. Create only the packages needed now; shared packages must actually be imported. Pin a supported Node LTS and npm version. Provide a minimal rendered home route and an Express health route, both reachable through documented commands. Wire the development API proxy and production build entry points; do not create unused database or business stubs.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Clean install and both processes start from documented commands.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 02 — Automated baseline

Blueprint: **B02** · Prerequisites: **B01**

```text
Implement B02 — Automated baseline in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B01.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Configure type/lint/build checks.
2. Add unit/integration/E2E runners.
3. Run them in CI with real representative tests.

Chunk-specific engineering and integration requirements:
Use Vitest for appropriate unit tests, Supertest for API integration, and Playwright for browser journeys unless the repository already has suitable tooling. Exercise the actual health handler and rendered route, not a test-only copy. Configure test servers and graceful cleanup; do not require MongoDB before B03. Verify a deliberate temporary failing assertion makes the runner/CI command fail, then restore it. Keep real new tests with subsequent features rather than creating empty suites.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
CI fails on a deliberate broken build/test and passes when restored.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 03 — Database and API shell

Blueprint: **B03** · Prerequisites: **B01**

```text
Implement B03 — Database and API shell in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B01.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Configure replica-set MongoDB locally/test.
2. Add Express health/readiness and safe errors.
3. Add validated environment configuration.

Chunk-specific engineering and integration requirements:
Provide a reproducible local/test MongoDB replica-set setup and initialization/readiness instructions, using Docker Compose when supported. If Docker is unavailable, diagnose the capability rather than downgrading required transaction semantics. Separate liveness from database-dependent readiness. Validate configuration before startup, redact connection credentials, and close servers/connections on termination. Exercise a real database request and transaction in the test environment. Wire readiness into the API runtime and developer start instructions.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Readiness fails without database; valid configuration connects.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 04 — Brand and navigation

Blueprint: **B04** · Prerequisites: **B01**

```text
Implement B04 — Brand and navigation in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B01.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Define colour/type/spacing tokens.
2. Build accessible form/button primitives.
3. Implement public and portal layout shells.

Chunk-specific engineering and integration requirements:
Implement only primitives consumed by current screens: buttons, labelled inputs, feedback, and layout/navigation. Define gold #e7db9d, ivory, charcoal and semantic tokens; validate contrast. Use responsive spacing and licensed font assets/fallbacks. Add portal shells as navigable, clearly unavailable states, not unprotected fake dashboards. Include focus, skip navigation, reduced-motion and keyboard checks. Apply the components to the existing home route.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Keyboard navigation and mobile layout work; tokens match brief.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 05 — Public brochure

Blueprint: **B05** · Prerequisites: **B04**

```text
Implement B05 — Public brochure in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B04.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Build homepage.
2. Build join/academy information.
3. Add contact/policy routes and metadata.

Chunk-specific engineering and integration requirements:
Build the compact homepage, join comparison and hybrid academy information. Clearly show academy 16+, established 18+, ₦50,000/₦30,000 and payment only after acceptance. Route application CTAs to a truthful forthcoming application state until B09–B14; never fake submission success. Use an informational contact page until B28 adds the working form. Mark draft policies as unapproved and prevent production collection based on placeholders. Add server-rendered title/description, canonical handling and no invented agency contact details.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Track fees and post-acceptance payment are clear; no unlicensed imagery.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 06 — Shared API contracts

Blueprint: **B06** · Prerequisites: **B02, B03**

```text
Implement B06 — Shared API contracts in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B02, B03.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add shared schemas/error codes.
2. Add API client and query conventions.
3. Define pagination and request IDs.

Chunk-specific engineering and integration requirements:
Add shared runtime request/response schemas and typed errors, with a small API client used by an existing readiness/status component. Connect QueryClientProvider and establish query keys, cancellation, mutation invalidation and bounded pagination. Router loaders and TanStack Query must share hydration conventions rather than double-fetching. Include a real contract failure test, correlation IDs and safe field validation errors. Do not build unused generic repositories or speculative endpoint layers.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Invalid requests return consistent errors without leaking internals.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 07 — Identity persistence

Blueprint: **B07** · Prerequisites: **B03, B06**

```text
Implement B07 — Identity persistence in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B03, B06.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add user/session/token schemas and indexes.
2. Implement password hashing.
3. Add ownership/role middleware.

Chunk-specific engineering and integration requirements:
Implement normalized unique email and partial unique username indexes, secure password hashing, opaque hashed sessions and purpose-bound auth tokens. Add an explicit repeatable index command. Connect these services to existing Express middleware and test them through a protected test harness using the actual middleware; do not expose diagnostic identity endpoints publicly. Verify ownership, expiry and role denial with persisted users. B09 will add public login UI; do not invent temporary insecure login routes.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Duplicate identities and unauthorized record access fail.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 08 — Email job foundation

Blueprint: **B08** · Prerequisites: **B03, B06**

```text
Implement B08 — Email job foundation in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B03, B06.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add outbox and leased worker.
2. Add provider adapter with local test sink.
3. Add safe templates/retry records.

Chunk-specific engineering and integration requirements:
Create a durable MongoDB outbox and worker with atomic leases, bounded retries, dedupe keys and safe delivery records. Add a local email sink that is usable only in development/test; no fabricated provider credentials. Integrate through a runnable worker command and a restricted local smoke command that enqueues and delivers a harmless test email. Use a provider interface consumed by the worker now; defer choosing production provider until configuration is available. Never log reset/invitation tokens. Later prompts will add domain producers.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Failed send retries; duplicate jobs are deduplicated; secrets are redacted.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 09 — Applicant authentication

Blueprint: **B09** · Prerequisites: **B04, B07, B08**

```text
Implement B09 — Applicant authentication in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B04, B07, B08.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add registration/verification.
2. Add login/logout/session cookies and CSRF protection.
3. Add reset flow and rate limits.

Chunk-specific engineering and integration requirements:
Deliver real applicant registration, verification, email login, logout, current-user and reset routes with accessible screens. Use HttpOnly cookies, environment-correct Secure settings, CSRF protection, explicit origin policy and server-backed rate limiting appropriate to deployment. Reuse B07 and B08, consume verification/reset tokens once and rotate/revoke sessions. Link public CTAs to registration and the authenticated applicant shell. Test browser flows, unauthorized access, expired tokens, safe duplicate responses and logout revocation.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Browser journey works; expired tokens, enumeration and cross-site mutation cases covered.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 10 — Application draft API

Blueprint: **B10** · Prerequisites: **B06, B07**

```text
Implement B10 — Application draft API in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B06, B07.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Create track-specific schemas.
2. Implement one active draft per track and version checks.
3. Save and retrieve only owned drafts.

Chunk-specific engineering and integration requirements:
Use authenticated applicant identity from B09, not a user ID supplied by the client. Implement create/read/versioned save and active-track uniqueness with shared schemas. Save incomplete drafts permissively, but validate types/ranges and keep final submission requirements distinct. Freeze track changes after submission. Add a minimal connected draft-start/resume control to the applicant dashboard so the API is used before B11 expands the editor. Preserve submitted history and test stale versions and cross-account access.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Both tracks persist; another user cannot read/write; stale save returns conflict.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 11 — Application wizard

Blueprint: **B11** · Prerequisites: **B04, B09, B10**

```text
Implement B11 — Application wizard in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B04, B09, B10.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Build personal/background/measurement steps.
2. Add conditional fields and age feedback.
3. Add explicit save state and resume.

Chunk-specific engineering and integration requirements:
Turn the dashboard draft control into an accessible multi-step form for personal data, location, experience and canonical measurements. Use date-only birth dates and Lagos business-date age checks. Clearly indicate save-in-progress, saved and failed; do not claim local edits are persisted. Guard navigation when edits are unsaved. Add conditional established/academy fields, clear unit labels, server error mapping and reload/resume tests. Leave photo/guardian steps visibly pending until integrated by B12/B13; do not enable final submission yet.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Reload resumes saved draft; API enforces rules even when UI bypassed.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 12 — Private uploads

Blueprint: **B12** · Prerequisites: **B07, B10**

```text
Implement B12 — Private uploads in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B07, B10.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Authorize signed uploads for allowed purposes.
2. Verify content and create derivatives.
3. Add upload UI and orphan cleanup.

Chunk-specific engineering and integration requirements:
Connect the upload flow to the existing wizard and persisted draft. Choose a supported private storage adapter; use actual signed/private access semantics, not obscurity of URLs. Validate content, limits and image dimensions, strip metadata and generate safe derivatives before declaring an upload complete. Handle retries and abandoned uploads with a scoped cleanup job. Test ownership and anonymous denial for original files and derivatives. If external storage is unavailable, use an explicit development-only adapter and report real integration as unverified.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Invalid files fail; private photos cannot be fetched publicly or by another applicant.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 13 — Guardian consent

Blueprint: **B13** · Prerequisites: **B08, B10, B11**

```text
Implement B13 — Guardian consent in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B08, B10, B11.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Capture guardian details.
2. Issue purpose-bound verification/consent link.
3. Record policy evidence and withdrawal handling.

Chunk-specific engineering and integration requirements:
Show guardian fields only where required, but enforce age/consent server-side. Deliver a purpose-specific guardian email link and consent screen without exposing the full application. Record relationship, policy version, verified email and timestamps. Handle replacement links, expiry, guardian email changes and consent withdrawal; invalidate obsolete consent and stop later submission when required. Do not describe email verification as legal proof of guardianship. Wire consent status into the wizard and applicant dashboard.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Minor cannot submit without consent; guardian token cannot log in as applicant.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 14 — Submission and status

Blueprint: **B14** · Prerequisites: **B11, B12, B13**

```text
Implement B14 — Submission and status in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B11, B12, B13.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Validate and snapshot application atomically.
2. Add review/submit UI and status timeline.
3. Queue receipt of submission email.

Chunk-specific engineering and integration requirements:
Add final review and submission with snapshot/version checks, verified email, age eligibility, ready required photos and applicable consent. Never initialize payment here. Use transaction/outbox for transition and acknowledgement; repeat submit must return the existing outcome. Lock submitted answers and show status/timeline and withdrawal where allowed. Test adult academy, minor academy and established tracks plus incomplete and bypassed client validation. Submission email is acknowledgement, not acceptance.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Both tracks submit without payment; repeated submit does not duplicate history/email jobs.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 15 — Staff access and audit

Blueprint: **B15** · Prerequisites: **B07, B08**

```text
Implement B15 — Staff access and audit in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B07, B08.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add secure initial-admin bootstrap.
2. Add staff invitations/MFA.
3. Add audit writes and last-admin protection.

Chunk-specific engineering and integration requirements:
Implement a local/deployment one-time admin bootstrap command with secure credential handling, staff invitation flow and mandatory MFA with encrypted secrets and recovery codes. Keep staff invitations distinct from paid model invitations. All staff share operational roles but use unique identities. Add authenticated admin navigation, a real staff listing and audit viewer. Prevent last-admin removal and actor self-review in reusable policies. Test MFA enforcement, bootstrap re-use denial, audit access and public admin registration denial.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Individual staff accounts work; public admin signup and self-review fail.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 16 — Review workspace

Blueprint: **B16** · Prerequisites: **B14, B15**

```text
Implement B16 — Review workspace in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B14, B15.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Build filtered application queue/detail.
2. Add correction requests and scoped resubmission.
3. Add audited review transitions with concurrency checks.

Chunk-specific engineering and integration requirements:
Build a bounded/filterable real application queue and private review detail with authorized photo retrieval. Add correction requests naming editable fields and reasons; reconnect applicant UI to scoped edits and resubmission with preserved snapshots. Enforce allowed state transitions, optimistic concurrency, actor attribution and self-review restriction. Add only decisions ready at this step; final offers follow B18. Test staff/applicant interactions rather than only reducer functions.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Staff review private photos; stale decisions cannot overwrite current ones.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 17 — Admission scheduling

Blueprint: **B17** · Prerequisites: **B16**

```text
Implement B17 — Admission scheduling in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B16.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add event/slot/invitation models.
2. Add staff scheduling and applicant RSVP.
3. Send updates/cancellation emails.

Chunk-specific engineering and integration requirements:
Implement admission-event scheduling for each application track with assigned slots, RSVP, attendance and outcomes. Enforce eligibility, time ordering, slot/capacity conflicts and staff-only management, including concurrent reservations. Connect admin application detail to invite/schedule and applicant dashboard to details/RSVP. Rescheduling/cancellation must update persisted invitations and send version-deduplicated messages. Show Africa/Lagos timezone and protect meeting links.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Capacity and audience rules hold; rescheduling updates the portal and notifications.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 18 — Decisions and offers

Blueprint: **B18** · Prerequisites: **B16**

```text
Implement B18 — Decisions and offers in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B16.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add acceptance/rejection/waitlist actions.
2. Snapshot fee and policy version in offer.
3. Display offer/deadline and queue decision emails.

Chunk-specific engineering and integration requirements:
Wire acceptance, rejection and waitlist decisions to the existing review screen and applicant status. Acceptance creates an immutable fee/policy offer with configurable deadline; suggested 14 days must be labelled a default. Enforce one active offer, allowed transitions, conflicts and audit. Display terms and expiry without a fake Pay button until B19. Add renewal behavior and tests proving correction edits cannot rewrite an accepted fee or allow duplicate active offers.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Only accepted active offer is payable; corrections do not silently rewrite offer prices.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 19 — Checkout initialization

Blueprint: **B19** · Prerequisites: **B18**

```text
Implement B19 — Checkout initialization in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B18.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add Paystack adapter/test keys.
2. Generate unique server references and correct amount.
3. Build checkout and pending-return UI.

Chunk-specific engineering and integration requirements:
Initialize Paystack checkout only for the authenticated owner of an accepted active offer. Resolve integer kobo amount and NGN from server snapshot. Persist unique attempt/reference before provider calls and recover initialization timeouts safely without double charging. Wire accepted-offer Pay CTA and callback screen to server-owned pending state. Verify test-mode destination and never expose server keys. No redirect parameter or client mutation may grant access; settlement is added next.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Rejected/unaccepted/wrong-owner requests fail; redirects cannot mark payment successful.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 20 — Verified settlement

Blueprint: **B20** · Prerequisites: **B19**

```text
Implement B20 — Verified settlement in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B19.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Validate webhook signature.
2. Verify provider transaction and match details.
3. Deduplicate provider events and update payment atomically.

Chunk-specific engineering and integration requirements:
Implement Paystack raw-body signature validation using current official provider guidance, server-to-server verification and exact reference/amount/currency/application matching. Keep network calls outside DB transactions and durable retry states inside the flow. Deduplicate repeated/concurrent events and preserve verified summaries, not sensitive payload dumps. Integrate settlement with B19 status polling. Until B22, successful settlement grants no role or invitation. Exercise signed fixtures, invalid signatures, incorrect amounts, duplicate delivery and verification outage.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Bad signature/amount/currency fail; replay and concurrent delivery settle once.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 21 — Reconciliation and receipts

Blueprint: **B21** · Prerequisites: **B08, B20**

```text
Implement B21 — Reconciliation and receipts in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B08, B20.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add scheduled pending verification.
2. Build admin anomaly/refund-record view.
3. Queue receipts from settlement.

Chunk-specific engineering and integration requirements:
Add leased reconciliation jobs that verify unresolved payments and route late/expired-offer settlements and unexpected duplicate charges to staff review. Add admin payment detail and refund reconciliation records; never permit a manual successful toggle. Generate a receipt only from verified settlement through the outbox. Wire applicant payment history/status and admin anomaly filters. Test closed-browser success, delayed webhook, provider/email outage, refund updates and idempotent reconciliation. Document real provider sandbox checks separately from mocks.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Closed browser, delayed webhook and email outage recover without false success.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 22 — Paid invitation issuance

Blueprint: **B22** · Prerequisites: **B20, B21**

```text
Implement B22 — Paid invitation issuance in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B20, B21.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Create unique entitlement on settlement.
2. Issue hashed email-bound key.
3. Add portal retrieval and revoke/reissue.

Chunk-specific engineering and integration requirements:
Create one durable membership entitlement per verified paid application; recover past successful payments from B20/B21 idempotently. Use an outbox consumer or transactional service path so crashes cannot lose grants. Issue random single-use email-bound invitations with stored hashes and seven-day default expiry. Do not attempt to recover a raw key from its hash: allow authenticated eligible users to request a replacement, revoking the old token. Protect any queued token payload with bounded encrypted storage or a suitable secure delivery design and remove it after delivery. Wire applicant next-action and admin reissue controls; never log raw keys or charge again.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
One entitlement per paid application; expiry/reissue never requests a second fee.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 23 — Member activation

Blueprint: **B23** · Prerequisites: **B09, B22**

```text
Implement B23 — Member activation in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B09, B22.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Validate token and prove email ownership.
2. Link existing applicant or create intended identity safely.
3. Atomically consume token and grant correct role.

Chunk-specific engineering and integration requirements:
Create the member activation page and API. Validate token, expiry/revocation, verified invited email and paid entitlement; consume and grant role atomically. Existing applicants reauthenticate or prove email ownership before linking to the same user; never allow token possession alone to overwrite passwords. Member registration remains a distinct onboarding action and adds no applicant-derived privilege automatically. Grant academy student or model role only as intended. Add member login with email/username, portal switching and session refresh. Test token races and wrong-role access.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Wrong-email, replayed/revoked/expired invitations fail; student does not gain model permissions.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 24 — Member profile

Blueprint: **B24** · Prerequisites: **B23**

```text
Implement B24 — Member profile in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B23.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Build role-specific dashboard.
2. Add private contact/profile edits.
3. Add versioned professional drafts and validation.

Chunk-specific engineering and integration requirements:
Build real student/model dashboards and private profile editing; share identity without mixing applicant/member records. Add professional draft schema only for eligible represented-model onboarding, and a connected editable form. Normalize measurements and distinguish private changes from public pending edits. Wire member navigation, role-specific landing and profile completeness based on real required data. Do not claim a profile is published or expose professional drafts publicly.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Applicant-only access fails; private edits do not leak to public projections.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 25 — Portfolio editor

Blueprint: **B25** · Prerequisites: **B12, B24**

```text
Implement B25 — Portfolio editor in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B12, B24.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add ordered media/cover controls.
2. Submit immutable review revision.
3. Show pending/rejected feedback.

Chunk-specific engineering and integration requirements:
Extend the existing private-upload pipeline for model portfolio limits, ordered images, cover selection and credits. Wire it into the member profile editor. Submitting captures an immutable revision with exact media references; later edits fork a new draft. Protect referenced media from cleanup/deletion while needed for review or publication. Show pending/rejected/changes-required states and API validation. Test retries, ownership and attempts to alter an already submitted revision.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Editing after submission creates a new draft and cannot alter reviewed snapshot.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 26 — Moderation and publication

Blueprint: **B26** · Prerequisites: **B15, B25**

```text
Implement B26 — Moderation and publication in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B15, B25.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Build revision review comparison.
2. Approve/publish pointer atomically.
3. Add hide/suspend controls and age gate.

Chunk-specific engineering and integration requirements:
Build admin revision queue, side-by-side review and reasons for requested changes. Approve an exact reviewed immutable revision and atomically move the publication pointer; reject stale approvals and self-review. Require age 18 and represented membership. Staff hide/unhide listings separately from suspending login. Use public-safe image derivatives only after approval and update cache invalidation. Wire member status and an authorized published preview; B27 exposes anonymous browsing.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Unapproved revisions and under-18 students never publish; previous approved profile survives rejection.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 27 — Public catalogue

Blueprint: **B27** · Prerequisites: **B05, B26**

```text
Implement B27 — Public catalogue in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B05, B26.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add bounded directory query and filters.
2. Add SSR detail/gallery/meta.
3. Add unavailable-profile behavior and cache invalidation.

Chunk-specific engineering and integration requirements:
Implement public-safe projected directory/detail APIs, bounded filters/pagination and SSR React Router pages. Reuse approved imagery with responsive dimensions, lazy loading, alt text and keyboard gallery controls. Never serialize whole private documents into SSR hydration. Add canonical/OG metadata and appropriate 404 for hidden/unknown models. Wire discover CTAs and model cards; booking CTA goes to a truthful form-ready route integrated in B28. Test unpublished data and cached hidden profiles do not leak.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Anonymous responses include only published fields; hidden models disappear from listing/detail caches.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 28 — Booking enquiries

Blueprint: **B28** · Prerequisites: **B08, B27**

```text
Implement B28 — Booking enquiries in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B08, B27.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add validated persistence and spam limits.
2. Build model-prefilled form/acknowledgement.
3. Add admin queue, notes and outcomes.

Chunk-specific engineering and integration requirements:
Implement public booking and general contact forms backed by persisted enquiries. Prefill only valid public model IDs, capture project dates/usage/budget where known, validate safely and rate-limit abuse. Persist before notifications; acknowledgement supplies a reference without promising booking. Deliver admin queue, assignment, private notes and status/outcome transitions. Wire every public contact/booking CTA to the real form and staff navigation to the queue. Test email failure, invalid/private model IDs and spam controls.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Email failure does not lose enquiry; model preference does not create a reservation.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 29 — Professional casting

Blueprint: **B29** · Prerequisites: **B17, B24**

```text
Implement B29 — Professional casting in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B17, B24.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add represented-model event audience.
2. Add member RSVP/attendance.
3. Record outcomes and notify changes.

Chunk-specific engineering and integration requirements:
Extend B17 event infrastructure for professional castings without duplicating scheduling logic. Only eligible represented models receive these invitations; students/applicants are excluded unless independently represented. Add member invitation detail, RSVP, attendance/outcome views and staff filters. Preserve private brief/meeting access and notify changes. Exercise cross-role denial and full staff-to-model scheduling flow.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Applicants/students cannot access professional invitations unless independently eligible.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 30 — Cohorts and enrolment

Blueprint: **B30** · Prerequisites: **B15, B23**

```text
Implement B30 — Cohorts and enrolment in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B15, B23.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add cohort/enrolment models.
2. Build staff allocation/capacity UI.
3. Show student cohort home.

Chunk-specific engineering and integration requirements:
Implement cohorts and enrolment with paid activated academy entitlement checks and atomic capacity limits. Add admin cohort management/enrolment and student cohort home using persisted data. Keep withdrawn/suspended enrolment semantics explicit and do not grant representation. Test duplicates, concurrent capacity allocation, another student's records and access after enrolment ends according to configured policy. Wire academy navigation only where appropriate.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Only paid activated students enrol; duplicate/cross-cohort access cases fail.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 31 — Hybrid timetable

Blueprint: **B31** · Prerequisites: **B17, B30**

```text
Implement B31 — Hybrid timetable in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B17, B30.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add delivery mode, venue and protected links.
2. Build staff/session schedule.
3. Send change reminders.

Chunk-specific engineering and integration requirements:
Implement academy sessions referencing cohorts, reusing only suitable scheduling utilities from B17. Add in-person/online/hybrid modes, venue and authorized meeting links. Connect admin calendar/editor and student timetable with explicit Lagos times. Queue reminders with version-aware cancellation/rescheduling so stale jobs do not notify obsolete details. Test membership enforcement, schedule edits and private-link exclusion from anonymous or other-cohort responses.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Lagos-time schedule is clear; meeting links are not present in unauthorized responses.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 32 — Resources and attendance

Blueprint: **B32** · Prerequisites: **B12, B31**

```text
Implement B32 — Resources and attendance in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B12, B31.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add cohort-scoped resource access.
2. Add session attendance marking.
3. Add student views and staff correction audit.

Chunk-specific engineering and integration requirements:
Extend media authorization for cohort resource files and controlled external links. Connect resource lists/downloads to sessions and enrolled student views. Add staff attendance capture/correction with one current record per enrolment/session, preserving audit history. Enforce access in the download endpoint, not merely in navigation. Test duplicate marking, revoked enrolment, cross-cohort access and file cleanup references.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Other-cohort access fails; one current attendance result per enrolment/session.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 33 — Progress and completion

Blueprint: **B33** · Prerequisites: **B32**

```text
Implement B33 — Progress and completion in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B32.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Separate feedback/private notes.
2. Add configured completion review.
3. Add adult representation-review handoff.

Chunk-specific engineering and integration requirements:
Add criteria-based progress and completion screens using the agency's configured curriculum; do not invent assessment standards. Separate student-visible feedback from staff-only notes in schemas and responses. Allow completion review and an explicit representation-review request for eligible adults, without automatic model role/publication or a new fee. Connect outcomes to existing profile/moderation flow with a clear approval step. Test under-18 denial, note privacy and duplicate completion actions.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Private notes never reach student API; completion grants no automatic publication or extra charge.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 34 — Assignments and certificates

Blueprint: **B34** · Prerequisites: **B33**

```text
Implement B34 — Assignments and certificates in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B33.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add tasks/submission versions.
2. Add staff assessment feedback.
3. Generate approved certificates and revocation.

Chunk-specific engineering and integration requirements:
Implement assignments first with staff creation and enrolled student submissions using existing protected media. Then add versioned resubmission and assessment/feedback on existing progress screens. Finally generate staff-approved certificates only when configured criteria are met, with unique numbers and revocation. Do not expose certificate lookup containing private student details without consent. Each substep must be a reachable, tested slice before proceeding to the next; avoid unrelated grading features.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Only enrolled students submit; criteria and staff approval control certification.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 35 — Content and staff operations

Blueprint: **B35** · Prerequisites: **B15, B28**

```text
Implement B35 — Content and staff operations in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B15, B28.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Add structured draft/publish content.
2. Add delivery-failure view and safe retry.
3. Add operational filters/counts with private-data limits.

Chunk-specific engineering and integration requirements:
Replace hardcoded editable public content with validated structured draft/published records and initial migration preserving current copy. Build staff edit/preview/publish screens without arbitrary executable HTML. Add notification failure inspection/retry using existing job semantics and safe operational counts/filters. Wire content publication to public page cache invalidation. Test script injection, unauthorized publishing, retry deduplication and financial-state immutability.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Public content cannot inject scripts; retries do not change financial state.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 36 — Staging deployment

Blueprint: **B36** · Prerequisites: **B14, B15**

```text
Implement B36 — Staging deployment in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B14, B15.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Provision separate DB/media/email/payment test services.
2. Configure CI deployment and migrations.
3. Add readiness and error reporting.

Chunk-specific engineering and integration requirements:
Inspect actual deployment capabilities before choosing configuration. Produce executable staging deployment definitions and runbooks for separate replica-set DB, private media, test Paystack, email and worker. Wire CI build/migration/readiness checks, graceful rollout and error reporting with redaction. If infrastructure credentials are unavailable, validate locally and report exactly which remote checks are blocked; do not claim deployment. No production publish or paid resource creation without applicable authorization. Exercise clean startup, index repeatability and rollback compatibility.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Clean deploy, rollback and database/index setup work without production credentials.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 37 — Journey verification

Blueprint: **B37** · Prerequisites: **B23, B28, B29, B36; B33 for academy release**

```text
Implement B37 — Journey verification in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B23, B28, B29, B36; B33 for academy release.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Run both full admission journeys and negative payment cases.
2. Run publication/enquiry and academy permission journeys.
3. Fix failures and preserve current-run reports.

Chunk-specific engineering and integration requirements:
Run current-commit E2E journeys for adult academy, minor guardian consent and established models through review, payment, activation and correct memberships. Include forged/replayed payment, correction/resubmission, moderation, public catalogue/enquiry and role-isolated casting. Include academy tests only if those features are in this release; list excluded features explicitly. Use actual test-mode integrations for representative checks and controlled fixtures for fault cases. Preserve current-run results and command exit statuses; investigate failures rather than weakening assertions.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Required tests actually execute and pass; blocked/skipped checks remain explicit.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 38 — Accessibility and performance

Blueprint: **B38** · Prerequisites: **B27, B28, B31 as applicable**

```text
Implement B38 — Accessibility and performance in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B27, B28, B31 as applicable.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Review keyboard/forms/screen reader use.
2. Test real image budgets and public rendering.
3. Correct bottlenecks and verify measured targets.

Chunk-specific engineering and integration requirements:
Audit actual shipped screens at mobile and desktop widths: keyboard/focus, screen-reader semantics, form errors, image gallery, reduced motion, contrast and touch targets. Add focused regression checks and repair the existing components. Measure SSR metadata, image payloads and representative LCP/INP/CLS conditions without presenting lab measurements as field percentiles. Integrate image/cache fixes into current routes and rerun affected journeys. Record measured outcomes and unresolved issues honestly.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
No critical journey inaccessible; measured results documented against targets.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 39 — Recovery and security

Blueprint: **B39** · Prerequisites: **B21, B36**

```text
Implement B39 — Recovery and security in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B21, B36.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Restore a staging backup.
2. Exercise provider outage/retry/reconciliation.
3. Review uploads, sessions, MFA, authorization and log redaction.

Chunk-specific engineering and integration requirements:
Use isolated staging/test resources for backup restoration and fault drills; never destroy production data. Restore a backup into a separate DB, start the actual application against it and verify representative protected records and indexes. Exercise worker crashes, provider downtime, expired leases, reconciliation and invitation recovery. Review auth/CSRF/MFA, media authorization and log redaction with negative tests. Connect alerts to actionable documented runbooks, and distinguish configured backups from a demonstrated successful restore.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
Restored service works; no unpaid access; incident/recovery procedures are usable.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---

## Prompt 40 — Production launch gate

Blueprint: **B40** · Prerequisites: **B35, B37, B38, B39; B34 only if extended academy launches**

```text
Implement B40 — Production launch gate in the existing Psycocity repository. Complete this chunk only.

Context and invariant requirements:
- Read repository agent instructions, specs.md (especially the sections relevant to this chunk), existing code, and docs/implementation-progress.md before editing. Inspect git status and preserve unrelated work. Confirm prerequisites: B35, B37, B38, B39; B34 only if extended academy launches.
- Use React 19, TypeScript, Tailwind, TanStack Query, React Router v7 via react-router (not react-router-dom), Express/Node and MongoDB. Reuse installed compatible tools; do not re-scaffold an existing application or introduce speculative abstractions.
- Academy eligibility is 16+ with guardian consent for ages 16–17; established/represented models are 18+. Applications are free to submit. Only accepted applicants pay: academy 5,000,000 kobo; established 3,000,000 kobo; NGN via Paystack. Verified payment precedes a single-use email-bound membership invitation. Applicant and member permissions remain separate.
- All staff have equal operational permissions but individual audited accounts. Public model changes require staff approval. Never expose private application/member fields or images. Email is the initial notification channel; academy delivery is hybrid.

Implement incrementally:
1. Finalize business policies/assets/curriculum for released scope.
2. Configure verified live providers and perform controlled checks.
3. Train staff and approve release/rollback checklist.

Chunk-specific engineering and integration requirements:
Read the release scope and all current-run reports. Complete a concrete checklist for policies/refunds/retention, safeguarding, imagery rights, business contacts, academy curriculum, provider/domain verification and staff readiness. Perform reversible permitted checks; do not invent credentials, legal approval or live financial transactions. Prepare controlled live verification and rollback steps for the operator where explicit approval is required. Keep release disabled for unresolved required blockers. Integrate final operational instructions and record evidence, owners and go/no-go status; do not automatically publish or claim launch.

Work discipline:
- Before coding, briefly identify the files/contracts affected and how each step connects to existing behavior. If a prerequisite is absent, repair only a small prerequisite gap or report the concrete blocker; never silently bypass it.
- Keep schemas, authorization, server validation, UI states and failure recovery with the feature that needs them. Test real boundaries and invariants, not copies of implementation. Do not build later chunks prematurely.
- Use maintained dependencies, reproducible installs and explicit configuration. Preserve TLS/signature/checksum verification. Do not commit secrets, fabricate credentials, use live payments for tests, or deploy/publish without applicable authorization.
- External service gaps require an explicitly development/test-only adapter plus a reported integration limitation. Never enable that adapter silently in production or describe a mocked check as a live integration check.

Verification gate:
No unresolved required policy/integration blocker; release scope and monitoring owner recorded.
Run relevant meaningful tests, type checks and builds using the actual repository commands. Add negative/failure-path coverage appropriate to this chunk and a representative functional request/browser check. Distinguish passed, failed, skipped and blocked checks. Do not disable assertions or count zero executed tests as success.

Finish by wiring everything together:
Connect all new routes, UI actions, API calls, services, jobs, configuration and navigation to their intended existing consumers. For foundation-only work, wire a runnable command or real runtime/test consumer now. Remove temporary duplicate paths and dead code; do not leave isolated components, unused helpers, unregistered endpoints or nonfunctional CTAs. Rerun the integrated path, update setup instructions and docs/implementation-progress.md, and report changed behavior, integration points, exact validation results, limitations and the next dependency-ready chunk. Stop after this chunk.
```

---
