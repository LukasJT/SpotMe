# Database foundation

The first migration creates private profile, city and gym tables, source provenance, user gym selections, and a gym suggestion queue. It grants access only to the server role and enables row-level security without client policies. Keep `spotme_private` out of the exposed Data API schemas. Review schema grants and RLS together before creating any client endpoint. [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security)

Apply this migration to an isolated Supabase development database first. Check that `anon` and `authenticated` cannot read or mutate any table in the schema, that duplicate municipality and source IDs fail, that gym links and schedules default to private, and that pending submissions cannot become approved without a resolved gym. This migration has not yet been applied to a running database.

The local demo uses browser storage. When implementing the managed backend, enforce age and account eligibility before activation, verify approved gym selections and limits in a transaction, return explicit audience-specific projections, and route dating decisions through transaction-safe server operations. Keep the service role credential on the server. [Supabase database functions and privileges](https://supabase.com/docs/guides/database/functions)
