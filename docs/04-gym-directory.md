# SpotMe gym directory and Ontario launch geography

Research checked November 11, 2026. This is an implementation brief; no gym records have been scraped or imported. Product rules and acceptance thresholds below are proposed SpotMe decisions, not claims that a vendor guarantees them.

## 1. Outcome and source decision

Build a durable, branch-level directory that lets someone choose a city, find gyms in it, add several gyms to their profile, and submit a missing gym using its name and address. Aim for comprehensive coverage within the launch area, measure the gaps, and expand region by region. Never label a dataset “all gyms” merely because an import completed: no source checked guarantees complete, current coverage.

**Recommended first source: Overture Places, supplemented by owner-provided information, licensed municipal datasets, and moderated user submissions.** Use a local indexed database for product searches. Keep proprietary member associations in a separate private application schema.

Overture publishes downloadable place records with names, addresses, geometry, source information, and existence-confidence fields. Its current Places guide states that this theme contains no OpenStreetMap data. The October 2026 documentation describes `taxonomy` and `basic_category`; older examples using `categories.primary` are stale. The documentation has some transitional inconsistencies, so pin a release and inspect its actual schema before writing import code. [Overture Places guide](https://docs.overturemaps.org/guides/places/), [current place schema](https://docs.overturemaps.org/schema/reference/places/place/).

| Source | Decision for SpotMe | Implementation constraint |
|---|---|---|
| Overture Places | Primary bulk seed | Track each upstream source and its licence; retain required notices. |
| Gym owners and user submissions | Fill missing and changed locations | Record submitter permission, evidence, moderation, and ownership separately. |
| Municipal open data | Optional local supplement | Check the specific dataset licence, freshness, and gym coverage before import. |
| OpenStreetMap | Optional second-stage source | Decide ODbL treatment before merging or deduplicating it into the canonical directory. |
| Google Places | Optional separately licensed interactive lookup | Do not use it as a bulk scraper or permanent canonical source of copied names and addresses. |
| Commercial POI feeds | Later if coverage justifies spend | Obtain a written licence for persistent storage, enrichment, redistribution, and termination handling. |

Overture's source-level licensing page lists CDLA Permissive 2.0, Apache 2.0, and CC0 providers; these must not be collapsed into “everything is public domain.” Preserve applicable licence text and Foursquare notices when distributing relevant data, and make an attribution page part of the release checklist. [Overture attribution and licensing](https://docs.overturemaps.org/attribution/).

Google's policy restricts prefetching, indexing, storing, and redistributing Maps content except where expressly permitted; Place IDs have a storage exception. This makes Google an unsuitable default for a permanent scraped gym catalogue. If later enabled, maintain an isolated adapter and enforce its then-current storage, display, attribution, and expiry rules. [Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies).

OSM data is available under ODbL with attribution obligations. Combining an OSM POI list with a proprietary POI list and removing duplicates can create a derivative-database question; merely placing the records in different tables does not settle it. Keep member data out of directory exports and decide the directory's licence architecture before OSM ingestion. [OSMF attribution guidelines](https://osmfoundation.org/wiki/Attribution_Guidelines), [OSMF collective database guideline](https://osmfoundation.org/wiki/Licence/Community_Guidelines/Collective_Database_Guideline_Guideline).

Do not power autocomplete or bulk harvesting with the public Nominatim server: its policy prohibits those patterns and caps allowed use at one request per second across an application. Select a geocoder with contractually permitted persistent results, or host an appropriate service after a cost review. Public Overpass instances have operator-specific limits; use regional extracts, a contracted service, or self-hosting for sustained commercial imports. [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/), [Overpass instance policies](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances).

## 2. Explicit launch geography

The launch scope is the **Greater Toronto Area, Kitchener area, Golden Horseshoe, Barrie, and surrounding Ontario communities**. These are overlapping market descriptions, not database primary keys. Create a versioned `launch-markets.json` with a market label, source municipality identifiers, included polygons, aliases, activation status, and effective date. The geographic union determines the import boundary; overlap never duplicates a gym.

Start with these operational clusters, then validate the exact municipality allowlist against the founder's launch plan:

- GTA: Toronto and municipalities in Durham, York, Peel, and Halton.
- Kitchener area: Kitchener, Waterloo, Cambridge, and selected surrounding Waterloo Region townships; make Guelph and neighbouring communities explicit additions rather than silently assuming them.
- Golden Horseshoe coverage beyond the GTA: Hamilton and Niagara municipalities, with Burlington handled once through Halton membership.
- Barrie area: Barrie plus explicit neighbouring communities such as Innisfil, Springwater, Oro-Medonte, and selected Simcoe municipalities. “Surrounding” is a configurable allowlist, not an unlimited distance radius.

Import municipal boundaries and stable identifiers from an authoritative, licensed release. Ontario publishes lower/single-tier and upper-tier boundary datasets under the Open Government Licence – Ontario, and a municipality list for name/status validation. Check the actual resource vintage, since catalogue update dates and geometry dates can differ. [Ontario municipal boundaries](https://data.ontario.ca/en/dataset/municipal-boundaries), [Ontario municipalities](https://data.ontario.ca/dataset/municipalities).

Store `city_id`, `municipality_name`, `province=ON`, `country=CA`, and independent market memberships. Support search aliases such as “KW,” “Kitchener-Waterloo,” “GTA,” and Toronto neighbourhood/former-municipality names without treating them as interchangeable postal cities. A broad market search can expand to its member municipalities, with the expansion visible in the UI. Use a boundary-buffer candidate pass only to catch edge records; apply explicit polygon and municipality rules before publishing.

## 3. Import pipeline to build

Implement an offline, restartable import job with dry-run mode. Product clients must query SpotMe's own approved directory, never trigger whole-region provider scans.

1. **Freeze inputs.** Record source release, retrieval time, licence snapshot, schema hash, category-map version, geographic config, code commit, and import-run ID. Overture supports regional downloads and GeoParquet queries through its client and DuckDB; use spatial and column filters rather than downloading the world. [Overture quickstart](https://docs.overturemaps.org/getting-data/).
2. **Define eligibility.** Include staffed commercial gyms, fitness centres, and relevant training studios; classify climbing, martial arts, yoga, Pilates, CrossFit-style facilities, recreation centres, and university gyms deliberately. Exclude equipment stores, trainers without a public facility, outdoor exercise equipment, private residences, and hotel-only gyms unless a future product rule permits them. Keep restricted-access university/workplace facilities labelled.
3. **Map categories.** Inspect the pinned taxonomy CSV; map eligible descendants and alternate categories to SpotMe facility types. Do not search only for “gym” in names or invent taxonomy constants. Add inclusion/exclusion fixtures for a gym, supplement store, physiotherapist, apartment gym, studio, and sports field. [Overture taxonomy download](https://docs.overturemaps.org/guides/places/taxonomy-explorer/).
4. **Stage raw records.** Save the source payload or permitted subset, source identifier, licence lineage, original name/address, geometry, confidence, and source operating status. Preserve raw values for explainability; reject malformed geometry and impossible country/province combinations.
5. **Normalize.** Unicode-normalize search keys, standardize whitespace and Canadian postal-code formatting, parse unit/street/locality/province separately, and retain the original display spelling. Never discard suite numbers: adjacent studios can share a street address. Geocode only missing or suspect positions through the approved adapter; record provider and confidence. Flag city/address/geometry conflicts for review.
6. **Resolve identities.** First match exact source IDs. Then propose branch candidates using normalized address, name tokens, website/phone where licensed, and configurable geographic distance. A shared chain name is never sufficient to merge branches. A shared coordinate is not sufficient to merge co-located businesses. Initially auto-merge only reviewed high-precision rules; queue ambiguous cases with evidence.
7. **Publish transactionally.** Promote validated records, source links, and changes together. Enforce a unique source/provider ID and canonical redirect rules. Generate counts of added, changed, merged, quarantined, closed, and unchanged records. Abort unexpectedly large churn pending inspection.
8. **Reconcile and refresh.** Run on available source releases, with a monthly operational check. Source disappearance is a review signal rather than automatic closure. Preserve manually verified fields until stronger dated evidence supersedes them. Review active high-selection gyms more frequently; retain a last-verified date and field-level provenance.

Minimum tables: `cities`, `city_aliases`, `launch_markets`, `market_cities`, `gyms`, `gym_sources`, `gym_field_evidence`, `gym_aliases`, `gym_submissions`, `gym_revision_events`, `import_runs`, and private `profile_gyms`. Every canonical gym gets a SpotMe UUID independent of vendor IDs. Store geometry in an indexed geospatial column and source payloads outside hot search queries.

## 4. Search, selection, and missing gyms

Search starts with country/province and city or market. Return gym name, branch/address, city, facility type, and status; rank exact name and city matches before fuzzy matches. Support pagination, accent-insensitive search, chain aliases, common misspellings, and a visible “Add a missing gym” path. Do not require device location. If location is optionally enabled, use it only as explained and permitted.

Allow multiple gyms and one optional primary gym. Keep the cap configurable, with ten as an initial anti-abuse/usability default. Save the selection as an association with independent visibility controls; it is self-reported, never proof of membership. Do not expose a public list of members at a gym or publish a gym's member count when it could reveal individuals.

Missing-gym flow: collect name and address, derive or request city/province/postal code, show duplicate candidates, and let the submitter confirm a map position if available. Create a private pending submission that can appear to its owner as “Pending review.” It must not become globally searchable or disclose the submitter's location. Existing onboarding can continue without an approved gym; offer a “Gym pending” state without showing the raw address to others.

Require authenticated, verified submitters; rate-limit submissions; detect repeated spam and attempts to publish home addresses; validate business existence using permitted evidence. Review outcomes are `approved_new`, `linked_existing`, `needs_information`, or `rejected`, with a reason and audit trail. An administrator cannot silently convert an individual's home into a public gym. Imported records also need this screening where address or category signals suggest a residence.

Approved duplicate submissions link to the existing canonical gym. Merging two canonical gyms must run as one transaction: redirect old IDs, migrate member associations, coalesce duplicate associations without broadening visibility, keep source/history references, and reindex. Never drop a user's gym because its upstream identifier changes. Maintain an audited reversal mechanism for mistaken merges.

## 5. Operations, evidence, and release tests

Provide correction/report actions for wrong name, wrong location, duplicate, closed, and inappropriate listing. Quarantine credible sensitive-address reports promptly; never hide a report behind a paid tier. A closed gym becomes unavailable for new selection; existing users see a private prompt to update. Keep historical IDs for reconciliation, and remove addresses or fields when required by a valid correction or source agreement.

Measure coverage against a documented independent benchmark: a manually verified, stratified sample of eligible gyms across municipalities, chains, independent facilities, and studio types. Report sample size, collection method, confidence/uncertainty, and date. Do not treat the union of two incomplete feeds as ground truth. Proposed launch targets: at least 95% recall and 98% precision on that reviewed sample, fewer than 1% confirmed duplicate branches, and no known unresolved residential-address exposures. These are acceptance goals, not measured results.

Track zero-result city searches, missing-gym submissions per 100 searches, approval turnaround, stale-record percentage, duplicate rate, source coverage by municipality, and cost per accepted record. Revisit the targets after the first benchmark; show the denominator rather than an unsupported “99% coverage” badge.

Required tests: importing the same release twice changes no identities; overlapping GTA/Golden Horseshoe imports produce one branch; same chain at two addresses stays separate; two businesses at one address stay separate; accented and alias city searches work; pending submissions stay private; a merge preserves memberships and stricter visibility; a source outage leaves approved results searchable; closures do not erase audit history; and deleted/blocked accounts cannot be recovered through gym associations.

Before the first live import, the implementing AI must deliver the geography manifest, pinned source/licence inventory, taxonomy map, dry-run report, sample dedup review, attribution text, rollback command, and forecast query/storage costs. Leave uncertain licences or ambiguous identity matches in quarantine while completing unaffected work. No live import or completeness claim is part of this research deliverable.
