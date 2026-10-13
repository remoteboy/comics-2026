# Title search

Every screen has a sticky collection search bar for titles, creators and publishers. Type at least two characters to see up to 12 suggestions labelled Title, Creator or Publisher. Exact and prefix name matches appear first; selecting a title opens its series page. Empty series are included. Arrow keys choose a suggestion, Enter opens it, and Escape closes the list. Pressing Enter without a selection or using Search collection opens the existing collection results.

Intake’s Title name field also searches as you type, using the selected Zap or Comic Vine source. Selecting a suggestion opens the issue-entry step. Existing Find titles and manual entry remain available when provider lookup fails or JavaScript is unavailable. Searches wait 300 ms after typing; previous responses cannot replace newer suggestions.

Creator and publisher management requires migration `0010_catalog_management.sql`; no additional configuration is needed. Creator and publisher suggestions open their catalogue detail pages and also match aliases. See [catalog-management.md](catalog-management.md).

## Manual review

- From Dashboard, Boxes, a comic, and Intake, find a collection title with the top bar. Check keyboard and touch selection.
- Search a missing title, dismiss suggestions with Escape, then submit a title without selecting a suggestion.
- In intake, type a provider title and select it. Confirm issue lookup and purchase entry still work.
- Switch provider while suggestions are open. Confirm results refresh and failures leave Find titles and manual entry usable.
