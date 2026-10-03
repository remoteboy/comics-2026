# Migration dry-run reconciliation

Source: `comics_20261003_1532IST-.sql`

The importer completed successfully against the supplied dump.

## Core preservation checks

| Check                         |     Legacy |   Migrated | Result |
| ----------------------------- | ---------: | ---------: | ------ |
| Series                        |      1,793 |      1,793 | PASS   |
| Legacy variant rows           |      9,577 |      9,577 | PASS   |
| Holdings                      |      9,572 |      9,572 | PASS   |
| Physical quantity             |      9,680 |      9,680 | PASS   |
| Boxes                         |         84 |         84 | PASS   |
| Creator credits               |     30,452 |     30,452 | PASS   |
| Publishers                    |         90 |         90 | PASS   |
| Creators                      |      2,038 |      2,038 | PASS   |
| Zap variant references        |      9,448 |      9,448 | PASS   |
| Comic Vine variant references |        130 |        130 | PASS   |
| Aggregate collection value    | $52,083.29 | $52,083.29 | PASS   |

SQLite `PRAGMA integrity_check` returns `ok` and `PRAGMA foreign_key_check` returns zero violations.

## New normalized structure

The 9,577 legacy `issues` rows normalize into:

- 9,401 logical issues
- 9,577 exact variants
- 167 logical issues with more than one owned/catalogued cover variant

No legacy variant row was deduplicated or dropped.

## Legacy data conditions preserved

- 322 holdings are unboxed. Legacy `box_id = 0` is migrated to SQL `NULL`; three rows were already `NULL`.
- 259 holdings have no value (`NULL`).
- 123 holdings explicitly have value `$0.00`.
- These are kept distinct rather than being silently merged.

## Price history

There are 511 console audit events that explicitly changed a holding's price and therefore represent Zap-driven valuation changes.

- 493 attach to holdings that still exist and are imported into `price_snapshots`.
- 18 target legacy holdings that were later deleted, spanning seven old holding IDs. They cannot satisfy a current holding foreign key, so they are preserved in `output/provider-payloads/legacy-price-events.jsonl.gz` rather than discarded.

## Provider payload archive

Raw provider responses are exported verbatim for later R2 archival:

- 9,447 Zap issue payloads
- 130 Comic Vine issue payloads

The importer does not require live Zap/Comic Vine credentials.

## Images

`variants.image_key` follows the legacy application's lookup rule:

1. `{zap_id}.jpg` when a Zap ID exists;
2. otherwise `{comic_vine_id}.jpg`.

Image existence has not yet been verified because the cover directory was not included in the uploaded repository archive. The next migration step should reconcile these keys against the actual cover directory before R2 upload.
