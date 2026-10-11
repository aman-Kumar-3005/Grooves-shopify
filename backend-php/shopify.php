<?php
/**
 * Shopify Client & Authentication Management
 *
 * Implements Shopify's 2026 OAuth Client Credentials Grant Flow
 * and GraphQL Order Verification.
 */

declare(strict_types=1);

require_once __DIR__ . '/helpers.php';

class ShopifyClient
{
    /**
     * Verify that Shopify integration credentials and domain are valid.
     */
    public static function assertConfigured(array $settings, array $config): void
    {
        $domain = $settings['shopifyStoreDomain'] ?? $config['SHOPIFY_STORE_DOMAIN'] ?? '';
        $hasLegacyToken = !empty($config['SHOPIFY_ADMIN_ACCESS_TOKEN']);
        $hasClientCredentials = !empty($config['SHOPIFY_CLIENT_ID']) && !empty($config['SHOPIFY_CLIENT_SECRET']);

        if (empty($domain) || (!$hasLegacyToken && !$hasClientCredentials)) {
            throw new ServiceException(503, 'Shopify Admin API is not configured.');
        }

        if (!preg_match('/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i', $domain)) {
            throw new ServiceException(503, 'Invalid Shopify store domain configuration.');
        }
    }

    /**
     * Retrieve or refresh the Admin Access Token.
     * Uses client_credentials flow with persistent MySQL caching.
     */
    public static function getAdminAccessToken(PDO $pdo, array $settings, array $config): string
    {
        // 1. Fallback to legacy static token if specifically provided
        if (!empty($config['SHOPIFY_ADMIN_ACCESS_TOKEN'])) {
            return (string)$config['SHOPIFY_ADMIN_ACCESS_TOKEN'];
        }

        $shopDomain = strtolower(trim($settings['shopifyStoreDomain'] ?? $config['SHOPIFY_STORE_DOMAIN'] ?? ''));
        $now = time();

        // 2. Check cached token in database (valid if more than 5 minutes remain)
        try {
            $stmt = $pdo->prepare('SELECT access_token, expires_at FROM oauth_tokens WHERE shop_domain = :shop LIMIT 1');
            $stmt->execute([':shop' => $shopDomain]);
            $cached = $stmt->fetch();

            if ($cached && !empty($cached['access_token']) && ((int)$cached['expires_at'] - $now) > 300) {
                return (string)$cached['access_token'];
            }
        } catch (Throwable $e) {
            error_log('Failed checking oauth_tokens table: ' . $e->getMessage());
        }

        // 3. Request a new short-lived access token via client_credentials flow
        $clientId = trim((string)($config['SHOPIFY_CLIENT_ID'] ?? ''));
        $clientSecret = trim((string)($config['SHOPIFY_CLIENT_SECRET'] ?? ''));

        if (empty($clientId) || empty($clientSecret)) {
            throw new ServiceException(503, 'Shopify Client ID and Client Secret are required.');
        }

        $oauthUrl = "https://{$shopDomain}/admin/oauth/access_token";
        $postData = http_build_query([
            'grant_type'    => 'client_credentials',
            'client_id'     => $clientId,
            'client_secret' => $clientSecret,
        ]);

        $ch = curl_init($oauthUrl);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $postData,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/x-www-form-urlencoded',
                'Accept: application/json',
                'User-Agent: Grooves-Support-Backend/1.0',
            ],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $httpCode < 200 || $httpCode >= 300) {
            error_log("Shopify token exchange failed. HTTP: {$httpCode}, cURL: {$curlError}, Response: {$response}");
            throw new ServiceException(502, 'Shopify authentication failed.');
        }

        $payload = json_decode($response, true);
        if (!is_array($payload) || empty($payload['access_token'])) {
            $err = $payload['error_description'] ?? $payload['error'] ?? 'Unknown token exchange error';
            error_log("Shopify token response missing access_token: {$err}");
            throw new ServiceException(502, 'Shopify authentication failed.');
        }

        $accessToken = (string)$payload['access_token'];
        $expiresIn = isset($payload['expires_in']) ? (int)$payload['expires_in'] : 86399;
        $expiresAt = $now + $expiresIn;

        // 4. Cache new token in MySQL
        try {
            $upsert = $pdo->prepare('
                INSERT INTO oauth_tokens (shop_domain, access_token, expires_at)
                VALUES (:shop, :token, :expires)
                ON DUPLICATE KEY UPDATE 
                    access_token = VALUES(access_token),
                    expires_at = VALUES(expires_at),
                    updated_at = CURRENT_TIMESTAMP
            ');
            $upsert->execute([
                ':shop'    => $shopDomain,
                ':token'   => $accessToken,
                ':expires' => $expiresAt,
            ]);
        } catch (Throwable $e) {
            error_log('Failed storing oauth_token in database: ' . $e->getMessage());
        }

        return $accessToken;
    }

    /**
     * Execute a GraphQL query against Shopify Admin API.
     */
    public static function graphql(PDO $pdo, string $query, array $variables, array $settings, array $config): array
    {
        self::assertConfigured($settings, $config);

        $shopDomain = strtolower(trim($settings['shopifyStoreDomain'] ?? $config['SHOPIFY_STORE_DOMAIN'] ?? ''));
        $apiVersion = trim((string)($config['SHOPIFY_API_VERSION'] ?? '2026-10'));
        $accessToken = self::getAdminAccessToken($pdo, $settings, $config);

        $url = "https://{$shopDomain}/admin/api/{$apiVersion}/graphql.json";
        $body = json_encode(['query' => $query, 'variables' => $variables]);

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $body,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER     => [
                'Content-Type: application/json',
                'Accept: application/json',
                'X-Shopify-Access-Token: ' . $accessToken,
                'User-Agent: Grooves-Support-Backend/1.0',
            ],
            CURLOPT_TIMEOUT        => 15,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false || $httpCode < 200 || $httpCode >= 300) {
            error_log("Shopify GraphQL HTTP error {$httpCode}. cURL: {$curlError}. Response: {$response}");
            throw new ServiceException(502, 'Shopify order service unavailable.');
        }

        $payload = json_decode($response, true);
        if (!is_array($payload) || !empty($payload['errors'])) {
            error_log('Shopify GraphQL returned errors: ' . json_encode($payload['errors'] ?? $payload));
            throw new ServiceException(502, 'Shopify order service unavailable.');
        }

        return $payload['data'] ?? [];
    }

    /**
     * Find a verified Shopify order by order reference and customer email.
     */
    public static function findVerifiedOrder(
        PDO $pdo,
        string $reference,
        string $email,
        ?string $loggedInCustomerId,
        array $settings,
        array $config
    ): ?array {
        $orderReference = normalizeOrderReference($reference);
        $normalizedEmail = normalizeEmail($email);

        if (empty($orderReference) || strlen($orderReference) > 80 || !validEmail($normalizedEmail)) {
            return null;
        }

        $orderQuery = <<<'GRAPHQL'
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
        legacyResourceId
        email
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

        $searches = buildOrderSearchQueries($orderReference, $normalizedEmail);

        foreach ($searches as $search) {
            $data = self::graphql($pdo, $orderQuery, ['query' => $search], $settings, $config);
            $nodes = $data['orders']['nodes'] ?? [];

            foreach ($nodes as $order) {
                $orderName = normalizeOrderReference($order['name'] ?? '');
                $confirmNo = strtoupper(trim((string)($order['confirmationNumber'] ?? '')));
                $orderNoHash = ltrim(strtoupper(trim((string)($order['name'] ?? ''))), '#');
                $refNoHash = ltrim(strtoupper(trim($orderReference)), '#');

                $exactOrder = ($orderName === $orderReference)
                    || ($confirmNo === $orderReference)
                    || ($orderNoHash === $refNoHash);

                $orderEmail = normalizeEmail($order['email'] ?? '');
                $customerEmail = normalizeEmail($order['customer']['email'] ?? '');
                $exactEmail = ($orderEmail === $normalizedEmail) || ($customerEmail === $normalizedEmail);

                $orderCustId = (string)($order['customer']['legacyResourceId'] ?? '');
                $customerMatches = empty($loggedInCustomerId) || ($orderCustId === (string)$loggedInCustomerId);

                if ($exactOrder && $exactEmail && $customerMatches) {
                    return $order;
                }
            }
        }

        return null;
    }

    /**
     * Discover verified Shopify orders by checkout email and phone.
     */
    public static function findVerifiedOrdersByContact(
        PDO $pdo,
        string $email,
        string $phone,
        ?string $loggedInCustomerId,
        array $settings,
        array $config
    ): array {
        $normalizedEmail = normalizeEmail($email);
        $normalizedPhone = normalizePhone($phone);

        if (!validEmail($normalizedEmail) || strlen($normalizedPhone) < 10 || strlen($normalizedPhone) > 15) {
            return [];
        }

        $query = 'email:"' . graphqlSearchValue($normalizedEmail) . '"';

        $graphql = <<<'GRAPHQL'
query FindOrdersByContact($query: String!) {
  orders(first: 20, query: $query, sortKey: PROCESSED_AT, reverse: true) {
    nodes {
      id
      name
      confirmationNumber
      processedAt
      displayFinancialStatus
      displayFulfillmentStatus
      email
      phone
      test
      shippingAddress {
        phone
      }
      customer {
        legacyResourceId
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
      lineItems(first: 20) {
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

        $data = self::graphql($pdo, $graphql, ['query' => $query], $settings, $config);
        $nodes = $data['orders']['nodes'] ?? [];
        $matched = [];

        foreach ($nodes as $order) {
            $exactEmail = normalizeEmail($order['email'] ?? '') === $normalizedEmail;

            $orderPhone = $order['phone'] ?? '';
            $shipPhone = $order['shippingAddress']['phone'] ?? '';
            $exactPhone = phoneMatches($orderPhone, $normalizedPhone) || phoneMatches($shipPhone, $normalizedPhone);

            $orderCustId = (string)($order['customer']['legacyResourceId'] ?? '');
            $customerMatches = empty($loggedInCustomerId) || ($orderCustId === (string)$loggedInCustomerId);

            if ($exactEmail && $exactPhone && $customerMatches) {
                $matched[] = $order;
            }
        }

        return $matched;
    }
}
