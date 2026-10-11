-- =====================================================================
-- Grooves Customer Care Backend - MySQL Database Schema
-- Hostinger MySQL / phpMyAdmin Migration
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';
SET foreign_key_checks = 0;
SET sql_mode = 'NO_AUTO_VALUE_ON_ZERO';

-- 1. Store and Policy Settings Table
CREATE TABLE IF NOT EXISTS `settings` (
    `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
    `shopify_store_domain` VARCHAR(255) NOT NULL DEFAULT '',
    `warranty_days` INT UNSIGNED NOT NULL DEFAULT 365,
    `return_window_days` INT UNSIGNED NOT NULL DEFAULT 7,
    `return_window_basis` ENUM('purchase', 'delivery') NOT NULL DEFAULT 'delivery',
    `updated_at` DATETIME NULL,
    PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed initial settings row
INSERT IGNORE INTO `settings` (`id`, `shopify_store_domain`, `warranty_days`, `return_window_days`, `return_window_basis`, `updated_at`)
VALUES (1, '1tsavh-dz.myshopify.com', 365, 7, 'delivery', UTC_TIMESTAMP());

-- 2. Shopify OAuth Dynamic Access Token Cache (Client Credentials Grant 2026)
CREATE TABLE IF NOT EXISTS `oauth_tokens` (
    `shop_domain` VARCHAR(255) NOT NULL,
    `access_token` TEXT NOT NULL,
    `expires_at` INT UNSIGNED NOT NULL,
    `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (`shop_domain`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Atomic Sequence Counters for Warranties and Tickets
CREATE TABLE IF NOT EXISTS `sequences` (
    `name` VARCHAR(50) NOT NULL,
    `current_value` INT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Seed sequence trackers
INSERT IGNORE INTO `sequences` (`name`, `current_value`) VALUES ('warranty', 0), ('ticket', 0);

-- 4. Warranty Registrations Table
CREATE TABLE IF NOT EXISTS `warranties` (
    `warranty_id` VARCHAR(64) NOT NULL,
    `order_id` VARCHAR(128) NOT NULL,
    `order_number` VARCHAR(64) NOT NULL,
    `line_item_id` VARCHAR(128) NOT NULL,
    `product` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(128) NOT NULL DEFAULT '',
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(50) NOT NULL DEFAULT '',
    `serial_number` VARCHAR(150) NOT NULL DEFAULT '',
    `status` VARCHAR(50) NOT NULL DEFAULT 'Active',
    `purchase_date` DATETIME NOT NULL,
    `expires_at` DATETIME NOT NULL,
    `registered_at` DATETIME NOT NULL,
    `updated_at` DATETIME NOT NULL,
    PRIMARY KEY (`warranty_id`),
    INDEX `idx_warranties_email` (`email`),
    INDEX `idx_warranties_order_lookup` (`order_id`, `line_item_id`, `email`),
    INDEX `idx_warranties_status` (`status`),
    INDEX `idx_warranties_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Customer Care Support Tickets Table
CREATE TABLE IF NOT EXISTS `tickets` (
    `ticket_number` VARCHAR(64) NOT NULL,
    `request_type` VARCHAR(50) NOT NULL,
    `warranty_id` VARCHAR(64) NOT NULL DEFAULT '',
    `name` VARCHAR(150) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(50) NOT NULL DEFAULT '',
    `invoice` VARCHAR(64) NOT NULL,
    `order_id` VARCHAR(128) NOT NULL,
    `line_item_id` VARCHAR(128) NOT NULL,
    `product` VARCHAR(255) NOT NULL,
    `sku` VARCHAR(128) NOT NULL DEFAULT '',
    `category` VARCHAR(160) NOT NULL,
    `description` TEXT NOT NULL,
    `status` VARCHAR(50) NOT NULL DEFAULT 'Open',
    `notes` TEXT NOT NULL,
    `eligibility` LONGTEXT NULL,
    `timeline` LONGTEXT NULL,
    `attachments` LONGTEXT NULL,
    `created_at` DATETIME NOT NULL,
    `updated_at` DATETIME NOT NULL,
    PRIMARY KEY (`ticket_number`),
    INDEX `idx_tickets_email` (`email`),
    INDEX `idx_tickets_status` (`status`),
    INDEX `idx_tickets_updated_at` (`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 6. Rate Limiting Table (IP Abuse Protection)
CREATE TABLE IF NOT EXISTS `rate_limits` (
    `ip_address` VARCHAR(45) NOT NULL,
    `request_count` INT UNSIGNED NOT NULL DEFAULT 1,
    `window_start` INT UNSIGNED NOT NULL,
    PRIMARY KEY (`ip_address`),
    INDEX `idx_rate_limits_window` (`window_start`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
