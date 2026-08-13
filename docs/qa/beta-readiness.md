# Local beta readiness evidence

This log records the Ranger Outpost Hub Slice 4 checks performed on August 12, 2026. It is evidence for founder evaluation of the local beta, not a production-readiness or compliance certification.

## Build and environment

- Workspace: Windows, PowerShell, local D1, Node.js 22.17.1, npm 11.4.2.
- Build under test: the production Worker and client output from `npm run build`, served on `http://127.0.0.1:4173` with `npm run preview -- --host 127.0.0.1 --port 4173`.
- Browser checks: Codex in-app Chromium browser at 320, 390, 768, and 1280 CSS-pixel viewport widths.
- Accessibility supplement: axe-core 4.13.0 with WCAG 2 A/AA, WCAG 2.1 AA, WCAG 2.2 AA, best-practice, and target-size rules. Automated results were manually reviewed rather than treated as a conformance claim.

## Automated verification

The final verification run used:

```powershell
npm run db:setup
npm run test:integration
npm run check
git diff --check
```

Observed results on the final run:

- `npm run db:setup`: passed; Wrangler reported no migrations to apply;
- `npm run test:integration`: passed, 3 files and 28 tests;
- `npm run check`: passed; Oxlint reported no findings, Vitest passed 8 files and 51 tests, and both TypeScript project references plus Worker/client production builds completed;
- `git diff --check`: passed with no whitespace errors (Windows line-ending notices were informational).

## Routes and workflows exercised

- `/`: public data load, landmarks, headings, public event presentation, source names, production title, and shell behavior.
- `/outposts`: directory rendering and narrow-screen reflow.
- `/add-your-outpost`: public-only submission copy, field associations, error summary, and no server write.
- `/advancement`: program entry points, filters, source links, and tablet reflow.
- `/events`: Upcoming/Past view buttons, filter controls, conflict-safe fields, empty/result states, and keyboard-operable native buttons.
- `/about`, `/other`, `/help`, and `/search`: route titles, SPA navigation, public information presentation, and source links.
- `/operator`: local exact-host bypass, snapshot load, record selection, unsaved edit, private preview, Close, record-switch warning, Freshness Queue controls, and narrow-screen editor reflow.
- Private preview: an unsaved title appeared in the public presentation without a save or URL change; the `Private preview — not published` banner and stored publication status were visible; Close restored focus to Preview; invalid-preview warnings are covered by the preview contract tests.

No console errors were observed during the checked main flows.

## Authorization and request-boundary evidence

Worker tests call the exported Worker's real `fetch` interface. They verify:

- an unauthenticated Operator snapshot is rejected before D1 access;
- record create/update plus source reverify/broken-state, event lifecycle, event-conflict create/resolve, and coverage-gap create/resolve actions reject unauthenticated requests before D1 access;
- missing Access configuration, malformed assertions, wrong issuer, wrong audience, and invalid signatures return the same non-sensitive 401 response;
- `LOCAL_OPERATOR_PREVIEW` works only when it is exactly `true` and the hostname is exactly `localhost` or `127.0.0.1`;
- localhost lookalikes and deployed hostnames never use the bypass;
- malformed JSON, oversized bodies, and overlong common record text fail before mutation with plain-language responses;
- unsupported public writes and unknown routes do not mutate state;
- Operator responses are `no-store`.

Deployed Cloudflare Access and remote JWKS availability are intentionally not exercised because deployment is outside this slice.

## Privacy and cache inspection

- `/api/public` and `/api/search` are tested through the Worker and return only published records.
- Public event fields pass through the shared conflict-safe serializer: required-field conflicts omit the event and optional conflicts mask the affected public facts and sources.
- Public detail and source objects are allowlisted. Test fixtures containing draft/archive records, submitter email, actor email, audit data, private notes, conflict assertions/resolution notes, and broken-source metadata do not appear in serialized responses.
- Search input is converted to bounded quoted FTS terms before binding to a parameterized query.
- Public responses are publicly cacheable for short bounded periods. Operator/error responses are `no-store`.
- The service-worker classifier tests exclude `/operator`, `/api/operator/*`, other APIs, cross-origin requests, mutation requests, private/no-store responses, and error responses.
- The offline-response test verifies the cache indication is added without changing the bundle's generated date or record verification date.
- `VITE_PUBLIC_SUPPORT_EMAIL` is documented as public browser configuration; Access settings remain server-side variables without a `VITE_` prefix.

## Accessibility and keyboard checks

- Route-specific document titles, primary-navigation `aria-current`, a polite route announcement, and focus on `main` after client-side navigation were observed.
- At 390px, Menu changed from collapsed to expanded and closed after navigation while the active route retained `aria-current="page"` when the menu was reopened.
- The Events view uses two ordinary `aria-pressed` buttons instead of incomplete tab semantics.
- Native labels/fieldsets expose public and Operator inputs in the accessibility tree; disabled actions retain visible labels.
- The Add Your Outpost error summary and Operator save error are programmatically focusable; native required fields retain browser field focus behavior.
- The preview is a labelled modal dialog with initial Close-button focus, native containment, Escape handling, Close behavior, and focus restoration.
- A dirty Operator draft produced a confirmation before record switching; dismissing it retained the unsaved draft.
- Visible focus uses a two-color ring that remains distinguishable on light and dark surfaces. Reduced-motion CSS disables animation/smooth scrolling, and programmatic route/Operator scrolling chooses `auto` when reduced motion is requested.
- Axe found four initial small-text contrast failures and two generic-label review items; the gold/accent colors and grouping roles were corrected. Final checked states have no serious or critical violations. Remaining axe contrast review items concern non-text glyphs or gradient backgrounds and were manually checked against the actual dark backgrounds.
- Semantic-tree inspection supplemented the automated scan; a named screen-reader application was not used.

## Responsive, zoom, and motion checks

- Public and Operator flows were measured at widths 320, 390, 768, and 1280. Home, directory, submission, advancement, Events, Operator editor, Freshness Queue, and preview content reflow without ordinary-page horizontal scrolling after removal of the fixed 320px root minimum.
- Long event/location/source text uses wrapping in cards and fact grids. Mobile editor/source structures collapse to one column, and the record list becomes a bounded scroll region.
- 200% page-zoom reflow is represented by the equivalent reduced CSS viewport; 200% text-only sizing was checked with an audit-only root-font override against the production CSS.
- The active reduced-motion programmatic branch is covered by a unit test that requires non-animated `auto` scrolling; the production media-query rules were also inspected. The in-app browser did not expose an operating-system reduced-motion toggle for an additional visual pass.

## Installability and offline scenarios

- The production manifest has `name`, `short_name`, root `start_url`/`scope`, standalone display, theme/background colors, and independent PNG icons at 192×192 and 512×512, including a separate maskable declaration. The files were decoded and their dimensions verified.
- The production service worker registers as a module without an app-owned install prompt, precaches only the controlled public shell/core assets, caches hashed assets cache-first, and probes the network without the browser HTTP cache before using the saved `/api/public` fallback.
- Cache names are versioned; activation deletes older Ranger Outpost caches so an old application/data contract is not stranded. If an update has no newly saved public bundle yet, offline data is unavailable rather than fabricated.
- After service-worker activation, the public page was reloaded once online to confirm a controlled client. The preview server was then stopped: the saved shell and event bundle remained available, and the page announced the cached generated date without changing verification dates. A first-ever offline device remains an explicit unavailable case by design.
- The in-app browser does not expose the operating-system install UI, so the manifest/icon/service-worker install criteria were verified structurally rather than completing an OS-level install.

## Explicit limitations and deferred work

- No production deployment, live domain, remote D1, HSTS observation, deployed Access policy, alerting, analytics, monitoring vendor, or CI/CD deployment was added or tested.
- No ordinary/youth accounts, outpost claims, delegated editors, private Outpost Calendar, meeting plans, notifications, email delivery, source monitoring, or production-scale schema work was added.
- Representative data remains intentionally incomplete. This log does not validate every external source or imply official Royal Rangers endorsement.
- Accessibility automation cannot prove full WCAG 2.2 AA conformance. Founder evaluation should include a preferred screen reader and operating-system text/reduced-motion settings before production planning.
