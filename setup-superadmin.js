/**
 * ╔══════════════════════════════════════════════════════╗
 * ║   GRAM BAZAAR – Super Admin Setup Script             ║
 * ║                                                      ║
 * ║  Run ONCE on Railway to create super admin:          ║
 * ║  node setup-superadmin.js                            ║
 * ╚══════════════════════════════════════════════════════╝
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('./config/db');

const SUPER_ADMIN = {
  name:     'Laksh',
  phone:    '8875448173',
  email:    'superadmin@grambazaar.in',
  password: 'Laksh@8173',   // ← aap yahan change kar sakte hain
  role:     'super_admin'
};

async function setup() {
  console.log('\n🛡️  Gram Bazaar Super Admin Setup\n');

  try {
    // 1. Ensure super_admin enum exists
    console.log('1. Checking users table schema...');
    try {
      await db.query(`
        ALTER TABLE users 
        MODIFY COLUMN role ENUM('customer','seller','admin','super_admin') DEFAULT 'customer'
      `);
      console.log('   ✅ role enum updated with super_admin');
    } catch (e) {
      console.log('   ℹ️  role enum already has super_admin');
    }

    // 2. Create seller_licenses table
    console.log('2. Creating seller_licenses table...');
    await db.query(`
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
        INDEX idx_seller (seller_id),
        INDEX idx_expiry (expiry_date)
      )
    `);
    console.log('   ✅ seller_licenses table ready');

    // 3. Hash password
    console.log('3. Hashing password...');
    const hashedPassword = await bcrypt.hash(SUPER_ADMIN.password, 10);
    console.log('   ✅ Password hashed');

    // 4. Check if phone already exists
    const [existing] = await db.query('SELECT id, role FROM users WHERE phone = ?', [SUPER_ADMIN.phone]);

    if (existing.length) {
      // Update existing user to super_admin
      await db.query(
        'UPDATE users SET name=?, password=?, role=?, is_active=1, is_verified=1 WHERE phone=?',
        [SUPER_ADMIN.name, hashedPassword, SUPER_ADMIN.role, SUPER_ADMIN.phone]
      );
      console.log(`4. ✅ Existing user (id: ${existing[0].id}) upgraded to super_admin`);
    } else {
      // Create new super admin
      const [result] = await db.query(
        'INSERT INTO users (uuid, name, phone, email, password, role, is_active, is_verified) VALUES (?,?,?,?,?,?,1,1)',
        [uuidv4(), SUPER_ADMIN.name, SUPER_ADMIN.phone, SUPER_ADMIN.email, hashedPassword, SUPER_ADMIN.role]
      );
      console.log(`4. ✅ Super admin created (id: ${result.insertId})`);
    }

    console.log('\n🎉 Setup complete!\n');
    console.log('   📱 Phone:    ', SUPER_ADMIN.phone);
    console.log('   🔒 Password: ', SUPER_ADMIN.password);
    console.log('   👤 Role:      super_admin\n');
    console.log('   Login URL: /super-admin/index.html\n');
    console.log('   ⚠️  Aap ab password change kar sakte hain Super Admin panel mein.\n');

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Setup failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

setup();
