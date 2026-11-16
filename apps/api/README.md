# SpotMe member web app and API

The API uses the verified Supabase user as the acting member on every request. Set it up against an isolated development project with adult, verified sample accounts. [Supabase user verification](https://supabase.com/docs/reference/javascript/auth-getuser)

1. Apply the migrations in `supabase/migrations` with your migration owner.
2. Create a dedicated PostgreSQL login in the development database and grant it `spotme_chat_api`. Give the login a generated password through your database administration tool. The API checks that the login inherits the role, has no direct profile or message reads, and cannot bypass the discovery checks by calling the low-level swipe routine.
3. Copy `.env.example` to `.env` in this folder. Set `SUPABASE_URL` to the project origin, `SUPABASE_PUBLISHABLE_KEY` to its publishable key, and `SPOTME_DATABASE_URL` to the dedicated login connection string. Use a verified TLS connection with `sslmode=verify-full` for a remote database and configure the project's root certificate if required. Keep `.env` private. [Supabase database roles](https://supabase.com/docs/guides/database/postgres/roles) · [node-postgres TLS](https://node-postgres.com/features/ssl)
4. Run `npm ci --ignore-scripts` from this folder, then `node --env-file=.env server.mjs`. Open `http://127.0.0.1:3080` in your browser, or use the port printed by the server. Sign in and open My profile to enter your details. The server binds to loopback. When using a same-origin HTTPS proxy for development, set `SPOTME_WEB_ORIGIN` to the proxy origin so writes are checked against it and the cookie is marked `Secure`.

For a development walkthrough, the [fixture](../../supabase/dev/discovery-fixture.sql) seeds a fictional city, gym, and two active reciprocal profiles for two fresh, confirmed Auth test accounts. Run it from the repository root against the disposable development database using a migration owner connection. Set `ALEX_ID` and `MAYA_ID` to the test account UUIDs. Use fixture approval for synthetic accounts until the photo and moderation flows are in place.

```sh
psql -v alex_id="$ALEX_ID" -v maya_id="$MAYA_ID" -f supabase/dev/discovery-fixture.sql
```

Sign in as Alex, open Discover, and like Maya. Sign out, switch accounts, and like Alex to open a conversation in Matches. Alex's shared gym and weekdays appear on the card, while Maya's private details stay hidden. To test onboarding from scratch, use a third fresh confirmed account and create its profile under My profile. Dates of birth are locked after onboarding and require a support correction.

API clients can send `Authorization: Bearer <access_token>` from a signed-in, email-confirmed Supabase account. The browser exchanges the email and password through Supabase Auth and then uses an opaque `HttpOnly` cookie. Browser writes require the configured origin. The path member ID identifies the other person. [Supabase password sign-in](https://supabase.com/docs/reference/javascript/auth-signinwithpassword) · [Cookie attributes](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)

| Method and path | Result |
| --- | --- |
| `GET /v1/me/profile` and `PUT /v1/me/profile` | Read or save your profile, preferences, and gym visibility settings. |
| `GET /v1/cities`, `GET /v1/gyms?city=<id>` | List seeded cities and approved gyms. Gym search supports `q` and an `after` cursor. |
| `POST /v1/gym-submissions` | Submit `{ "city_id": "<id>", "name": "…", "address": "…" }` for review. |
| `GET /v1/discovery`, `POST /v1/swipes` | Page eligible cards and record `{ "peer_id": "<uuid>", "decision": "like" }` or `pass`. |
| `POST /v1/reports` | Submit `{ "peer_id": "<uuid>", "client_report_id": "<uuid>", "reason": "harassment", "details": "…" }` to the private review queue. |
| `GET /v1/matches` | Open matches with peer ID, display name and match date. Pass the last peer ID as `after` to continue. |
| `GET /v1/matches/:peer/messages` | Messages in ascending ID order. Pass the last message ID as `after` to continue. |
| `POST /v1/matches/:peer/messages` | Accepts `{ "body": "Hi", "client_message_id": "<uuid>" }` and returns the message ID. Reuse the UUID when retrying the same body. |
| `POST /v1/matches/:peer/unmatch` | Closes an existing match. |
| `POST /v1/blocks/:peer` | Closes the pair, including before a match. |

Match and message lists accept `limit` from 1 to 50. Message IDs are decimal strings so clients can round-trip PostgreSQL `bigint` values. Inaccessible conversations return `404`. A rejected or unavailable Auth request prevents database operations. Responses are marked `no-store`.

## Enable self-service registration in development

Enable email/password signup and **Confirm email** in Supabase. Use `supabase/templates/confirm-signup.html` as the Confirm signup email template. It contains the six-digit code expected by the browser. Configure email delivery for the development test recipients, then set `SPOTME_SIGNUP_ENABLED=true` and restart the API. Until then, the signup controls and routes are off. [Supabase signup](https://supabase.com/docs/reference/javascript/auth-signup) · [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates)

Create an account, enter the emailed code, then sign in with the password. Signup and verification responses carry no provider tokens. Successful signup uses a generic response so the app does not disclose whether the address already has an account. The API applies its process-wide sign-in rate limit to signup and code verification too. Profile onboarding still enforces the adult date-of-birth check before discovery approval.

The browser keeps sessions in one server process. Restarting it signs members out, and expiry requires signing in again. A hosted deployment needs durable session storage, login throttling across instances, and verification against real Supabase sessions. Password recovery, photo uploads and approval, staff tooling, and real directory import remain pending. Discovery uses initials until photo delivery is implemented.

## Desktop and Android Premium

Use an isolated Supabase project and billing sandbox first. Apply
`20261115000300_add_play_and_web_billing.sql`; create a dedicated PostgreSQL login
that inherits `spotme_external_billing` only. Set
`SPOTME_EXTERNAL_BILLING_DATABASE_URL` to its TLS-verified connection string.
Use `SPOTME_BILLING_ENVIRONMENT=Sandbox` for test purchases and `Production`
for live purchases. If Apple is enabled, its environment must match. One
verified payment grants access to the same SpotMe account on every surface.

- **Stripe:** Create a product and two licensed recurring prices in CAD
  ($4 every week and $10 every month). Set the secret key and both price IDs.
  Expose `POST /stripe/webhook` on the member server over HTTPS. Subscribe to
  `customer.subscription.created`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.paid`, and `invoice.payment_failed`.
  Set the endpoint signing secret. Enable
  customer portal cancellation and payment updates; leave plan changes off
  until the plan switching experience is ready. The user returns to the
  Premium tab and waits for account verification. Confirm a failed payment
  never unlocks access. In an operator refund or dispute requiring immediate
  revocation, also cancel the Stripe subscription. [Stripe webhooks](https://docs.stripe.com/webhooks) ·
  [Customer portal](https://docs.stripe.com/customer-management)
- **Google Play:** Follow the [Android purchase setup](../android/README.md).
  The app hands transactions to this API, which verifies ownership and
  environment, records expiry, and acknowledges purchases. Authenticated
  Pub/Sub calls `POST /play/notifications` for renewals, cancellation and
  revocation. Verify a Play license test never unlocks a production deployment.
- **Desktop hosting:** Serve this API and its member UI together behind HTTPS
  (for example at `app.spotmedating.com`). Set `SPOTME_WEB_ORIGIN` to that
  exact origin. The public GitHub Pages site can link desktop visitors to
  the member app once its host is live. GitHub Pages does not run this server
  or handle payment webhooks. For launch, run the existing mobile promotional
  flow on the public site and keep the members area out of search indexes.

Test in both directions: activate on one provider and sign in with the same
SpotMe account on the other surface without charging again. Verify signed
delivery, duplicate delivery, expiry, cancellation at period end, immediate
revocation, and blocked members. Confirm gym search excludes profiles that
have not opted in or do not match reciprocal preferences.
