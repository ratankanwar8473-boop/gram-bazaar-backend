const db = require('../config/db');

// ─── GET ALL SELLERS (for customers) ────────────────────
exports.getSellers = async (req, res) => {
  const { type, district, online } = req.query;
  try {
    let q = `SELECT u.id, u.name, u.village, u.district, sp.business_name, sp.rating,
               sp.total_reviews, sp.is_online, sp.description,
               GROUP_CONCAT(s.type) as service_types
             FROM users u
             JOIN seller_profiles sp ON sp.user_id = u.id
             LEFT JOIN services s ON s.seller_id = u.id AND s.is_active = 1
             WHERE u.role = 'seller' AND u.is_active = 1`;
    const params = [];

    if (district) { q += ' AND u.district = ?'; params.push(district); }
    if (online === 'true') { q += ' AND sp.is_online = 1'; }

    q += ' GROUP BY u.id, sp.id';
    if (type) q += ' HAVING FIND_IN_SET(?, service_types)';
    if (type) params.push(type);
    q += ' ORDER BY sp.rating DESC, sp.is_online DESC';

    const [sellers] = await db.query(q, params);
    res.json({ success: true, sellers });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Sellers nahi mile.' });
  }
};

// ─── GET SELLER DETAIL ───────────────────────────────────
exports.getSellerDetail = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT u.id, u.name, u.village, u.district, u.phone,
         sp.business_name, sp.rating, sp.total_reviews, sp.is_online,
         sp.description, sp.upi_id
       FROM users u JOIN seller_profiles sp ON sp.user_id = u.id
       WHERE u.id = ? AND u.role = 'seller'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Seller nahi mila.' });

    const [services] = await db.query(
      'SELECT * FROM services WHERE seller_id = ? AND is_active = 1',
      [req.params.id]
    );
    const [reviews] = await db.query(
      `SELECT r.*, u.name as customer_name FROM reviews r
       JOIN users u ON u.id = r.customer_id
       WHERE r.seller_id = ? ORDER BY r.created_at DESC LIMIT 10`,
      [req.params.id]
    );

    res.json({ success: true, seller: rows[0], services, reviews });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── TOGGLE ONLINE STATUS ────────────────────────────────
exports.toggleOnline = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT is_online FROM seller_profiles WHERE user_id=?', [req.user.id]);
    const newStatus = rows[0].is_online ? 0 : 1;
    await db.query('UPDATE seller_profiles SET is_online=? WHERE user_id=?', [newStatus, req.user.id]);
    res.json({ success: true, is_online: newStatus, message: newStatus ? 'Aap ab online hain!' : 'Aap offline ho gaye.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET SELLER DASHBOARD STATS ──────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const sellerId = req.user.id;

    const [[totals]] = await db.query(
      `SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) as new_orders,
        SUM(CASE WHEN status='in_progress' THEN 1 ELSE 0 END) as active_orders,
        SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) as completed_orders,
        SUM(CASE WHEN status='completed' THEN total_amount ELSE 0 END) as total_earned
       FROM orders WHERE seller_id=?`,
      [sellerId]
    );

    const [[today]] = await db.query(
      `SELECT COALESCE(SUM(total_amount),0) as today_earned
       FROM orders WHERE seller_id=? AND status='completed' AND DATE(completed_at)=CURDATE()`,
      [sellerId]
    );

    const [[week]] = await db.query(
      `SELECT COALESCE(SUM(total_amount),0) as week_earned
       FROM orders WHERE seller_id=? AND status='completed'
       AND completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
      [sellerId]
    );

    const [[month]] = await db.query(
      `SELECT COALESCE(SUM(total_amount),0) as month_earned
       FROM orders WHERE seller_id=? AND status='completed'
       AND MONTH(completed_at)=MONTH(NOW()) AND YEAR(completed_at)=YEAR(NOW())`,
      [sellerId]
    );

    const [sp] = await db.query('SELECT rating, total_reviews, is_online FROM seller_profiles WHERE user_id=?', [sellerId]);

    res.json({
      success: true,
      stats: {
        ...totals,
        today_earned:  today.today_earned,
        week_earned:   week.week_earned,
        month_earned:  month.month_earned,
        rating:        sp[0]?.rating || 0,
        total_reviews: sp[0]?.total_reviews || 0,
        is_online:     sp[0]?.is_online || 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Dashboard data nahi mila.' });
  }
};

// ─── MANAGE SERVICES ─────────────────────────────────────
exports.getMyServices = async (req, res) => {
  const [services] = await db.query('SELECT * FROM services WHERE seller_id=?', [req.user.id]);
  res.json({ success: true, services });
};

exports.upsertService = async (req, res) => {
  const { id, type, title, description, price, price_unit, is_active } = req.body;
  try {
    if (id) {
      await db.query(
        'UPDATE services SET title=?, description=?, price=?, price_unit=?, is_active=? WHERE id=? AND seller_id=?',
        [title, description, price, price_unit || 'per day', is_active ?? 1, id, req.user.id]
      );
    } else {
      await db.query(
        'INSERT INTO services (seller_id, type, title, description, price, price_unit) VALUES (?,?,?,?,?,?)',
        [req.user.id, type, title, description, price, price_unit || 'per day']
      );
    }
    res.json({ success: true, message: 'Service save ho gayi!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Save failed.' });
  }
};

// ─── SUBMIT REVIEW ───────────────────────────────────────
exports.submitReview = async (req, res) => {
  const { order_id, rating, comment } = req.body;
  try {
    const [orders] = await db.query('SELECT * FROM orders WHERE id=? AND customer_id=? AND status="completed"', [order_id, req.user.id]);
    if (!orders.length) return res.status(400).json({ success: false, message: 'Order complete nahi hua ya aapka nahi hai.' });

    const order = orders[0];
    await db.query(
      'INSERT INTO reviews (order_id, customer_id, seller_id, rating, comment) VALUES (?,?,?,?,?)',
      [order_id, req.user.id, order.seller_id, rating, comment || null]
    );

    // Update seller avg rating
    await db.query(
      `UPDATE seller_profiles SET
        rating = (SELECT AVG(rating) FROM reviews WHERE seller_id=?),
        total_reviews = (SELECT COUNT(*) FROM reviews WHERE seller_id=?)
       WHERE user_id=?`,
      [order.seller_id, order.seller_id, order.seller_id]
    );

    res.json({ success: true, message: 'Review submit ho gaya. Shukriya!' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ success: false, message: 'Aap pehle hi review de chuke hain.' });
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
