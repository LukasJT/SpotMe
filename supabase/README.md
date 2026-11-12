# Database foundation

The migrations create private tables for profiles, cities, gym listings and provenance, gym selections, gym suggestions, member pairs, and messages. The schema grants access only to the server role and enables row-level security without client policies. Keep `spotme_private` outside the exposed Data API schemas. [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

The matching migration provides server-only operations for recording a swipe, sending and reading messages, and blocking or unmatching. One canonical row per pair serializes decisions and message writes. Profiles are locked in ID order before the pair row. A first decision is durable, mutual likes open a conversation, and closure prevents both members from reading or writing through these operations. Message retries reuse the same ID when the body matches. Message history uses an ascending ID cursor with a maximum of 50 rows per call. [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html)

The API must derive `p_actor` from a verified session and check discovery eligibility and rate limits before calling `record_swipe`. Profile activation must enforce onboarding, age, and photo approval. The discovery projection must exclude closed pairs and use the profile and gym audience fields. Treat the service role as trusted server access and keep its credential out of browser and mobile code. [Supabase database functions and privileges](https://supabase.com/docs/guides/database/functions)

## Run the database checks

From the repository root, with Node.js 22 and npm:

```sh
npm --prefix supabase/tests ci --ignore-scripts
npm --prefix supabase/tests test
```

The tests run the migrations against in-memory PostgreSQL via PGlite with a minimal `auth.users` table and Supabase role equivalents. They check client denial, server grants, private defaults, gym review constraints, reciprocal swipes, message retries and history, and closure after blocking or unmatching. The local browser demo has its own fictional data. Before connecting real accounts, apply the migrations in an isolated Supabase project, exercise the real session and role configuration, and run simultaneous swipe and send-versus-block tests over separate connections.
