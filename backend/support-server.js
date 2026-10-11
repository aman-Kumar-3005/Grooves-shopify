/**
 * Grooves customer care service.
 *
 * Customer requests arrive through a signed Shopify App Proxy. Every warranty,
 * return, replacement, repair, and support request is bound to a real Shopify
 * order and checkout email before customer-safe information is returned.
 */
require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const app = express();
const PORT = positiveInteger(process.env.PORT, 4000);
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2026-10';
const DEFAULT_SHOPIFY_STORE_DOMAIN = String(process.env.SHOPIFY_STORE_DOMAIN || '').trim().toLowerCase();
const SHOPIFY_ADMIN_ACCESS_TOKEN = String(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '').trim();
const SHOPIFY_API_SECRET = String(process.env.SHOPIFY_API_SECRET || '').trim();
const SUPPORT_ADMIN_KEY = String(process.env.SUPPORT_ADMIN_KEY || '').trim();
const DEFAULT_WARRANTY_DAYS = positiveInteger(process.env.WARRANTY_DAYS, 365);
const DEFAULT_RETURN_WINDOW_DAYS = positiveInteger(process.env.RETURN_WINDOW_DAYS, 7);
const DATA_DIR = path.resolve(process.env.DATA_DIR || __dirname);
const DB_FILE = path.join(DATA_DIR, 'data.json');
const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads'));
const MAX_LOOKUPS = positiveInteger(process.env.MAX_LOOKUPS_PER_WINDOW, 20);
const RATE_WINDOW_MS = positiveInteger(process.env.RATE_WINDOW_MINUTES, 15) * 60 * 1000;
const STAFF_DIR = path.join(__dirname, 'staff');
const lookupBuckets = new Map();
const ALLOWED_REQUEST_TYPES = new Set([
  'warranty_claim', 'return', 'replacement', 'repair', 'technical_support', 'order_issue', 'other'
]);
const ALLOWED_TICKET_STATUSES = new Set([
  'Open', 'Under Review', 'In Progress', 'Awaiting Customer', 'Approved', 'Pickup Scheduled',
  'In Transit', 'Replacement Shipped', 'Refund Processing', 'Resolved', 'Rejected', 'Closed'
]);

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const allowedUploads = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['application/pdf', '.pdf']
]);
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, done) => done(null, UPLOAD_DIR),
    filename: (_req, file, done) => done(null, `${Date.now()}-${crypto.randomUUID()}${allowedUploads.get(file.mimetype) || ''}`)
  }),
  fileFilter: (_req, file, done) => allowedUploads.has(file.mimetype)
    ? done(null, true)
    : done(serviceError(400, 'Unsupported attachment type.')),
  limits: { fileSize: 10 * 1024 * 1024, files: 5, fields: 12, fieldSize: 8 * 1024 }
});

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((_req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
  });
  next();
});
app.use(express.json({ limit: '48kb' }));
app.use(express.urlencoded({ extended: false, limit: '48kb' }));
app.use('/staff', express.static(STAFF_DIR, { index: 'index.html', maxAge: 0 }));

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function defaultSettings() {
  return {
    shopifyStoreDomain: DEFAULT_SHOPIFY_STORE_DOMAIN,
    warrantyDays: DEFAULT_WARRANTY_DAYS,
    returnWindowDays: DEFAULT_RETURN_WINDOW_DAYS,
    updatedAt: null
  };
}

function sanitizeSettings(settings = {}) {
  return {
    shopifyStoreDomain: String(settings.shopifyStoreDomain || DEFAULT_SHOPIFY_STORE_DOMAIN).trim().toLowerCase(),
    warrantyDays: positiveInteger(settings.warrantyDays, DEFAULT_WARRANTY_DAYS),
    returnWindowDays: positiveInteger(settings.returnWindowDays, DEFAULT_RETURN_WINDOW_DAYS),
    updatedAt: settings.updatedAt || null
  };
}

function emptyDatabase() {
  return { schemaVersion: 3, settings: defaultSettings(), warranties: {}, tickets: {}, nextWarrantySeq: 1, nextTicketSeq: 1 };
}

function loadDatabase() {
  if (!fs.existsSync(DB_FILE)) return emptyDatabase();
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      schemaVersion: 3,
      settings: sanitizeSettings(parsed.settings),
      warranties: parsed.warranties || {},
      tickets: parsed.tickets || {},
      nextWarrantySeq: positiveInteger(parsed.nextWarrantySeq, 1),
      nextTicketSeq: positiveInteger(parsed.nextTicketSeq, 1)
    };
  } catch (error) {
    console.error('Support database could not be read:', error.message);
    throw serviceError(503, 'Support database is unavailable.');
  }
}

function saveDatabase(database) {
  const temporary = `${DB_FILE}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(database, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temporary, DB_FILE);
}

function removeUploadedFiles(files) {
  (files || []).forEach((file) => {
    try { fs.unlinkSync(file.path); } catch (_) { /* Already unavailable. */ }
  });
}

function serviceError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function verifyShopifyProxy(req) {
  if (process.env.NODE_ENV !== 'production' && !req.query.signature) return true;
  if (!SHOPIFY_API_SECRET || typeof req.query.signature !== 'string') return false;
  const timestamp = Number(req.query.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return false;

  const query = { ...req.query };
  const supplied = query.signature;
  delete query.signature;
  const message = Object.keys(query)
    .sort()
    .map((key) => `${key}=${Array.isArray(query[key]) ? query[key].join(',') : query[key]}`)
    .join('');
  const expected = crypto.createHmac('sha256', SHOPIFY_API_SECRET).update(message).digest('hex');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return suppliedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(suppliedBuffer, expectedBuffer);
}

function requireProxy(req, res, next) {
  if (!verifyShopifyProxy(req)) return res.status(403).json({ error: 'Unauthorized request.' });
  try {
    const settings = loadDatabase().settings;
    const proxyShop = String(req.query.shop || '').toLowerCase();
    if (proxyShop && settings.shopifyStoreDomain && proxyShop !== settings.shopifyStoreDomain) {
      return res.status(403).json({ error: 'Store mismatch.' });
    }
    next();
  } catch (error) {
    next(error);
  }
}

function requireAdmin(req, res, next) {
  if (!SUPPORT_ADMIN_KEY) return res.status(503).json({ error: 'Admin API is not configured.' });
  const supplied = String(req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const suppliedBuffer = Buffer.from(supplied, 'utf8');
  const expectedBuffer = Buffer.from(SUPPORT_ADMIN_KEY, 'utf8');
  if (!supplied || suppliedBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return res.status(401).json({ error: 'Unauthorized.' });
  }
  next();
}

function rateLimit(req, res, next) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  if (lookupBuckets.size > 5000) {
    lookupBuckets.forEach((value, bucketKey) => {
      if (now - value.startedAt >= RATE_WINDOW_MS) lookupBuckets.delete(bucketKey);
    });
  }
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

function assertShopifyConfigured(settings) {
  if (!settings.shopifyStoreDomain || !SHOPIFY_ADMIN_ACCESS_TOKEN) {
    throw serviceError(503, 'Shopify Admin API is not configured.');
  }
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(settings.shopifyStoreDomain)) {
    throw serviceError(503, 'Invalid Shopify store domain configuration.');
  }
}

async function shopifyGraphql(query, variables, settings) {
  assertShopifyConfigured(settings);
  const response = await fetch(`https://${settings.shopifyStoreDomain}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': SHOPIFY_ADMIN_ACCESS_TOKEN },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(10000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors) {
    console.error('Shopify GraphQL error:', response.status, JSON.stringify(payload.errors || payload));
    throw serviceError(502, 'Shopify order service unavailable.');
  }
  return payload.data;
}

async function findVerifiedOrder(reference, email, loggedInCustomerId, settings) {
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
          lineItems(first: 50) {
            nodes {
              id name title quantity sku
              variant { id title product { id handle } }
            }
          }
        }
      }
    }
  `, { query: search }, settings);

  return (data.orders?.nodes || []).find((order) => {
    const exactOrder = normalizeOrderReference(order.name) === orderReference || String(order.confirmationNumber || '').toUpperCase() === orderReference;
    const exactEmail = normalizeEmail(order.email) === normalizedEmail;
    const customerMatches = !loggedInCustomerId || String(order.customer?.legacyResourceId || '') === String(loggedInCustomerId);
    return exactOrder && exactEmail && customerMatches;
  }) || null;
}

function orderEligibility(order, policy = defaultSettings()) {
  const settings = sanitizeSettings(policy);
  const purchase = new Date(order.processedAt);
  if (Number.isNaN(purchase.getTime())) throw serviceError(502, 'Order date is unavailable.');
  const warrantyExpiresAt = new Date(purchase.getTime() + settings.warrantyDays * 86400000);
  const returnExpiresAt = new Date(purchase.getTime() + settings.returnWindowDays * 86400000);
  const remainingDays = Math.max(0, Math.ceil((warrantyExpiresAt.getTime() - Date.now()) / 86400000));
  const returnDaysRemaining = Math.max(0, Math.ceil((returnExpiresAt.getTime() - Date.now()) / 86400000));
  const disqualified = ['REFUNDED', 'VOIDED', 'EXPIRED'].includes(order.displayFinancialStatus);
  return {
    purchase,
    warrantyExpiresAt,
    returnExpiresAt,
    remainingDays: disqualified ? 0 : remainingDays,
    returnDaysRemaining: disqualified ? 0 : returnDaysRemaining,
    warrantyStatus: disqualified ? 'Not eligible' : (remainingDays > 0 ? 'Active' : 'Expired'),
    returnEligible: !disqualified && returnDaysRemaining > 0,
    disqualified
  };
}

function secureProductSelector(order, item, email) {
  const secret = SHOPIFY_API_SECRET || SUPPORT_ADMIN_KEY || SHOPIFY_ADMIN_ACCESS_TOKEN;
  return crypto.createHmac('sha256', secret)
    .update(`${order.id}\u0000${item.id}\u0000${normalizeEmail(email)}`)
    .digest('hex');
}

function safeTokenEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''), 'utf8');
  const rightBuffer = Buffer.from(String(right || ''), 'utf8');
  return leftBuffer.length === rightBuffer.length && leftBuffer.length > 0 && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function publicLineItem(item, order, email) {
  return {
    lineItemId: secureProductSelector(order, item, email),
    title: item.name || item.title,
    quantity: Number(item.quantity) || 1,
    sku: item.sku || '',
    variantTitle: item.variant?.title || '',
    productHandle: item.variant?.product?.handle || ''
  };
}

function findWarrantyForLine(database, order, lineItem, email) {
  return Object.values(database.warranties).find((warranty) =>
    warranty.orderId === order.id &&
    warranty.lineItemId === lineItem.id &&
    normalizeEmail(warranty.email) === normalizeEmail(email) &&
    warranty.status !== 'Cancelled'
  ) || null;
}

function warrantyFromOrder(order, email, database) {
  const settings = sanitizeSettings(database.settings);
  const eligibility = orderEligibility(order, settings);
  const lineItems = order.lineItems?.nodes || [];
  return {
    status: eligibility.warrantyStatus,
    orderNumber: order.name,
    purchaseDate: order.processedAt,
    durationDays: settings.warrantyDays,
    remainingDays: eligibility.remainingDays,
    expiresAt: eligibility.warrantyExpiresAt.toISOString(),
    returnWindowDays: settings.returnWindowDays,
    returnDaysRemaining: eligibility.returnDaysRemaining,
    returnEligible: eligibility.returnEligible,
    financialStatus: order.displayFinancialStatus,
    fulfillmentStatus: order.displayFulfillmentStatus,
    total: order.currentTotalPriceSet?.shopMoney || null,
    items: lineItems.map((item) => {
      const registration = findWarrantyForLine(database, order, item, email);
      return {
        ...publicLineItem(item, order, email),
        warrantyId: registration?.warrantyId || '',
        registered: Boolean(registration),
        registeredAt: registration?.registeredAt || ''
      };
    })
  };
}

function getOrderLineItem(order, lineItemId, email, productFallback) {
  const items = order.lineItems?.nodes || [];
  const exact = items.find((item) => safeTokenEqual(secureProductSelector(order, item, email), lineItemId));
  if (exact) return exact;
  const normalizedProduct = String(productFallback || '').trim().toLowerCase();
  if (!normalizedProduct) return null;
  return items.find((item) => String(item.name || item.title || '').trim().toLowerCase() === normalizedProduct) || null;
}

function createWarrantyRegistration(database, order, lineItem, customer) {
  const existing = findWarrantyForLine(database, order, lineItem, customer.email);
  if (existing) return { registration: existing, created: false };
  const eligibility = orderEligibility(order, database.settings);
  if (eligibility.disqualified) throw serviceError(409, 'This order is not eligible for warranty registration.');
  if (eligibility.remainingDays <= 0) throw serviceError(409, 'Warranty coverage for this order has expired.');
  const sequence = database.nextWarrantySeq++;
  const warrantyId = `GRV-WTY-${new Date().getFullYear()}-${String(sequence).padStart(6, '0')}`;
  const now = new Date().toISOString();
  const registration = {
    warrantyId,
    orderId: order.id,
    orderNumber: order.name,
    lineItemId: lineItem.id,
    product: lineItem.name || lineItem.title,
    sku: lineItem.sku || '',
    name: customer.name,
    email: customer.email,
    phone: customer.phone || '',
    serialNumber: customer.serialNumber || '',
    status: eligibility.remainingDays > 0 ? 'Active' : 'Expired',
    purchaseDate: order.processedAt,
    expiresAt: eligibility.warrantyExpiresAt.toISOString(),
    registeredAt: now,
    updatedAt: now
  };
  database.warranties[warrantyId] = registration;
  return { registration, created: true };
}

function publicWarranty(registration) {
  const remainingDays = Math.max(0, Math.ceil((new Date(registration.expiresAt).getTime() - Date.now()) / 86400000));
  const status = registration.status === 'Cancelled' ? 'Cancelled' : (remainingDays > 0 ? 'Active' : 'Expired');
  return {
    warrantyId: registration.warrantyId,
    orderNumber: registration.orderNumber,
    product: registration.product,
    sku: registration.sku,
    status,
    purchaseDate: registration.purchaseDate,
    expiresAt: registration.expiresAt,
    remainingDays,
    registeredAt: registration.registeredAt
  };
}

function publicTicket(ticket) {
  return {
    ticketNumber: ticket.ticketNumber,
    requestType: ticket.requestType,
    warrantyId: ticket.warrantyId || '',
    orderNumber: ticket.invoice,
    product: ticket.product,
    category: ticket.category,
    status: ticket.status,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    notes: ticket.notes,
    timeline: (ticket.timeline || []).filter((entry) => entry.public !== false).map((entry) => ({
      status: entry.status,
      note: entry.note,
      at: entry.at
    }))
  };
}

app.get('/health', (_req, res) => {
  const settings = loadDatabase().settings;
  res.json({
    status: 'ok',
    shopifyConfigured: Boolean(settings.shopifyStoreDomain && SHOPIFY_ADMIN_ACCESS_TOKEN && SHOPIFY_API_SECRET),
    storageWritable: fs.existsSync(DATA_DIR),
    timestamp: new Date().toISOString()
  });
});

app.post(['/apps/grooves-support/status', '/api/status'], requireProxy, rateLimit, async (req, res) => {
  try {
    const type = String(req.body?.type || '');
    const reference = String(req.body?.reference || '').trim();
    const email = normalizeEmail(req.body?.email);
    if (!['warranty', 'ticket'].includes(type) || !reference || !validEmail(email)) {
      return res.status(400).json({ error: 'Valid type, reference, and registered email are required.' });
    }

    const database = loadDatabase();
    if (type === 'warranty') {
      const directWarranty = database.warranties[reference.toUpperCase()];
      if (directWarranty) {
        if (normalizeEmail(directWarranty.email) !== email) return res.status(404).json({ error: 'No data found.' });
        return res.json({ ...publicWarranty(directWarranty), verifiedEmail: email, lookupType: 'registration' });
      }
      const order = await findVerifiedOrder(reference, email, req.query.logged_in_customer_id, database.settings);
      if (!order) return res.status(404).json({ error: 'No data found.' });
      return res.json({ ...warrantyFromOrder(order, email, database), verifiedEmail: email, lookupType: 'order' });
    }

    const ticket = database.tickets[reference.toUpperCase()];
    if (!ticket || normalizeEmail(ticket.email) !== email) return res.status(404).json({ error: 'No data found.' });
    return res.json(publicTicket(ticket));
  } catch (error) {
    console.error('Status lookup failed:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Status lookup failed.' });
  }
});

app.post(['/apps/grooves-support/register-warranty', '/api/register-warranty'], requireProxy, rateLimit, async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || '').trim();
    const invoice = String(req.body?.invoice || '').trim();
    const lineItemId = String(req.body?.lineItemId || '').trim();
    const serialNumber = String(req.body?.serialNumber || '').trim();
    if (!name || name.length > 100 || !validEmail(email) || !invoice || !lineItemId || phone.length > 30 || serialNumber.length > 120) {
      return res.status(400).json({ error: 'Please complete all required registration fields.' });
    }
    const database = loadDatabase();
    const order = await findVerifiedOrder(invoice, email, req.query.logged_in_customer_id, database.settings);
    if (!order) return res.status(404).json({ error: 'No matching Shopify order found.' });
    const lineItem = getOrderLineItem(order, lineItemId, email);
    if (!lineItem) return res.status(404).json({ error: 'Selected product was not found in this order.' });
    const { registration, created } = createWarrantyRegistration(database, order, lineItem, { name, email, phone, serialNumber });
    if (created) saveDatabase(database);
    res.status(created ? 201 : 200).json({ success: true, created, warranty: publicWarranty(registration) });
  } catch (error) {
    console.error('Warranty registration failed:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Warranty registration failed.' });
  }
});

app.post(['/apps/grooves-support/create-ticket', '/api/create-ticket'], requireProxy, rateLimit, upload.array('attachments', 5), async (req, res) => {
  try {
    const name = String(req.body?.name || '').trim();
    const email = normalizeEmail(req.body?.email);
    const phone = String(req.body?.phone || '').trim();
    const invoice = String(req.body?.invoice || '').trim();
    const lineItemId = String(req.body?.lineItemId || '').trim();
    const productFallback = String(req.body?.product || '').trim();
    const requestType = String(req.body?.requestType || 'technical_support').trim().toLowerCase();
    const category = String(req.body?.category || '').trim();
    const description = String(req.body?.description || '').trim();
    const serialNumber = String(req.body?.serialNumber || '').trim();
    if (!name || name.length > 100 || !validEmail(email) || phone.length > 30 || !invoice || invoice.length > 80 || !lineItemId || !ALLOWED_REQUEST_TYPES.has(requestType) || !category || category.length > 160 || productFallback.length > 200 || serialNumber.length > 120 || description.length < 10 || description.length > 3000) {
      removeUploadedFiles(req.files);
      return res.status(400).json({ error: 'Please complete all required fields with valid information.' });
    }

    const database = loadDatabase();
    const order = await findVerifiedOrder(invoice, email, req.query.logged_in_customer_id, database.settings);
    if (!order) {
      removeUploadedFiles(req.files);
      return res.status(404).json({ error: 'No matching Shopify order found.' });
    }
    const lineItem = getOrderLineItem(order, lineItemId, email, productFallback);
    if (!lineItem) {
      removeUploadedFiles(req.files);
      return res.status(404).json({ error: 'Selected product was not found in this order.' });
    }

    const eligibility = orderEligibility(order, database.settings);
    if (requestType === 'return' && !eligibility.returnEligible) {
      removeUploadedFiles(req.files);
      return res.status(409).json({ error: `The ${database.settings.returnWindowDays}-day return request window has expired or this order is not eligible.` });
    }
    if (['warranty_claim', 'replacement', 'repair'].includes(requestType) && eligibility.remainingDays <= 0) {
      removeUploadedFiles(req.files);
      return res.status(409).json({ error: 'Warranty coverage has expired or this order is not eligible.' });
    }

    let warranty = findWarrantyForLine(database, order, lineItem, email);
    if (!warranty && ['warranty_claim', 'replacement', 'repair'].includes(requestType)) {
      warranty = createWarrantyRegistration(database, order, lineItem, { name, email, phone, serialNumber }).registration;
    }
    const sequence = database.nextTicketSeq++;
    const ticketNumber = `GRV-TKT-${new Date().getFullYear()}-${String(sequence).padStart(6, '0')}`;
    const now = new Date().toISOString();
    const initialNote = requestType === 'return'
      ? 'Return request received and pending eligibility review.'
      : 'Request received. Grooves Support will review the case.';
    database.tickets[ticketNumber] = {
      ticketNumber,
      requestType,
      warrantyId: warranty?.warrantyId || '',
      name,
      email,
      phone,
      invoice: order.name,
      orderId: order.id,
      lineItemId: lineItem.id,
      product: lineItem.name || lineItem.title,
      sku: lineItem.sku || '',
      category,
      description,
      status: 'Open',
      createdAt: now,
      updatedAt: now,
      notes: initialNote,
      eligibility: {
        warrantyRemainingDays: eligibility.remainingDays,
        returnDaysRemaining: eligibility.returnDaysRemaining,
        checkedAt: now
      },
      timeline: [{ status: 'Open', note: initialNote, at: now, public: true }],
      attachments: (req.files || []).map((file) => ({
        filename: file.filename,
        originalName: path.basename(file.originalname),
        size: file.size,
        mimeType: file.mimetype
      }))
    };
    saveDatabase(database);
    res.status(201).json({
      success: true,
      ticketNumber,
      warrantyId: warranty?.warrantyId || '',
      status: 'Open',
      message: 'Support request created.'
    });
  } catch (error) {
    removeUploadedFiles(req.files);
    console.error('Ticket creation failed:', error.message);
    res.status(error.status || 500).json({ error: error.message || 'Ticket creation failed.' });
  }
});

app.get('/api/admin/tickets', requireAdmin, (req, res) => {
  const database = loadDatabase();
  const status = String(req.query.status || '').trim().toLowerCase();
  const tickets = Object.values(database.tickets)
    .filter((ticket) => !status || String(ticket.status).toLowerCase() === status)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  res.json({ tickets });
});

app.patch('/api/admin/tickets/:ticketNumber', requireAdmin, (req, res) => {
  try {
    const database = loadDatabase();
    const key = String(req.params.ticketNumber || '').toUpperCase();
    const ticket = database.tickets[key];
    if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
    const status = String(req.body?.status || '').trim();
    const note = String(req.body?.note || '').trim();
    const isPublic = req.body?.public !== false;
    if (!ALLOWED_TICKET_STATUSES.has(status) || !note || note.length > 1200) {
      return res.status(400).json({ error: 'A valid status and customer update note are required.' });
    }
    const now = new Date().toISOString();
    ticket.status = status;
    ticket.notes = isPublic ? note : ticket.notes;
    ticket.updatedAt = now;
    ticket.timeline ||= [];
    ticket.timeline.push({ status, note, at: now, public: isPublic });
    saveDatabase(database);
    res.json({ success: true, ticket });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Ticket update failed.' });
  }
});

app.get('/api/admin/settings', requireAdmin, (_req, res) => {
  const database = loadDatabase();
  res.json({ settings: database.settings });
});

app.patch('/api/admin/settings', requireAdmin, (req, res) => {
  try {
    const shopifyStoreDomain = String(req.body?.shopifyStoreDomain || '').trim().toLowerCase();
    const warrantyDays = Number(req.body?.warrantyDays);
    const returnWindowDays = Number(req.body?.returnWindowDays);
    const applyWarrantyToExisting = req.body?.applyWarrantyToExisting === true;
    if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shopifyStoreDomain)) {
      return res.status(400).json({ error: 'Enter the permanent store domain ending in .myshopify.com.' });
    }
    if (!Number.isInteger(warrantyDays) || warrantyDays < 1 || warrantyDays > 3650) {
      return res.status(400).json({ error: 'Warranty duration must be between 1 and 3650 days.' });
    }
    if (!Number.isInteger(returnWindowDays) || returnWindowDays < 1 || returnWindowDays > 365) {
      return res.status(400).json({ error: 'Return window must be between 1 and 365 days.' });
    }
    const database = loadDatabase();
    const now = new Date().toISOString();
    database.settings = { shopifyStoreDomain, warrantyDays, returnWindowDays, updatedAt: now };
    if (applyWarrantyToExisting) {
      Object.values(database.warranties).forEach((warranty) => {
        const purchase = new Date(warranty.purchaseDate);
        if (!Number.isNaN(purchase.getTime()) && warranty.status !== 'Cancelled') {
          warranty.expiresAt = new Date(purchase.getTime() + warrantyDays * 86400000).toISOString();
          warranty.status = warranty.expiresAt > now ? 'Active' : 'Expired';
          warranty.updatedAt = now;
        }
      });
    }
    saveDatabase(database);
    res.json({ success: true, settings: database.settings, existingWarrantiesUpdated: applyWarrantyToExisting });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Settings update failed.' });
  }
});

app.get('/api/admin/warranties', requireAdmin, (req, res) => {
  const database = loadDatabase();
  const status = String(req.query.status || '').trim().toLowerCase();
  const warranties = Object.values(database.warranties)
    .filter((warranty) => !status || String(publicWarranty(warranty).status).toLowerCase() === status)
    .map((warranty) => ({ ...warranty, status: publicWarranty(warranty).status }))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  res.json({ warranties });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) return res.status(400).json({ error: 'Attachment limit exceeded.' });
  console.error('Unhandled request error:', error.message);
  res.status(error.status || 500).json({ error: error.status ? error.message : 'Unexpected server error.' });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Grooves support service listening on port ${PORT}`);
    const settings = loadDatabase().settings;
    console.log(`Shopify integration: ${settings.shopifyStoreDomain && SHOPIFY_ADMIN_ACCESS_TOKEN ? 'configured' : 'not configured'}`);
    console.log(`Support storage: ${DB_FILE}`);
  });
}

module.exports = {
  app,
  verifyShopifyProxy,
  orderEligibility,
  normalizeOrderReference,
  normalizeEmail,
  secureProductSelector,
  getOrderLineItem,
  publicWarranty
};
