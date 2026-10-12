# Zap pricing while saving owned comics

Adding a copy defaults to **Get current value from Zap**. Saving fetches the exact cover's latest raw guide price and Zap's condition rule for the selected grade. The owned copy, current valuation and first price snapshot are saved together. Increasing an existing quantity or correcting grade/cover also fetches a fresh value when the normal Keep value setting is used.

The same fresh quote updates other owned copies with the same exact Zap cover identity and grade, across boxes. Their quantity, purchase price, watch notes and comparison period stay intact. Each copy gets its own current valuation and a new price snapshot only when its unit price changes. Different grades and covers are not repriced by this save. A newer edit made while the quote was being fetched is preserved.

**Check Zap value** previews the selected cover/grade without changing ownership or other copy values. Save checks again rather than trusting a browser-supplied price. A repeated identical save does not create a second copy or repeat the provider request.

Lookup failures leave the form open with typed details retained and do not silently create unvalued copies. Retry, enter a manual value, or explicitly choose **Save without a value**. Covers with no usable Zap identity and grades absent from Zap's condition rules require that explicit fallback. The app does not interpolate unsupported grades or turn missing prices into zero. A genuine provider zero is accepted as a known value.

Manual values remain specific to the selected copy. A later fresh Zap quote updates matching copies, but manual estimates and copied baselines are not treated as market price observations in movement calculations. They remain visible in price history.

## Apply after the grouping patch

From the repository root:

```sh
git apply --check ~/Downloads/collection-zap-on-save.patch
git apply ~/Downloads/collection-zap-on-save.patch
cd app
yarn test:ci
yarn build:cloudflare
```

No migration or new credentials are needed if Zap already works in that runtime. Local tests deliberately clear live Zap credentials and use injected clients or a local mock service, so the fixture suite never prices or modifies the real collection. The local manual app uses its usual Zap configuration; production uses its existing persistent session.

## Manual test

1. Open a Zap-linked cover and choose Add another copy. Confirm Zap is the default value setting.
2. Enter the grade and purchase price. Check Zap value, then save. The new copy should already have a Live Zap value.
3. Check another copy of the same cover/grade, including one in another box. Its current value/freshness should now be updated; its purchase price and history remain independent.
4. Check a different grade and cover: they should retain their values.
5. Correct a grade to a supported grade and save normally. The corrected copy and matching-grade peers should be valued immediately. Zap's recorded condition list does not include 9.3; an unsupported grade produces an explanation and permits manual entry rather than a fabricated estimate.
6. Try a cover without a Zap match. Saving with Zap should retain the form and explain the missing match. Only an explicit fallback should save without a value.

This patch prices existing stored covers. Full new-issue/provider cover discovery and automatic catalogue/creator creation remain the intake step that follows; this same save-pricing behavior is intended to support it.
