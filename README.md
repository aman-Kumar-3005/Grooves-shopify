# Grooves Shopify theme and support service

## Overview

A Shopify theme with storefront sections, reusable Liquid snippets, and a separate customer-support service. The Node.js backend verifies an order reference and email against Shopify before creating warranty registrations or support tickets. Storefront rendering and backend hosting are separate concerns.

## System architecture and modules

| Path | Responsibility |
| --- | --- |
| `layout/` | Theme document layout. |
| `templates/ / sections/ / blocks/ / snippets/` | Page templates, sections, blocks, and reusable Liquid components. |
| `assets/` | Theme JavaScript, CSS, and media; assets/package.json declares ES modules. |
| `config/ / locales/` | Theme settings and translation files. |
| `backend/support-server.js` | Express API, Shopify app-proxy verification, order lookup, warranties, tickets, and staff endpoints. |
| `backend/staff/` | Staff console assets. |
| `backend/support-server.test.js` | Node test suite for backend behavior. |
| `docs/` | Integration instructions and earlier implementation/audit notes. |

## Tech stack

Shopify Liquid, JavaScript, CSS, Node.js 20+, Express 4, Multer 2, and dotenv. Backend records use an atomic JSON file and local private uploads; no MySQL schema is included.

## Local setup

Theme development requires Shopify CLI and access to a development store. The preview command uploads theme files to that store.

```bash
git clone https://github.com/shreyasingh3005/Grooves-shopify.git
cd Grooves-shopify
npm install -g @shopify/cli@latest
shopify theme check
shopify theme dev --store your-development-store.myshopify.com
```

Replace the development-store placeholder with a store you control. For the separate support service:

```bash
cd backend
npm install
cp .env.example .env
npm test
npm start
```

The default backend port is `4000`; inspect `http://127.0.0.1:4000/health`. Without Shopify configuration, a running process does not imply that order lookups work. Configure `SHOPIFY_STORE_DOMAIN`, `SHOPIFY_ADMIN_ACCESS_TOKEN`, `SHOPIFY_API_SECRET`, and `SUPPORT_ADMIN_KEY` privately, then follow [backend/README.md](backend/README.md) for app-proxy and order-access requirements. Do not put these values in the theme.

CLI reference: [Shopify theme commands](https://shopify.dev/docs/api/shopify-cli/theme).

## Implementation notes and limits

- The customer routes include `/apps/grooves-support/status`, `/register-warranty`, and `/create-ticket` under the same proxy prefix; direct `/api/...` aliases exist for development. Staff routes require the admin key.
- The JSON store is intended for one backend instance with persistent disk. It does not provide a shared database for horizontally scaled or ephemeral deployments.
- Production proxy-signature checks, real order ownership, upload handling, and store permissions need verification in the target environment. No live store deployment was performed in this documentation pass.
- Existing integration and audit notes are retained under `docs/`; their dated findings are separate from current test evidence.
