require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const path       = require('path');

const routes     = require('./routes');
const socketSetup = require('./socket');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || '*', methods: ['GET','POST'] }
});

// ─── Socket Setup ────────────────────────────────────────
socketSetup(io);

// ─── Middleware ──────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: process.env.FRONTEND_URL || '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// Rate limiting
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 200, message: { success: false, message: 'Too many requests.' } }));
app.use('/api/auth/login', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { success: false, message: 'Bahut zyada login attempts. 15 min baad try karein.' } }));

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Attach io to req for controllers
app.use((req, _, next) => { req.io = io; next(); });

// ─── API Routes ──────────────────────────────────────────
app.use('/api', routes);

// ─── Health Check ────────────────────────────────────────
app.get('/health', (_, res) => res.json({ status: 'ok', app: 'Gram Bazaar API', time: new Date() }));

// ─── 404 ─────────────────────────────────────────────────
app.use((_, res) => res.status(404).json({ success: false, message: 'Route nahi mili.' }));

// ─── Error Handler ───────────────────────────────────────
app.use((err, _, res, __) => {
  console.error('Server error:', err);
  res.status(500).json({ success: false, message: err.message || 'Server error.' });
});

// ─── Start ───────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`\n🌾 Gram Bazaar API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   API:    http://localhost:${PORT}/api\n`);
});
