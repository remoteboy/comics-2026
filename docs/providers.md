# Provider architecture

Phase 5 introduces transport-free provider adapters around the responses preserved by the legacy application. The goal is to normalize external data without letting ZapKapow or Comic Vine response shapes leak into collection domain models.

## Boundary

All adapters implement `ProviderAdapter` from `app/src/providers/types.ts` and normalize unknown provider payloads into five shared result types:

- series
- issue
- variant
- valuation
- update event

The adapters contain no HTTP, cookies, API keys or persistence. Phase 6 can therefore add live transport while reusing the tested normalizers.

## Recorded fixtures

Fixtures under `app/tests/fixtures/providers/` are copied from the archived legacy payloads, not hand-authored API examples:

- `zap-flat-issue.json` — older flat Zap issue response.
- `zap-rich-variant.json` — later Zap wrapper containing the richer issue response and grade price table.
- `zap-updates.json` — selected events from a stored `/ajax/updates` response, including price up/down, new issue and new annual cases.
- `comic-vine-cover-b.json` — a stored Comic Vine issue whose exact owned cover was the second cover discovered by the legacy scraper.

The old application did not persist the response from either provider's title endpoint. Series normalization therefore uses the provider series identity embedded in recorded issue data. Missing title-only fields are left `null` rather than invented.

## ZapKapow notes

Two generations of Zap data exist in the archive:

1. older flat issue objects;
2. later wrappers containing `response.issue` plus normalized fields added by the Laravel app.

A subtle legacy detail matters: in the later wrapper, top-level `title_id` is the local Laravel title ID, while `response.issue.title_id` is the Zap series ID. The adapter deliberately prefers the nested provider ID.

Zap variants use the exact Zap issue ID. Where available, `primary_issue_id` becomes the logical issue identity so multiple cover variants can be grouped without losing exact variant IDs.

The provider normalizes all recorded condition prices into integer cents and grade tenths. It also normalizes the legacy update feed used by the scheduled valuation job.

## Comic Vine notes

Comic Vine issue IDs were extended by the old app with a synthetic cover suffix, for example:

```text
4000-767904-1
```

The adapter preserves that exact external ID while separating:

- logical Comic Vine issue: `4000-767904`
- cover index: `1`

Person credits are normalized into names, Comic Vine person IDs and normalized role labels (`cover` becomes `cover_artist`).

### Alternate-cover discovery decision

The recorded Comic Vine API payload for the fixture identifies the primary Cover A image. The stored exact variant is Cover B with a different image URL and a synthetic `-1` suffix. That exact cover metadata came from the legacy HTML cover-gallery/table scraper.

Therefore the Comic Vine API response alone is not sufficient to reproduce alternate-cover discovery. A future live Comic Vine integration must either:

1. keep cover-page scraping isolated behind the provider adapter; or
2. use another catalogue source for variant discovery and retain Comic Vine only for issue metadata.

No live scraping is implemented in Phase 5.
