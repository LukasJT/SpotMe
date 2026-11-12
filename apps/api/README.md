# SpotMe chat API

The API uses the verified Supabase user as the acting member on every request. Set it up against an isolated development project with two adult, verified sample accounts and a match seeded through the server database operations. [Supabase user verification](https://supabase.com/docs/reference/javascript/auth-getuser)

1. Apply the migrations in `supabase/migrations` with your migration owner.
2. Create a dedicated PostgreSQL login in the development database and grant it `spotme_chat_api`. Give the login a generated password through your database administration tool. The API checks that the login inherits the chat role and has neither direct profile/message reads nor permission to create swipes.
3. Copy `.env.example` to `.env` in this folder. Set `SUPABASE_URL` to the project origin, `SUPABASE_PUBLISHABLE_KEY` to its publishable key, and `SPOTME_DATABASE_URL` to the dedicated login connection string. Use a verified TLS connection with `sslmode=verify-full` for a remote database and configure the project's root certificate if required. Keep `.env` private. [Supabase database roles](https://supabase.com/docs/guides/database/postgres/roles) · [node-postgres TLS](https://node-postgres.com/features/ssl)
4. Run `npm ci --ignore-scripts` from this folder, then `node --env-file=.env server.mjs`. The API binds to loopback. A future web deployment can route requests through a same-origin HTTPS server.

All routes expect `Authorization: Bearer <access_token>` from a signed-in, email-confirmed Supabase account. The path member ID always identifies the other person.

| Method and path | Result |
| --- | --- |
| `GET /v1/matches` | Open matches with peer ID, display name and match date. Pass the last peer ID as `after` to continue. |
| `GET /v1/matches/:peer/messages` | Messages in ascending ID order. Pass the last message ID as `after` to continue. |
| `POST /v1/matches/:peer/messages` | Accepts `{ "body": "Hi", "client_message_id": "<uuid>" }` and returns the message ID. Reuse the UUID when retrying the same body. |
| `POST /v1/matches/:peer/unmatch` | Closes an existing match. |
| `POST /v1/blocks/:peer` | Closes the pair, including before a match. |

List routes accept `limit` from 1 to 50. Message IDs are decimal strings so clients can round-trip PostgreSQL `bigint` values. Inaccessible conversations return `404`. A rejected or unavailable Auth request prevents database operations. Responses are marked `no-store`.

The browser demo remains a separate local experience. The first real client integration still needs sign-in, profile onboarding, and discovery. Keep swipes behind server-side discovery eligibility and rate limits when adding that endpoint.
