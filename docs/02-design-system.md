# Brand and interface specification

## Direction

**SpotMe** should feel energetic, social, and comfortable after dark: a dark training journal with playful dating energy. The brand is inclusive and confident, never a bodybuilding leaderboard. Exact slogan: **SpotMe Train Match Connect**. Use “Train. Match. Connect.” as a supporting typographic arrangement where punctuation improves the layout; retain the exact slogan in brand metadata and primary brand documentation.

Use an original wordmark with a subtle paired-dot/spotting motif, not another dating app's flame or heart silhouette. A trademark and store-name check is still required. Dark colors alone are not product differentiation or evidence of store acceptance.

## Design tokens

| Token | Hex | Purpose |
|---|---|---|
| `canvas` | `#101116` | Main dark background |
| `surface` | `#1B1D27` | Cards and navigation |
| `surface-raised` | `#262937` | Elevated surfaces |
| `text-primary` | `#F5F5FA` | Main text |
| `text-secondary` | `#B7BACA` | Supporting text |
| `border` | `#3D4155` | Structural boundaries; verify control contrast |
| `volt` | `#D4FF5A` | Main actions, likes, selected accents |
| `iris` | `#A995FF` | Secondary highlights and focus accents |
| `coral` | `#FF8C79` | Sparse celebratory/playful accent |
| `danger` | `#FF6978` | Error/destructive messaging only, with text/icon |
| `on-accent` | `#101116` | Text on bright filled buttons |

Proposed usage: 80–85% dark surfaces, 10–15% neutral text/structure, 5–10% bright accents. Do not use all three accents on every screen. Likes use volt; passes use neutral styling. Keep brand coral separate from destructive semantics. Never use white small text on lime.

Validate every actual text/background pair with WCAG 2.2 AA tooling: normal text ≥4.5:1, large text ≥3:1, meaningful non-text controls ≥3:1. Borders that fail must not be the only control boundary. Confirm hover, disabled, selected, error, and focus states separately. Document token changes rather than treating these starting colors as immutable.

Typography: use a legible licensed sans such as Inter or an appropriate platform system font. Start body and form inputs at 16px, labels at 14px, mobile page headings at 28–32px, desktop public hero headings at 48–64px. Preserve OS font scaling; do not fit content by shrinking essential text. Use a compact bold display treatment for short brand lines and normal case for instructions.

Spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px. Control radius 12–16px; profile card radius 24px; tags pill-shaped. Use soft separation over heavy shadows. Mobile touch targets at least 44px, preferably 48px. Keep destructive actions visually separate from liking or saving.

## Responsive navigation

- Mobile: four main destinations—Discover, Matches, Profile, Settings. Put My gyms and My routine inside Profile. Keep report/block accessible within a named overflow menu. Respect safe areas and keyboard insets.
- Desktop ≥1024px: compact left navigation, centered discovery card/detail area, optional right panel for the user's filters or their own training preferences. Do not show private details of another member in side panels.
- Tablet: collapse the sidebar and use a two-column arrangement only if readable. At narrow widths use one content column, no horizontal page scrolling.
- Public site: product promise, how it works, privacy/safety explanation, launch regions, and clear join/sign-in actions. Separate navigation from the authenticated app.

## Key screen specifications

**Discovery.** Photo is dominant and keeps its crop stable. Overlay only name/age/city on a sufficiently opaque gradient or solid panel. Put bio and training tags in a separate legible section. Show photo pagination with an accessible label such as “Photo 2 of 6,” not color alone. Expose Pass and Like buttons with persistent text or accessible labels. Full profile and report actions stay discoverable. Remove drag animation under reduced-motion preference.

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
