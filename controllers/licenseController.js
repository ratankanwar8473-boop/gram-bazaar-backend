const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// ─── GET ALL LICENSES ────────────────────────────────────
exports.getLicenses = async (req, res) => {
  try {
    const [licenses] = await db.query(`
      SELECT sl.*, u.name as seller_name, sp.business_name
      FROM seller_licenses sl
      JOIN users u ON u.id = sl.seller_id
      LEFT JOIN seller_profiles sp ON sp.user_id = sl.seller_id
      ORDER BY sl.created_at DESC
    `);
    res.json({ success: true, licenses });
  } catch (err) {
    console.error('getLicenses error:', err);
    res.status(500).json({ success: false, message: 'Licenses nahi mile.' });
  }
};

// ─── GET LICENSE BY SELLER ID ────────────────────────────
exports.getSellerLicense = async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT sl.*, u.name as seller_name, sp.business_name
      FROM seller_licenses sl
      JOIN users u ON u.id = sl.seller_id
      LEFT JOIN seller_profiles sp ON sp.user_id = sl.seller_id
      WHERE sl.seller_id = ? AND sl.status = 'active'
      ORDER BY sl.created_at DESC LIMIT 1
    `, [req.params.sellerId]);
    res.json({ success: true, license: rows[0] || null });
  } catch (err) {
    res.status(500).json({ success: false, message: 'License nahi mili.' });
  }
};

// ─── CREATE LICENSE ──────────────────────────────────────
exports.createLicense = async (req, res) => {
  const { seller_id, type, amount, start_date, expiry_date, notes } = req.body;
  if (!seller_id || !type || !start_date) {
    return res.status(400).json({ success: false, message: 'seller_id, type aur start_date required hain.' });
  }
  try {
    const license_key = uuidv4().replace(/-/g, '').substring(0, 32).toUpperCase();
    const [result] = await db.query(`
      INSERT INTO seller_licenses (seller_id, license_key, type, status, amount_paid, start_date, expiry_date, issued_by, notes)
      VALUES (?, ?, ?, 'active', ?, ?, ?, ?, ?)
    `, [seller_id, license_key, type, amount || 0, start_date, expiry_date || null, req.user.id, notes || null]);

    const [rows] = await db.query(`
      SELECT sl.*, u.name as seller_name, sp.business_name
      FROM seller_licenses sl
      JOIN users u ON u.id = sl.seller_id
      LEFT JOIN seller_profiles sp ON sp.user_id = sl.seller_id
      WHERE sl.id = ?
    `, [result.insertId]);

    res.json({ success: true, license: rows[0], message: 'License ban gayi!' });
  } catch (err) {
    console.error('createLicense error:', err);
    res.status(500).json({ success: false, message: 'License nahi bani: ' + err.message });
  }
};

// ─── UPDATE LICENSE ──────────────────────────────────────
exports.updateLicense = async (req, res) => {
  const { type, amount, start_date, expiry_date, notes, status } = req.body;
  try {
    const [rows] = await db.query('SELECT id FROM seller_licenses WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'License nahi mili.' });

    await db.query(`
      UPDATE seller_licenses SET type=?, amount_paid=?, start_date=?, expiry_date=?, notes=?, status=?
      WHERE id=?
    `, [type, amount || 0, start_date, expiry_date || null, notes || null, status || 'active', req.params.id]);

    res.json({ success: true, message: 'License update ho gayi!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Update failed.' });
  }
};

// ─── DELETE LICENSE ──────────────────────────────────────
exports.deleteLicense = async (req, res) => {
  try {
    const [rows] = await db.query('SELECT id FROM seller_licenses WHERE id=?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'License nahi mili.' });
    await db.query('DELETE FROM seller_licenses WHERE id=?', [req.params.id]);
    res.json({ success: true, message: 'License delete ho gayi.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Delete failed.' });
  }
};
