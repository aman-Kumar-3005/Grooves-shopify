const test = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
const {
  normalizeOrderReference,
  normalizeEmail,
  orderEligibility,
  verifyShopifyProxy,
  secureProductSelector,
  getOrderLineItem,
  publicWarranty,
  buildOrderSearchQueries
} = require('./support-server');

test('normalizes customer order references and email addresses', () => {
  assert.equal(normalizeOrderReference('  #grv-1001  '), 'GRV-1001');
  assert.equal(normalizeOrderReference('1002'), '1002');
  assert.equal(normalizeEmail('  Customer@Example.COM '), 'customer@example.com');
});

test('Shopify order search quotes tokenized email and includes safe fallbacks', () => {
  assert.deepEqual(buildOrderSearchQueries('#1001', 'AmanChaursiya1234@gmail.com'), [
    'name:1001 email:"amanchaursiya1234@gmail.com"',
    'name:1001',
    'email:"amanchaursiya1234@gmail.com"'
  ]);
});

test('active paid order receives warranty and return eligibility', () => {
  const order = {
    processedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
    displayFinancialStatus: 'PAID'
  };
  const result = orderEligibility(order);
  assert.equal(result.disqualified, false);
  assert.equal(result.warrantyStatus, 'Active');
  assert.equal(result.returnEligible, true);
  assert.ok(result.remainingDays >= 362 && result.remainingDays <= 364);
  assert.ok(result.returnDaysRemaining >= 4 && result.returnDaysRemaining <= 6);
});

test('refunded order is never eligible even inside policy windows', () => {
  const result = orderEligibility({
    processedAt: new Date().toISOString(),
    displayFinancialStatus: 'REFUNDED'
  });
  assert.equal(result.disqualified, true);
  assert.equal(result.warrantyStatus, 'Not eligible');
  assert.equal(result.remainingDays, 0);
  assert.equal(result.returnEligible, false);
  assert.equal(result.returnDaysRemaining, 0);
});

test('admin policy values change warranty and return calculations dynamically', () => {
  const result = orderEligibility({
    processedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
    displayFinancialStatus: 'PAID'
  }, { warrantyDays: 730, returnWindowDays: 30 });
  assert.equal(result.warrantyStatus, 'Active');
  assert.equal(result.returnEligible, true);
  assert.ok(result.remainingDays >= 719 && result.remainingDays <= 721);
  assert.ok(result.returnDaysRemaining >= 19 && result.returnDaysRemaining <= 21);
});

test('delivery-based return window uses Shopify deliveredAt instead of purchase date', () => {
  const order = {
    processedAt: new Date(Date.now() - 20 * 86400000).toISOString(),
    displayFinancialStatus: 'PAID',
    fulfillments: { nodes: [{ deliveredAt: new Date(Date.now() - 2 * 86400000).toISOString() }] }
  };
  const deliveryPolicy = orderEligibility(order, { warrantyDays: 365, returnWindowDays: 7, returnWindowBasis: 'delivery' });
  const purchasePolicy = orderEligibility(order, { warrantyDays: 365, returnWindowDays: 7, returnWindowBasis: 'purchase' });
  assert.equal(deliveryPolicy.returnEligible, true);
  assert.equal(deliveryPolicy.returnWindowBasis, 'delivery');
  assert.equal(purchasePolicy.returnEligible, false);
  assert.equal(purchasePolicy.returnWindowBasis, 'purchase');
});

test('old paid order has expired warranty and return window', () => {
  const result = orderEligibility({
    processedAt: new Date(Date.now() - 400 * 86400000).toISOString(),
    displayFinancialStatus: 'PAID'
  });
  assert.equal(result.warrantyStatus, 'Expired');
  assert.equal(result.remainingDays, 0);
  assert.equal(result.returnEligible, false);
});

test('invalid order date is rejected as an upstream data error', () => {
  assert.throws(
    () => orderEligibility({ processedAt: 'not-a-date', displayFinancialStatus: 'PAID' }),
    (error) => error.status === 502 && /date/i.test(error.message)
  );
});

test('development proxy verification allows unsigned local requests', () => {
  assert.equal(verifyShopifyProxy({ query: {} }), true);
});

test('public product selector is opaque and resolves only for the verified order and email', () => {
  const item = { id: 'gid://shopify/LineItem/123', name: 'Grooves Alpha' };
  const order = { id: 'gid://shopify/Order/456', lineItems: { nodes: [item] } };
  const selector = secureProductSelector(order, item, 'customer@example.com');
  assert.equal(selector.length, 64);
  assert.equal(selector.includes('123'), false);
  assert.equal(getOrderLineItem(order, selector, 'customer@example.com'), item);
  assert.equal(getOrderLineItem(order, selector, 'different@example.com'), null);
});

test('stored active registration is presented as expired after its end date', () => {
  const result = publicWarranty({
    warrantyId: 'GRV-WTY-2026-000001',
    orderNumber: '#1001',
    product: 'Grooves Alpha',
    sku: 'ALPHA',
    status: 'Active',
    purchaseDate: '2025-01-01T00:00:00.000Z',
    expiresAt: '2025-12-31T00:00:00.000Z',
    registeredAt: '2025-01-02T00:00:00.000Z'
  });
  assert.equal(result.status, 'Expired');
  assert.equal(result.remainingDays, 0);
});
