# Comics Modernization Roadmap

## Phase 0 — Legacy assessment

- [x] Review Laravel application structure
- [x] Review MySQL export
- [x] Reconstruct title / issue / cover / holding model
- [x] Reconstruct Add Title workflow
- [x] Reconstruct Add Issue / cover-selection workflow
- [x] Reconstruct ZapKapow valuation/update workflow
- [x] Review Comic Vine fallback integration
- [x] Identify image-storage behaviour
- [x] Identify incomplete / unused legacy features
- [x] Identify committed legacy secrets
- [x] Decide against upgrading the existing Laravel application

## Phase 1 — Data migration

- [x] Design normalized replacement schema
- [x] Create D1-compatible SQLite schema
- [x] Build repeatable MySQL-export importer
- [x] Preserve legacy IDs for reconciliation
- [x] Preserve ZapKapow IDs
- [x] Preserve Comic Vine IDs
- [x] Normalize series / issues / variants / holdings
- [x] Normalize creators and credits
- [x] Normalize boxes
- [x] Recover legacy price-change history
- [x] Archive raw ZapKapow payloads
- [x] Archive raw Comic Vine payloads
- [x] Handle legacy `box_id = 0`
- [x] Verify foreign keys / SQLite integrity
- [x] Reconcile migrated counts
- [x] Reconcile aggregate collection value

### Migration baseline

- 1,793 series
- 9,401 logical issues
- 9,577 variants
- 9,572 holdings
- 9,680 physical copies
- 84 boxes
- 30,452 creator credits
- Legacy collection value: $52,083.29

## Phase 2 — Read-only application foundation

- [x] Create Astro + TypeScript application
- [x] Configure Yarn 4
- [x] Use `node-modules` linker for Vite compatibility
- [x] Configure Tailwind CSS 4
- [x] Add repository coding / formatting conventions
- [x] Create feature-oriented application structure
- [x] Abstract database access behind application interfaces
- [x] Add local SQLite database adapter
- [x] Build data smoke tests
- [x] Build cover-image smoke tests
- [x] Serve covers from legacy local image directory
- [x] Dashboard prototype
- [x] Collection / series listing
- [x] Series detail page
- [x] Cover view
- [x] List view
- [x] Comic / variant detail
- [x] Boxes listing
- [x] Box contents
- [x] Confirm application runs locally against real collection
- [x] Create private Git repository
- [x] Adopt Conventional Commits
- [x] Establish `v0.1.0` baseline

## Phase 3 — Read-only UX polish

- [x] Improve dashboard layout and hierarchy
- [x] Add biggest movers section
- [x] Add most valuable comics section
- [x] Add missing-valuation summary
- [x] Add stale-pricing summary
- [x] Add collection-health summary
- [x] Improve collection search
- [x] Add useful collection filters
- [x] Improve series sorting
- [x] Improve series cover view
- [x] Improve series list view
- [x] Improve comic detail page
- [x] Improve box navigation
- [x] Improve responsive/mobile behaviour
- [x] Add useful empty/error states
- [x] Review accessibility
- [x] Review long-title / unusual-issue-number handling
- [x] Add changelog and advance application version to `0.2.0`

## Phase 4 — Testing foundation

- [x] Add a unit/integration test runner
- [x] Add test scripts to the Yarn workflow
- [x] Add deterministic test database fixtures
- [x] Test collection filter parsing and URL generation
- [x] Test formatting and shared utility functions
- [x] Test collection repository queries
- [x] Test dashboard valuation/health queries
- [x] Test box repository queries and navigation
- [x] Test variant detail and price-history queries
- [x] Add regression tests for unusual issue numbers and multiple variants
- [x] Add regression tests for legacy `NULL`, `$0`, unboxed and multi-copy holdings
- [x] Add page-level smoke tests for core routes
- [x] Add browser-level smoke coverage for primary navigation
- [x] Add type-check/build/format checks suitable for CI
- [x] Document the local and CI testing workflow
- [x] Add GitHub Actions CI workflow
- [x] Advance application version to `0.3.0`

## Phase 5 — Provider architecture

### Shared provider layer

- [x] Define provider interfaces
- [x] Define normalized series result
- [x] Define normalized issue result
- [x] Define normalized variant result
- [x] Define normalized valuation result
- [x] Keep provider-specific payloads outside domain models

### ZapKapow

- [x] Build recorded-response Zap provider
- [x] Create representative Zap fixtures from legacy payloads
- [x] Test title normalization
- [x] Test issue normalization
- [x] Test variant normalization
- [x] Test creator normalization
- [x] Test grade-based pricing normalization
- [x] Test update-feed normalization

### Comic Vine

- [x] Build recorded-response Comic Vine provider
- [x] Preserve legacy synthetic cover indexes
- [x] Normalize title / issue metadata
- [x] Normalize creators
- [x] Normalize images
- [x] Decide whether HTML cover scraping is still required

## Phase 6 — Live ZapKapow integration

- [x] Obtain fresh ZapKapow session
- [x] Inspect current application/network requests
- [x] Determine current API transport and retire the legacy-endpoint assumption
- [x] Confirm title search
- [x] Confirm issue lookup
- [x] Confirm variant / cover lookup
- [x] Confirm grade-based pricing
- [x] Confirm price-update feed
- [x] Store credentials only as runtime secrets
- [x] Add provider-health/status reporting
- [x] Gracefully handle invalid / expired live credentials
- [x] Ensure collection remains usable with Zap offline
- [x] Verify live integration against preserved Zap title and variant IDs
- [x] Advance application version to `0.5.0`

## Phase 7 — Valuation engine

- [x] Add explicit current valuation model
- [x] Add price snapshots
- [x] Import recovered historical snapshots
- [x] Refresh valuation by actual holding grade
- [x] Record price only when materially changed
- [x] Calculate absolute movement
- [x] Calculate percentage movement
- [x] Track 30-day movement
- [x] Track 90-day movement
- [x] Track longer-term movement where data permits
- [x] Detect stale prices
- [x] Detect missing prices
- [x] Add provider-sync history
- [x] Add valuation freshness indicators
- [x] Add bounded live backfill for legacy / stale holdings
- [x] Advance application version to `0.6.0`

## Phase 8 — Sale intelligence

Checked items below have implementations in the supplied source; live production verification remains separate.

- [x] Define configurable sale-watch thresholds
- [x] Add sale-candidate / watchlist screen
- [x] Flag large percentage movements
- [x] Flag large absolute-value movements
- [x] Show current value vs historical values
- [x] Add manual watch/unwatch state
- [x] Add notes
- [ ] Investigate reliable sold-comps sources
- [ ] Investigate eBay Marketplace Insights access
- [x] Add recent comparable sales where available
- [ ] Distinguish raw / graded / signed / lots where possible
- [x] Add "research on eBay" workflow
- [ ] Add listing-preparation workflow if useful

## Phase 9 — Remaining-comics intake

- [ ] Search for series by name rather than provider ID
- [ ] Add new series from provider result
- [ ] Search available issues by number
- [ ] Show available covers visually
- [ ] Choose exact owned cover
- [ ] Set grade
- [ ] Set quantity
- [ ] Set box
- [ ] Preserve cover price
- [ ] Preserve external provider IDs
- [ ] Save provider-selected owned comic (copies of stored covers can now be added through collection editing)
- [ ] Implement sticky grade / box defaults
- [ ] Implement **Add & Next**
- [ ] Support manual entry when provider lookup fails
- [ ] Support manual cover upload
- [ ] Consider barcode lookup
- [ ] Consider camera-assisted cover matching

## Phase 10 — Image migration

- [ ] Inventory legacy cover directory
- [ ] Match image files to migrated variants
- [ ] Identify missing covers
- [ ] Identify orphan files
- [ ] Identify duplicate/suspicious files
- [ ] Establish canonical R2 object naming
- [ ] Create R2 bucket
- [ ] Upload matched covers
- [ ] Preserve private access
- [x] Add R2 image adapter
- [ ] Confirm local and R2 image adapters behave identically

## Phase 11 — Cloudflare deployment

- [x] Add Cloudflare D1 adapter
- [ ] Create production D1 database
- [ ] Apply schema migrations
- [ ] Import production collection data
- [ ] Configure R2
- [ ] Configure Worker deployment
- [x] Configure Cloudflare Access (owner confirmed)
- [ ] Remove need for application-level login
- [ ] Configure runtime secrets
- [ ] Configure scheduled valuation refresh
- [ ] Add deployment smoke tests
- [ ] Validate production data against local migration baseline

## Phase 12 — Release readiness

- [ ] Complete remaining backlog of physical comics
- [ ] Verify important high-value comics manually
- [ ] Verify box assignments
- [ ] Verify cover images
- [ ] Verify Zap IDs
- [ ] Verify valuation freshness
- [ ] Confirm backups/export process
- [ ] Document restore process
- [ ] Document provider-session refresh process
- [ ] Review security
- [ ] Review performance
- [ ] Review mobile usability
- [ ] Tag `v1.0.0`

---

## Current position

Cloudflare Access is implemented per the owner's confirmation. The fresh source workflow audit is complete. Production access policies and production data were not revalidated by this patch.

### Current development order

1. **Collection editing — first implementation ready for local review.** Copy grade, box, quantity, purchase price and value; add another copy of a stored cover; split one physical copy; select another stored cover of the same issue; retain history; reject stale/repeated writes. Apply migration `0006_collection_editing.sql` before using this code. See [collection-editing.md](collection-editing.md).
2. **Complete collection editing — implementation ready for local review.** Inline group box moves, cover-level shared metadata/credits editing and safe local/R2 cover upload/repair. Apply migration `0008_collection_management.sql`; see [collection-management.md](collection-management.md). Destructive removal remains deferred.
3. **Restore full intake — next implementation priority.** Title-name search, exact issue/annual lookup, all provider cover choices, grade-based preview, automatic creators/publishers, manual fallback and Add & Next. The new editor only selects already stored covers; it does not yet replace provider intake.
4. **Global search.** Owned comics, titles, creators, publishers and boxes.
5. **Supporting management.** Titles, boxes, publishers, creators and shared cover metadata without exposing catalogue maintenance as a prerequisite for adding ownership.
6. **Operational completion.** Verify existing sale intelligence, schedule valuations, backups/restore, provider recovery and release checks.

D1, R2 and persistent sessions have code and reported production operation. Sale thresholds, candidates, watch state, notes, eBay research links and on-demand Zap comps already have code and tests. The historical phase checklists above are not proof of a freshly verified production release.

Keep the normalized schema internal. User-facing terminology is Title / Issue / Cover / Copy / Grade / Box / Value. Valuation remains per owned copy row; identical-copy groups are split internally when just one copy changes.
