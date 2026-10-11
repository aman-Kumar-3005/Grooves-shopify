/**
 * Grooves customer support service.
 * Real orders are verified against Shopify Admin GraphQL before any order or
 * warranty information is returned. Unknown references never receive demo data.
 */
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-10';
const SHOPIFY_STORE_DOMAIN = String(process.env.SHOPIFY_STORE_DOMAIN || '').toLowerCase();
const SHOPIFY_ADMIN_ACCESS_TOKEN = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const SHOPIFY_API_SECRET = process.env.SHOPIFY_API_SECRET || '';
const WARRANTY_DAYS = Math.max(1, Number(process.env.WARRANTY_DAYS) || 365);
const DB_FILE = path.join(__dirname, 'data.json');
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const MAX_LOOKUPS = 12;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const lookupBuckets = new Map();

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const allowedUploads = new Map([
  ['image/jpeg', '.jpg'], ['image/png', '.png'], ['image/webp', '.webp'], ['application/pdf', '.pdf']
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, UPLOAD_DIR),
    filename: (_req, file, done) => done(null, `${Date.now()}-${crypto.randomUUID()}${allowedUploads.get(file.mimetype) || ''}`)
  }),
  fileFilter: (_req, file, done) => done(null, allowedUploads.has(file.mimetype)),
  limits: { fileSize: 10 * 1024 * 1024, files: 5 }
});

app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));

function loadDatabase() {
  if (!fs.existsSync(DB_FILE)) return { tickets: {}, nextTicketSeq: 1 };
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return { tickets: parsed.tickets || {}, nextTicketSeq: Number(parsed.nextTicketSeq) || 1 };
  } catch (error) {
    console.error('Ticket database could not be read:', error.message);
    return { tickets: {}, nextTicketSeq: 1 };
  }
}

function saveDatabase(database) {
  const temporary = `${DB_FILE}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(database, null, 2), 'utf8');
  fs.renameSync(temporary, DB_FILE);
}

function removeUploadedFiles(files) {
  (files || []).forEach((file) => {
    try { fs.unlinkSync(file.path); } catch (_) { /* File may already be unavailable. */ }
  });
}

function verifyShopifyProxy(req) {
  if (process.env.NODE_ENV !== 'production' && !req.query.signature) return true;
  if (!SHOPIFY_API_SECRET || typeof req.query.signature !== 'string') return false;
  const timestamp = Number(req.query.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const query = { ...req.query };
  const supplied = query.signature;
  delete query.signature;
  const message = Object.keys(query).sort().map((key) => `${key}=${Array.isArray(query[key]) ? query[key].join(',') : query[key]}`).join('');
  const expected = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(message).digest('hex');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function requireProxy(req, res, next) {
  if (!verifyShopifyProxy(req)) return res.status(403).json({ error: 'Unauthorized request.' });
  const proxyShop = String(req.query.shop || '').toLowerCase();
  if (proxyShop && SHOPIFY_STORE_DOMAIN && proxyShop !== SHOPIFY_STORE_DOMAIN) {
    return res.status(403).json({ error: 'Store mismatch.' });
  }
  next();
}

function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const bucket = lookupBuckets.get(key);
  if (!bucket || now - bucket.startedAt >= RATE_WINDOW_MS) {
    lookupBuckets.set(key, { startedAt: now, count: 1 });
    return next();
  }
  bucket.count += 1;
  if (bucket.count > MAX_LOOKUPS) return res.status(429).json({ error: 'Too many attempts. Please try again later.' });
  next();
}

function normalizeOrderReference(value) {
  return String(value || '').trim().replace(/^#/, '').toUpperCase();
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function graphqlSearchValue(value) {
  return String(value).replace(/[^a-zA-Z0-9@._+\-]/g, '');
}

function assertShopifyConfigured() {
  if (!SHOPIFY_STORE_DOMAIN || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
    const error = new Error('Shopify Admin API is not configured.');
    error.status = 503;
    throw error;
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(SHOPIFY_STORE_DOMAIN)) {
    const error = new Error('Invalid Shopify store domain configuration.');
    error.status = 503;
    throw error;
  }
}

async function shopifyGraphql(query, variables) {
  assertShopifyConfigured();
  const response = await fetch(`https://${SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors) {
    console.error('Shopify GraphQL error:', response.status, JSON.stringify(payload.errors || payload));
    const error = new Error('Shopify order service unavailable.');
    error.status = 502;
    throw error;
  }
  return payload.data;
}

async function findVerifiedOrder(reference, email, loggedInCustomerId) {
  const orderReference = normalizeOrderReference(reference);
  const normalizedEmail = normalizeEmail(email);
  if (!orderReference || orderReference.length > 80 || !validEmail(normalizedEmail)) return null;
  const search = `name:${graphqlSearchValue(orderReference)} email:${graphqlSearchValue(normalizedEmail)}`;
  const data = await shopifyGraphql(`
    query FindCustomerOrder($query: String!) {
      orders(first: 5, query: $query, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id name confirmationNumber processedAt displayFinancialStatus displayFulfillmentStatus email
          customer { legacyResourceId }
          currentTotalPriceSet { shopMoney { amount currencyCode } }
          lineItems(first: 50) { nodes { name quantity sku } }
        }
      }
    }
  `, { query: search });

  return (data.orders?.nodes || []).find((order) => {
    const exactOrder = normalizeOrderReference(order.name) === orderReference || String(order.confirmationNumber || '').toUpperCase() === orderReference;
    const exactEmail = normalizeEmail(order.email) === normalizedEmail;
    const customerMatches = !loggedInCustomerId || String(order.customer?.legacyResourceId || '') === String(loggedInCustomerId);
    return exactOrder && exactEmail && customerMatches;
  }) || null;
}

function warrantyFromOrder(order) {
  const purchase = new Date(order.processedAt);
  const expiresAt = new Date(purchase.getTime() + WARRANTY_DAYS * 86400000);
  const remainingDays = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 86400000));
  const disqualified = ['REFUNDED', 'VOIDED', 'EXPIRED'].includes(order.displayFinancialStatus);
  return {
    status: disqualified ? 'Not eligible' : (remainingDays > 0 ? 'Active' : 'Expired'),
    orderNumber: order.name,
    purchaseDate: order.processedAt,
    durationDays: WARRANTY_DAYS,
    remainingDays: disqualified ? 0 : remainingDays,
    expiresAt: expiresAt.toISOString(),
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    total: order.currentTotalPriceSet?.shopMoney || null,
    items: (order.lineItems?.nodes || []).map((item) => ({ title: item.name, quantity: item.quantity, sku: item.sku || '' }))
  };
}

app.get('/health', (_req, res) => res.json({
  status: 'ok',
  shopifyConfigured: Boolean(SHOPIFY_STORE_DOMAIN && SHOPIFY_ADMIN_ACCESS_TOKEN),
  timestamp: new Date().toISOString()
}));

app.post(['/apps/grooves-support/status', '/api/status'], requireProxy, rateLimit, async (req, res) => {
  try {
    const type = String(req.body?.type || '');
    const reference = String(req.body?.reference || '').trim();
    const email = normalizeEmail(req.body?.email);
    if (!['warranty', 'ticket'].includes(type) || !reference || !validEmail(email)) {
      return res.status(400).json({ error: 'Valid type, reference, and registered email are required.' });
    }

    if (type === 'warranty') {
      const order = await findVerifiedOrder(reference, email, req.query.logged_in_customer_id);
      if (!order) return res.status(404).json({ error: 'No data found.' });
      return res.json({ ...warrantyFromOrder(order), verifiedEmail: email });
    }

    const database = loadDatabase();
    const ticket = database.tickets[reference.toUpperCase()];
    if (!ticket || normalizeEmail(ticket.email) !== email) return res.status(404).json({ error: 'No data found.' });
    return res.json({
      ticketNumber: ticket.ticketNumber,
      product: ticket.product,
      category: ticket.category,
      status: ticket.status,
      updatedAt: ticket.updatedAt,
      notes: ticket.notes
    });
  } catch (error) {
    console.error('Status lookup failed:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Status lookup failed.' });
  }
});

app.post(['/apps/grooves-support/create-ticket', '/api/create-ticket'], requireProxy, rateLimit, upload.array('attachments', 5), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const invoice = String(req.body?.invoice || '').trim();
    const product = String(req.body?.product || '').trim();
    const category = String(req.body?.category || '').trim();
    const description = String(req.body?.description || '').trim();
    if (!name || name.length > 100 || !validEmail(email) || !invoice || !product || !category || description.length < 10 || description.length > 3000) {
      removeUploadedFiles(req.files);
      return res.status(400).json({ error: 'Please complete all required fields with valid information.' });
    }

    const order = await findVerifiedOrder(invoice, email, req.query.logged_in_customer_id);
    if (!order) {
      removeUploadedFiles(req.files);
      return res.status(404).json({ error: 'No matching Shopify order found.' });
    }

    const database = loadDatabase();
    const sequence = database.nextTicketSeq++;
    const ticketNumber = `GRV-TKT-${new Date().getFullYear()}-${String(sequence).padStart(6, '0')}`;
    const now = new Date().toISOString();
    database.tickets[ticketNumber] = {
      ticketNumber,
      name,
      email,
      invoice: order.name,
      orderId: order.id,
      product,
      category,
      description,
      status: 'Open',
      createdAt: now,
      updatedAt: now,
      notes: 'Request received. Grooves Support will review the case.',
      attachments: (req.files || []).map((file) => ({ filename: file.filename, originalName: file.originalname, size: file.size, mimeType: file.mimetype }))
    };
    saveDatabase(database);
    res.status(201).json({ success: true, ticketNumber, message: 'Support ticket created.' });
  } catch (error) {
    removeUploadedFiles(req.files);
    console.error('Ticket creation failed:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Ticket creation failed.' });
  }
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Attachment limit exceeded.' });
  console.error('Unhandled request error:', error.message);
  res.status(500).json({ error: 'Unexpected server error.' });
});

app.listen(PORT, () => {
  console.log(`Grooves support service listening on port ${PORT}`);
  console.log(`Shopify integration: ${SHOPIFY_STORE_DOMAIN && SHOPIFY_ADMIN_ACCESS_TOKEN ? 'configured' : 'not configured'}`);
});
