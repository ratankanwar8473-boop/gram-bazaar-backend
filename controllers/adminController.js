const db = require('../config/db');

// ─── DASHBOARD OVERVIEW ──────────────────────────────────
exports.overview = async (req, res) => {
  try {
    const [[users]]   = await db.query("SELECT COUNT(*) as total, SUM(role='customer') as customers, SUM(role='seller') as sellers FROM users WHERE role != 'admin'");
    const [[orders]]  = await db.query("SELECT COUNT(*) as total, SUM(status='completed') as completed, SUM(status='pending') as pending, COALESCE(SUM(CASE WHEN status='completed' THEN total_amount END),0) as gmv FROM orders");
    const [[today]]   = await db.query("SELECT COUNT(*) as orders_today, COALESCE(SUM(CASE WHEN status='completed' THEN total_amount END),0) as revenue_today FROM orders WHERE DATE(created_at)=CURDATE()");
    const [topSellers]= await db.query(`SELECT u.name, sp.business_name, sp.total_earnings, sp.rating, sp.total_reviews FROM seller_profiles sp JOIN users u ON u.id=sp.user_id ORDER BY sp.total_earnings DESC LIMIT 5`);
    const [recentOrders] = await db.query(`SELECT o.order_number, o.service_type, o.status, o.total_amount, o.created_at, c.name as customer, s.name as seller FROM orders o JOIN users c ON c.id=o.customer_id JOIN users s ON s.id=o.seller_id ORDER BY o.created_at DESC LIMIT 10`);

    res.json({ success: true, stats: { users, orders, today }, topSellers, recentOrders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Dashboard error.' });
  }
};

// ─── LIST USERS ──────────────────────────────────────────
exports.listUsers = async (req, res) => {
  const { role, page = 1, limit = 30, search } = req.query;
  const offset = (page - 1) * limit;
  try {
    let q = "SELECT id, uuid, name, phone, email, role, village, district, is_active, created_at FROM users WHERE 1=1";
    const params = [];
    if (role)   { q += ' AND role=?';  params.push(role); }
    if (search) { q += ' AND (name LIKE ? OR phone LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
    q += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const [users] = await db.query(q, params);
    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Users nahi mile.' });
  }
};

// ─── TOGGLE USER ACTIVE ──────────────────────────────────
exports.toggleUser = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT is_active FROM users WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'User nahi mila.' });
    const newStatus = rows[0].is_active ? 0 : 1;
    await db.query('UPDATE users SET is_active=? WHERE id=?', [newStatus, req.params.id]);
    res.json({ success: true, is_active: newStatus });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── ALL ORDERS ──────────────────────────────────────────
exports.listOrders = async (req, res) => {
  const { status, page = 1, limit = 30 } = req.query;
  const offset = (page - 1) * limit;
  try {
    let q = `SELECT o.*, c.name as customer_name, c.phone as customer_phone,
               s.name as seller_name, sp.business_name
             FROM orders o
             JOIN users c ON c.id=o.customer_id
             JOIN users s ON s.id=o.seller_id
             LEFT JOIN seller_profiles sp ON sp.user_id=o.seller_id
             WHERE 1=1`;
    const params = [];
    if (status) { q += ' AND o.status=?'; params.push(status); }
    q += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));
    const [orders] = await db.query(q, params);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Orders nahi mile.' });
  }
};

// ─── BROADCAST NOTIFICATION ──────────────────────────────
exports.broadcast = async (req, res) => {
  const { title, body, role } = req.body;
  try {
    let q = 'SELECT id FROM users WHERE is_active=1';
    const params = [];
    if (role) { q += ' AND role=?'; params.push(role); }
    const [users] = await db.query(q, params);

    const values = users.map(u => [u.id, title, body, 'broadcast', null]);
    if (values.length) {
      await db.query('INSERT INTO notifications (user_id, title, body, type, reference_id) VALUES ?', [values]);
    }

    if (req.io) req.io.emit('broadcast', { title, body });

    res.json({ success: true, message: `${users.length} users ko notification bheji!` });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Broadcast failed.' });
  }
};
