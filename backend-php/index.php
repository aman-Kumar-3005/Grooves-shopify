<?php
/**
 * Grooves Customer Care Backend - Main API Entry Point & Router
 *
 * Handles public Shopify App Proxy requests and private staff console API calls.
 */

declare(strict_types=1);

error_reporting(E_ALL);
ini_set('display_errors', '0');

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/shopify.php';

// Apply security headers to every response
setSecurityHeaders();

// Load configuration
$config = require __DIR__ . '/config.php';
$pdo = Database::getConnection($config);
$settings = loadSettings($pdo, $config);

// Determine HTTP Method (supporting method override)
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method === 'POST' && !empty($_POST['_method'])) {
    $method = strtoupper((string)$_POST['_method']);
} elseif (!empty($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
    $method = strtoupper((string)$_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
}

// Normalize URI Path
$rawUri = (string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$scriptName = dirname($_SERVER['SCRIPT_NAME'] ?? '');
if ($scriptName !== '/' && $scriptName !== '\\' && !empty($scriptName)) {
    if (str_starts_with($rawUri, $scriptName)) {
        $rawUri = substr($rawUri, strlen($scriptName));
    }
}
$path = trim($rawUri, '/');

// Parse Request Body
$body = [];
$rawInput = file_get_contents('php://input');
if (!empty($rawInput)) {
    $json = json_decode($rawInput, true);
    if (is_array($json)) {
        $body = $json;
    }
}
if (empty($body) && !empty($_POST)) {
    $body = $_POST;
}

// Constant lists
$ALLOWED_REQUEST_TYPES = [
    'warranty_claim', 'return', 'replacement', 'repair', 'technical_support', 'order_issue', 'other'
];
$ALLOWED_TICKET_STATUSES = [
    'Open', 'Under Review', 'In Progress', 'Awaiting Customer', 'Approved', 'Pickup Scheduled',
    'In Transit', 'Replacement Shipped', 'Refund Processing', 'Resolved', 'Rejected', 'Closed'
];

try {
    // --------------------------------------------------------------------------
    // Health Check Endpoint
    // --------------------------------------------------------------------------
    if ($method === 'GET' && ($path === 'health' || $path === 'api/health')) {
        $uploadDir = $config['UPLOAD_DIR'] ?? (__DIR__ . '/uploads');
        $shopifyOk = !empty($settings['shopifyStoreDomain'])
            && !empty($config['SHOPIFY_CLIENT_SECRET'])
            && (!empty($config['SHOPIFY_CLIENT_ID']) || !empty($config['SHOPIFY_ADMIN_ACCESS_TOKEN']));

        sendJsonResponse([
            'status'            => 'ok',
            'shopifyConfigured' => $shopifyOk,
            'databaseConnected' => true,
            'storageWritable'   => is_dir($uploadDir) && is_writable($uploadDir),
            'timestamp'         => nowIso(),
        ]);
    }

    // --------------------------------------------------------------------------
    // Order Discovery Endpoint
    // --------------------------------------------------------------------------
    if ($method === 'POST' && ($path === 'apps/grooves-support/discover-orders' || $path === 'api/discover-orders')) {
        requireProxy($_GET, $config, $settings);
        rateLimit($pdo, $config);

        $email = normalizeEmail($body['email'] ?? '');
        $phone = (string)($body['phone'] ?? '');

        if (!validEmail($email) || strlen(normalizePhone($phone)) < 10) {
            sendErrorResponse('Valid checkout email and mobile number are required.', 400);
        }

        $customerId = isset($_GET['logged_in_customer_id']) ? (string)$_GET['logged_in_customer_id'] : null;
        $orders = ShopifyClient::findVerifiedOrdersByContact($pdo, $email, $phone, $customerId, $settings, $config);

        if (empty($orders)) {
            sendErrorResponse('No data found.', 404);
        }

        $formatted = [];
        foreach ($orders as $order) {
            $formatted[] = array_merge(
                warrantyFromOrder($order, $email, $pdo, $settings, $config),
                [
                    'verifiedEmail' => $email,
                    'lookupType'    => 'order',
                ]
            );
        }

        sendJsonResponse(['orders' => $formatted]);
    }

    // --------------------------------------------------------------------------
    // Status Lookup Endpoint (Warranty or Ticket)
    // --------------------------------------------------------------------------
    if ($method === 'POST' && ($path === 'apps/grooves-support/status' || $path === 'api/status' || $path === 'api/verify')) {
        requireProxy($_GET, $config, $settings);
        rateLimit($pdo, $config);

        $type = (string)($body['type'] ?? '');
        $reference = trim((string)($body['reference'] ?? ''));
        $email = normalizeEmail($body['email'] ?? '');

        if (!in_array($type, ['warranty', 'ticket'], true) || empty($reference) || !validEmail($email)) {
            sendErrorResponse('Valid type, reference, and registered email are required.', 400);
        }

        if ($type === 'warranty') {
            // 1. Check for direct warranty registration by ID
            $stmt = $pdo->prepare('SELECT * FROM warranties WHERE UPPER(warranty_id) = :ref LIMIT 1');
            $stmt->execute([':ref' => strtoupper($reference)]);
            $direct = $stmt->fetch();

            if ($direct) {
                if (normalizeEmail($direct['email']) !== $email) {
                    sendErrorResponse('No data found.', 404);
                }
                sendJsonResponse(array_merge(
                    publicWarranty($direct),
                    [
                        'verifiedEmail' => $email,
                        'lookupType'    => 'registration',
                    ]
                ));
            }

            // 2. Otherwise verify live Shopify order
            $customerId = isset($_GET['logged_in_customer_id']) ? (string)$_GET['logged_in_customer_id'] : null;
            $order = ShopifyClient::findVerifiedOrder($pdo, $reference, $email, $customerId, $settings, $config);
            if (!$order) {
                sendErrorResponse('No data found.', 404);
            }

            sendJsonResponse(array_merge(
                warrantyFromOrder($order, $email, $pdo, $settings, $config),
                [
                    'verifiedEmail' => $email,
                    'lookupType'    => 'order',
                ]
            ));
        }

        // Support ticket lookup
        $stmt = $pdo->prepare('SELECT * FROM tickets WHERE UPPER(ticket_number) = :ref LIMIT 1');
        $stmt->execute([':ref' => strtoupper($reference)]);
        $ticket = $stmt->fetch();

        if (!$ticket || normalizeEmail($ticket['email']) !== $email) {
            sendErrorResponse('No data found.', 404);
        }

        sendJsonResponse(publicTicket($ticket));
    }

    // --------------------------------------------------------------------------
    // Warranty Registration Endpoint
    // --------------------------------------------------------------------------
    if ($method === 'POST' && ($path === 'apps/grooves-support/register-warranty' || $path === 'api/register-warranty')) {
        requireProxy($_GET, $config, $settings);
        rateLimit($pdo, $config);

        $name = trim((string)($body['name'] ?? ''));
        $email = normalizeEmail($body['email'] ?? '');
        $phone = trim((string)($body['phone'] ?? ''));
        $invoice = trim((string)($body['invoice'] ?? ''));
        $lineItemId = trim((string)($body['lineItemId'] ?? ''));
        $serialNumber = trim((string)($body['serialNumber'] ?? ''));

        if (
            empty($name) || strlen($name) > 100 || !validEmail($email) ||
            empty($invoice) || empty($lineItemId) || strlen($phone) > 30 || strlen($serialNumber) > 120
        ) {
            sendErrorResponse('Please complete all required registration fields.', 400);
        }

        $customerId = isset($_GET['logged_in_customer_id']) ? (string)$_GET['logged_in_customer_id'] : null;
        $order = ShopifyClient::findVerifiedOrder($pdo, $invoice, $email, $customerId, $settings, $config);
        if (!$order) {
            sendErrorResponse('No matching Shopify order found.', 404);
        }

        $lineItem = getOrderLineItem($order, $lineItemId, $email, null, $config);
        if (!$lineItem) {
            sendErrorResponse('Selected product was not found in this order.', 404);
        }

        $customerData = [
            'name'         => $name,
            'email'        => $email,
            'phone'        => $phone,
            'serialNumber' => $serialNumber,
        ];
        $result = createWarrantyRegistration($pdo, $order, $lineItem, $customerData, $settings, $config);

        sendJsonResponse([
            'success'  => true,
            'created'  => $result['created'],
            'warranty' => publicWarranty($result['registration']),
        ], $result['created'] ? 201 : 200);
    }

    // --------------------------------------------------------------------------
    // Create Support Ticket Endpoint
    // --------------------------------------------------------------------------
    if ($method === 'POST' && ($path === 'apps/grooves-support/create-ticket' || $path === 'api/create-ticket')) {
        requireProxy($_GET, $config, $settings);
        rateLimit($pdo, $config);

        $savedFiles = [];
        $uploadDir = $config['UPLOAD_DIR'] ?? (__DIR__ . '/uploads');

        try {
            $savedFiles = handleFileUploads($_FILES['attachments'] ?? [], $config);
        } catch (ServiceException $se) {
            sendErrorResponse($se->getMessage(), $se->getStatusCode());
        }

        $name = trim((string)($body['name'] ?? ''));
        $email = normalizeEmail($body['email'] ?? '');
        $phone = trim((string)($body['phone'] ?? ''));
        $invoice = trim((string)($body['invoice'] ?? ''));
        $lineItemId = trim((string)($body['lineItemId'] ?? ''));
        $productFallback = trim((string)($body['product'] ?? ''));
        $requestType = strtolower(trim((string)($body['requestType'] ?? 'technical_support')));
        $category = trim((string)($body['category'] ?? ''));
        $description = trim((string)($body['description'] ?? ''));
        $serialNumber = trim((string)($body['serialNumber'] ?? ''));

        if (
            empty($name) || strlen($name) > 100 || !validEmail($email) || strlen($phone) > 30 ||
            empty($invoice) || strlen($invoice) > 80 || empty($lineItemId) ||
            !in_array($requestType, $ALLOWED_REQUEST_TYPES, true) ||
            empty($category) || strlen($category) > 160 || strlen($productFallback) > 200 ||
            strlen($serialNumber) > 120 || strlen($description) < 10 || strlen($description) > 3000
        ) {
            removeUploadedFiles($savedFiles, $uploadDir);
            sendErrorResponse('Please complete all required fields with valid information.', 400);
        }

        $customerId = isset($_GET['logged_in_customer_id']) ? (string)$_GET['logged_in_customer_id'] : null;
        $order = ShopifyClient::findVerifiedOrder($pdo, $invoice, $email, $customerId, $settings, $config);
        if (!$order) {
            removeUploadedFiles($savedFiles, $uploadDir);
            sendErrorResponse('No matching Shopify order found.', 404);
        }

        $lineItem = getOrderLineItem($order, $lineItemId, $email, $productFallback, $config);
        if (!$lineItem) {
            removeUploadedFiles($savedFiles, $uploadDir);
            sendErrorResponse('Selected product was not found in this order.', 404);
        }

        $eligibility = orderEligibility($order, $settings);
        if ($requestType === 'return' && !$eligibility['returnEligible']) {
            removeUploadedFiles($savedFiles, $uploadDir);
            $retDays = (int)($settings['returnWindowDays'] ?? 7);
            sendErrorResponse("The {$retDays}-day return request window has expired or this order is not eligible.", 409);
        }

        if (in_array($requestType, ['warranty_claim', 'replacement', 'repair'], true) && $eligibility['remainingDays'] <= 0) {
            removeUploadedFiles($savedFiles, $uploadDir);
            sendErrorResponse('Warranty coverage has expired or this order is not eligible.', 409);
        }

        $warranty = findWarrantyForLine($pdo, (string)$order['id'], (string)$lineItem['id'], $email);
        if (!$warranty && in_array($requestType, ['warranty_claim', 'replacement', 'repair'], true)) {
            $customerData = ['name' => $name, 'email' => $email, 'phone' => $phone, 'serialNumber' => $serialNumber];
            $wResult = createWarrantyRegistration($pdo, $order, $lineItem, $customerData, $settings, $config);
            $warranty = $wResult['registration'];
        }

        $sequence = getNextSequence($pdo, 'ticket');
        $ticketNumber = sprintf('GRV-TKT-%s-%06d', date('Y'), $sequence);
        $nowIso = nowIso();
        $nowMysql = toMysqlDateTime($nowIso);

        $initialNote = ($requestType === 'return')
            ? 'Return request received and pending eligibility review.'
            : 'Request received. Grooves Support will review the case.';

        $timeline = [
            [
                'status' => 'Open',
                'note'   => $initialNote,
                'at'     => $nowIso,
                'public' => true,
            ]
        ];

        $eligibilityPayload = [
            'warrantyRemainingDays' => $eligibility['remainingDays'],
            'returnDaysRemaining'   => $eligibility['returnDaysRemaining'],
            'checkedAt'             => $nowIso,
        ];

        $stmt = $pdo->prepare('
            INSERT INTO tickets (
                ticket_number, request_type, warranty_id, name, email, phone, invoice,
                order_id, line_item_id, product, sku, category, description,
                status, notes, eligibility, timeline, attachments, created_at, updated_at
            ) VALUES (
                :ticket_number, :request_type, :warranty_id, :name, :email, :phone, :invoice,
                :order_id, :line_item_id, :product, :sku, :category, :description,
                :status, :notes, :eligibility, :timeline, :attachments, :created_at, :updated_at
            )
        ');

        $stmt->execute([
            ':ticket_number' => $ticketNumber,
            ':request_type'  => $requestType,
            ':warranty_id'   => (string)($warranty['warranty_id'] ?? $warranty['warrantyId'] ?? ''),
            ':name'          => $name,
            ':email'         => $email,
            ':phone'         => $phone,
            ':invoice'       => (string)$order['name'],
            ':order_id'      => (string)$order['id'],
            ':line_item_id'  => (string)$lineItem['id'],
            ':product'       => (string)($lineItem['name'] ?? $lineItem['title'] ?? ''),
            ':sku'           => (string)($lineItem['sku'] ?? ''),
            ':category'      => $category,
            ':description'   => $description,
            ':status'        => 'Open',
            ':notes'         => $initialNote,
            ':eligibility'   => json_encode($eligibilityPayload),
            ':timeline'      => json_encode($timeline),
            ':attachments'   => json_encode($savedFiles),
            ':created_at'    => $nowMysql,
            ':updated_at'    => $nowMysql,
        ]);

        sendJsonResponse([
            'success'      => true,
            'ticketNumber' => $ticketNumber,
            'warrantyId'   => (string)($warranty['warranty_id'] ?? $warranty['warrantyId'] ?? ''),
            'status'       => 'Open',
            'message'      => 'Support request created.',
        ], 201);
    }

    // --------------------------------------------------------------------------
    // Staff Admin API: List Tickets
    // --------------------------------------------------------------------------
    if ($method === 'GET' && $path === 'api/admin/tickets') {
        requireAdmin($config);

        $statusFilter = strtolower(trim((string)($_GET['status'] ?? '')));
        if (!empty($statusFilter)) {
            $stmt = $pdo->prepare('SELECT * FROM tickets WHERE LOWER(status) = :status ORDER BY updated_at DESC');
            $stmt->execute([':status' => $statusFilter]);
        } else {
            $stmt = $pdo->query('SELECT * FROM tickets ORDER BY updated_at DESC');
        }

        $rows = $stmt->fetchAll();
        $tickets = [];

        foreach ($rows as $row) {
            $timeline = !empty($row['timeline']) ? json_decode($row['timeline'], true) : [];
            $attachments = !empty($row['attachments']) ? json_decode($row['attachments'], true) : [];
            $eligibility = !empty($row['eligibility']) ? json_decode($row['eligibility'], true) : null;

            $tickets[] = [
                'ticketNumber' => (string)$row['ticket_number'],
                'requestType'  => (string)$row['request_type'],
                'warrantyId'   => (string)$row['warranty_id'],
                'name'         => (string)$row['name'],
                'email'        => (string)$row['email'],
                'phone'        => (string)$row['phone'],
                'invoice'      => (string)$row['invoice'],
                'orderId'      => (string)$row['order_id'],
                'lineItemId'   => (string)$row['line_item_id'],
                'product'      => (string)$row['product'],
                'sku'          => (string)$row['sku'],
                'category'     => (string)$row['category'],
                'description'  => (string)$row['description'],
                'status'       => (string)$row['status'],
                'notes'        => (string)$row['notes'],
                'eligibility'  => $eligibility,
                'timeline'     => $timeline,
                'attachments'  => $attachments,
                'createdAt'    => isoDate($row['created_at']),
                'updatedAt'    => isoDate($row['updated_at']),
            ];
        }

        sendJsonResponse(['tickets' => $tickets]);
    }

    // --------------------------------------------------------------------------
    // Staff Admin API: Update Ticket Status & Timeline
    // --------------------------------------------------------------------------
    if ($method === 'PATCH' && preg_match('#^api/admin/tickets/([^/]+)$#', $path, $matches)) {
        requireAdmin($config);

        $ticketKey = strtoupper(urldecode($matches[1]));
        $stmt = $pdo->prepare('SELECT * FROM tickets WHERE UPPER(ticket_number) = :ref LIMIT 1');
        $stmt->execute([':ref' => $ticketKey]);
        $ticket = $stmt->fetch();

        if (!$ticket) {
            sendErrorResponse('Ticket not found.', 404);
        }

        $newStatus = trim((string)($body['status'] ?? ''));
        $note = trim((string)($body['note'] ?? ''));
        $isPublic = ($body['public'] ?? true) !== false;

        if (!in_array($newStatus, $ALLOWED_TICKET_STATUSES, true) || empty($note) || strlen($note) > 1200) {
            sendErrorResponse('A valid status and customer update note are required.', 400);
        }

        $timeline = !empty($ticket['timeline']) ? json_decode($ticket['timeline'], true) : [];
        if (!is_array($timeline)) {
            $timeline = [];
        }

        $nowIso = nowIso();
        $nowMysql = toMysqlDateTime($nowIso);

        $timeline[] = [
            'status' => $newStatus,
            'note'   => $note,
            'at'     => $nowIso,
            'public' => $isPublic,
        ];

        $newNotes = $isPublic ? $note : (string)$ticket['notes'];

        $update = $pdo->prepare('
            UPDATE tickets 
            SET status = :status, notes = :notes, timeline = :timeline, updated_at = :updated_at 
            WHERE ticket_number = :ref
        ');
        $update->execute([
            ':status'     => $newStatus,
            ':notes'      => $newNotes,
            ':timeline'   => json_encode($timeline),
            ':updated_at' => $nowMysql,
            ':ref'        => $ticket['ticket_number'],
        ]);

        $ticket['status'] = $newStatus;
        $ticket['notes'] = $newNotes;
        $ticket['timeline'] = $timeline;
        $ticket['updatedAt'] = $nowIso;

        sendJsonResponse([
            'success' => true,
            'ticket'  => [
                'ticketNumber' => (string)$ticket['ticket_number'],
                'requestType'  => (string)$ticket['request_type'],
                'warrantyId'   => (string)$ticket['warranty_id'],
                'name'         => (string)$ticket['name'],
                'email'        => (string)$ticket['email'],
                'phone'        => (string)$ticket['phone'],
                'invoice'      => (string)$ticket['invoice'],
                'product'      => (string)$ticket['product'],
                'category'     => (string)$ticket['category'],
                'status'       => $newStatus,
                'notes'        => $newNotes,
                'timeline'     => $timeline,
                'updatedAt'    => $nowIso,
            ],
        ]);
    }

    // --------------------------------------------------------------------------
    // Staff Admin API: Get Settings
    // --------------------------------------------------------------------------
    if ($method === 'GET' && $path === 'api/admin/settings') {
        requireAdmin($config);
        sendJsonResponse(['settings' => loadSettings($pdo, $config)]);
    }

    // --------------------------------------------------------------------------
    // Staff Admin API: Update Settings
    // --------------------------------------------------------------------------
    if ($method === 'PATCH' && $path === 'api/admin/settings') {
        requireAdmin($config);

        $storeDomain = strtolower(trim((string)($body['shopifyStoreDomain'] ?? '')));
        $warrantyDays = isset($body['warrantyDays']) ? (int)$body['warrantyDays'] : 0;
        $returnWindowDays = isset($body['returnWindowDays']) ? (int)$body['returnWindowDays'] : 0;
        $returnBasis = strtolower(trim((string)($body['returnWindowBasis'] ?? 'delivery')));
        $applyToExisting = !empty($body['applyWarrantyToExisting']);

        if (!preg_match('/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i', $storeDomain)) {
            sendErrorResponse('Enter the permanent store domain ending in .myshopify.com.', 400);
        }
        if ($warrantyDays < 1 || $warrantyDays > 3650) {
            sendErrorResponse('Warranty duration must be between 1 and 3650 days.', 400);
        }
        if ($returnWindowDays < 1 || $returnWindowDays > 365) {
            sendErrorResponse('Return window must be between 1 and 365 days.', 400);
        }
        if (!in_array($returnBasis, ['delivery', 'purchase'], true)) {
            sendErrorResponse('Return window basis must be delivery or purchase.', 400);
        }

        $nowMysql = toMysqlDateTime(nowIso());
        $stmt = $pdo->prepare('
            UPDATE settings 
            SET shopify_store_domain = :domain,
                warranty_days = :wDays,
                return_window_days = :rDays,
                return_window_basis = :rBasis,
                updated_at = :now
            WHERE id = 1
        ');
        $stmt->execute([
            ':domain' => $storeDomain,
            ':wDays'  => $warrantyDays,
            ':rDays'  => $returnWindowDays,
            ':rBasis' => $returnBasis,
            ':now'    => $nowMysql,
        ]);

        if ($applyToExisting) {
            $bulkUpdate = $pdo->prepare('
                UPDATE warranties 
                SET expires_at = DATE_ADD(purchase_date, INTERVAL :wDays DAY),
                    status = IF(DATE_ADD(purchase_date, INTERVAL :wDays2 DAY) > UTC_TIMESTAMP(), "Active", "Expired"),
                    updated_at = UTC_TIMESTAMP()
                WHERE status != "Cancelled"
            ');
            $bulkUpdate->execute([':wDays' => $warrantyDays, ':wDays2' => $warrantyDays]);
        }

        $newSettings = loadSettings($pdo, $config);

        sendJsonResponse([
            'success'                  => true,
            'settings'                 => $newSettings,
            'existingWarrantiesUpdated' => $applyToExisting,
        ]);
    }

    // --------------------------------------------------------------------------
    // Staff Admin API: List Warranties
    // --------------------------------------------------------------------------
    if ($method === 'GET' && $path === 'api/admin/warranties') {
        requireAdmin($config);

        $statusFilter = strtolower(trim((string)($_GET['status'] ?? '')));
        $stmt = $pdo->query('SELECT * FROM warranties ORDER BY updated_at DESC');
        $rows = $stmt->fetchAll();

        $warranties = [];
        foreach ($rows as $row) {
            $formatted = publicWarranty($row);
            if (!empty($statusFilter) && strtolower($formatted['status']) !== $statusFilter) {
                continue;
            }

            $warranties[] = [
                'warrantyId'   => (string)$row['warranty_id'],
                'orderId'      => (string)$row['order_id'],
                'orderNumber'  => (string)$row['order_number'],
                'lineItemId'   => (string)$row['line_item_id'],
                'product'      => (string)$row['product'],
                'sku'          => (string)$row['sku'],
                'name'         => (string)$row['name'],
                'email'        => (string)$row['email'],
                'phone'        => (string)$row['phone'],
                'serialNumber' => (string)$row['serial_number'],
                'status'       => $formatted['status'],
                'purchaseDate' => isoDate($row['purchase_date']),
                'expiresAt'    => isoDate($row['expires_at']),
                'registeredAt' => isoDate($row['registered_at']),
                'updatedAt'    => isoDate($row['updated_at']),
            ];
        }

        sendJsonResponse(['warranties' => $warranties]);
    }

    // Endpoint not matched
    sendErrorResponse('Not Found: ' . $path, 404);

} catch (ServiceException $se) {
    sendErrorResponse($se->getMessage(), $se->getStatusCode());
} catch (PDOException $pe) {
    error_log('Database error: ' . $pe->getMessage());
    sendErrorResponse('Database service error.', 500);
} catch (Throwable $t) {
    error_log('Unhandled error: ' . $t->getMessage() . "\n" . $t->getTraceAsString());
    sendErrorResponse('Unexpected server error.', 500);
}
