# SpotMe

**SpotMe — Train Match Connect.**

An adult dating product built around training compatibility, with iOS, Android, and a fully usable desktop website.

This repository contains the researched product handoff and a standalone discovery prototype. The prototype uses fictional profiles and photo placeholders. Its interactions run locally and reset when the page reloads.

## Start here

Open [the discovery prototype](apps/web/discovery-preview.html) locally in a browser. Scroll within the card, try the photo controls, then use Pass or Like. A deliberate horizontal drag on the card also advances the sample deck. The white and soft gray theme uses blue for the primary action.

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
