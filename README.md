# SpotMe

**SpotMe — Train Match Connect.**

An adult dating product built around training compatibility, with iOS, Android, and a fully usable desktop website.

This repository contains the researched product handoff, a browser demo using fictional accounts, and a backend for chat and match management.

## Start here

From the repository root, run `node tools/build-local.mjs` with Node.js 22 or later, then open `dist/spotme-local.html`. The build kit also includes a prebuilt `SpotMe-Local-App.html`. The demo stores edits and messages in the current browser when browser storage is available. Use fictional information when testing.

Start as Alex and like Maya in Discover. Switch the sample account to Maya and like Alex, then open Matches to send a message. Switch back to Alex to read it. Try My profile to change who sees training days and gyms, or select gyms across cities and submit a missing gym in Gyms. Suggestions appear only for the sample account that submitted them. The demo also supports reporting, blocking, and unmatching.

The [original discovery prototype](apps/web/discovery-preview.html) is a single-card interaction reference. See the [chat API setup](apps/api/README.md) and [database checks](supabase/README.md) to run the backend against a development project.

Give the next implementation agent [the master prompt](docs/00-ai-builder-prompt.md), then have it read the linked specifications before coding.

1. [AI builder prompt and operating instructions](docs/00-ai-builder-prompt.md)
2. [Product requirements and user journeys](docs/01-product-requirements.md)
3. [Brand, interaction, and accessibility specification](docs/02-design-system.md)
4. [Architecture, authentication, security, and cost research](docs/03-architecture-security-cost.md)
5. [Gym data acquisition and directory operations](docs/04-gym-directory.md)
6. [Ontario launch, market research, app stores, and SEO](docs/05-market-launch-seo.md)
7. [Implementation milestones and acceptance tests](docs/06-delivery-plan.md)

**Launch geography requested by the founder:** Greater Toronto Area, Kitchener–Waterloo area, Golden Horseshoe, Barrie, and nearby Ontario communities. Support this directory footprint while opening dating discovery in measured local cohorts. Do not interpret overlapping regions as separate copies of the same gym.

**Proposed technical direction:** TypeScript, Expo/React Native for mobile, Next.js for public and authenticated web, Supabase for managed PostgreSQL/Auth/Storage/Realtime. Confirm current pricing and compatibility before implementation. These are recommendations, not services already purchased.

**Key distinction:** workout compatibility and multiple gym affiliations without publishing someone's attendance, exact location, or weekly whereabouts. Gym membership is self-reported. No live check-ins or member rosters.

Research citations appear beside the claims they support. Costs, legal applicability, store rules, availability, and vendor SDKs must be rechecked before release. Product defaults and launch targets are proposals unless explicitly identified as founder requirements.
