# Collection management

Apply `collection-management.patch` after the copy/purchase-date and Cloudflare deployment fixes. Apply from the repository root, including the migration and documentation outside `app`.

## Setup

From `app`, run `yarn db:migrate` before opening the local app. Before deploying to Cloudflare, run `yarn d1:migrate` to apply migration 0008, then `yarn deploy`. The migration adds comic edit revisions and metadata/box-move audit tables. It does not change purchase details or valuation records.

Local uploads use `COVER_UPLOAD_ROOT` (default `../output/covers`); keep this writable and include it in backups. Existing local covers still use `LEGACY_IMAGE_ROOT`. Cloudflare uploads use the existing private `COVERS` R2 binding and the `/covers/:key` serving route.

## Manual review

- On a comic, title (grid or list), or box page, expand **Move copy/copies**, select a box or Unboxed, and save. The same page/filter is retained and shows **Box updated**. All records in the displayed matching-cover/grade/box group move atomically. To move one physical copy, use the existing copy editor. Purchase details, quantities and price histories remain unchanged. Groups with more than 200 purchase records require moves through the copy editor.
- On a comic page, choose **Edit comic details**. Correct cover name, story title, publisher, cover price, first appearance/significance, notes and creator roles/names. Publisher and creator names are suggested and automatically reused/created. Adding/removing credits never deletes the people themselves. These details apply to all copies of that exact cover; title/issue identity and provider mappings are retained.
- Select a replacement image to repair a missing or incorrect cover. Preview it and save. Accepted images: JPEG, PNG, WebP or GIF, up to 5 MB, dimensions up to 8192 per side and 40 million pixels. SVG/HTML and invalid/truncated headers are rejected. The file name and claimed MIME do not determine the stored type. Old images remain available; new images get unique keys so cached old images do not mask replacement.
- Open two metadata edits, save one and then submit the other. The stale form must ask you to reload instead of overwriting newer work. The equivalent box-move conflict also leaves every copy in the group unchanged. Successful repeat requests are harmless; changed inputs cannot reuse a consumed request ID.
- Invalid metadata/image submission retains text and credits. Reselect the image before retrying. A storage failure keeps the old image/details. If the database write fails after an upload, the new unreferenced object is removed where possible; a storage deletion failure can leave an unreferenced object, without changing the comic.

## Validation

Regression coverage includes atomic group moves and races, D1 statement parameter limits, unchanged ownership/history/provider mappings, metadata replay/stale edits, creator/publisher reuse, image replacement/cleanup, same-origin checks, bounded bodies and all four image encodings. HTTP smoke checks exercise actual local form submissions and uploaded image serving. Browser regressions are supplied for local execution; Chromium is unavailable in the build workspace.

Full provider intake remains next: title search, exact issue/annual lookup, all provider cover choices, automatic metadata/valuation and Add & Next. Editing a comic's shared cover details does not yet provide title management or change issue identity.
