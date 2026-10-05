# Grooves status tracking integration

The theme page `page.track-status.json` uses `sections/grooves-track-status.liquid` and sends a same-origin POST to the configured Shopify app proxy endpoint (default: `/apps/grooves-support/status`). The backend verifies warranty requests against real Shopify orders and stores support tickets separately.

Request body:

```json
{"type":"warranty","reference":"#1001","email":"customer@example.com"}
```

`type` is `warranty` or `ticket`. `reference` is the Shopify order number for warranty and ticket number for support. Both flows require the registered email. A successful warranty response contains verified, customer-safe order data:

```json
{"status":"Active","orderNumber":"#1001","purchaseDate":"2026-07-01T10:30:00Z","durationDays":365,"remainingDays":269}
```

The backend validates input, verifies Shopify app proxy signatures, rate limits lookups, and avoids returning names, contact details, full addresses, payment details, or attachments. Unknown references and mismatched emails return `404 No data found`. Admin API tokens and other secrets must never be placed in the theme.

For deployment, credentials, scopes, app-proxy configuration, and test cases, follow `backend/README.md`. The footer shows a tracking link automatically when the `track-status` page exists.
