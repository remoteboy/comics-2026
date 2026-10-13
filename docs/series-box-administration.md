# Series and box administration

Apply migration `0011_series_box_administration.sql` locally with `cd app && yarn db:migrate`, and remotely with `yarn d1:migrate` before deploying.

## Series

Open a series and choose Edit series. You can change its display name, sort name, start year and ongoing/ended status. A blank sort name uses the display name. Changing the year updates an existing trailing year in an otherwise unchanged display name; a custom sort name is retained.

The series keeps the same ID, issues, copies and provider references. Renaming or correcting the year saves the former name/year as an alias. Global search, collection search, publisher/creator series filters and subsequent manual intake recognise those aliases. A series name/year already assigned to another record is rejected rather than silently combining collections.

## Boxes

Choose Add box from Boxes. Leave the number blank to allocate the next number, or enter an unused physical number. Choose Short, Long or Magazine and an optional label. New boxes appear in intake and copy-moving choices.

Edit box changes its label/type without renumbering it or moving purchases. Remove empty box requires confirmation and is blocked while any positive-quantity copies remain. Zero-quantity purchase records are retained and become unboxed if a physically empty box is retired. Retired numbers are remembered and never reassigned automatically or manually.

Box search supports autocomplete and filters the list as you type or change storage type. Global collection search also finds box numbers and labels. Without JavaScript, Apply still submits the box filters normally.

Edits are atomic, protect against stale forms, and can be retried without duplicate boxes or repeated changes. Purchases, grades, prices and valuation history remain intact.

## Manual checks

- Edit a series status and sort name; check the collection filters and ordering.
- Rename a series or correct its year. Search using its former name and verify existing copies/history still belong to it.
- Add a box, edit its label/type, and select it when adding or moving a copy.
- Confirm a box containing copies cannot be removed. Move its copies out, then remove it.
- Type a box label and change its type filter; confirm the list updates without submitting.
- Open an editor in two tabs, save one, then save the older form. It should request a reload.
