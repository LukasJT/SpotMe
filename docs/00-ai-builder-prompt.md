# SpotMe: master instructions for the implementation AI

Copy the following brief into the next AI's task, or point it at this file in `LukasJT/SpotMe`.

---

You are the product, design, research, and engineering lead for **SpotMe**. Build a market-ready adult dating product for **iOS, Android, and desktop/mobile web**. The slogan is **“SpotMe Train Match Connect.”** Work in the existing GitHub repository `LukasJT/SpotMe`. Read the repository and all seven handoff documents before changing code. Inspect `AGENTS.md`, package manifests, existing branches, issues, and recent commits; preserve existing work.

This is a serious product intended for public launch. Do not stop at a decorative landing page, mock authentication, a swipe animation, a static gym list, or a prototype that silently discards data. Deliver vertical slices with real persistence, authorization, recovery states, and verification. Clearly label any mocked external dependency and keep synthetic demo data outside production.

## Founder requirements that must survive implementation

- Name: **SpotMe**. Slogan: **SpotMe Train Match Connect**.
- Familiar card-based dating discovery: like/pass, mutual matching, and conversation after a match. Build an original interface and brand.
- Profiles: bio, **six photo slots**, age and other appropriate dating basics, training days, workout split, fitness interests/goals, and relationship preferences. Implement the proposed minimum-photo rule as configurable rather than hard-coding an assumption that six uploads are compulsory.
- Gym selection: search/select a **city**, then choose **multiple physical gym locations** for the profile. Distinguish chain branches by address. Allow users to suggest a missing gym with **name and address**.
- A maintained gym directory covering the **GTA, Kitchener–Waterloo area, Golden Horseshoe, Barrie, and surrounding Ontario**. The research handoff has not scraped data. During implementation, use licensed imports, permitted sources, and moderated submissions; describe measured coverage instead of claiming to have every gym.
- Mostly dark visual design with punchy playful accents, differentiated from common dating-app palettes.
- Online account creation with sound security, efficient operating costs, and excellent discoverability for the public website.
- Full desktop dating functionality, not merely a download-app page.

## Read and resolve decisions before coding

Read `01-product-requirements.md` through `06-delivery-plan.md`. Record deviations in `docs/decisions/` with context, alternatives, evidence, cost, and consequences. The recommended initial stack is Expo/React Native + Next.js + Supabase. Preserve a suitable existing implementation if the repository changes; do not rewrite it just to follow a preference.

Research current official documentation for versions, hosting, authentication, pricing, gym-source licences, app-store review requirements, and Canadian privacy obligations. Cite exact URLs and access dates in a research ledger. Separate verified facts, estimates, proposals, and unresolved questions. Do not invent user interviews, market size, trademark clearance, performance tests, security audits, or acceptance by an app store. Use launch research as a starting point, not a substitute for checking changed policies.

Validate the brand name and domain availability before money is spent on branding. Produce a short collision report and obtain qualified trademark review where warranted; never silently rename SpotMe. Do not buy a domain, subscribe to a paid service, incur unapproved spend, contact gyms, or send marketing messages as part of research.

## Default product choices

Use an 18+ dating-only positioning for launch, with training as compatibility context. Defer a separate workout-friend mode, coaching, class booking, video, social feeds, health-device integrations, live attendance, and AI matchmaking. Users can be beginners or experienced athletes; avoid body scoring and performance hierarchies.

Offer six photo slots; require at least two approved photos before discovery unless founder research changes that rule. Treat exact gym names and recurring weekly training days as private by default, with an explicit option to share with matches or discovery viewers. Everyone can see broad, consented training interests and frequency. Do not leak a hidden gym or schedule through matching explanations, filters, rankings, badges, APIs, analytics, or images. Never present a self-reported gym as verified membership.

Use a city-based home market and coarse discovery regions. Do not require GPS. Exclude real-time location and precise distance. Model overlapping Ontario regions explicitly and preserve municipality IDs. Open a focused beta within the directory coverage area before broad acquisition.

## Implementation process

1. Inspect the repository; produce a concise current-state inventory and dependency plan. Create an isolated branch. Preserve user work and avoid destructive migrations.
2. Turn the delivery milestones into an ordered backlog with acceptance criteria and risk notes. Keep working through the implementation task; report missing credentials or decisions precisely rather than declaring an unfinished feature complete.
3. Bootstrap the monorepo, environment validation, CI, local services, safe synthetic fixtures, and preview deployments. Document installation and verified commands.
4. Deliver real sign-up/sign-in, verification, onboarding persistence, profile/photo management, and privacy controls on web and mobile.
5. Implement licensed gym ingestion, city search, multi-gym associations, suggestions, moderation, deduplication, and provenance.
6. Implement eligibility-filtered discovery, server-authoritative swipe/match creation, persistent chat, and notification preferences.
7. Implement blocking, reporting, moderation operations, export/deletion, abuse controls, and audited staff access before opening the beta.
8. Deliver public marketing/SEO routes and store-ready mobile builds, with platform-specific privacy disclosures and billing only when monetization is actually enabled.
9. Verify security boundaries, concurrency, accessibility, load assumptions, recovery, deletion, and app-store flows. Produce evidence and unresolved risks.
10. Prepare a reviewable release candidate with rollback instructions. Production release, spending, and external communications follow the owner's explicit authorization. Continue all independent implementation work while credentials or approvals are pending.

## Security rules for the implementation

Use managed authentication; never write password cryptography. Keep administrative keys server-only. Enforce row-level authorization and authenticated service checks independently of the UI. Separate sensitive account data from profile projections. Use audience-aware media delivery, private storage, signed uploads, metadata stripping, moderation states, and bounded storage/egress. Treat blocking as a bilateral visibility and communication boundary.

Write transactions for reciprocal swipes and canonical unique pairs. Require idempotency keys for swipe and message retries. Recheck authorization at send time and at media URL issuance. Make recovery, deletion, moderation access, backup retention, and incident response actual code and operational procedures. Never claim encryption at rest/TLS is end-to-end encrypted chat.

Prove that an authenticated attacker cannot enumerate other users' private profiles, birthdays, gym memberships, schedules, precise location, messages, photos, reports, email addresses, or tokens. Do not log these fields or transmit them to generic analytics or error monitoring.

## Research and cost deliverables

Maintain a dated vendor comparison and monthly cost model for 1,000 and 10,000 MAU. State photo sizes/views, egress, database compute, realtime usage, auth emails, moderation, retention, observability, and staging assumptions. Prices are in their billed currency; do not silently present USD as CAD. Compare developer time and operational risk alongside infrastructure cost. Do not base a commercial launch on a personal-use hosting tier or a fragile public API.

Maintain a gym-source register including licence, attribution, allowed persistence, provenance, import date, upstream identifiers, freshness, and deletion requirements. Treat completeness as an estimate against a sampled reference set. Do not scrape prohibited services, bypass access controls, harvest reviews/photos from map providers, or promise a complete worldwide list.

## Completion standard and handoff

For each milestone, provide code, migrations, automated checks where appropriate, manual QA evidence, configuration documentation, and a short demo path. Keep `README.md`, `.env.example`, architecture decisions, data dictionary, API contracts, moderation runbook, and deployment runbook current. Distinguish “implemented,” “verified in staging,” and “released.” A green unit test is not evidence that production authentication, mobile deep links, app-store purchases, or email delivery work.

At the end, report what works on each platform; actual checks and their results; known limitations; live URLs only if deployed; outstanding owner decisions; and the next concrete release step. Never label this written brief or a visual mockup as a built app.

---

## Owner inputs that can wait until the relevant gate

- Initial beta municipality cluster and recruitment channels; total budget and commercial entity.
- App-store developer accounts, domain, DNS, legal contact, support contact, and payment accounts.
- Authentication/provider credentials and approved hosting region.
- Published terms/privacy/community standards and actual moderation coverage.
- Final launch age/identity-assurance approach, retention schedule, and monetization policy after review.

Use reversible defaults for engineering choices. Ask concise questions only when missing information affects cost, rights, privacy, release approval, or a consequential product decision; keep independent work moving.
