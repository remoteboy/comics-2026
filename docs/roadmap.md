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

- [ ] Define provider interfaces
- [ ] Define normalized series result
- [ ] Define normalized issue result
- [ ] Define normalized variant result
- [ ] Define normalized valuation result
- [ ] Keep provider-specific payloads outside domain models

### ZapKapow

- [ ] Build recorded-response Zap provider
- [ ] Create representative Zap fixtures from legacy payloads
- [ ] Test title normalization
- [ ] Test issue normalization
- [ ] Test variant normalization
- [ ] Test creator normalization
- [ ] Test grade-based pricing normalization
- [ ] Test update-feed normalization

### Comic Vine

- [ ] Build recorded-response Comic Vine provider
- [ ] Preserve legacy synthetic cover indexes
- [ ] Normalize title / issue metadata
- [ ] Normalize creators
- [ ] Normalize images
- [ ] Decide whether HTML cover scraping is still required

## Phase 6 — Live ZapKapow integration

- [ ] Obtain fresh ZapKapow session
- [ ] Inspect current application/network requests
- [ ] Determine whether legacy endpoints still exist
- [ ] Confirm title search
- [ ] Confirm issue lookup
- [ ] Confirm variant / cover lookup
- [ ] Confirm grade-based pricing
- [ ] Confirm price-update feed
- [ ] Store credentials only as runtime secrets
- [ ] Add provider-health/status reporting
- [ ] Gracefully handle expired sessions
- [ ] Ensure collection remains usable with Zap offline

## Phase 7 — Valuation engine

- [ ] Add explicit current valuation model
- [ ] Add price snapshots
- [ ] Import recovered historical snapshots
- [ ] Refresh valuation by actual holding grade
- [ ] Record price only when materially changed
- [ ] Calculate absolute movement
- [ ] Calculate percentage movement
- [ ] Track 30-day movement
- [ ] Track 90-day movement
- [ ] Track longer-term movement where data permits
- [ ] Detect stale prices
- [ ] Detect missing prices
- [ ] Add provider-sync history
- [ ] Add valuation freshness indicators

## Phase 8 — Sale intelligence

- [ ] Define configurable sale-watch thresholds
- [ ] Add sale-candidate / watchlist screen
- [ ] Flag large percentage movements
- [ ] Flag large absolute-value movements
- [ ] Show current value vs historical values
- [ ] Add manual watch/unwatch state
- [ ] Add notes
- [ ] Investigate reliable sold-comps sources
- [ ] Investigate eBay Marketplace Insights access
- [ ] Add recent comparable sales where available
- [ ] Distinguish raw / graded / signed / lots where possible
- [ ] Add "research on eBay" workflow
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
- [ ] Add holding
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
- [ ] Add R2 image adapter
- [ ] Confirm local and R2 image adapters behave identically

## Phase 11 — Cloudflare deployment

- [ ] Add Cloudflare D1 adapter
- [ ] Create production D1 database
- [ ] Apply schema migrations
- [ ] Import production collection data
- [ ] Configure R2
- [ ] Configure Worker deployment
- [ ] Configure Cloudflare Access
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

**Completed: Phase 4 — Testing foundation (`v0.3.0`)**

**Next: Phase 5 — Provider architecture**

The migrated collection is browsable locally and now has deterministic unit, repository integration and browser smoke coverage. Pricing remains explicitly labelled as a legacy baseline until the provider layer and live valuation sync are restored.
