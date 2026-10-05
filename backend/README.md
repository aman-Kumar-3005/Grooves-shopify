# Grooves order, warranty, and support backend

This service powers `/pages/track-status`. It verifies a Shopify order number and checkout email before returning order or warranty information. Unknown numbers, mismatched emails, and unknown tickets return `404 No data found`; there is no demo-data fallback.

## What is implemented

- Shopify Admin GraphQL order lookup by order number and checkout email.
- Optional logged-in customer ownership check from the signed Shopify app-proxy request.
- Remaining warranty calculation from the real order purchase date.
- Safe public response containing order status, product names, total, and warranty dates—never payment details or a full address.
- Ticket creation only after the Shopify order and email match.
- Ticket lookup requires both ticket number and registered email.
- Shopify app-proxy HMAC verification, five-minute timestamp tolerance, timing-safe signature comparison, input limits, attachment restrictions, and lookup rate limiting.

## Merchant setup required

The code cannot connect to live orders until the store owner supplies credentials and deploys the service.

1. Create or configure a Shopify app for the Grooves store.
2. Grant `read_orders`. A 365-day warranty needs orders older than Shopify's normal 60-day window, so also request and grant `read_all_orders`.
3. If Shopify asks for protected customer data approval, request access to the order email field. The portal uses it only to verify ownership.
4. Copy `.env.example` to `.env` on the backend host and set:
   - `SHOPIFY_STORE_DOMAIN` to the permanent `*.myshopify.com` domain, not the public custom domain.
   - `SHOPIFY_ADMIN_ACCESS_TOKEN` to the app's Admin API token.
   - `SHOPIFY_API_SECRET` to the app client secret used to validate proxy signatures.
   - `WARRANTY_DAYS` to the approved store-wide warranty term.
5. Deploy the `backend` directory to a persistent Node.js host. The host must use Node 20+ and persistent disk for `data.json` and `uploads/`.
6. Install and start:

   ```bash
   npm install
   npm start
   ```

7. Confirm `https://YOUR-BACKEND-DOMAIN/health` returns `"shopifyConfigured": true`.
8. Configure the Shopify app proxy:
   - Prefix: `apps`
   - Subpath: `grooves-support`
   - Proxy destination: `https://YOUR-BACKEND-DOMAIN/apps/grooves-support`
9. Keep the theme section endpoint as `/apps/grooves-support/status` and ticket endpoint as `/apps/grooves-support/create-ticket`.
10. Test one recent real order, one order older than 60 days, a wrong email, a random order number, a new ticket, and a wrong ticket email before publishing.

## Environment variables

See `.env.example`. Secrets belong only on the backend host. Never paste the Admin token or app secret into Shopify theme code.

## Production storage note

The included ticket store uses an atomic JSON file and is suitable for a single persistent backend instance. Before running multiple instances or serverless deployments, replace `loadDatabase` and `saveDatabase` with PostgreSQL, MySQL, or another shared database, and move attachments to private object storage.

## API behavior

### Warranty/order lookup

`POST /apps/grooves-support/status`

```json
{
  "type": "warranty",
  "reference": "#1001",
  "email": "customer@example.com"
}
```

### Ticket lookup

```json
{
  "type": "ticket",
  "reference": "GRV-TKT-2026-000001",
  "email": "customer@example.com"
}
```

Both live storefront requests must travel through the signed Shopify app proxy. Direct `/api/status` access is intended only for local development and still requires production proxy authentication when `NODE_ENV=production`.
