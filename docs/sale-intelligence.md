# Sale intelligence

Phase 8 treats sale intelligence as a decision aid rather than a listing bot.

## Candidate rules

Automatic candidates require a live Zap valuation, a configurable minimum current value, and a positive 30-day or 90-day movement that crosses either the configured absolute-dollar or percentage threshold. Manual watches remain visible regardless of automatic thresholds.

Watch state and notes are stored per holding, not per variant. This preserves independent decisions when multiple owned copies share a Zap variant but differ by grade or quantity.

## Sold comps

The authenticated Zap Club application was observed calling its `ebay-sold-lookup` Supabase Edge Function. The captured contract returns raw sold samples, graded aggregates and graded samples, median/min/max prices, cache metadata and filtered search results. The application calls this endpoint only on demand from a single sale-review page and stores the returned public market evidence by Zap variant ID so multiple holdings can reuse it.

The captured response explicitly separates raw and graded results and rejects many lot/noise matches. It does not provide a reliable signed-copy classification, so signed or otherwise unusual sales must still be reviewed manually.

## eBay API decision

As of October 2026, eBay documents Marketplace Insights (sold-item history) as limited/restricted and not open to new users. The Browse API is available for current listing search but is not a general substitute for sold-history access. For that reason, this application does not add a direct eBay API dependency in Phase 8.

Every sale-review page instead provides a direct eBay completed/sold search link for manual research alongside Zap's observed sold-comps lookup.

## Listing preparation

Phase 8 stops at research, watch state and notes. Automated eBay listing creation is deliberately deferred until it provides enough value to justify seller-account OAuth, listing-policy configuration and additional write-side risk.
