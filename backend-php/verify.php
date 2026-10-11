<?php
/**
 * Grooves Order Verification Endpoint
 * 
 * Implements Shopify 2026 OAuth (client_credentials grant flow)
 * and verifies order ownership matching order number and checkout email.
 *
 * File Location: public_html/verify.php
 * Endpoint URL:  https://your-backend-domain.com/api/verify or /verify.php
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');

// ==============================================================================
// 1. CORS Headers (Allows requests from your Shopify storefront)
// ==============================================================================
$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header("Access-Control-Allow-Origin: {$origin}");
header('Access-Control-Allow-Credentials: true');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept, X-Requested-With, X-HTTP-Method-Override');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json; charset=utf-8');

// Immediately exit on browser preflight OPTIONS request
if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}

// Helper: send JSON and exit
function jsonOut(array $data, int $statusCode = 200): void {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// ==============================================================================
// 2. Read Configuration
// ==============================================================================
$configFile = __DIR__ . '/config.php';
if (!file_exists($configFile)) {
    jsonOut(['success' => false, 'error' => 'Configuration file config.php not found.'], 500);
}

$config = require $configFile;

$storeDomain   = trim((string)($config['SHOPIFY_STORE_DOMAIN'] ?? ''));
$clientId      = trim((string)($config['SHOPIFY_CLIENT_ID'] ?? ''));
$clientSecret  = trim((string)($config['SHOPIFY_CLIENT_SECRET'] ?? ''));
$apiVersion    = trim((string)($config['SHOPIFY_API_VERSION'] ?? '2026-10'));
$warrantyDays  = (int)($config['DEFAULT_WARRANTY_DAYS'] ?? 365);
$returnDays    = (int)($config['DEFAULT_RETURN_WINDOW_DAYS'] ?? 7);
$returnBasis   = ($config['DEFAULT_RETURN_WINDOW_BASIS'] ?? '') === 'purchase' ? 'purchase' : 'delivery';

if (empty($storeDomain) || empty($clientId) || empty($clientSecret)) {
    jsonOut(['success' => false, 'error' => 'Shopify credentials not properly configured in config.php.'], 500);
}

// ==============================================================================
// 3. Parse Frontend Request Payload (Supports order_number and email)
// ==============================================================================
$rawInput = file_get_contents('php://input');
$payload = [];
if (!empty($rawInput)) {
    $decoded = json_decode($rawInput, true);
    if (is_array($decoded)) {
        $payload = $decoded;
    }
}
if (empty($payload)) {
    $payload = $_POST;
}

// Read input fields with fallbacks for frontend naming conventions
$orderInput = trim((string)(
    $payload['order_number'] 
    ?? $payload['orderNumber'] 
    ?? $payload['reference'] 
    ?? $payload['order_id'] 
    ?? $payload['orderId'] 
    ?? $payload['invoice'] 
    ?? ''
));

$emailInput = strtolower(trim((string)(
    $payload['email'] 
    ?? $payload['customer_email'] 
    ?? $payload['customerEmail'] 
    ?? ''
)));

// Validate inputs
if (empty($orderInput) || empty($emailInput) || !filter_var($emailInput, FILTER_VALIDATE_EMAIL)) {
    jsonOut([
        'success' => false,
        'error'   => 'Please provide a valid Order Number and checkout email.'
    ], 400);
}

$cleanOrderNumber = strtoupper(ltrim($orderInput, '#'));

// ==============================================================================
// 4. Token Generation: Client Credentials Grant Flow (Shopify 2026)
// ==============================================================================
function getShopifyAccessToken(string $storeDomain, string $clientId, string $clientSecret): string {
    // Check cached token (file cache fallback ensures zero external bottlenecks)
    $cacheFile = sys_get_temp_dir() . '/shopify_token_' . md5($storeDomain . $clientId) . '.json';
    if (file_exists($cacheFile)) {
        $cached = json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($cached) && !empty($cached['token']) && (($cached['expires_at'] ?? 0) - time()) > 300) {
            return (string)$cached['token'];
        }
    }

    $oauthUrl = "https://{$storeDomain}/admin/oauth/access_token";
    $bodyData = http_build_query([
        'grant_type'    => 'client_credentials',
        'client_id'     => $clientId,
        'client_secret' => $clientSecret,
    ]);

    $ch = curl_init($oauthUrl);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => $bodyData,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/x-www-form-urlencoded',
            'Accept: application/json',
            'User-Agent: Grooves-Shopify-Backend/1.0',
        ],
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($response === false || $httpCode < 200 || $httpCode >= 300) {
        error_log("Shopify token exchange failed [HTTP {$httpCode}]: " . ($curlErr ?: $response));
        throw new Exception('Shopify authentication failed. Please verify Client ID and Secret in config.php.');
    }

    $respData = json_decode((string)$response, true);
    if (!is_array($respData) || empty($respData['access_token'])) {
        $msg = $respData['error_description'] ?? $respData['error'] ?? 'Unknown token error';
        throw new Exception("Shopify token generation error: {$msg}");
    }

    $token = (string)$respData['access_token'];
    $expiresIn = isset($respData['expires_in']) ? (int)$respData['expires_in'] : 86399;

    // Cache the token
    @file_put_contents($cacheFile, json_encode([
        'token'      => $token,
        'expires_at' => time() + $expiresIn,
    ]));

    return $token;
}

try {
    $accessToken = getShopifyAccessToken($storeDomain, $clientId, $clientSecret);
} catch (Exception $e) {
    jsonOut(['success' => false, 'error' => $e->getMessage()], 502);
}

// ==============================================================================
// 5. Query Shopify Admin API to Find & Verify the Order
// ==============================================================================
function queryShopifyGraphql(string $storeDomain, string $apiVersion, string $token, string $query, array $variables = []): array {
    $endpoint = "https://{$storeDomain}/admin/api/{$apiVersion}/graphql.json";

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => json_encode(['query' => $query, 'variables' => $variables]),
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'Accept: application/json',
            'X-Shopify-Access-Token: ' . $token,
            'User-Agent: Grooves-Shopify-Backend/1.0',
        ],
        CURLOPT_TIMEOUT        => 15,
        CURLOPT_SSL_VERIFYPEER => true,
    ]);

    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr  = curl_error($ch);
    curl_close($ch);

    if ($response === false || $httpCode < 200 || $httpCode >= 300) {
        error_log("Shopify GraphQL error [HTTP {$httpCode}]: " . ($curlErr ?: $response));
        throw new Exception('Shopify order service is currently unavailable.');
    }

    $data = json_decode((string)$response, true);
    if (!is_array($data) || !empty($data['errors'])) {
        error_log('Shopify GraphQL errors: ' . json_encode($data['errors'] ?? []));
        throw new Exception('Shopify order lookup failed.');
    }

    return $data['data'] ?? [];
}

$graphqlQuery = <<<'GRAPHQL'
query FindCustomerOrder($query: String!) {
  orders(first: 10, query: $query, sortKey: PROCESSED_AT, reverse: true) {
    nodes {
      id
      name
      confirmationNumber
      processedAt
      displayFinancialStatus
      displayFulfillmentStatus
      email
      test
      customer {
        id
        email
        displayName
      }
      currentTotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      fulfillments(first: 20) {
        deliveredAt
      }
      lineItems(first: 50) {
        nodes {
          id
          name
          title
          quantity
          sku
          variant {
            id
            title
            product {
              id
              handle
            }
          }
        }
      }
    }
  }
}
GRAPHQL;

// Build search queries: Try exact name with '#', without '#', and fallback to customer email
$searchQueries = [
    "name:\"#{$cleanOrderNumber}\"",
    "name:\"{$cleanOrderNumber}\"",
    "name:{$cleanOrderNumber}",
    "email:\"{$emailInput}\""
];

$matchedOrder = null;

try {
    foreach (array_unique($searchQueries) as $search) {
        $result = queryShopifyGraphql($storeDomain, $apiVersion, $accessToken, $graphqlQuery, ['query' => $search]);
        $orders = $result['orders']['nodes'] ?? [];

        foreach ($orders as $order) {
            $orderNameClean = strtoupper(ltrim((string)($order['name'] ?? ''), '#'));
            $confirmClean   = strtoupper(trim((string)($order['confirmationNumber'] ?? '')));
            
            // Check if order number matches
            $matchesOrder = ($orderNameClean === $cleanOrderNumber) || ($confirmClean === $cleanOrderNumber);

            // Check if email matches (checks both order.email and customer.email)
            $orderEmail    = strtolower(trim((string)($order['email'] ?? '')));
            $customerEmail = strtolower(trim((string)($order['customer']['email'] ?? '')));
            $matchesEmail  = ($orderEmail === $emailInput) || ($customerEmail === $emailInput);

            if ($matchesOrder && $matchesEmail) {
                $matchedOrder = $order;
                break 2;
            }
        }
    }
} catch (Exception $e) {
    jsonOut(['success' => false, 'error' => $e->getMessage()], 502);
}

// Order not found or email does not match
if (!$matchedOrder) {
    jsonOut([
        'success' => false,
        'error'   => 'No data found.',
        'message' => 'No matching Shopify order found for the provided order number and checkout email.'
    ], 404);
}

// ==============================================================================
// 6. Calculate Warranty & Return Eligibility
// ==============================================================================
$processedAt = $matchedOrder['processedAt'] ?? '';
$purchaseTs  = strtotime($processedAt);
if ($purchaseTs === false) {
    $purchaseTs = time();
}

// Determine delivery date
$deliveredDates = [];
foreach ($matchedOrder['fulfillments'] ?? [] as $f) {
    if (!empty($f['deliveredAt'])) {
        $dTs = strtotime($f['deliveredAt']);
        if ($dTs !== false) $deliveredDates[] = $dTs;
    }
}
$deliveredAtTs = !empty($deliveredDates) ? max($deliveredDates) : null;
$returnStartsAtTs = ($returnBasis === 'delivery' && $deliveredAtTs !== null) ? $deliveredAtTs : $purchaseTs;

$warrantyExpiresAtTs = $purchaseTs + ($warrantyDays * 86400);
$returnExpiresAtTs   = $returnStartsAtTs + ($returnDays * 86400);
$now = time();

$remainingDays       = max(0, (int)ceil(($warrantyExpiresAtTs - $now) / 86400));
$returnDaysRemaining = max(0, (int)ceil(($returnExpiresAtTs - $now) / 86400));

$financialStatus = (string)($matchedOrder['displayFinancialStatus'] ?? '');
$disqualified    = in_array($financialStatus, ['REFUNDED', 'VOIDED', 'EXPIRED'], true);

$warrantyStatus  = $disqualified ? 'Not eligible' : ($remainingDays > 0 ? 'Active' : 'Expired');
$returnEligible  = !$disqualified && ($returnDaysRemaining > 0);

// ==============================================================================
// 7. Format Purchased Products List
// ==============================================================================
$items = [];
$lineItemNodes = $matchedOrder['lineItems']['nodes'] ?? [];

foreach ($lineItemNodes as $node) {
    // Create tamper-proof HMAC selector token for line item
    $tokenSecret = $clientSecret;
    $selectorPayload = ($matchedOrder['id'] ?? '') . "\0" . ($node['id'] ?? '') . "\0" . $emailInput;
    $selectorId = hash_hmac('sha256', $selectorPayload, $tokenSecret);

    $items[] = [
        'lineItemId'    => $selectorId,
        'id'            => (string)($node['id'] ?? ''),
        'title'         => (string)($node['name'] ?? $node['title'] ?? ''),
        'name'          => (string)($node['name'] ?? $node['title'] ?? ''),
        'quantity'      => (int)($node['quantity'] ?? 1),
        'sku'           => (string)($node['sku'] ?? ''),
        'variantTitle'  => (string)($node['variant']['title'] ?? ''),
        'productHandle' => (string)($node['variant']['product']['handle'] ?? ''),
        'registered'    => false,
        'warrantyId'    => '',
    ];
}

// Check database for any already registered warranties if DB is configured
try {
    if (file_exists(__DIR__ . '/db.php')) {
        require_once __DIR__ . '/db.php';
        $pdo = Database::getConnection($config);
        $stmt = $pdo->prepare('SELECT line_item_id, warranty_id FROM warranties WHERE order_id = :orderId AND LOWER(email) = :email AND status != "Cancelled"');
        $stmt->execute([':orderId' => (string)$matchedOrder['id'], ':email' => $emailInput]);
        $existingWarranties = $stmt->fetchAll(PDO::FETCH_KEY_PAIR);

        if (!empty($existingWarranties)) {
            foreach ($items as &$item) {
                if (isset($existingWarranties[$item['id']])) {
                    $item['registered'] = true;
                    $item['warrantyId'] = $existingWarranties[$item['id']];
                }
            }
            unset($item);
        }
    }
} catch (Throwable $e) {
    // Database check is optional; gracefully continue if DB is temporarily unreachable
}

// ==============================================================================
// 8. Output Complete JSON Response (Unlocks the Frontend Form)
// ==============================================================================
$responsePayload = [
    'success'              => true,
    'lookupType'           => 'order',
    'status'               => $warrantyStatus,
    'orderNumber'          => (string)($matchedOrder['name'] ?? "#{$cleanOrderNumber}"),
    'verifiedEmail'        => $emailInput,
    'purchaseDate'         => gmdate('Y-m-d\TH:i:s\Z', $purchaseTs),
    'durationDays'         => $warrantyDays,
    'remainingDays'        => $disqualified ? 0 : $remainingDays,
    'expiresAt'            => gmdate('Y-m-d\TH:i:s\Z', $warrantyExpiresAtTs),
    'returnWindowDays'     => $returnDays,
    'returnWindowBasis'    => ($returnBasis === 'delivery' && $deliveredAtTs !== null) ? 'delivery' : 'purchase',
    'returnStartsAt'       => gmdate('Y-m-d\TH:i:s\Z', $returnStartsAtTs),
    'returnDaysRemaining'  => $disqualified ? 0 : $returnDaysRemaining,
    'returnEligible'       => $returnEligible,
    'financialStatus'      => $financialStatus,
    'fulfillmentStatus'    => (string)($matchedOrder['displayFulfillmentStatus'] ?? ''),
    'testOrder'            => (bool)($matchedOrder['test'] ?? false),
    'total'                => $matchedOrder['currentTotalPriceSet']['shopMoney'] ?? null,
    'items'                => $items,
    'products'             => $items, // Alias for theme scripts expecting `products`
];

jsonOut($responsePayload, 200);
