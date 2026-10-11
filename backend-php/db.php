<?php
/**
 * Database Connection Handler using PDO
 */

declare(strict_types=1);

class Database
{
    private static ?PDO $instance = null;

    public static function getConnection(array $config): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        $host = $config['DB_HOST'] ?? 'localhost';
        $port = (int)($config['DB_PORT'] ?? 3306);
        $dbname = $config['DB_NAME'] ?? '';
        $charset = $config['DB_CHARSET'] ?? 'utf8mb4';
        $user = $config['DB_USER'] ?? '';
        $pass = $config['DB_PASS'] ?? '';

        $dsn = "mysql:host={$host};port={$port};dbname={$dbname};charset={$charset}";

        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
            PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES {$charset} COLLATE utf8mb4_unicode_ci",
        ];

        try {
            self::$instance = new PDO($dsn, $user, $pass, $options);
            return self::$instance;
        } catch (PDOException $e) {
            error_log('Database connection error: ' . $e->getMessage());
            http_response_code(503);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'error' => 'Support database is unavailable. Please verify MySQL configuration.'
            ], JSON_UNESCAPED_SLASHES);
            exit;
        }
    }
}
