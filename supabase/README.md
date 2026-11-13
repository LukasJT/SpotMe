# Database foundation

The migrations create private tables for profiles, cities, gym listings and provenance, gym selections, gym suggestions, member pairs, and messages. The schema grants access only to the server role and enables row-level security without client policies. Keep `spotme_private` outside the exposed Data API schemas. [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

The matching migration provides server-only operations for recording a swipe, sending and reading messages, and blocking or unmatching. One canonical row per pair serializes decisions and message writes. Profiles are locked in ID order before the pair row. A first decision is durable, mutual likes open a conversation, and closure prevents both members from reading or writing through these operations. Message retries reuse the same ID when the body matches. Message history uses an ascending ID cursor with a maximum of 50 rows per call. [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html)

The [chat API](../apps/api/README.md) derives `p_actor` from a verified session and connects with a dedicated PostgreSQL login. That role can list matches, manage conversation closure, and read or send through the guarded routines. Direct table access and `record_swipe` stay with the trusted database role. A future discovery API must check eligibility and rate limits before recording a swipe. Activation must enforce onboarding, age, and photo approval, and discovery must honor the audience fields and exclude closed pairs. [Supabase database functions and privileges](https://supabase.com/docs/guides/database/functions)

## Run the database checks

From the repository root, with Node.js 22 and npm:

```sh
npm --prefix supabase/tests ci --ignore-scripts
npm --prefix supabase/tests test
```

The tests run the migrations against in-memory PostgreSQL via PGlite with a minimal `auth.users` table and Supabase role equivalents. They check role privileges, private defaults, gym review constraints, mutual likes, message retries, closure, and the HTTP handler with a simulated Auth response. Separate smoke checks on a local PostgreSQL 18.6 server verified concurrent reciprocal swipes, sending during a block, and a send/read round trip through the running HTTP process and its restricted login. Validate the migrations and real Auth sessions against an isolated Supabase project before using real accounts.
