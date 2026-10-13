# Creators and publishers

Apply migration `0010_catalog_management.sql` before using this patch, locally with `cd app && yarn db:migrate` and on Cloudflare with `yarn d1:migrate` before deployment.

Creators and Publishers appear in the main navigation. Their searchable directories show linked cover counts and physical copies owned. Open a record to see its comics and creator roles, edit its display name, or merge duplicates. Comic details link to their creator and publisher records. Directory and merge searches support autocomplete.

Global search now includes titles, creators and publishers, labelled by type. Selecting a creator or publisher opens its detail page. Old names remain searchable after renaming or merging, including the ordinary collection search.

## Consolidation

Renaming preserves the previous name as an alias. To merge, open the duplicate record, expand Merge duplicates, find the record to keep, select it and confirm they represent the same person or publisher. The kept record receives all comic links and aliases; duplicate credits with the same role are combined. Distinct roles remain separate. Old detail links redirect to the kept record, including after later merges.

Similar names are never merged automatically. Publisher imprints and people with similar names can be distinct. Merging replaces the duplicate record; it does not change purchases, grades, boxes, valuations or price history.

Intake and comic edits resolve previous names to the kept record, preventing an old provider spelling from recreating a duplicate. Multiple aliases submitted for the same creator and role produce a single credit. A changed name or merge increments affected comic revisions so an older editing form cannot overwrite the change silently. Saves and merges are atomic, with retry protection and an audit record.

Placeholder NULL names are excluded from directories and suggestions; this patch does not delete legacy records automatically.

## Manual checks

- Open Creators and Publishers. Search by name; check autocomplete, counts, comics and creator roles.
- Rename a test record. Confirm the new name on its comics and find it using the old name in global search.
- Create a duplicate through manual comic intake. Merge it into the intended record and verify links, roles and owned-copy counts.
- Add another comic using the old name; confirm it reuses the kept record.
- Open a comic editing form, rename its creator or publisher in another tab, then try saving the old form. It should report a conflict.

Browser tests use separate manual-intake records to avoid colliding with other collection-editing tests.
