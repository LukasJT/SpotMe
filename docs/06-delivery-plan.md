# Delivery plan, acceptance criteria, and handoff

This is an implementation sequence, not a calendar promise. Estimate effort after inspecting staffing, repository state, dependencies, and legal/store requirements. Do not compress moderation and deletion work into an optional post-launch sprint.

## Milestone 0 — decisions and working foundation

Deliver a product decision log, source/licence register, threat model, budget assumptions, regional configuration, brand-name collision check, and environment architecture. Establish TypeScript workspaces, lockfile, formatter/linter, test runner, CI, `.env.example`, secret scanning, isolated dev/staging/prod, and seed fixtures that cannot be mistaken for real users.

**Acceptance:** clean install and CI on a fresh environment; no production data in test; reproducible migrations; commercial hosting eligibility checked; no secrets in clients or history; ownership of release/support/moderation recorded. Preview deployment is clearly nonproduction and blocked from indexing.

## Milestone 1 — accounts and profiles across platforms

Implement managed auth, verification/recovery, 18+ eligibility, onboarding persistence, profile fields, six photo slots, media quarantine/review, privacy preview, pause, and session management. Deliver a usable web slice and mobile builds early to expose deep-link and secure-storage issues.

**Acceptance:** a new user signs up, verifies, resumes onboarding on another device, uploads/reorders/removes images, edits their bio/routine, and sees the correct audience preview. Unapproved photos never enter discovery. Underage accounts cannot activate. Account takeover protections and recovery messages are exercised.

## Milestone 2 — Ontario gym directory

Implement municipality/market config, ingestion adapters, provenance, canonical gyms/aliases, branch deduplication, city search, cross-city multi-select, user suggestions, moderator queue, merges, and correction history. Pilot with a bounded licensed source sample before importing a whole release.

**Acceptance:** Toronto and Mississauga locations with the same brand remain separate; records for the same physical gym branch merge while different businesses at one address stay separate; Waterloo region and city disambiguate; two imported regions do not duplicate a gym; ten selected gyms persist across city changes; missing-gym name/address submissions remain pending until review; merges preserve privacy settings and referential integrity. A coverage/freshness report states limitations.

## Milestone 3 — discovery and transactional matching

Implement privacy-safe candidate retrieval, reciprocal eligibility filters, understandable ranking, pagination, swipe actions, event outbox, match creation, and match list. Make button/keyboard paths equivalent to gestures. Test candidate queries against realistic synthetic distributions, not only uniformly distributed seed rows.

**Acceptance:** simultaneous reciprocal likes create one match and one conversation; replayed requests preserve the original action outcome while reapplying current authorization and redacting revoked content; pass/like races are deterministic; blocked/suspended/deleted/underage/unverified users cannot leak through queries or cached cards. Empty pools show honest states. Filtering/ranking never reveals private gym affiliations or routines.

## Milestone 4 — conversation and notifications

Implement authenticated chat history, sends/retries/reconnect, unread state, safe link handling, preferences, push-token lifecycle, transaction email, and block/unmatch transitions.

**Acceptance:** no unmatched account can read or send; copied conversation IDs fail; retried sends do not duplicate; reconnect resumes from a cursor; a block racing a send is resolved consistently; queued notifications are suppressed when eligibility changes; lock-screen content respects privacy settings. Test on actual iOS and Android devices, not only simulators.

## Milestone 5 — safety operations and user rights

Deliver staff roles/MFA/audits, reports, evidence retention, sanctions/appeals, queue priorities, support procedures, consent records, export, deletion, vendor deletion hooks, restore/recovery, and incident response.

**Acceptance:** report evidence is visible only to authorized staff; ordinary moderators cannot escalate their own role; deleted profiles and media disappear from active surfaces; jobs retry and alert; restoration respects deletion tombstones; export contains only the requester's permitted data; a backup restore succeeds in an isolated environment. Staff perform a tabletop harassment/underage/privacy-incident exercise.

## Milestone 6 — acquisition site and beta launch

Deliver indexable public pages, supported-region content, safety/help/legal/deletion pages, canonical metadata, sitemap, robots controls, structured data where accurate, accessible forms, rate-limited waitlist, analytics consent configuration, store listing material, review credentials, and screenshots from the working app.

**Acceptance:** search engines receive useful HTML; private and preview routes are excluded and actually access-controlled; public media does not expose users; performance/accessibility targets are checked on realistic devices; no fake gym partnerships or inflated availability claims; store policy checklist is dated and substantiated. Open one qualified local cohort, then expand based on density and safety capacity.

## Milestone 7 — controlled release and operating handoff

Document production configuration, environment ownership, dependency update process, cost alerts, daily operating checks, escalation contacts, deployment/rollback, DB migration safety, customer support, moderation staffing, and analytics definitions. Prepare phased mobile rollout and feature flags for discovery, gym-overlap use, notifications, and new markets.

**Acceptance:** founder receives a concrete release candidate with evidence, budget forecast, known risks, and rollback path. Paid services, deployment, store submission, and external outreach have appropriate authorization. Verify the release after deployment and monitor meaningful failure signals; do not treat a successful build upload as a public launch.

## Critical adversarial test matrix

| Area | Test | Passing result |
|---|---|---|
| Auth/RLS | Anonymous, user A, user B, blocked user, moderator, admin requests | Least-privilege results for every table, view, RPC, storage policy, and realtime channel |
| Enumeration | Iterate profile IDs, gym memberships, object keys, API cursors | No bulk private dataset; bounded and audience-checked responses |
| Hidden fields | Compare API payloads/ranking before and after private gym/day changes | Hidden values neither returned nor inferred through a deterministic explanation/filter |
| Age/preferences | Boundary birthdays, leap days, mismatched reciprocal preferences | Correct eligibility; no under-18 range or bypass |
| OAuth/recovery | Expired/replayed links, wrong redirects, account-link conflict, stolen session | Safe failure; no automatic takeover by matching an unverified email |
| Media | MIME mismatch, SVG/script, huge dimensions, EXIF GPS, malicious upload | Rejection/quarantine; safe raster re-encoding; metadata removed |
| Media audience | Reuse a URL after block/removal/privacy change | No new access grant; bounded existing signed-URL lifetime documented |
| Matching | Parallel reciprocal swipes, offline retries, duplicate events | Exactly one canonical match/conversation/event effect |
| Chat | Replay message IDs; send during block/unmatch; join another channel | Idempotency and authorization enforced server-side |
| Abuse | Signup/email floods, gym spam, distributed swiping, report brigading | Layered limits, review paths, no unlimited spend or instant malicious bans |
| Directory | Same chain/different branch; same branch/different source; relocation | Correct canonical records, history, stable foreign keys |
| Geography | Overlapping region imports; ambiguous city; out-of-area location | One canonical record; explicit and accurate coverage |
| Deletion | Partial vendor failure, deleted user in backup, retry after timeout | Tombstones/retries/alerts; no unintended resurrection |
| Staff | Forged role claim, privilege escalation, unlogged record view | Server policy rejects unauthorized action and records authorized access |
| SEO | Crawl anonymous public pages and guessed private routes | Public HTML indexable; private content never served anonymously |
| Billing, if enabled | Duplicate/out-of-order webhook, refund, expired purchase | Verified idempotent entitlements; platform-appropriate billing |
| Accessibility | Keyboard-only, screen readers, large text, reduced motion | Complete primary flows without drag, color, sound, or small text dependence |
| Recovery | DB restore + object restore + deleted-account replay | Measured recovery time/data loss; deletion and access policies preserved |

Use meaningful integration and end-to-end tests for these boundaries; do not inflate test counts with implementation-mirroring assertions. Run dependency, secret, and static security checks in CI; use independent security review before broad public launch.

## Suggested performance and reliability objectives

These are targets to measure, not achieved results: public pages meet good Core Web Vitals; discovery server p95 under 500ms at agreed beta concurrency; message acceptance p95 under 500ms excluding client network and background notification delivery; 99.5% monthly beta availability; zero known cross-user authorization leaks; urgent safety cases acknowledged within the actual staffed response target.

Before release, define and verify recovery objectives. A proposed starting business requirement is RPO ≤24 hours and RTO ≤4 hours; daily managed database backups alone do not prove this and may not cover media. If the business needs tighter recovery, price PITR and replicated object backups explicitly. Test load, query plans, connection limits, realtime subscriber limits, upload concurrency, egress, and restore behavior.

## Repository structure to produce during implementation

```text
apps/web/                 # public SEO routes + authenticated desktop/mobile web
apps/mobile/              # Expo iOS/Android
packages/domain/          # types, validation, pure eligibility helpers
packages/design-tokens/   # shared colors/spacing, not forced identical UI trees
packages/api-client/      # typed contracts; no privileged secrets
supabase/migrations/      # schema, grants, policies, functions
supabase/tests/           # policy and transaction tests
services/jobs/            # media, notifications, ingestion, erasure jobs
tools/gym-ingestion/      # adapters, provenance, dry runs, import reports
docs/decisions/           # current architecture and product decisions
docs/runbooks/            # deploy, rollback, moderation, incident, deletion
tests/e2e/                # meaningful cross-platform user journeys
```

This is a proposed layout. Pin supported versions from current official docs at build time; do not paste unverified versions into a generated manifest. Include exact verified setup, migration, development, test, build, and release commands once real code exists.

## Evidence the implementation AI must return

- Platform parity matrix listing working, partial, and deferred functionality.
- Migration history and access-control matrix with test output.
- Dated vendor cost sheet with measured traffic assumptions and budget alerts.
- Source/licence/provenance register and sampled gym-quality report.
- Screenshots or recordings of actual web/iOS/Android flows using synthetic data.
- Accessibility, performance, load, restore, deletion, and security check results with limitations.
- Store/privacy checklist, moderation staffing plan, and launch cohort decision.
- Release/rollback instructions, known defects, owner inputs, and operational ownership.
