# API conventions

- Prefix routes with `/api/v1`. JSON error envelope: `{ error: { code, message, requestId } }`. Safe stable codes and public messages are shared in `@psycocity/validation`. Never serialize raw exceptions or private fields.
- Every request receives an `X-Request-ID`. A bounded safe caller-provided ID may be preserved; arbitrary strings are replaced. It is a correlation hint, never an authorization credential.
- Runtime schemas are imported by API and client from the built shared package. Validate all untrusted inputs server-side; shared types alone do not validate.
- Health returns a typed literal payload and rejects unsupported query parameters. Readiness remains a separate topology-dependent 200/503 signal.
- TanStack Query owns client server-state, with domain-scoped array keys, cancellation signals, explicit invalidation after mutations, no mutation retries and no automatic retries for authentication/financial operations. The first consumer is `/status`.
- Public editorial pages SSR their content without API hydration state. Current API-backed status queries begin after hydration; no loader duplicates the same request. Future SSR data loaders must prefetch into a request-scoped QueryClient and dehydrate only public/authorized data, using the same query keys and stale time. Never use a process-global private cache.
- API client uses same-origin credentials, validates response schemas and throws a typed safe error including correlation ID where available.
- List endpoints, when introduced, use explicit domain query schemas: default limit 20, maximum 100, validated filters and stable cursor/order boundaries. Responses carry items and nextCursor. Do not build an unused generic pagination layer ahead of the first list endpoint.
- Shared contracts build before API/web builds and type checking. Development builds contracts once then watches them alongside the API and web processes.
