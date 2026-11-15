# SpotMe — architecture, security, and operating economics

Research checked 11 November 2026. Vendor prices below are USD, before tax; no CAD exchange rate is assumed. Recommendations and workload estimates are proposed engineering decisions, not vendor guarantees. Recheck current versions, regional availability, prices, and terms before provisioning.

## 1. Recommended implementation

Use a TypeScript monorepo with **Expo/React Native for iOS and Android, Next.js for the responsive desktop/mobile website, and managed Supabase for Postgres, authentication, private media storage, and realtime events**. Use Vercel Pro initially for web hosting; configure a production SMTP provider. Share domain types, validation, API contracts, ranking logic, and design tokens. Share UI components only where accessibility and platform conventions survive; do not force a phone interface into desktop web.

This is an engineering judgment for a small team: SpotMe has relational data—people, multiple gyms, preferences, reciprocal likes, matches, messages, blocks, reports—which fits Postgres well. Avoid microservices, Kubernetes, Elasticsearch, a custom authentication service, and paid AI ranking in the MVP. Keep background processing in one durable job system; use an outbox so transactions and notifications remain consistent.

| Option | Evidence and tradeoff | Decision |
|---|---|---|
| Supabase | Pro starts at $25/month with one Micro project's compute covered by credits, 100,000 auth MAU, 8 GB database disk, and 100 GB file storage. MAU allowance does not establish database throughput. | Recommended integrated backend; benchmark discovery and chat. [Pricing](https://supabase.com/pricing) |
| Firebase | Authentication and Firestore have free allowances; Firestore bills document/index reads, writes, storage, and bandwidth. Phone authentication is separately charged. | Credible alternative, especially for Firebase-experienced teams; relational discovery and joins require additional modeling. [Pricing](https://firebase.google.com/pricing), [Firestore billing](https://firebase.google.com/docs/firestore/pricing) |
| Clerk + database | Current pricing uses **monthly retained users**, not interchangeable MAU; 50,000 MRU included, with paid features and additional usage. | Strong authentication UI; a separate database/storage system still needed. Avoid a second identity layer unless a concrete requirement warrants it. [Pricing](https://clerk.com/pricing) |
| Custom/self-hosted auth | Infrastructure savings omit patching, incident response, recovery, abuse protection, and availability work. | Reject for initial release; revisit only with an owner and measured total cost. |
| Vercel Pro | Currently $20/month base with usage credit; Hobby is for personal, noncommercial use. | Default for implementation efficiency; verify seats and usage billing. [Pricing](https://vercel.com/pricing) |
| Cloudflare Workers | Paid base currently $5/month; requests and CPU can add charges. Current Next.js guidance recommends vinext, which the same documentation labels beta; OpenNext remains an alternative for existing deployments. | Lower infrastructure base, subject to a compatibility spike for auth, SSR, cache behavior, and native dependencies. [Pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Next.js deployment](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/) |

Start with supported stable versions selected and pinned at implementation time, not version guesses in this brief. For Ontario launch, select the nearest suitable Canadian database region if available and contractually appropriate. Record locations for database, backups, logs, email, push, analytics, and moderation separately; a Canadian database does not imply every processor stays in Canada. [Supabase region list](https://supabase.com/docs/guides/platform/regions)

Proposed layout:

```text
apps/web/                 # public SEO pages + authenticated responsive app
apps/mobile/              # Expo iOS/Android
packages/domain/          # types, validation, shared business rules
packages/api-client/      # generated/typed client contracts
packages/design-tokens/   # platform-neutral color/spacing/type tokens
supabase/migrations/      # schema, grants, RLS, functions, indexes
supabase/functions/       # controlled operations and workers as appropriate
tests/security/           # cross-account and privilege tests
docs/                     # product, architecture, runbooks, decisions
```

## 2. Account creation and sessions

Implement email/password with email confirmation and recovery, plus Apple/Google sign-in where configured. Ask date of birth and enforce **18+ server-side** before activation; any auth account created before the age step stays provisional with access only to onboarding, eligibility, and deletion. A failed age screen immediately revokes sessions and queues prompt cleanup under an approved minimal retention policy; self-declared age is not identity verification. Require clear Terms and Privacy acceptance with policy versions. Keep marketing consent separate and optional. Treat verified email, optional identity verification, and moderation approval as different states.

Use the provider's password hashing, reset, refresh, and token verification. Configure password controls, leaked-password protection where available, narrow redirect allowlists, PKCE for OAuth, and short-lived one-time recovery flows. Prevent enumeration with generic responses and comparable behavior. Rate-limit sign-up, reset, OTP, login, uploads, discovery, likes, messages, and gym submissions using account/IP/device signals; use progressive friction so a shared gym Wi-Fi does not lock out everyone. Require recent reauthentication for email change, credential changes, export, and deletion. Require MFA for staff and infrastructure accounts; offer user MFA with tested recovery.

Production email must use custom SMTP: Supabase's default service is restricted and unsuitable for public production signup. Configure SPF, DKIM, DMARC, bounce/complaint handling, disabled auth-link click tracking, sender reputation, and tested launch limits. [SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp)

Choose and document one web-session model. Recommended: a backend-for-frontend with Secure, HttpOnly, SameSite cookies and CSRF/origin checks for mutations; the browser does not receive refresh tokens. Realtime credentials then require an explicit narrow, short-lived design. The standard Supabase browser/SSR integration has different cookie requirements: do not claim its JavaScript-accessible sessions are HttpOnly. Test refresh races and signed-in response caching. Mobile keeps credentials in platform secure storage, not unencrypted general storage; clear tokens and sensitive caches on logout. [Supabase SSR guidance](https://supabase.com/docs/guides/auth/server-side/advanced-guide), [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)

## 3. Schema and access boundaries

All IDs are opaque UUIDs; timestamps UTC, schedule interpretation uses the user's timezone. Store minimal personal information. Add foreign keys, required fields, bounded text/arrays, explicit status enums, unique constraints, and deletion behavior in migrations.

| Entity | Required fields / invariants | Access |
|---|---|---|
| `account_private` | user ID, DOB, account state, policy acceptances, region; email remains in auth provider | Owner through narrow endpoint; authorized support only |
| `profiles` | display name, bio, city, gender/preferences consent, visibility, moderation state | Owner edits permitted fields; discovery returns a redacted projection |
| `profile_photos` | owner, slot 1–6, object key, status, version; unique owner/slot | Owner manages; eligible viewers receive approved derivatives only |
| `workout_preferences` | goals, experience, split type, custom split, weekly days, timezone, visibility | Owner; per-field visibility enforced server-side |
| `gyms`, `gym_sources` | canonical location, address, coordinates, source/license, review state | Approved business facts; writes through import/moderation |
| `profile_gyms` | user/gym unique, optional primary, visibility setting | Owner; exact affiliation hidden by default until opted in |
| `discovery_preferences` | allowed ages/genders, selected coarse municipalities/regions | Owner only; never returned on candidate cards |
| `swipes` | actor, target, decision, idempotency key | Controlled operation; no readable incoming-like table |
| `matches` | canonical low/high user IDs, unique pair, state/version | Active participants only |
| `messages` | match, sender, client message ID, body, server timestamp | Active authorized participants; unique sender/client ID |
| `blocks`, `reports` | actor/subject, reason, evidence reference | Owner's limited status; trained moderators; never subject-readable |
| `consents`, `audit_events`, `jobs` | versioned consent; staff access audit; retry state | Dedicated permissions, no broad client reads |

Use private schemas or revoke general table access for sensitive data. Enable RLS for every exposed table and storage object, with default deny and tests for every operation. RLS is row-level, so separate private columns or expose explicit projections; hiding fields in the UI is insufficient. Secret/service-role credentials bypass RLS and must never enter web/mobile bundles. User-editable metadata must not grant staff privileges. [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)

For every privileged SQL function/RPC, validate the actor from trusted auth context, pin a safe `search_path`, fully qualify object names, grant execution narrowly, and reject arbitrary query/filter input. Review security-definer functions, views, storage policies, and realtime subscriptions as independent access paths. A service-role backend must perform explicit policy checks; RLS cannot rescue a bypassing credential. Use ordinary user-context queries where possible and isolate narrowly privileged operations.

Discovery runs through a controlled endpoint/function, not arbitrary client queries over all profiles. Return only eligible adults with approved photos, active visibility, reciprocal preference compatibility, and no block in either direction. Apply the same checks again on like/match creation. Do not expose exact coordinates, raw DOB, email, gym visit times, unseen like status, member lists, or SQL filters allowing profile enumeration. Issue bounded batches and opaque pagination; log rate-limit decisions without copying dating preferences into logs.

Use city centroids or deliberately coarse locations for MVP discovery. Public gym coordinates describe businesses, not a person's live location. Multiple gym affiliations and workout days are preference signals, not attendance evidence. Never show “at the gym now” or infer a user's route. Database indexes should support pair lookup, city/visibility filtering, gym membership, match timelines, and message cursors; prove plans with realistic data.

## 4. Correctness-critical operations

**Atomic matching:** `POST /swipes` validates actor from session, target eligibility, decision, and idempotency key. In one database transaction acquire an advisory lock for the canonical user pair, recheck eligibility/blocks, upsert the swipe, inspect reciprocal like, and insert exactly one unique match. Use the same pair lock for block/unmatch operations. A unique constraint alone prevents duplicate matches but can still miss simultaneous reciprocal likes if each transaction reads before the other commits. Acquire the lock before reciprocal reads under a documented isolation level (for example READ COMMITTED with statements after lock acquisition); retry serialization/deadlock failures safely. On retries preserve the stored action outcome but reapply current authorization: never return revoked profile, media, or match content. Enqueue match notifications through an outbox.

**Messaging:** `POST /matches/{id}/messages` acquires the same canonical-pair transaction lock used by swipe/block/unmatch, then checks active membership, permitted account states, and blocks immediately before inserting. Active and paused accounts may use existing chats; suspended, deletion-pending, deleted, provisional, and underage accounts may not. Account suspension/deletion must also serialize against sends using a consistent account-lock-then-pair-lock order or equivalent database-enforced protocol. Use a client-generated message UUID with unique sender/key. Store first, then acknowledge and publish; sort by server sequence/timestamp plus ID, not client clocks. Recover missed events with cursor-based fetch. Realtime is delivery assistance, not the authoritative message store. Start with text messages, link handling, report/block/unmatch, and opt-in push. Keep push text generic by default and never include gym schedules or private messages on lock screens.

**Blocking:** transactionally stop new messages, discovery, match events, and future media authorization in both directions; invalidate caches and active subscriptions. Previously downloaded material cannot be recalled. Do not tell the blocked user who reported them. Preserve narrowly scoped report evidence only under the approved retention policy.

**Media:** issue owner-bound, size-limited upload grants to a quarantine bucket. Validate file bytes and dimensions, decompress safely, strip EXIF/GPS, re-encode, scan/moderate, and generate fixed small derivatives. Reject or hold review failures; never publish quarantine objects. Six slots may exist, but only approved images count toward profile eligibility. Delete orphaned/replaced files with retry-safe jobs. Serve private images through authorization or short-lived signed links; accept that an already issued URL remains usable until expiry unless the serving layer can revoke it. Document that window and avoid treating signed links as instant revocation.

**Deletion/export:** provide authenticated flows on every platform. Deletion immediately disables discovery and sessions, then a tracked idempotent job removes profile, media, tokens, and processor copies; treat shared messages and safety evidence according to a documented retention matrix. Distinguish deactivation from deletion. Notify completion without sensitive detail. Backups age out on schedule; restore procedures must reapply deletion tombstones before reopening access. Exports use encrypted storage, recent reauthentication, short expiry, and auditable retrieval.

## 5. Cost model and controls

MAU alone is insufficient. The following is an **illustrative monthly workload**, not a quote or a capacity promise:

* 1,000 / 10,000 MAU; 2,000 / 20,000 stored profiles, each with six photos.
* Each retained photo averages 0.8 MB sanitized master + 0.2 MB card + 0.05 MB thumbnail: 12.6 / 126 GB stored, excluding quarantines and backups.
* Each MAU browses 50 cards on 10 days, loading two 150 KB images per card: 150 / 1,500 GB image delivery. Assume uncached for a conservative example; actual cache mix matters.
* Three transactional emails per MAU: 3,000 / 30,000 sends. Chat assumption: 100 sent messages/MAU, before fan-out/reconnect events. Peak realtime connections: 100 / 400. Verify these with telemetry.
* One production Micro database and one additional Micro staging project; one web developer seat; EAS Starter; no SMS, video, or on-demand image transformation.

| Monthly line item | 1,000 MAU | 10,000 MAU |
|---|---:|---:|
| Supabase Pro production base | $25.00 | $25.00 |
| Additional Micro staging compute | $10.00 | $10.00 |
| Vercel Pro base, before extra usage/seats | $20.00 | $20.00 |
| Expo EAS Starter | $19.00 | $19.00 |
| Uncached image egress beyond 250 GB | $0.00 | $112.50 |
| File storage beyond 100 GB | $0.00 | about $0.55 |
| SES à la carte sends, excluding data/add-ons | $0.30 | $3.00 |
| **Modeled subtotal** | **$74.30** | **about $190.05** |

Supabase bills cached and uncached egress separately: each currently includes 250 GB on Pro; excess is $0.03/GB cached or $0.09/GB uncached. Storage excess is $0.0213/GB-month. These example computations do not assume free bandwidth beyond those quotas. [Egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress), [Storage pricing](https://supabase.com/docs/guides/storage/pricing)

EAS Starter is currently $19/month with $45 build credit; usage beyond allowances adds cost. SES à la carte outbound email is currently $0.10 per thousand plus applicable data/features; production access and deliverability setup require work. [Expo plans](https://docs.expo.dev/billing/plans/), [SES pricing](https://aws.amazon.com/ses/pricing/)

Budget separately for web usage beyond credits, database upgrades/disk/indexes, realtime fan-out, image processing and automated moderation, monitoring, offsite media backups, extra environments, domains, store enrollment, payment fees, legal review, human moderation/support, marketing, taxes, and development labor. These can exceed the subtotal substantially. At 10k MAU, loading all six photos instead of two makes image delivery 4,500 GB and the uncached image overage alone $382.50. Avoid automatic prefetching of whole galleries.

Set 50/75/90% spend alerts, explicit resource limits, per-user quotas, queue backpressure, and an incident switch that pauses nonessential imports or expensive media processing. Do not promise a spend cap protects every billable product. Measure dollars per activated user, image GB per session, moderation minutes per report, email acceptance, and database query latency. Use production load tests to size compute; 100k included auth MAU does not mean a Micro instance supports every 100k-user workload.

## 6. Verification, delivery, and operations

Keep local, staging, and production isolated. Store no secrets or real user photos in GitHub; commit example environment variables and synthetic seed data. Use protected branches, dependency and secret scanning, pinned CI permissions, migration review, backup-before-destructive-change, and rollback notes. Maintain an inventory of processor contracts, secret owners, rotation procedures, and data destinations.

Required tests: cross-account profile/private-field access; malicious direct storage/API reads; underage/disallowed discovery; simultaneous reciprocal likes; like-versus-block races; duplicate/offline message retries; stale JWT after suspension; unauthorized realtime subscriptions; photo replacement during moderation; reset-link replay; CSRF; account linking takeover attempts; deletion retries and restore tombstones. Run web keyboard/screen-reader and native accessibility tests; exercise real-device OAuth/deep links, push opt-out, and poor-network recovery. Adopt relevant OWASP ASVS requirements and record which controls are implemented, verified, or deferred. [OWASP ASVS](https://asvs.owasp.org/)

Proposed initial service targets: discovery p95 under 500 ms at agreed regional load, message persistence p95 under 500 ms excluding network, error-budget alerts, and no unauthorized cross-user data access. These are acceptance targets, not measured results. Require query-plan evidence and 2× projected peak load before public release.

Assign an on-call owner, escalation contacts, abuse queues, staff least privilege/MFA, immutable staff-action logs, and incident runbooks for account takeover, leaked key, exposed images, spam surge, and database failure. Logs must omit tokens, message bodies, precise locations, and sensitive preference payloads. Start with a stated recovery point target of 24 hours and recovery time target of four hours, then prove them in a staging restore or improve backup frequency. Supabase Pro daily database backups retain seven days, but **database backups exclude Storage object contents**; implement and test a separate media recovery strategy. [Backup documentation](https://supabase.com/docs/guides/platform/backups)

## 7. API contract and state-machine work to implement

The following is a proposed contract inventory, not endpoints already implemented. Generate a versioned OpenAPI or equivalent typed contract, runtime input schemas, authorization matrix, and shared client types before wiring the three clients. Derive actor identity from the session, never a client-supplied `actor_id`. Keep server clocks and state authoritative.

| Operation | Proposed route | Contract requirements |
|---|---|---|
| Own profile | `GET/PATCH /v1/me/profile` | Explicit editable fields, revision/ETag for conflict detection; never permit role/state edits |
| Own routine/privacy | `PUT /v1/me/routine`, `PUT /v1/me/visibility` | Separate display and ranking consent; policy version; invalidate projections |
| Upload reservation | `POST /v1/me/photos/uploads` | Slot 1–6, declared MIME/size, bounded owner-bound upload grant |
| Upload completion | `POST /v1/me/photos/{id}/complete` | Verify actual object, enqueue processing; remain pending until accepted |
| Photo order/delete | `PUT /v1/me/photos/order`, `DELETE /v1/me/photos/{id}` | Ownership, complete permutation, primary photo invariant, orphan cleanup |
| City search | `GET /v1/cities?q=` | Bounded results, canonical IDs, aliases and visible region expansion |
| Gym search | `GET /v1/gyms?city_id=&q=&cursor=` | Approved records only, no member counts/associations; bounded pagination |
| Gym associations | `PUT /v1/me/gyms` | Gym IDs plus per-gym visibility; cap 10; optimistic concurrency; transactional replacement |
| Missing gym | `POST /v1/gym-submissions` | Verified sender, name/address/city, duplicate candidates, idempotency, owner-only status |
| Discovery | `GET /v1/discovery?cursor=` | Signed opaque cursor, bounded candidate batch, current eligibility and audience projection |
| Swipe | `POST /v1/swipes` | Target ID, like/pass, client request UUID; canonical locking, action result, eligible match summary |
| Match list/history | `GET /v1/matches`, `GET /v1/matches/{id}/messages` | Active participant authorization; stable cursor; message body not in list telemetry |
| Send message | `POST /v1/matches/{id}/messages` | Client UUID, bounded plain text, shared serialization protocol, server message ID/sequence |
| Unmatch/block/report | `POST /v1/matches/{id}/unmatch`, `POST /v1/blocks`, `POST /v1/reports` | Auditable, idempotent, restricted evidence; durable exclusion and immediate visibility changes |
| Rights/cleanup | `POST /v1/me/export`, `DELETE /v1/me` | Recent reauth, tracked job/status, short-lived export access, deletion tombstones |
| Staff operations | `/v1/admin/...` | Server-authorized staff role/MFA; case-scoped evidence; every read/write audited |

Use bounded `limit` and cursor pagination; disallow unbounded exports from discovery. Return structured errors with a safe code, human-readable message, field errors where applicable, request ID, and optional retry time. Use 401 for missing/expired auth, 403 for denied operations where disclosure is safe, uniform 404 for inaccessible private objects, 409 for revision conflicts, 422 for input validation, and 429 with retry guidance. Never echo raw tokens, SQL, addresses, or sensitive request bodies into errors. Return rate-limit and no-candidate states without leaking why a particular member was excluded.

Accept an idempotency key for retryable writes. Scope it to actor + operation; store a request hash and outcome. Reuse with a different payload returns a conflict. Return current authorized projections on replay rather than stale cached private content. Define a retention window long enough for expected offline retries, bounded by policy. Use optimistic concurrency for profile edits and moderation decisions; never let a slow mobile save silently restore more permissive privacy choices.

Create event types such as `photo.approved`, `gym.submission_reviewed`, `match.created`, `message.created`, `pair.blocked`, and `account.deletion_requested`. Store only identifiers and minimal routing data in durable jobs. Consumers deduplicate by event ID and recheck recipient eligibility before disclosure. Retry transient failures with backoff/jitter, quarantine permanent failures, and alert on dead-letter growth. Subscription authorization must expire/revalidate promptly when relationship or account state changes; choose scoped ephemeral web credentials or a BFF-mediated stream and test it explicitly.

Use a data retention matrix with rows for accounts, pending underage/provisional accounts, raw/quarantined photos, approved derivatives, chat, reports/evidence, security logs, analytics, exports, job payloads, and backups. Each row needs purpose, access roles, retention duration, deletion trigger, exception basis, processor propagation, and an owner. Set exact durations through the launch privacy/safety review and implement them as scheduled jobs with verification. The matrix is a release gate; indefinite retention is not an acceptable default.

Build a threat model around account takeover, private-data enumeration, stalking through gym/routine inference, unauthorized staff access, abusive uploads, spam/harassment, fake or underage accounts, compromised dependencies, data-loss incidents, and resource-exhaustion bills. For each, name the asset, attacker capability, control, residual limitation, test, and response owner. Explicitly state that approved photographs or email verification do not guarantee identity or personal safety.
