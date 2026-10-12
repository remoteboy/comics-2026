# Matching owned copies

Owned comics are displayed together when they have the same exact cover, grade and box. Returning a separated copy to its original grade puts it back into the visible group automatically. A new purchase with matching cover/grade/box joins that group too. The same rule applies on comic pages, series cover/list views and box contents.

Quantity is the sum of the matching copies. Purchase price, current value, valuation comparison period, watch notes and price history still belong to the original ownership records. The grouping does not merge, delete or rewrite them. It also works for copies separated before this patch: no cleanup or database migration is necessary.

On the comic page, **Edit copies & purchase details** opens the breakdown when copies have separate purchase/history records. Choose the relevant copy or copy range to edit, view its price history or review it for sale. Human-readable copy ranges are consistent between this breakdown and the history selector. Editing a range still offers changing just one copy or that particular range; it does not silently edit every record in the displayed group.

Pending values stay unknown rather than inheriting another copy's price. The group shows its known total and the number awaiting value. If valued copies have different prices, it shows a unit-value range. Different purchase prices alone do not create duplicate display groups.

## Apply after the editing and accessible-label patches

From the repository root:

```sh
git apply --check ~/Downloads/collection-copy-grouping.patch
git apply ~/Downloads/collection-copy-grouping.patch
cd app
yarn test:ci
yarn build:cloudflare
```

No new migration is needed. Unit and integration coverage includes the five-copy grade round trip, another matching purchase, independently preserved purchase/history records, partial valuations, zero values and different covers/grades/boxes. Browser regression coverage follows the same round trip and checks grouping in comic, series and box views.
