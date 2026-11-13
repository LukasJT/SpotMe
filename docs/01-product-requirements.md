# Product requirements

Status: proposed implementation specification, November 11, 2026. Founder requirements are marked **Required**. Numerical limits and launch thresholds are starting hypotheses, to be validated and configurable.

## 1. Product promise and scope

**SpotMe — Train Match Connect.** Meet adults whose training lifestyle fits yours. The core loop is: create a trustworthy profile → express training preferences → discover eligible people → mutually match → talk → decide whether to meet.

**Required platforms:** iOS, Android, responsive desktop and mobile web. All platforms support onboarding, profiles, gym selection, discovery, matching, messaging, safety actions, privacy settings, and account deletion. The public website also explains the product and attracts search traffic.

**Required geography:** GTA + Kitchener–Waterloo area + Golden Horseshoe + Barrie and surrounding communities. These are a requested footprint, not a single formally defined administrative area. Keep the final municipal inclusion list in versioned configuration. One city can belong to several marketing regions but must have a single canonical city ID.

**Primary audience:** adults seeking dating relationships who train, including beginners, lifters, runners, group-fitness participants, and people returning to fitness. Different bodies and abilities belong here. Do not rank physique, body fat, strength, attractiveness, or perceived health.

**Launch scope:** dating, profile discovery, match-gated text chat, gym directory and submissions, safety operations, public website. Later candidates: friend mode with distinct matching pools; verified-gym partnerships; optional identity checks; paid convenience features. Exclude workout tracking, coaching advice, wearable data, class booking, public posts, video, live check-ins, and chat attachments from MVP.

## 2. Account and onboarding

Proposed flow:

1. Welcome: value proposition, 18+ requirement, terms/privacy links, sign-up and sign-in.
2. Managed email registration and verification, plus platform-appropriate Apple/Google options if enabled. Explain verification emails and recovery. Avoid account-enumerating errors.
3. Private date of birth and age gate. Calculate eligibility by calendar date; show age, never full birth date. Reject activation after a failed age screen. If managed auth already created a provisional account, revoke its sessions and queue prompt cleanup; it may never browse, message, or access member data. Age declaration alone is not proof of age; complete the age-assurance and app-store review in the launch plan.
4. Display name, pronouns (optional), gender identity, who the user wants to meet, and relationship intentions. Offer self-description where feasible. Separate identity visibility from matching preferences. No preselected sensitive disclosures.
5. City/area selection. Manual city selection works without geolocation permission. Explain supported markets and waitlist behavior for unopened areas.
6. **Six photo slots**, first-photo selection, crop/rotate/reorder, upload progress, rejection guidance, retry/delete, and descriptive captions/accessibility text where appropriate. Require two approved photos before discovery as a proposed default. Users may fill all six; do not force duplicates to finish onboarding.
7. Bio (proposed 500-character maximum) and optional short prompts, such as “My ideal post-workout plan…” or “A goal I’m working toward…”. Count Unicode graphemes consistently; reject control characters, unsafe markup, and spam.
8. Training profile and gym selection, including “I train at home/outdoors” and “Prefer not to list a gym.” Gym membership is not compulsory for dating eligibility.
9. Privacy preview: show exactly what a stranger and a match can see. Ask for explicit sensitive-data choices. Save progress after every step; resume across devices.
10. Confirm completeness and moderation status; enter discovery only once age, verification, profile, market, and safety eligibility requirements pass.

Account states: `unverified`, `onboarding`, `pending_review`, `active`, `paused`, `suspended`, `deletion_pending`, `deleted`. Document allowed transitions and preserve appeal/recovery paths. Suspended and paused profiles must not appear in discovery or generate new matches. Paused users retain existing match/chat access but cannot discover or be discovered, like, or create new matches. Suspended and deletion-pending/deleted users cannot send or receive new messages or notifications. Other participants see a generic unavailable state, never a suspension reason. Provisional/onboarding/pending-review accounts cannot access member discovery or chat.

## 3. Profile field contract

| Field | Input and proposed limit | Visibility/default |
|---|---|---|
| Account ID/email/provider IDs | Managed auth identifiers | Owner and restricted systems only |
| Date of birth | Real calendar date; 18+ | Private; return derived age |
| Display name | 2–40 graphemes | Eligible discovery viewers |
| Pronouns/gender identity | Optional public display choices | Per-field consent; preferences remain private |
| City | Canonical city/municipality ID | Broad city label only |
| Bio | Up to 500 graphemes | Eligible discovery viewers |
| Photos | Slots 1–6, exactly one primary when any exist | Approved, audience-authorized delivery |
| Relationship intent | Configurable options + optional explanation | User-controlled public profile field |
| Fitness interests | Up to 8 curated tags, accessible taxonomy | Consented public profile field |
| Training experience | Beginner/intermediate/experienced/prefer not to say | Optional, never a performance rank |
| Training frequency | 0–7 days/week, or flexible | Public only with consent |
| Workout split | Full body, upper/lower, push/pull/legs, body-part split, classes, sport-specific, custom, flexible | Optional public field |
| Recurring weekly plan | Day, activity label, rest/flexible state | Private by default; separately shareable |
| Gyms | Multiple canonical physical locations; proposed cap 10 | Private by default; per-gym sharing options |
| Discovery preferences | Age range 18+, identities sought, coarse regions, optional training preferences | Private |
| Blocks/reports/moderation | IDs, evidence, status, reason | Restricted operational records |

Do not combine all fields into a single readable `profiles` row. Store private information separately and construct explicit audience-specific projections. Changes to a public field should immediately update future responses and invalidate relevant caches. Do not expose exact coordinates or timestamps that reveal routines.

## 4. Workout experience

The weekly editor shows Monday–Sunday with **train / rest / flexible** state and an optional label for each training day. Users can choose a template and customize it: e.g. Monday upper, Tuesday lower, Thursday upper, Saturday lower. Support rolling schedules and “varies each week”; do not force every split into a seven-day template. Store local timezone for display consistency, not precise appointment times.

Keep training frequency, split, and day sharing separate. A person can display “Upper/lower · 4 days/week” while keeping their weekdays private. MVP does not store start times, live attendance, or “currently at the gym.” Add a clear preview before sharing any recurring plan.

Users can opt into broad training-compatibility matching. Weekly-day overlap influences rank or explanations only when both users make those days discovery-visible AND explicitly opt into using them for discovery; private and matches-only days are excluded entirely. Gym overlap similarly requires explicit bilateral permission for discovery use. Exact gym visibility is a separate choice; do not infer permission from membership entry. Launch with opt-in gym-overlap ranking disabled unless privacy testing proves hidden affiliations cannot be inferred.

## 5. City and gym selection

**Required:** country/region → city search → gym search within the city → multi-select → save. A user can switch cities and keep earlier selections, such as a home gym in Toronto and another near work in Mississauga.

Each result shows gym name, branch/address, municipality, source freshness/status, and selection state. Search supports normalized aliases and common spellings; disambiguate Waterloo city, Waterloo Region, and Kitchener. Nearby results are explicitly labeled and never silently replace the selected city. Prefer searchable lists in MVP; maps are optional and must not become a dependency for completing the flow.

Empty state: “Can’t find your gym? Add its name and address.” Required submission fields are name, street address, city, province, postal code where available, and country. Optional website or map pin can help moderation but is not required. Present candidate duplicates before submission. The gym initially appears to its submitter as **Pending review**; do not publish unverified addresses to all members. Allow submitter edits, moderator approval/rejection, and clear status feedback. No residential/home gyms in the public directory.

Provide per-gym `private / matches / discovery` display controls with private as default. Removing a gym removes the user's association, not the shared directory record. Merging duplicate gym records preserves associations and the more restrictive visibility choice. “Self-reported” describes affiliation; a source record's quality is not proof a user trains there.

Gym pages must never list members, attendance schedules, or counts for small cohorts. Directory access must not be a back door to browse every person affiliated with a location. A public gym directory can be deferred until data rights and useful editorial content support it.

## 6. Discovery and matching

**Required:** one compact person card at a time; left/pass and right/like gesture plus visible named buttons. Scroll vertically inside that same card to read the complete audience-visible profile; no separate full-profile screen is required for discovery. Photos, full bio, dating basics, training information, and shared gym details stay within the card. Tap/click through up to six photos using explicit photo controls. Keep Pass/Like visible in the card footer while its body scrolls. Provide keyboard and screen-reader equivalents, including a non-drag photo reorder path in editing.

Card content: primary photo, display name, derived age, broad city, optional shared pronouns, relationship intent, full bio, all audience-visible training information, interests, and only consented gym/schedule fields. “All information” means all fields this viewer is authorized to see; private and matches-only information remains excluded from unmatched discovery. Use short factual compatibility labels, such as “Both enjoy strength training,” with underlying permission checks. Never show made-up “92% compatible” values.

Card behavior: distinguish vertical scrolling from horizontal dating swipes with a direction lock and deliberate travel/velocity threshold. Diagonal scrolling, selecting text, operating photo controls, and tapping a report control must not cause a like or pass. Preserve the card and its scroll position on a failed action; after a successful decision, reset the next profile to its top and first photo. Use the same profile-card component for authorized matched-profile viewing, with the appropriate audience projection. Keep discovery free of mandatory profile-information sidebars.

Eligibility filters run server-side before ranking: active verified 18+ users, allowed markets, reciprocal gender and age preferences, moderation eligibility, no self, neither-direction block, no existing match or durable unmatch exclusion, and no recent pass/like already handled. Proposed pass resurfacing after 30 days must be configurable and explained; never resurface blocked people. Explain when filters leave an empty pool and let the user widen them deliberately.

Initial ranking is understandable and cheap: eligible coarse region, broad training-interest overlap, opt-in schedule compatibility, freshness, and exposure balancing. Proposed example weights are region 35%, interests 35%, explicitly shared routine 15%, exposure balance 15%; missing private fields must not penalize a person—renormalize available components. Validate with experiments; do not ship numeric weights as established science. Do not sell precise gym filters in MVP.

A like is private until reciprocal. Create exactly one match for the canonical pair in a transaction. Two simultaneous likes, duplicate network retries, and later sync must never create two matches or conversations. A pass cannot erase an established match; unmatch is its own operation. For MVP, unmatch permanently excludes the pair from discovery and rematching unless a future explicitly consented reactivation feature is designed; preserve a canonical pair tombstone instead of reinserting an active match. Publish match events after commit with retry-safe delivery.

Proposed initial abuse ceiling: 100 likes/day per account, with additional device/IP and behavioral limits. Tune for abuse and inclusion; present honest limit states. This is not the monetization plan. Do not run a city-wide empty queue filled with fabricated or long-inactive profiles.

## 7. Matches, messages, and notifications

Match sheet: “Good form. Great chemistry.” Offer “Say hello” and “Keep exploring.” Messaging works on all platforms with a conversation list, unread indicators, text composition (proposed 2,000 graphemes), chronological history, sent/failed/retry states, and reconnection recovery.

MVP supports plain text and safe link presentation; defer media attachments. No read receipts, typing indicators, or last-seen timestamps unless subsequently justified. An optional icebreaker can reference a consented training interest, never a hidden gym or routine. Do not send generated openers automatically.

Only current match participants may read/send. Block/unmatch immediately prevents new messages and notifications. Retain only what the documented safety/deletion policy permits; users can report from a recent unmatched-conversation safety entry during a bounded retention window without restoring chat access. Resolve block-versus-send races server-side.

Push permissions are requested in context. Lock-screen preview defaults to “You have a new message on SpotMe”; revealing names or message text is opt-in. Marketing consent is separate from transactional email and notifications. Store device tokens securely, remove invalid tokens, and revoke associations on logout/account deletion. Suppress blocked/deleted/suspended recipients at dispatch time.

## 8. Safety, privacy, and staff operations

Report and block are available on cards, profiles, and conversations. Categories include underage, impersonation, harassment, threats, sexual content, spam/scam, and other. Provide immediate blocking as an option without requiring the user to disclose detailed allegations. Do not tell the reported person who reported them.

The staff console needs least-privilege roles, MFA, audited record views/actions, report priority, evidence access scoped to the case, sanctions, appeal tracking, gym suggestions, photo review, and account deletion status. Report submission alone must not auto-ban someone; use a defensible review policy and escalations for urgent harm. Do not launch reporting without people and coverage to respond.

Settings include pause discovery, visibility preview, consent history, notification choices, session revocation, data export, account deletion, and support links. Provide meaningful account deletion rather than “contact support” as the only path. Deletion immediately withdraws discoverability and prevents new messages; background erasure has a documented deadline, retries, audit trail, and narrowly scoped retention exceptions.

Never publish a member profile in a search index. Do not put profile bodies, media, DOB, messages, gyms, or preferences into analytics, replay tools, or AI prompts. Logs and metrics use pseudonymous IDs and aggregate event data. Review each third-party SDK and processor; an SDK default is not a consent strategy.

## 9. Essential screen and state inventory

| Area | Screens | States to implement |
|---|---|---|
| Account | Welcome, sign-in/up, verify, recovery, age gate | Pending, invalid/expired link, throttle, offline, deleted account |
| Onboarding | Basics, photos, bio, routine, gyms, preview | Draft/resume, validation, rejected photo, pending gym, unsupported market |
| Discovery | Scrollable profile-card deck, preferences, match sheet | Loading, exhausted, no eligible users, rate limited, photo revoked |
| Social | Match list, conversation, report, block/unmatch | Empty, retry, removed participant, blocked, moderation restriction |
| Settings | Privacy, sessions, notifications, export, delete | Reauthentication, queued/completed export, deletion failure/retry |
| Staff | Review queues, case details, gym edits, audit log | Permission denied, concurrent edit, evidence unavailable, appeal |
| Public site | Home, how it works, safety, supported areas, FAQ, legal, deletion/help | Accessible validation, 404, outage, canonical/index rules |

## 10. Success and release gates

Primary outcome hypothesis: more meaningful reciprocal conversations among compatible local adults. Proposed north-star measure: weekly matched pairs with at least two messages from each participant within seven days, counted once and measured from metadata without inspecting message content. Do not present this as proof of relationship quality.

Track onboarding completion, verified-to-discoverable conversion, approved-photo delays, eligible pool size by consented cohort, weekly mutual-match rate, match-to-two-way-conversation conversion, retention, report/block rates, review latency, and deletion completion. Suppress small analytics cells and avoid demographic targeting that exposes sensitive identity.

Before opening a beta cluster, require working safety coverage, verified account recovery/deletion, checked directory quality, and enough reciprocal eligible profiles to avoid persistent empty queues. Proposed density target: median eligible queue ≥30 and tenth percentile ≥10 for activated beta users across relevant cohorts; revise through research instead of hiding poor availability. All numeric targets are operating hypotheses, not market benchmarks.
