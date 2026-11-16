# SpotMe Android Premium

This native Android project implements sign-in, Play checkout, restore,
subscription management, and Premium gym search. It is the purchase slice of
the Android app; full Android onboarding, swiping, and messaging remain separate.

1. Open this folder in Android Studio. Use JDK 17 or 21 and install Android SDK Platform 36, Build-Tools
   36.0.0, and Platform-Tools. The wrapper pins Gradle 8.13. From a shell with these installed, build with
   `./gradlew :app:assembleDebug -PspotmeApiOrigin=https://your-staging-member-host`.
   Set `spotmeApiOrigin` to the exact HTTPS origin of the SpotMe member API.
   A debug build without that property uses `http://127.0.0.1:3080`; run
   `adb reverse tcp:3080 tcp:3080` for local API access.
2. In Play Console, register `com.spotmedating.android` and publish a signed
   internal test build. Create the subscription `spotme_premium` with
   automatically renewing base plans `weekly` (CAD $4/week) and `monthly`
   (CAD $10/month), targeting Canada for initial rollout. Set trial/introductory
   offers aside for now. The app shows the current localized Play price.
3. Enable the Google Play Android Developer API. Grant a dedicated backend
   service account only the app access and permissions needed to read its
   orders and manage subscriptions. Use Application Default Credentials,
   ideally workload identity; a local key file, if required for staging,
   stays outside this repository and the APK.
4. Set the external billing environment and database as documented in the
   [member API README](../api/README.md). Set `SPOTME_PLAY_ENABLED=true` and
   `SPOTME_PLAY_ACCOUNT_SECRET` to a stable random secret of at least 32 bytes.
   Retain the secret across deployments: it binds purchase ownership to the
   member's SpotMe account.
5. Configure Play real-time developer notifications to a Cloud Pub/Sub topic
   with Play publishing access. Create an authenticated push subscription to
   `https://your-staging-member-host/play/notifications`. Configure the push
   service-account email and exact audience as
   `SPOTME_PLAY_PUSH_SERVICE_ACCOUNT` and `SPOTME_PLAY_PUSH_AUDIENCE`.
6. Install from the internal testing link using a Play license tester and
   sign in to a confirmed SpotMe test account. Exercise the test card for
   both plans; check restore after reinstall and wrong SpotMe account,
   pending/declined payment, renewals, cancellation, refund/revocation,
   and cross-device access. Use the same SpotMe account on the desktop
   staging member app to confirm that access carries over.

[Play Billing integration](https://developer.android.com/google/play/billing/integrate) ·
[License tests](https://developer.android.com/google/play/billing/test) ·
[Real-time developer notifications](https://developer.android.com/google/play/billing/rtdn-reference) ·
[Authenticated Pub/Sub push](https://cloud.google.com/pubsub/docs/authenticate-push-subscriptions)
