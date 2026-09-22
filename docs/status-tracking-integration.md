# Grooves status tracking integration

The theme page `page.track-status.json` uses `sections/grooves-track-status.liquid` and sends a same-origin POST to the configured Shopify app proxy endpoint (default: `/apps/grooves-support/status`). The theme cannot read private warranty or support records by itself. The endpoint must be backed by the system that stores registrations and tickets.

Request body:

```json
{"type":"warranty","reference":"INVOICE-123"}
```

`type` is `warranty` or `ticket`. `reference` is the invoice number for warranty and ticket number for support. A successful response must contain only a public status and optional ISO timestamp:

```json
{"status":"In Progress","updatedAt":"2026-09-22T10:30:00Z"}
```

The backend must validate input, verify Shopify app proxy signatures, rate limit lookups, and avoid returning names, contact details, invoices, notes, or attachments. Unknown references should return a generic error. Because invoice numbers may be guessable, the recommended production lookup also verifies a customer email/mobile or a one-time code before disclosing anything beyond a generic registration state. Do not put Admin API tokens or other secrets in the theme.

To activate after the backend is available: deploy the theme files, create a Shopify page with handle `track-status` using the `track-status` template, and configure the section endpoint. The footer shows a tracking link automatically when that page exists. Test a real warranty invoice, a real ticket, and invalid references before advertising the page.
