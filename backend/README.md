# Grooves Lifestyle Support Tracking & Ticketing Backend Architecture

This backend service powers the customer support portal for **Grooves Lifestyle** ([`grooveslifestyle.com`](https://grooveslifestyle.com)), providing:
1. **Warranty Status Verification** (Invoice lookups, warranty duration, remaining days, Active/Expired badge).
2. **Ticket Status Lookups** (Ticket lifecycle state: Open, In Progress, Resolved, support engineer notes).
3. **Automated Ticket Creation** (Captures customer details, issues, and defect attachments, generates sequential `GRV-TKT-2026-XXXXXX` references).
4. **Automated Email Confirmations** to customers.
5. **Shopify App Proxy Integration** with HMAC SHA-256 cryptographic security verification.
6. **CRM / Helpdesk Integrations** (Zendesk, Gorgias, Freshdesk).

---

## 1. Shopify App Proxy Configuration

To connect this backend to your live Shopify store so requests from `/pages/track-status` go directly to your backend over Shopify's proxy:

1. Go to your **Shopify Partners Dashboard** or **Shopify Store Admin > Apps > App Setup**.
2. Scroll to the **App Proxy** section and click **Set up proxy**.
3. Configure the following values:
   - **Subpath prefix**: `apps`
   - **Subpath**: `grooves-support`
   - **Proxy URL**: `https://your-backend-domain.com/apps/grooves-support`
4. Copy your **Shopify App Client Secret** and set it in your environment:
   ```bash
   SHOPIFY_API_SECRET=your_app_client_secret_here
   ```
5. When a customer on your store visits or submits an AJAX request to:
   `https://grooveslifestyle.com/apps/grooves-support/status`
   Shopify automatically attaches a cryptographic `signature` query parameter, forwards the request securely to your backend, and returns the response without cross-origin (CORS) complications.

---

## 2. API Endpoints

### A. Status Lookup
- **URL**: `POST /apps/grooves-support/status`
- **Request Body**:
  ```json
  {
    "type": "warranty",
    "reference": "INV-2026-001"
  }
  ```
- **Response**:
  ```json
  {
    "product": "Grooves Pulse Pro ANC Earbuds (Carbon Black)",
    "purchaseDate": "2026-01-15",
    "durationDays": 365,
    "remainingDays": 284,
    "status": "Active",
    "updatedAt": "2026-09-23T04:00:00.000Z"
  }
  ```

- **For Ticket Lookup**:
  ```json
  {
    "type": "ticket",
    "reference": "GRV-TKT-2026-000001"
  }
  ```
- **Response**:
  ```json
  {
    "ticketNumber": "GRV-TKT-2026-000001",
    "product": "Grooves Pulse Pro ANC Earbuds",
    "category": "Audio / Sound Distortion",
    "status": "In Progress",
    "updatedAt": "2026-09-23T02:00:00.000Z",
    "notes": "Diagnostic completed by Grooves Audio Lab. Replacement right earbud packed and scheduled for courier dispatch via Bluedart."
  }
  ```

---

### B. Create Support Ticket
- **URL**: `POST /apps/grooves-support/create-ticket`
- **Content-Type**: `multipart/form-data` or `application/json`
- **Fields**:
  - `name`: Customer Full Name
  - `email`: Customer Email Address
  - `invoice`: Invoice Number (e.g. `INV-2026-001`)
  - `product`: Grooves Product Model
  - `category`: Issue Category
  - `description`: Detailed Issue Description
  - `attachments`: File uploads (invoice copy, defect photos)
- **Response**:
  ```json
  {
    "success": true,
    "ticketNumber": "GRV-TKT-2026-000003",
    "message": "Support ticket generated successfully"
  }
  ```

---

## 3. Helpdesk / CRM Integration Strategy

### Zendesk Integration
In `backend/support-server.js`, you can configure the Zendesk REST API:
```javascript
// POST to https://{subdomain}.zendesk.com/api/v2/tickets.json
const zendeskPayload = {
  ticket: {
    subject: `[Grooves Support] ${product} - ${category}`,
    comment: { body: description },
    requester: { name: name, email: email },
    custom_fields: [{ id: 1234567, value: invoice }]
  }
};
```

### Gorgias Integration
Gorgias accepts tickets via HTTP REST:
```javascript
// POST to https://{subdomain}.gorgias.com/api/tickets/
const gorgiasPayload = {
  customer: { name, email },
  subject: `Grooves Issue: ${category} (${invoice})`,
  messages: [{ channel: 'email', from_agent: false, text: description }]
};
```

### Freshdesk Integration
```javascript
// POST to https://{domain}.freshdesk.com/api/v2/tickets
const freshdeskPayload = {
  name,
  email,
  subject: `[Warranty / Support] ${product}`,
  description,
  status: 2, // Open
  priority: 2 // Medium
};
```

---

## 4. Running the Backend Locally

```bash
cd backend
npm install
npm start
```
The server will start on port `4000`. You can expose it via ngrok/localtunnel for live Shopify App Proxy testing:
```bash
npx ngrok http 4000
```
Update your Shopify Partners App Proxy URL to your ngrok URL.
