# Grooves warranty, returns, and support backend

This service powers `/pages/track-status`. It verifies a real Shopify order and checkout email before showing purchase details. Customers can register an item warranty, raise a warranty claim, request a return/replacement/repair, and track the resulting ticket. Unknown references and mismatched emails return `No data found`; the service never invents demo data.

## Customer flow implemented

1. Customer enters an order number (for example `#1001`) and checkout email.
2. The backend securely queries Shopify Admin GraphQL and confirms ownership.
3. The portal loads the actual purchased line items, warranty balance, and return-window eligibility.
4. Customer selects the exact purchased item and can register its warranty or raise a warranty claim, return, replacement, repair, technical-support, or order-issue request.
5. The customer receives a permanent `GRV-WTY-...` warranty ID or `GRV-TKT-...` ticket ID.
6. Ticket status and its update timeline can be viewed using the ID plus registered email.

Files are restricted to JPEG, PNG, WebP, or PDF, up to 10 MB each and five files per request. Public responses never include payment details, a full address, Admin API IDs, or stored upload paths.

## Merchant setup required

The repository does not contain live store secrets. The store owner must securely configure these values on the backend host:

1. Permanent Shopify domain such as `your-store.myshopify.com`, not the public custom domain.
2. A custom-app Admin API token with `read_orders`. Because a 365-day warranty needs older orders, request and approve `read_all_orders` too.
3. Protected customer data access for the order email field, if Shopify requires approval for the store/app.
4. The app client secret used to verify every Shopify app-proxy signature.
5. A long random `SUPPORT_ADMIN_KEY` for private staff endpoints.
6. Initial warranty and return defaults (`WARRANTY_DAYS` and `RETURN_WINDOW_DAYS`). The admin can change both later from the staff console.
7. A Node 20+ hosting URL with persistent disk, or a production database/object-storage replacement.

Copy `.env.example` to `.env` only on the backend host and set its values there. Never put the Admin token, app secret, or admin key into Liquid, storefront JavaScript, Git, or chat messages.

```bash
npm install
npm test
npm start
```

Confirm `https://YOUR-BACKEND-DOMAIN/health` returns `"shopifyConfigured": true` before enabling the storefront.

For container hosting, `backend/Dockerfile` is ready to use. Mount a persistent volume at `/app/data`; without that volume, warranty records, tickets, and private attachments will be lost when the container is replaced.

## Shopify app proxy

Configure one app proxy in the Shopify app:

- Prefix: `apps`
- Subpath: `grooves-support`
- Proxy destination: `https://YOUR-BACKEND-DOMAIN/apps/grooves-support`

The theme uses these child paths:

- `POST /apps/grooves-support/status`
- `POST /apps/grooves-support/register-warranty`
- `POST /apps/grooves-support/create-ticket`

Shopify adds signed query parameters to these calls. In production the backend rejects missing, expired, or invalid signatures and validates the signed logged-in customer ID when one is present.

## Public API examples

Verify an order and calculate eligibility:

```json
{
  "type": "warranty",
  "reference": "#1001",
  "email": "customer@example.com"
}
```

Track a warranty registration:

```json
{
  "type": "warranty",
  "reference": "GRV-WTY-2026-000001",
  "email": "customer@example.com"
}
```

Track a service ticket:

```json
{
  "type": "ticket",
  "reference": "GRV-TKT-2026-000001",
  "email": "customer@example.com"
}
```

Direct `/api/status`, `/api/register-warranty`, and `/api/create-ticket` aliases are provided for local development. When `NODE_ENV=production`, they still require a valid Shopify proxy signature.

## Private staff API

These routes require `Authorization: Bearer YOUR_SUPPORT_ADMIN_KEY`:

- `GET /api/admin/tickets?status=Open&limit=100`
- `PATCH /api/admin/tickets/GRV-TKT-2026-000001`
- `GET /api/admin/warranties?status=Active&limit=100`

Example status update body:

```json
{
  "status": "In Progress",
  "note": "Product received at service centre and diagnosis started."
}
```

Every update is appended to the customer-visible timeline. Do not expose the admin key in a browser. Connect these endpoints to a private staff dashboard, helpdesk, or approved internal automation.

A lightweight private staff console is included at `https://YOUR-BACKEND-DOMAIN/staff/`. Its **Settings** tab controls the permanent `*.myshopify.com` domain, warranty duration, return-window duration, and whether returns start from delivery or purchase date—without code changes or redeployment. Changes apply to the next customer request immediately. The admin can optionally apply a new warranty duration to existing registrations; otherwise their original coverage end dates are preserved. The admin key is kept only in the open browser tab. For a larger support team, place this route behind the hosting provider's access control or replace it with company SSO.

## Policy and storage notes

- Warranty is calculated from the Shopify processed/purchase date.
- Return eligibility uses Shopify's fulfillment `deliveredAt` date when the admin selects delivery-based returns; it safely falls back to purchase date when Shopify has no delivery timestamp.
- The bundled atomic JSON store is safe only for a single backend instance with persistent disk. Before using multiple instances or serverless hosting, move warranties/tickets to PostgreSQL or MySQL and attachments to private object storage.
- Customer email/SMS notifications are not sent until a provider is selected and its credentials are configured. IDs are displayed immediately in the portal and records remain available through the staff API.

## Go-live verification

Test all of the following before publishing:

- a recent genuine order and matching email;
- an order older than 60 days (proves `read_all_orders` works);
- a wrong email and a random order number (both must show no data);
- warranty registration twice for the same item (must return the existing ID);
- an eligible and ineligible return request;
- a claim after the configured warranty end date;
- ticket creation with and without attachments;
- ticket status update from the private API and customer timeline lookup;
- invalid/expired app-proxy signatures and repeated requests over the rate limit.
