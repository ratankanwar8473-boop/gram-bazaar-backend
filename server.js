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

// ─── CORS Config ─────────────────────────────────────────
// Allow all Vercel deployments + localhost dev
const ALLOWED_ORIGINS = [
  process.env.FRONTEND_URL,
  'https://gram-bazaar-frontend.vercel.app',
  'http://localhost:3000',
  'http://localhost:5000',
  'http://127.0.0.1:5500',
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    // Allow any vercel.app subdomain
    if (origin.endsWith('.vercel.app')) return callback(null, true);
    // Allow any localhost
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) return callback(null, true);
    // Check explicit list
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // In development, allow all
    if (process.env.NODE_ENV !== 'production') return callback(null, true);
    callback(new Error('CORS: Origin not allowed: ' + origin));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200  // Some browsers (IE11) choke on 204
};

// ─── Socket.io ───────────────────────────────────────────
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});
socketSetup(io);

// ─── Core Middleware ─────────────────────────────────────
// CORS MUST be first — before everything including rate limiter
app.use(cors(corsOptions));

// Handle OPTIONS preflight for ALL routes explicitly
app.options('*', cors(corsOptions));

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// ─── Rate Limiting ───────────────────────────────────────
// Applied AFTER cors so preflight is never blocked
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. 15 min baad try karein.' }
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Bahut zyada login attempts. 15 min baad try karein.' }
});

app.use('/api/', generalLimiter);
app.use('/api/auth/login', loginLimiter);

// ─── Static Files ────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ─── Attach Socket to Requests ───────────────────────────
app.use((req, _, next) => { req.io = io; next(); });

// ─── API Routes ──────────────────────────────────────────
app.use('/api', routes);

// ─── Health Check ────────────────────────────────────────
app.get('/health', (_, res) => res.json({
  status: 'ok',
  app: 'Gram Bazaar API v2',
  time: new Date(),
  env: process.env.NODE_ENV || 'development'
}));

// ─── 404 ─────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, message: 'Route nahi mili: ' + req.path }));

// ─── Global Error Handler ────────────────────────────────
app.use((err, req, res, next) => {
  // CORS errors
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ success: false, message: err.message });
  }
  console.error('Server error:', err);
  res.status(500).json({ success: false, message: err.message || 'Server error.' });
});

// ─── Start Server ────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🌾 Gram Bazaar API v2 running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API:    http://localhost:${PORT}/api`);
  console.log(`   CORS:   ${ALLOWED_ORIGINS.join(', ') || 'all origins'}\n`);
});

module.exports = { app, server };
