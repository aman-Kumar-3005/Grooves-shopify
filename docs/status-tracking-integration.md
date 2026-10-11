# Grooves customer care portal integration

The Shopify page template `templates/page.track-status.json` renders `sections/grooves-track-status.liquid`. Its browser controller is `assets/grooves-track-status.js`; all public requests remain same-origin and pass through the Shopify app proxy.

## Live customer workflows

- Verify an actual Shopify order number plus checkout email.
<<<<<<< HEAD
- Discover matching orders/products using checkout email plus mobile number, then select an order without typing its number.
=======
>>>>>>> 65f68d4db9c9288d3627d9c409168a21554df447
- Show only customer-safe purchase data, purchased line items, remaining warranty, and return eligibility.
- Register a warranty for one exact purchased line item.
- Create warranty claim, return, replacement, repair, technical-support, order-issue, or other service tickets.
- Upload up to five protected JPG/PNG/WebP/PDF attachments, maximum 10 MB each.
- Track warranty IDs and ticket IDs using the registered email.
- Show the full customer-visible ticket timeline after staff updates.

No fallback/demo record is returned. Unknown references and wrong emails return `404 No data found`.

## Theme endpoints

- `/apps/grooves-support/status`
<<<<<<< HEAD
- `/apps/grooves-support/discover-orders`
=======
>>>>>>> 65f68d4db9c9288d3627d9c409168a21554df447
- `/apps/grooves-support/register-warranty`
- `/apps/grooves-support/create-ticket`

All three are editable in the Track Status section settings, but their defaults should be retained when the app proxy uses the recommended `grooves-support` subpath.

## Security boundary

The backend validates the Shopify proxy HMAC and timestamp, the permanent store domain, and the signed logged-in customer ID when present. It rate limits requests, normalizes references, validates file type/size, and never returns payment information, full addresses, private stored-file locations, Admin GraphQL IDs, or other customers' records.

Shopify Admin credentials, app secret, and the staff API key live only as backend environment variables. They must never be placed in the theme or committed to Git.

## Staff operations

The backend exposes private bearer-token endpoints to list warranties/tickets and update a ticket. Every public update is appended to the timeline visible to the customer. A private staff dashboard or existing helpdesk can be connected to these endpoints after the preferred system is selected.

The included staff console also has dynamic policy settings. An authorized admin can change the permanent Shopify domain, warranty days, return-window days, and whether the return window starts from delivery or purchase without editing code. These values are stored with the support database and take effect on subsequent customer requests.

Production credentials, scopes, app-proxy configuration, policy decisions, hosting requirements, and go-live tests are documented in `backend/README.md`.
