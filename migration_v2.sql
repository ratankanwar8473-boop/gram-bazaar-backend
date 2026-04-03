-- ╔══════════════════════════════════════════════════════╗
-- ║     GRAM BAZAAR v2 – Migration Script                ║
-- ║  Run this if you already have v1 database running    ║
-- ║  mysql -u root -p gram_bazaar < migration_v2.sql     ║
-- ╚══════════════════════════════════════════════════════╝

USE gram_bazaar;

-- 1. Add super_admin to users role enum
ALTER TABLE users 
  MODIFY COLUMN role ENUM('customer','seller','admin','super_admin') DEFAULT 'customer';

-- 2. Create seller_licenses table
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
  FOREIGN KEY (seller_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (issued_by) REFERENCES users(id),
  INDEX idx_seller (seller_id),
  INDEX idx_expiry (expiry_date),
  INDEX idx_status (status)
);

-- 3. Create Super Admin user (phone: 8875448173, password: Laksh@8173)
-- bcrypt hash of "Laksh@8173" (cost 10)
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

-- 4. If phone already exists, just upgrade role:
-- UPDATE users SET role='super_admin', name='Laksh' WHERE phone='8875448173';

SELECT 'Migration v2 complete!' AS status;

-- ╔══════════════════════════════════════════════════════╗
-- ║  IMPORTANT: Password Hash Generation                 ║
-- ║  Since bcrypt hash depends on runtime, run this      ║
-- ║  one-time Node.js script on your Railway server:     ║
-- ╚══════════════════════════════════════════════════════╝
-- 
-- node -e "
--   const bcrypt = require('bcryptjs');
--   const db = require('./config/db');
--   bcrypt.hash('Laksh@8173', 10).then(hash => {
--     db.query(
--       \"INSERT INTO users (uuid,name,phone,email,password,role,is_active,is_verified) VALUES (UUID(),'Laksh','8875448173','superadmin@grambazaar.in',?,  'super_admin',1,1) ON DUPLICATE KEY UPDATE password=?, role='super_admin'\",
--       [hash, hash]
--     ).then(()=>{ console.log('Super admin created!'); process.exit(0); });
--   });
-- "
