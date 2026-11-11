# Brand and interface specification

## Direction

**SpotMe** should feel clear, welcoming, and familiar: a clean fitness-and-dating interface with white cards, soft gray backgrounds, dark text, and a restrained blue accent. Use a conventional light theme as the default. Keep playful personality in the copy and interactions. The brand is inclusive and confident, never a bodybuilding leaderboard. Exact slogan: **SpotMe Train Match Connect**. Use “Train. Match. Connect.” as a supporting typographic arrangement where punctuation improves the layout; retain the exact slogan in brand metadata and primary brand documentation.

Use an original wordmark with a subtle paired-dot/spotting motif, not another dating app's flame or heart silhouette. A trademark and store-name check is still required. Color choices alone are not product differentiation or evidence of store acceptance.

## Design tokens

| Token | Hex | Purpose |
|---|---|---|
| `canvas` | `#F7F8FA` | Soft gray main background |
| `surface` | `#FFFFFF` | White cards, navigation, and elevated surfaces |
| `surface-muted` | `#F3F4F6` | Neutral chips and secondary surfaces |
| `text-primary` | `#111827` | Main text |
| `text-secondary` | `#4B5563` | Supporting text |
| `border-subtle` | `#E5E7EB` | Decorative separators; not the sole control boundary |
| `border-control` | `#6B7280` | Input and control boundaries |
| `primary` | `#2563EB` | Primary actions, likes, focus, and selected text |
| `primary-hover` | `#1D4ED8` | Hover/pressed blue actions |
| `primary-soft` | `#EFF6FF` | Selected surfaces with blue text |
| `danger` | `#DC2626` | Error/destructive messaging only, with text/icon |
| `on-primary` | `#FFFFFF` | Text on blue filled buttons |

Use white cards and navigation on a soft gray canvas. Reserve blue for primary actions, likes, focus, and selected states; use pale blue selected backgrounds with blue text. Keep passes neutral and destructive actions red. Use restrained shadows, simple dividers, and one main accent. White text on the proposed blue has approximately 5.17:1 contrast; blue on pale blue approximately 4.75:1. Recheck actual rendered combinations and interaction states.

Validate every actual text/background pair with WCAG 2.2 AA tooling: normal text ≥4.5:1, large text ≥3:1, meaningful non-text controls ≥3:1. Borders that fail must not be the only control boundary. Confirm hover, disabled, selected, error, and focus states separately. Document token changes rather than treating these starting colors as immutable.

Typography: use a legible licensed sans such as Inter or an appropriate platform system font. Start body and form inputs at 16px, labels at 14px, mobile page headings at 28–32px, desktop public hero headings at 48–64px. Preserve OS font scaling; do not fit content by shrinking essential text. Use a compact bold display treatment for short brand lines and normal case for instructions.

Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px. Control radius 12–16px; profile card radius 24px; tags pill-shaped. Use soft separation over heavy shadows. Mobile touch targets at least 44px, preferably 48px. Keep destructive actions visually separate from liking or saving.

## Responsive navigation

- Mobile: four main destinations—Discover, Matches, Profile, Settings. Put My gyms and My routine inside Profile. Keep report/block accessible within a named overflow menu. Respect safe areas and keyboard insets.
- Desktop ≥1024px: compact left navigation and one centered swipe card approximately 400–460px wide. All of the person's audience-visible information lives inside the vertically scrollable card. Put filters in a separate sheet or settings surface; no required profile-information sidebar.
- Tablet: collapse navigation and retain a single centered card. At narrow widths the card fills the available width with comfortable side margins; no horizontal page scrolling.
- Public site: product promise, how it works, privacy/safety explanation, launch regions, and clear join/sign-in actions. Separate navigation from the authenticated app.

## Key screen specifications

**Discovery.** Use a familiar dating swipe-card pattern with an original SpotMe visual identity. The card contains a vertically scrollable body and a persistent white action footer with clearly labeled Pass and Like buttons. Order its contents: photo carousel; name/age/city and shared dating basics; full bio; relationship intent; workout split/frequency; optional shared weekly routine; optional shared gyms; interests; report/block controls. A person can read the complete authorized profile without leaving the card. Do not truncate the bio behind a required detail screen or place profile facts outside the card.

Keep the first photo prominent with a stable crop. Show accessible photo pagination such as “Photo 2 of 6” and explicit previous/next controls. Photo controls must not trigger dating decisions. Avoid competing horizontal gestures: use taps/buttons for the photo carousel while horizontal dragging of the card controls like/pass. Vertical touch movement and wheel scrolling move the card body; after a direction is selected, lock it for that gesture. Respect text selection, native scrolling, reduced motion, and keyboard/screen-reader alternatives. Reset scroll/photo state only after a successful profile transition. On small viewports and large-text settings, size the card to available space without hiding its footer or creating nested scroll traps.

**Profile editor.** Six numbered photo slots in a 3×2 grid on mobile; first slot labeled “Main photo.” Provide move-left/right or “Set as main” alternatives to drag. Explain two-photo discovery eligibility as a proposed default and distinguish pending from rejected uploads. Preview both discovery and match audiences.

**Routine editor.** Seven day chips open a structured train/rest/flexible selector and text label. The visible privacy control sits next to the weekly plan, not buried in settings. A separate frequency/split summary stays editable. Copy: “Your routine is private until you choose to share it.”

**Gym selector.** City combobox first, then gym search, results with address, and selected gym chips. Retain selections when the city changes. Display a count and a clear Save action. Missing result links to the name-and-address form, with duplicate suggestions and a pending-state explanation. Use no default checkboxes implying public disclosure.

**Match and chat.** Keep celebration brief and optional: two profile thumbnails, “Good form. Great chemistry.”, Say hello, Keep exploring. Conversation headers include report/block and a profile link. Failed messages show Retry without duplicating messages. A blocked conversation explains availability without disclosing moderation details.

**Empty states.** Be useful and honest: “Your current filters are pretty specific. Try another nearby city or broaden your preferences.” Never imply unseen matches exist to trigger payment. Unsupported region: “We’re opening SpotMe area by area. Join the waitlist for your city.”

## Voice and microcopy

Use a playful headline and a plain explanation. Examples: “Find your kind of strong.”; “Different splits. Shared energy.”; “Your gym. Your call.”; “Train your way. Meet someone who gets it.” Safety, billing, deletion, and error messages are direct rather than jokey. Never promise a date, imply someone is physically present, or shame rest days and body types.

Use “Like,” “Pass,” “Match,” and “Message” consistently. Avoid ambiguous gym jargon as the only label for important controls. Taglines may be playful; accessibility names must describe actions.

## Interaction and accessibility checklist

Support keyboard navigation, visible focus, semantic labels, screen-reader reading order, VoiceOver/TalkBack, 200% text zoom, portrait/landscape, high contrast, reduced motion, and image loading failures. A swipe is never the only way to act. Announce successful saves, match events, errors, and message retry status without overwhelming live regions. Do not auto-advance photos or play sound.

Optimistic like/pass actions must reconcile with server outcomes. Preserve the user's place on failure. Save buttons disable while the same write is pending but retain accessible progress text. Undo, if implemented, must have server-defined semantics and never undo a safety block accidentally.

Preview data must be clearly synthetic. Use licensed or consented model photos in design work; never scrape dating profiles, use real people's images as fake members, or present generated people as actual local users. The accompanying conversation mockup is a design reference, not an implemented product.
