# Accessibility and local rendering evidence

Verified on 2026-10-26 with the production SSR build and local Chromium desktop/Pixel-7 viewport emulation. The current browser gate audits homepage, join, academy, catalogue, booking and applicant login with axe WCAG 2 A/AA, 2.1 AA and 2.2 AA tags; keyboard skip navigation and horizontal overflow are checked. A focused follow-up also audits the actual staff teaching workspace and enrolled student's cohort workspace. Automated checks do not establish full WCAG conformance or replace screen-reader/manual device review.

| Route | Desktop LCP sample (ms) | Desktop CLS sample | Mobile LCP sample (ms) | Mobile CLS sample |
| --- | ---: | ---: | ---: | ---: |
| `/` | 292 | 0.0009 | 208 | 0 |
| `/join` | 68 | 0 | 60 | 0 |
| `/academy` | 76 | 0 | 72 | 0 |
| `/models` | 88 | 0 | 72 | 0 |
| `/booking` | 88 | 0.0930 | 84 | 0 |
| `/applicant/login` | 132 | 0.0084 | 56 | 0 |

These are single unthrottled local samples captured around the browser audit, **not field percentiles**, phone-hardware results or production-load measurements. The samples are below 2.5-second LCP/0.1 CLS targets in this environment; booking's desktop layout shift is close to the threshold and needs representative slow-network/device review. INP was not measured; no INP/field-performance pass is claimed. Each browser run attaches its actual measurements as JSON in the Playwright report.

The homepage sample loaded about 526 KB of encoded resources (including scripts/fonts), with the original abstract hero SVG at 1,336 bytes. Self-hosted WOFF2 font resources in that sample total about 95 KB. Actual approved model images use normalized 480×640-bounded private WebP thumbnails, fixed aspect/dimensions, directory lazy loading and current authorization on each fetch. Catalogue projections now use bounded concurrency of four with an additive visibility/pagination index, retaining authoritative payment/role/visibility checks and no authorization cache. This reduces serial waiting without claiming a load-test throughput result.

Before launch, inspect the real licensed/model imagery, test a representative populated catalogue and forms on constrained networks/actual devices, manually review keyboard focus, reduced motion, touch targets, error announcement and screen readers, then monitor field LCP/INP/CLS with a privacy-approved mechanism. No third-party tracking or production analytics service is configured by these changes.
