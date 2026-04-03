-- ╔══════════════════════════════════════════════════════╗
-- ║          GRAM BAZAAR – MySQL Database Schema v2      ║
-- ║   Run: mysql -u root -p < gram_bazaar_schema.sql     ║
-- ╚══════════════════════════════════════════════════════╝

CREATE DATABASE IF NOT EXISTS gram_bazaar CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE gram_bazaar;

-- ─── USERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  uuid        VARCHAR(36) NOT NULL UNIQUE,
  name        VARCHAR(100) NOT NULL,
  phone       VARCHAR(15) NOT NULL UNIQUE,
  email       VARCHAR(120) UNIQUE,
  password    VARCHAR(255) NOT NULL,
  role        ENUM('customer','seller','admin','super_admin') DEFAULT 'customer',
  avatar      VARCHAR(255),
  village     VARCHAR(100),
  district    VARCHAR(100),
  state       VARCHAR(100) DEFAULT 'Rajasthan',
  is_active   TINYINT(1) DEFAULT 1,
  is_verified TINYINT(1) DEFAULT 0,
  fcm_token   VARCHAR(255),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_phone (phone),
  INDEX idx_role  (role)
);

-- ─── SELLER PROFILES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS seller_profiles (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  user_id         INT NOT NULL UNIQUE,
  business_name   VARCHAR(150) NOT NULL,
  upi_id          VARCHAR(100),
  description     TEXT,
  rating          DECIMAL(2,1) DEFAULT 0.0,
  total_reviews   INT DEFAULT 0,
  total_earnings  DECIMAL(12,2) DEFAULT 0.00,
  is_online       TINYINT(1) DEFAULT 0,
  bank_account    VARCHAR(20),
  bank_ifsc       VARCHAR(15),
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── SERVICES ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS services (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  seller_id   INT NOT NULL,
  type        ENUM('tent','saman','gadi','tractor','khana','karigar') NOT NULL,
  title       VARCHAR(150) NOT NULL,
  description TEXT,
  price       DECIMAL(10,2) NOT NULL,
  price_unit  VARCHAR(30) DEFAULT 'per day',
  is_active   TINYINT(1) DEFAULT 1,
  images      JSON,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_type   (type),
  INDEX idx_seller (seller_id)
);

-- ─── PRODUCTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  seller_id    INT NOT NULL,
  category     ENUM('saman','khana') NOT NULL,
  name         VARCHAR(150) NOT NULL,
  description  VARCHAR(255),
  price        DECIMAL(8,2) NOT NULL,
  unit         VARCHAR(30),
  stock        INT DEFAULT 100,
  emoji        VARCHAR(10),
  is_available TINYINT(1) DEFAULT 1,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ─── ORDERS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  order_number    VARCHAR(20) NOT NULL UNIQUE,
  customer_id     INT NOT NULL,
  seller_id       INT NOT NULL,
  service_type    ENUM('tent','saman','gadi','tractor','khana','karigar') NOT NULL,
  status          ENUM('pending','confirmed','in_progress','completed','cancelled') DEFAULT 'pending',
  total_amount    DECIMAL(10,2) NOT NULL,
  payment_status  ENUM('pending','paid','refunded') DEFAULT 'pending',
  payment_method  ENUM('upi','cash','online') DEFAULT 'cash',
  payment_ref     VARCHAR(100),
  items           JSON,
  notes           TEXT,
  address         TEXT,
  booking_date    DATE,
  booking_time    VARCHAR(30),
  completed_at    DATETIME,
  created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (seller_id)   REFERENCES users(id),
  INDEX idx_customer (customer_id),
  INDEX idx_seller   (seller_id),
  INDEX idx_status   (status)
);

-- ─── REVIEWS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reviews (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT NOT NULL UNIQUE,
  customer_id INT NOT NULL,
  seller_id   INT NOT NULL,
  rating      TINYINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     TEXT,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id)    REFERENCES orders(id),
  FOREIGN KEY (customer_id) REFERENCES users(id),
  FOREIGN KEY (seller_id)   REFERENCES users(id)
);

-- ─── NOTIFICATIONS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  title        VARCHAR(150) NOT NULL,
  body         TEXT NOT NULL,
  type         VARCHAR(50),
  reference_id INT,
  is_read      TINYINT(1) DEFAULT 0,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_user_read (user_id, is_read)
);

-- ─── TRANSACTIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  order_id     INT NOT NULL,
  user_id      INT NOT NULL,
  type         ENUM('credit','debit','refund') NOT NULL,
  amount       DECIMAL(10,2) NOT NULL,
  upi_ref      VARCHAR(100),
  razorpay_id  VARCHAR(100),
  status       ENUM('pending','success','failed') DEFAULT 'pending',
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (user_id)  REFERENCES users(id)
);

-- ─── SELLER LICENSES ─────────────────────────────────────
-- Super Admin seller ko license deta hai (customers free hain)
CREATE TABLE IF NOT EXISTS seller_licenses (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  seller_id     INT NOT NULL,
  license_key   VARCHAR(64) NOT NULL UNIQUE,
  type          ENUM('trial','monthly','quarterly','yearly','lifetime') NOT NULL DEFAULT 'monthly',
  status        ENUM('active','expired','revoked') DEFAULT 'active',
  amount_paid   DECIMAL(10,2) DEFAULT 0.00,
  start_date    DATE NOT NULL,
  expiry_date   DATE,
  issued_by     INT NOT NULL,
  notes         TEXT,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (seller_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (issued_by)  REFERENCES users(id),
  INDEX idx_seller  (seller_id),
  INDEX idx_expiry  (expiry_date),
  INDEX idx_status  (status)
);

-- ─── OTP ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS otps (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  phone      VARCHAR(15) NOT NULL,
  otp        VARCHAR(6) NOT NULL,
  expires_at DATETIME NOT NULL,
  is_used    TINYINT(1) DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone (phone)
);

-- ═══════════════════════════════════════════════════════
-- SEED DATA
-- ═══════════════════════════════════════════════════════

-- ─── Super Admin: Laksh (8875448173 / Laksh@8173) ────────
-- Password hash for: Laksh@8173
INSERT IGNORE INTO users (uuid, name, phone, email, password, role, is_active, is_verified)
VALUES (
  UUID(),
  'Laksh',
  '8875448173',
  'superadmin@grambazaar.in',
  '$2b$10$rQnKjY8mLpX2vZ5tN9wKhuDqF3eP7sA1cB4gH6iJ0yM.xW8nT2RvC',
  'super_admin',
  1,
  1
);

-- ─── Regular Admin (fallback) ─────────────────────────────
-- Password: Admin@2024
INSERT IGNORE INTO users (uuid, name, phone, email, password, role, is_active, is_verified)
VALUES (
  UUID(),
  'Gram Bazaar Admin',
  '9999999999',
  'admin@grambazaar.in',
  '$2b$10$X9Kn9DhGjNVZBUvUokmkAOHRSfUkn1I9h5T5v4K5PJz0DkVXmE.jy',
  'admin',
  1,
  1
);

-- ═══════════════════════════════════════════════════════
-- MIGRATION (if upgrading from v1):
-- Run these if tables already exist:
-- ═══════════════════════════════════════════════════════
-- ALTER TABLE users MODIFY COLUMN role ENUM('customer','seller','admin','super_admin') DEFAULT 'customer';
-- CREATE TABLE IF NOT EXISTS seller_licenses (...);  (run full CREATE above)
-- UPDATE users SET role='super_admin' WHERE phone='8875448173';
