require('dotenv').config();
const express     = require('express');
const http        = require('http');
const { Server }  = require('socket.io');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const rateLimit   = require('express-rate-limit');
const path        = require('path');

const routes      = require('./routes');
const socketSetup = require('./socket');

const app    = express();
const server = http.createServer(app);

// ─── CORS ────────────────────────────────────────────────
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return callback(null, true);
    if (process.env.FRONTEND_URL && origin === process.env.FRONTEND_URL) return callback(null, true);
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    callback(new Error('CORS: Not allowed: ' + origin));
  },
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'],
  allowedHeaders: ['Content-Type','Authorization','X-Requested-With'],
  optionsSuccessStatus: 200
};

// ─── Socket.io ───────────────────────────────────────────
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });
socketSetup(io);

// ─── Trust Proxy (Railway/Vercel ke liye zaroori) ────────
app.set('trust proxy', 1);

// ─── Middleware (CORS first!) ─────────────────────────────
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ─── Rate Limiting ───────────────────────────────────────
app.use('/api/', rateLimit({ windowMs: 15*60*1000, max: 300, standardHeaders: true, legacyHeaders: false }));
app.use('/api/auth/login', rateLimit({ windowMs: 15*60*1000, max: 20 }));

// ─── Static ──────────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use((req, _, next) => { req.io = io; next(); });

// ─── Routes ──────────────────────────────────────────────
app.use('/api', routes);

// ─── Health ──────────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', app: 'Gram Bazaar API v2', time: new Date() }));

// ─── 404 / Error ─────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Route nahi mili: ' + req.path }));
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ success: false, message: err.message || 'Server error.' });
});

// ─── Auto-setup on first start ───────────────────────────
async function autoSetup() {
  try {
    const db = require('./config/db');
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');

    // 1. Add super_admin to role enum (safe if already exists)
    try {
      await db.query(`ALTER TABLE services MODIFY COLUMN type ENUM('tent','kirana','gadi','tractor','khana','karigar','garments','hardware','electronics','furniture','medical','other') NOT NULL`);
      await db.query(`ALTER TABLE orders MODIFY COLUMN service_type ENUM('tent','kirana','gadi','tractor','khana','karigar','garments','hardware','electronics','furniture','medical','other') NOT NULL`);
      console.log('✅ DB: super_admin role enum added');
    } catch(e) {
      console.log('ℹ️  DB: role enum already up to date');
    }

    // 2. Create seller_licenses table
    await db.query(`
      CREATE TABLE IF NOT EXISTS seller_licenses (
        id           INT AUTO_INCREMENT PRIMARY KEY,
        seller_id    INT NOT NULL,
        license_key  VARCHAR(64) NOT NULL UNIQUE,
        type         ENUM('trial','monthly','quarterly','yearly','lifetime') DEFAULT 'monthly',
        status       ENUM('active','expired','revoked') DEFAULT 'active',
        amount_paid  DECIMAL(10,2) DEFAULT 0.00,
        start_date   DATE NOT NULL,
        expiry_date  DATE,
        issued_by    INT NOT NULL,
        notes        TEXT,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_seller (seller_id),
        INDEX idx_expiry (expiry_date)
      )
    `);
    console.log('✅ DB: seller_licenses table ready');

    // 3. Create / update super admin user
    const phone    = '8875448173';
    const password = 'Laksh@8173';
    const hashed   = await bcrypt.hash(password, 10);

    const [existing] = await db.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existing.length) {
      await db.query(
        `UPDATE users SET name='Laksh', password=?, role='super_admin', is_active=1, is_verified=1 WHERE phone=?`,
        [hashed, phone]
      );
      console.log('✅ DB: Super admin updated (id:', existing[0].id, ')');
    } else {
      const [r] = await db.query(
        `INSERT INTO users (uuid,name,phone,email,password,role,is_active,is_verified) VALUES (?,?,?,?,?,'super_admin',1,1)`,
        [uuidv4(), 'Laksh', phone, 'superadmin@grambazaar.in', hashed]
      );
      console.log('✅ DB: Super admin created (id:', r.insertId, ')');
    }

    console.log('\n🛡️  Super Admin ready → Phone: 8875448173 | Password: Laksh@8173\n');
  } catch(err) {
    console.error('⚠️  Auto-setup warning:', err.message);
    // Don't crash — DB might just be starting up
  }
}

// ─── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🌾 Gram Bazaar API v2 on port ${PORT} | ${process.env.NODE_ENV || 'development'}`);
  // Wait 3 seconds for DB connection pool to be ready, then auto-setup
  setTimeout(autoSetup, 3000);
});

module.exports = { app, server };
