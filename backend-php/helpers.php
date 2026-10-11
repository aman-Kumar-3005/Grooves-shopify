<?php
/**
 * Grooves Support Backend Helpers & Security Utilities
 */

declare(strict_types=1);

class ServiceException extends Exception
{
    private int $statusCode;

    public function __construct(int $statusCode, string $message)
    {
        parent::__construct($message);
        $this->statusCode = $statusCode;
    }

    public function getStatusCode(): int
    {
        return $this->statusCode;
    }
}

/**
 * Return current ISO-8601 UTC timestamp string.
 */
function nowIso(): string
{
    return gmdate('Y-m-d\TH:i:s\Z');
}

/**
 * Convert any date string / timestamp to ISO-8601 UTC.
 */
function isoDate(?string $value): string
{
    if (empty($value)) {
        return '';
    }
    $ts = strtotime($value . ' UTC');
    if ($ts === false) {
        $ts = strtotime($value);
    }
    return $ts !== false ? gmdate('Y-m-d\TH:i:s\Z', $ts) : $value;
}

/**
 * Format string as safe MySQL DATETIME (UTC).
 */
function toMysqlDateTime(?string $value): string
{
    if (empty($value)) {
        return gmdate('Y-m-d H:i:s');
    }
    $ts = strtotime($value);
    return $ts !== false ? gmdate('Y-m-d H:i:s', $ts) : gmdate('Y-m-d H:i:s');
}

/**
 * Standard HTTP JSON Response helper.
 */
function sendJsonResponse(mixed $data, int $statusCode = 200): void
{
    http_response_code($statusCode);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * Standard HTTP Error Response helper.
 */
function sendErrorResponse(string $message, int $statusCode = 400): void
{
    sendJsonResponse(['error' => $message], $statusCode);
}

/**
 * Handle CORS headers and OPTIONS preflight requests.
 */
function handleCors(): void
{
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, OPTIONS, PATCH');
    header('Access-Control-Allow-Headers: Content-Type, Authorization, Accept, X-Requested-With, X-HTTP-Method-Override');
    header('Access-Control-Max-Age: 86400');

    if (strtoupper($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Apply security and caching headers to every response.
 */
function setSecurityHeaders(): void
{
    handleCors();
    header('Cache-Control: no-store, max-age=0');
    header('X-Content-Type-Options: nosniff');
}

/**
 * Extract Bearer token from authorization headers across various server SAPIs.
 */
function getBearerToken(): string
{
    $header = '';
    if (!empty($_SERVER['HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['HTTP_AUTHORIZATION'];
    } elseif (!empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) {
        $header = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    } elseif (function_exists('apache_request_headers')) {
        $headers = apache_request_headers();
        if (!empty($headers['Authorization'])) {
            $header = $headers['Authorization'];
        } elseif (!empty($headers['authorization'])) {
            $header = $headers['authorization'];
        }
    }

    if (preg_match('/Bearer\s+(\S+)/i', $header, $matches)) {
        return $matches[1];
    }
    return '';
}

/**
 * Guard private staff console endpoints.
 */
function requireAdmin(array $config): void
{
    $adminKey = trim((string)($config['SUPPORT_ADMIN_KEY'] ?? ''));
    if (empty($adminKey)) {
        sendErrorResponse('Admin API is not configured.', 503);
    }

    $supplied = getBearerToken();
    if (empty($supplied) || !hash_equals($adminKey, $supplied)) {
        sendErrorResponse('Unauthorized.', 401);
    }
}

/**
 * Verify Shopify App Proxy request HMAC signature.
 */
function verifyShopifyProxy(array $query, array $config): bool
{
    $isProd = ($config['APP_ENV'] ?? 'production') === 'production';
    if (!$isProd && empty($query['signature'])) {
        return true;
    }

    $secret = trim((string)($config['SHOPIFY_CLIENT_SECRET'] ?: ($config['SHOPIFY_API_SECRET'] ?? '')));
    if (empty($secret) || empty($query['signature']) || !is_string($query['signature'])) {
        return false;
    }

    $timestamp = isset($query['timestamp']) ? (int)$query['timestamp'] : 0;
    if ($timestamp <= 0 || abs(time() - $timestamp) > 300) {
        return false;
    }

    $supplied = (string)$query['signature'];
    $cleanQuery = $query;
    unset($cleanQuery['signature']);

    ksort($cleanQuery);
    $parts = [];
    foreach ($cleanQuery as $key => $val) {
        if (is_array($val)) {
            $parts[] = $key . '=' . implode(',', $val);
        } else {
            $parts[] = $key . '=' . (string)$val;
        }
    }

    $message = implode('', $parts);
    $expected = hash_hmac('sha256', $message, $secret);

    return hash_equals($expected, $supplied);
}

/**
 * Guard Shopify proxy routes.
 */
function requireProxy(array $query, array $config, array $settings): void
{
    if (!verifyShopifyProxy($query, $config)) {
        sendErrorResponse('Unauthorized request.', 403);
    }

    $proxyShop = strtolower(trim((string)($query['shop'] ?? '')));
    $configuredShop = strtolower(trim((string)($settings['shopifyStoreDomain'] ?? '')));

    if (!empty($proxyShop) && !empty($configuredShop) && $proxyShop !== $configuredShop) {
        sendErrorResponse('Store mismatch.', 403);
    }
}

/**
 * Retrieve client IP address.
 */
function getClientIp(): string
{
    if (!empty($_SERVER['HTTP_CF_CONNECTING_IP'])) {
        return trim($_SERVER['HTTP_CF_CONNECTING_IP']);
    }
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($parts[0]);
    }
    return $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
}

/**
 * Rate limit requests per IP address using MySQL storage.
 */
function rateLimit(PDO $pdo, array $config): void
{
    $ip = getClientIp();
    $maxLookups = (int)($config['MAX_LOOKUPS_PER_WINDOW'] ?? 20);
    $windowSeconds = (int)($config['RATE_WINDOW_MINUTES'] ?? 15) * 60;
    $now = time();

    // Clean up expired buckets opportunistically (1% chance)
    if (random_int(1, 100) === 1) {
        try {
            $cleanup = $pdo->prepare('DELETE FROM rate_limits WHERE window_start < :cutoff');
            $cleanup->execute([':cutoff' => $now - ($windowSeconds * 2)]);
        } catch (Throwable $e) {
            // Non-fatal
        }
    }

    try {
        $stmt = $pdo->prepare('SELECT request_count, window_start FROM rate_limits WHERE ip_address = :ip');
        $stmt->execute([':ip' => $ip]);
        $row = $stmt->fetch();

        if (!$row || ($now - (int)$row['window_start']) >= $windowSeconds) {
            $insert = $pdo->prepare('
                INSERT INTO rate_limits (ip_address, request_count, window_start)
                VALUES (:ip, 1, :now)
                ON DUPLICATE KEY UPDATE request_count = 1, window_start = :now2
            ');
            $insert->execute([':ip' => $ip, ':now' => $now, ':now2' => $now]);
            return;
        }

        if ((int)$row['request_count'] >= $maxLookups) {
            sendErrorResponse('Too many attempts. Please try again later.', 429);
        }

        $update = $pdo->prepare('UPDATE rate_limits SET request_count = request_count + 1 WHERE ip_address = :ip');
        $update->execute([':ip' => $ip]);
    } catch (Throwable $e) {
        error_log('Rate limiting check failed: ' . $e->getMessage());
    }
}

/**
 * Normalization utilities
 */
function normalizeOrderReference(?string $value): string
{
    return strtoupper(ltrim(trim((string)$value), '#'));
}

function normalizeEmail(?string $value): string
{
    return strtolower(trim((string)$value));
}

function normalizePhone(?string $value): string
{
    return preg_replace('/\D/', '', (string)$value);
}

function phoneMatches(?string $left, ?string $right): bool
{
    $a = normalizePhone($left);
    $b = normalizePhone($right);
    if (empty($a) || empty($b)) {
        return false;
    }
    return ($a === $b) || (strlen($a) >= 10 && strlen($b) >= 10 && substr($a, -10) === substr($b, -10));
}

function validEmail(?string $value): bool
{
    return (bool)filter_var((string)$value, FILTER_VALIDATE_EMAIL);
}

function graphqlSearchValue(string $value): string
{
    return (string)preg_replace('/[^a-zA-Z0-9@._+\-]/', '', $value);
}

function buildOrderSearchQueries(string $orderReference, string $email): array
{
    $name = graphqlSearchValue(normalizeOrderReference($orderReference));
    $exactEmail = graphqlSearchValue(normalizeEmail($email));
    return [
        "name:\"#{$name}\" email:\"{$exactEmail}\"",
        "name:{$name} email:\"{$exactEmail}\"",
        "name:\"#{$name}\"",
        "name:{$name}",
        "email:\"{$exactEmail}\"",
    ];
}

/**
 * Secret product selector hash for verifying line item selection.
 */
function secureProductSelector(array $order, array $item, string $email, array $config): string
{
    $secret = trim((string)($config['SHOPIFY_CLIENT_SECRET'] ?: ($config['SUPPORT_ADMIN_KEY'] ?: ($config['SHOPIFY_ADMIN_ACCESS_TOKEN'] ?? ''))));
    $orderId = (string)($order['id'] ?? '');
    $itemId = (string)($item['id'] ?? '');
    $normEmail = normalizeEmail($email);

    $payload = "{$orderId}\0{$itemId}\0{$normEmail}";
    return hash_hmac('sha256', $payload, $secret);
}

function safeTokenEqual(string $left, string $right): bool
{
    if ($left === '' || $right === '') {
        return false;
    }
    return hash_equals($left, $right);
}

function publicLineItem(array $item, array $order, string $email, array $config): array
{
    return [
        'lineItemId'    => secureProductSelector($order, $item, $email, $config),
        'title'         => (string)($item['name'] ?? $item['title'] ?? ''),
        'quantity'      => (int)($item['quantity'] ?? 1),
        'sku'           => (string)($item['sku'] ?? ''),
        'variantTitle'  => (string)($item['variant']['title'] ?? ''),
        'productHandle' => (string)($item['variant']['product']['handle'] ?? ''),
    ];
}

/**
 * Match a specific line item in a verified Shopify order.
 */
function getOrderLineItem(array $order, string $lineItemId, string $email, ?string $productFallback, array $config): ?array
{
    $items = $order['lineItems']['nodes'] ?? [];
    foreach ($items as $item) {
        if (safeTokenEqual(secureProductSelector($order, $item, $email, $config), $lineItemId)) {
            return $item;
        }
    }

    $normalizedProduct = strtolower(trim((string)$productFallback));
    if (!empty($normalizedProduct)) {
        foreach ($items as $item) {
            $name = strtolower(trim((string)($item['name'] ?? $item['title'] ?? '')));
            if ($name === $normalizedProduct) {
                return $item;
            }
        }
    }

    return null;
}

/**
 * Calculate warranty balance and return window eligibility.
 */
function orderEligibility(array $order, array $settings): array
{
    $processedAt = $order['processedAt'] ?? '';
    $purchaseTs = strtotime($processedAt);
    if ($purchaseTs === false) {
        throw new ServiceException(502, 'Order date is unavailable.');
    }

    $deliveredDates = [];
    foreach ($order['fulfillments'] ?? [] as $fulfillment) {
        if (!empty($fulfillment['deliveredAt'])) {
            $dTs = strtotime($fulfillment['deliveredAt']);
            if ($dTs !== false) {
                $deliveredDates[] = $dTs;
            }
        }
    }

    $deliveredAtTs = !empty($deliveredDates) ? max($deliveredDates) : null;
    $returnBasis = $settings['returnWindowBasis'] ?? 'delivery';
    $returnStartsAtTs = ($returnBasis === 'delivery' && $deliveredAtTs !== null) ? $deliveredAtTs : $purchaseTs;

    $warrantyDays = (int)($settings['warrantyDays'] ?? 365);
    $returnWindowDays = (int)($settings['returnWindowDays'] ?? 7);

    $warrantyExpiresAtTs = $purchaseTs + ($warrantyDays * 86400);
    $returnExpiresAtTs = $returnStartsAtTs + ($returnWindowDays * 86400);
    $now = time();

    $remainingDays = max(0, (int)ceil(($warrantyExpiresAtTs - $now) / 86400));
    $returnDaysRemaining = max(0, (int)ceil(($returnExpiresAtTs - $now) / 86400));

    $financialStatus = (string)($order['displayFinancialStatus'] ?? '');
    $disqualified = in_array($financialStatus, ['REFUNDED', 'VOIDED', 'EXPIRED'], true);

    return [
        'purchase'            => gmdate('Y-m-d\TH:i:s\Z', $purchaseTs),
        'warrantyExpiresAt'   => gmdate('Y-m-d\TH:i:s\Z', $warrantyExpiresAtTs),
        'returnExpiresAt'     => gmdate('Y-m-d\TH:i:s\Z', $returnExpiresAtTs),
        'returnStartsAt'      => gmdate('Y-m-d\TH:i:s\Z', $returnStartsAtTs),
        'returnWindowBasis'   => ($returnBasis === 'delivery' && $deliveredAtTs !== null) ? 'delivery' : 'purchase',
        'remainingDays'       => $disqualified ? 0 : $remainingDays,
        'returnDaysRemaining' => $disqualified ? 0 : $returnDaysRemaining,
        'warrantyStatus'      => $disqualified ? 'Not eligible' : ($remainingDays > 0 ? 'Active' : 'Expired'),
        'returnEligible'      => !$disqualified && ($returnDaysRemaining > 0),
        'disqualified'        => $disqualified,
    ];
}

/**
 * Format public warranty registration object.
 */
function publicWarranty(array $reg): array
{
    $expiresAtStr = $reg['expires_at'] ?? $reg['expiresAt'] ?? '';
    $expiresTs = strtotime($expiresAtStr);
    $remainingDays = $expiresTs !== false ? max(0, (int)ceil(($expiresTs - time()) / 86400)) : 0;

    $status = ($reg['status'] ?? '') === 'Cancelled'
        ? 'Cancelled'
        : ($remainingDays > 0 ? 'Active' : 'Expired');

    return [
        'warrantyId'    => (string)($reg['warranty_id'] ?? $reg['warrantyId'] ?? ''),
        'orderNumber'   => (string)($reg['order_number'] ?? $reg['orderNumber'] ?? ''),
        'product'       => (string)($reg['product'] ?? ''),
        'sku'           => (string)($reg['sku'] ?? ''),
        'status'        => $status,
        'purchaseDate'  => isoDate($reg['purchase_date'] ?? $reg['purchaseDate'] ?? ''),
        'expiresAt'     => isoDate($expiresAtStr),
        'remainingDays' => $remainingDays,
        'registeredAt'  => isoDate($reg['registered_at'] ?? $reg['registeredAt'] ?? ''),
    ];
}

/**
 * Format public ticket object for customer tracking.
 */
function publicTicket(array $ticket): array
{
    $timeline = [];
    $rawTimeline = $ticket['timeline'] ?? [];
    if (is_string($rawTimeline)) {
        $rawTimeline = json_decode($rawTimeline, true) ?: [];
    }

    foreach ($rawTimeline as $entry) {
        if (($entry['public'] ?? true) !== false) {
            $timeline[] = [
                'status' => (string)($entry['status'] ?? ''),
                'note'   => (string)($entry['note'] ?? ''),
                'at'     => (string)($entry['at'] ?? ''),
            ];
        }
    }

    return [
        'ticketNumber' => (string)($ticket['ticket_number'] ?? $ticket['ticketNumber'] ?? ''),
        'requestType'  => (string)($ticket['request_type'] ?? $ticket['requestType'] ?? ''),
        'warrantyId'   => (string)($ticket['warranty_id'] ?? $ticket['warrantyId'] ?? ''),
        'orderNumber'  => (string)($ticket['invoice'] ?? ''),
        'product'      => (string)($ticket['product'] ?? ''),
        'category'     => (string)($ticket['category'] ?? ''),
        'status'       => (string)($ticket['status'] ?? ''),
        'createdAt'    => isoDate($ticket['created_at'] ?? $ticket['createdAt'] ?? ''),
        'updatedAt'    => isoDate($ticket['updated_at'] ?? $ticket['updatedAt'] ?? ''),
        'notes'        => (string)($ticket['notes'] ?? ''),
        'timeline'     => $timeline,
    ];
}

/**
 * Format complete order status with line-item warranty status.
 */
function warrantyFromOrder(array $order, string $email, PDO $pdo, array $settings, array $config): array
{
    $eligibility = orderEligibility($order, $settings);
    $lineItems = $order['lineItems']['nodes'] ?? [];
    $items = [];

    foreach ($lineItems as $item) {
        $reg = findWarrantyForLine($pdo, (string)$order['id'], (string)$item['id'], $email);
        $pubItem = publicLineItem($item, $order, $email, $config);

        $items[] = array_merge($pubItem, [
            'warrantyId'   => (string)($reg['warranty_id'] ?? ''),
            'registered'   => !empty($reg),
            'registeredAt' => !empty($reg['registered_at']) ? isoDate($reg['registered_at']) : '',
        ]);
    }

    return [
        'status'              => $eligibility['warrantyStatus'],
        'orderNumber'         => (string)($order['name'] ?? ''),
        'purchaseDate'        => (string)($order['processedAt'] ?? ''),
        'durationDays'        => (int)($settings['warrantyDays'] ?? 365),
        'remainingDays'       => $eligibility['remainingDays'],
        'expiresAt'           => $eligibility['warrantyExpiresAt'],
        'returnWindowDays'    => (int)($settings['returnWindowDays'] ?? 7),
        'returnWindowBasis'   => $eligibility['returnWindowBasis'],
        'returnStartsAt'      => $eligibility['returnStartsAt'],
        'returnDaysRemaining' => $eligibility['returnDaysRemaining'],
        'returnEligible'      => $eligibility['returnEligible'],
        'financialStatus'     => (string)($order['displayFinancialStatus'] ?? ''),
        'fulfillmentStatus'   => (string)($order['displayFulfillmentStatus'] ?? ''),
        'testOrder'           => (bool)($order['test'] ?? false),
        'total'               => $order['currentTotalPriceSet']['shopMoney'] ?? null,
        'items'               => $items,
    ];
}

/**
 * Load store and policy settings from MySQL.
 */
function loadSettings(PDO $pdo, array $config): array
{
    $defaultDomain = strtolower(trim((string)($config['SHOPIFY_STORE_DOMAIN'] ?? '')));
    $defaultWarrantyDays = (int)($config['DEFAULT_WARRANTY_DAYS'] ?? 365);
    $defaultReturnWindowDays = (int)($config['DEFAULT_RETURN_WINDOW_DAYS'] ?? 7);
    $defaultReturnWindowBasis = ($config['DEFAULT_RETURN_WINDOW_BASIS'] ?? '') === 'purchase' ? 'purchase' : 'delivery';

    try {
        $stmt = $pdo->query('SELECT * FROM settings WHERE id = 1 LIMIT 1');
        $row = $stmt->fetch();

        if ($row) {
            return [
                'shopifyStoreDomain' => !empty($row['shopify_store_domain']) ? strtolower(trim($row['shopify_store_domain'])) : $defaultDomain,
                'warrantyDays'       => (int)($row['warranty_days'] ?: $defaultWarrantyDays),
                'returnWindowDays'   => (int)($row['return_window_days'] ?: $defaultReturnWindowDays),
                'returnWindowBasis'  => in_array($row['return_window_basis'], ['purchase', 'delivery'], true) ? $row['return_window_basis'] : $defaultReturnWindowBasis,
                'updatedAt'          => !empty($row['updated_at']) ? isoDate($row['updated_at']) : null,
            ];
        }

        // Initialize row if empty
        $insert = $pdo->prepare('
            INSERT INTO settings (id, shopify_store_domain, warranty_days, return_window_days, return_window_basis, updated_at)
            VALUES (1, :domain, :wDays, :rDays, :rBasis, UTC_TIMESTAMP())
        ');
        $insert->execute([
            ':domain' => $defaultDomain,
            ':wDays'  => $defaultWarrantyDays,
            ':rDays'  => $defaultReturnWindowDays,
            ':rBasis' => $defaultReturnWindowBasis,
        ]);
    } catch (Throwable $e) {
        error_log('Failed reading settings table: ' . $e->getMessage());
    }

    return [
        'shopifyStoreDomain' => $defaultDomain,
        'warrantyDays'       => $defaultWarrantyDays,
        'returnWindowDays'   => $defaultReturnWindowDays,
        'returnWindowBasis'  => $defaultReturnWindowBasis,
        'updatedAt'          => null,
    ];
}

/**
 * Fetch existing active warranty for line item.
 */
function findWarrantyForLine(PDO $pdo, string $orderId, string $lineItemId, string $email): ?array
{
    $stmt = $pdo->prepare('
        SELECT * FROM warranties 
        WHERE order_id = :orderId 
          AND line_item_id = :lineItemId 
          AND LOWER(email) = :email 
          AND status != "Cancelled" 
        LIMIT 1
    ');
    $stmt->execute([
        ':orderId'    => $orderId,
        ':lineItemId' => $lineItemId,
        ':email'      => normalizeEmail($email),
    ]);
    $row = $stmt->fetch();
    return $row ?: null;
}

/**
 * Get next atomic sequence number from MySQL sequences table.
 */
function getNextSequence(PDO $pdo, string $name): int
{
    $stmt = $pdo->prepare('
        INSERT INTO sequences (name, current_value) 
        VALUES (:name, 1) 
        ON DUPLICATE KEY UPDATE current_value = LAST_INSERT_ID(current_value + 1)
    ');
    $stmt->execute([':name' => $name]);
    return (int)$pdo->lastInsertId();
}

/**
 * Register a new warranty or retrieve an existing one.
 */
function createWarrantyRegistration(PDO $pdo, array $order, array $lineItem, array $customer, array $settings, array $config): array
{
    $existing = findWarrantyForLine($pdo, (string)$order['id'], (string)$lineItem['id'], $customer['email']);
    if ($existing) {
        return ['registration' => $existing, 'created' => false];
    }

    $eligibility = orderEligibility($order, $settings);
    if ($eligibility['disqualified']) {
        throw new ServiceException(409, 'This order is not eligible for warranty registration.');
    }
    if ($eligibility['remainingDays'] <= 0) {
        throw new ServiceException(409, 'Warranty coverage for this order has expired.');
    }

    $sequence = getNextSequence($pdo, 'warranty');
    $year = date('Y');
    $warrantyId = sprintf('GRV-WTY-%s-%06d', $year, $sequence);
    $nowIso = nowIso();
    $nowMysql = toMysqlDateTime($nowIso);

    $productName = (string)($lineItem['name'] ?? $lineItem['title'] ?? '');
    $sku = (string)($lineItem['sku'] ?? '');
    $status = $eligibility['remainingDays'] > 0 ? 'Active' : 'Expired';

    $stmt = $pdo->prepare('
        INSERT INTO warranties (
            warranty_id, order_id, order_number, line_item_id, product, sku,
            name, email, phone, serial_number, status, purchase_date, expires_at, registered_at, updated_at
        ) VALUES (
            :warranty_id, :order_id, :order_number, :line_item_id, :product, :sku,
            :name, :email, :phone, :serial_number, :status, :purchase_date, :expires_at, :registered_at, :updated_at
        )
    ');

    $stmt->execute([
        ':warranty_id'   => $warrantyId,
        ':order_id'      => (string)$order['id'],
        ':order_number'  => (string)$order['name'],
        ':line_item_id'  => (string)$lineItem['id'],
        ':product'       => $productName,
        ':sku'           => $sku,
        ':name'          => (string)$customer['name'],
        ':email'         => normalizeEmail($customer['email']),
        ':phone'         => (string)($customer['phone'] ?? ''),
        ':serial_number' => (string)($customer['serialNumber'] ?? ''),
        ':status'        => $status,
        ':purchase_date' => toMysqlDateTime($order['processedAt']),
        ':expires_at'    => toMysqlDateTime($eligibility['warrantyExpiresAt']),
        ':registered_at' => $nowMysql,
        ':updated_at'    => $nowMysql,
    ]);

    $registration = [
        'warrantyId'   => $warrantyId,
        'orderId'      => (string)$order['id'],
        'orderNumber'  => (string)$order['name'],
        'lineItemId'   => (string)$lineItem['id'],
        'product'      => $productName,
        'sku'          => $sku,
        'name'         => (string)$customer['name'],
        'email'        => normalizeEmail($customer['email']),
        'phone'        => (string)($customer['phone'] ?? ''),
        'serialNumber' => (string)($customer['serialNumber'] ?? ''),
        'status'       => $status,
        'purchaseDate' => isoDate($order['processedAt']),
        'expiresAt'    => $eligibility['warrantyExpiresAt'],
        'registeredAt' => $nowIso,
        'updatedAt'    => $nowIso,
    ];

    return ['registration' => $registration, 'created' => true];
}

/**
 * Handle multipart form attachments validation and storage.
 */
function handleFileUploads(array $filesSpec, array $config): array
{
    if (empty($filesSpec) || empty($filesSpec['name'])) {
        return [];
    }

    $uploadDir = $config['UPLOAD_DIR'] ?? (__DIR__ . '/uploads');
    if (!is_dir($uploadDir)) {
        mkdir($uploadDir, 0755, true);
    }

    $allowedMimes = $config['ALLOWED_MIME_TYPES'] ?? [
        'image/jpeg' => '.jpg',
        'image/png'  => '.png',
        'image/webp' => '.webp',
        'application/pdf' => '.pdf',
    ];
    $maxFileSize = (int)($config['MAX_FILE_SIZE'] ?? (10 * 1024 * 1024));
    $maxFilesCount = (int)($config['MAX_FILES_COUNT'] ?? 5);

    // Normalize $_FILES structure
    $normalized = [];
    if (is_array($filesSpec['name'])) {
        $count = count($filesSpec['name']);
        if ($count > $maxFilesCount) {
            throw new ServiceException(400, 'Attachment limit exceeded. Maximum 5 files.');
        }
        for ($i = 0; $i < $count; $i++) {
            if ($filesSpec['error'][$i] === UPLOAD_ERR_NO_FILE) {
                continue;
            }
            $normalized[] = [
                'name'     => $filesSpec['name'][$i],
                'type'     => $filesSpec['type'][$i],
                'tmp_name' => $filesSpec['tmp_name'][$i],
                'error'    => $filesSpec['error'][$i],
                'size'     => $filesSpec['size'][$i],
            ];
        }
    } else {
        if ($filesSpec['error'] !== UPLOAD_ERR_NO_FILE) {
            $normalized[] = $filesSpec;
        }
    }

    if (count($normalized) > $maxFilesCount) {
        throw new ServiceException(400, 'Attachment limit exceeded. Maximum 5 files.');
    }

    $savedFiles = [];
    $finfo = finfo_open(FILEINFO_MIME_TYPE);

    try {
        foreach ($normalized as $file) {
            if ($file['error'] !== UPLOAD_ERR_OK) {
                throw new ServiceException(400, 'Error uploading attachment.');
            }

            if ($file['size'] > $maxFileSize) {
                throw new ServiceException(400, 'Attachment file size exceeds 10MB limit.');
            }

            $detectedMime = finfo_file($finfo, $file['tmp_name']);
            if (!isset($allowedMimes[$detectedMime])) {
                throw new ServiceException(400, 'Unsupported attachment type. Allowed: JPG, PNG, WebP, PDF.');
            }

            $extension = $allowedMimes[$detectedMime];
            $storedFilename = sprintf('%d-%s%s', (int)(microtime(true) * 1000), bin2hex(random_bytes(16)), $extension);
            $destination = $uploadDir . '/' . $storedFilename;

            if (!move_uploaded_file($file['tmp_name'], $destination)) {
                throw new ServiceException(500, 'Failed to save attachment.');
            }

            $savedFiles[] = [
                'filename'     => $storedFilename,
                'originalName' => basename((string)$file['name']),
                'size'         => (int)$file['size'],
                'mimeType'     => $detectedMime,
            ];
        }
    } catch (Throwable $e) {
        // Rollback already saved files on failure
        removeUploadedFiles($savedFiles, $uploadDir);
        if ($finfo) finfo_close($finfo);
        throw $e;
    }

    if ($finfo) finfo_close($finfo);
    return $savedFiles;
}

/**
 * Remove uploaded files from disk.
 */
function removeUploadedFiles(array $files, string $uploadDir): void
{
    foreach ($files as $file) {
        $filename = $file['filename'] ?? '';
        if (!empty($filename)) {
            $target = $uploadDir . '/' . basename($filename);
            if (file_exists($target)) {
                @unlink($target);
            }
        }
    }
}
