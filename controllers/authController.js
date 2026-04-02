const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db       = require('../config/db');

// ─── Generate JWT ────────────────────────────────────────
const signToken = (id, role) =>
  jwt.sign({ id, role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// ─── REGISTER ───────────────────────────────────────────
exports.register = async (req, res) => {
  const { name, phone, email, password, role = 'customer', village, district, business_name } = req.body;

  try {
    // Check duplicate phone
    const [existing] = await db.query('SELECT id FROM users WHERE phone = ?', [phone]);
    if (existing.length) {
      return res.status(400).json({ success: false, message: 'Yeh phone number pehle se registered hai.' });
    }

    const hashed = await bcrypt.hash(password, 10);
    const uuid   = uuidv4();

    const [result] = await db.query(
      'INSERT INTO users (uuid, name, phone, email, password, role, village, district) VALUES (?,?,?,?,?,?,?,?)',
      [uuid, name, phone, email || null, hashed, role, village || null, district || null]
    );

    const userId = result.insertId;

    // If seller, create seller profile
    if (role === 'seller') {
      await db.query(
        'INSERT INTO seller_profiles (user_id, business_name) VALUES (?,?)',
        [userId, business_name || name + ' Services']
      );
    }

    const token = signToken(userId, role);

    res.status(201).json({
      success: true,
      message: 'Registration successful!',
      token,
      user: { id: userId, uuid, name, phone, role }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Server error. Dobara try karein.' });
  }
};

// ─── LOGIN ───────────────────────────────────────────────
exports.login = async (req, res) => {
  const { phone, password } = req.body;

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE phone = ? AND is_active = 1',
      [phone]
    );

    if (!rows.length) {
      return res.status(401).json({ success: false, message: 'Phone number registered nahi hai.' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Password galat hai.' });
    }

    // Get seller profile if seller
    let sellerProfile = null;
    if (user.role === 'seller') {
      const [sp] = await db.query('SELECT * FROM seller_profiles WHERE user_id = ?', [user.id]);
      if (sp.length) sellerProfile = sp[0];
    }

    const token = signToken(user.id, user.role);

    res.json({
      success: true,
      message: 'Login successful!',
      token,
      user: {
        id: user.id, uuid: user.uuid, name: user.name,
        phone: user.phone, email: user.email, role: user.role,
        village: user.village, district: user.district,
        avatar: user.avatar
      },
      sellerProfile
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── GET PROFILE ─────────────────────────────────────────
exports.getProfile = async (req, res) => {
  try {
    const [rows] = await db.query(
      'SELECT id, uuid, name, phone, email, role, village, district, avatar, created_at FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'User nahi mila.' });

    let sellerProfile = null;
    if (rows[0].role === 'seller') {
      const [sp] = await db.query('SELECT * FROM seller_profiles WHERE user_id = ?', [req.user.id]);
      if (sp.length) sellerProfile = sp[0];
    }

    res.json({ success: true, user: rows[0], sellerProfile });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── UPDATE PROFILE ──────────────────────────────────────
exports.updateProfile = async (req, res) => {
  const { name, email, village, district, upi_id, business_name } = req.body;

  try {
    await db.query(
      'UPDATE users SET name=?, email=?, village=?, district=? WHERE id=?',
      [name, email || null, village || null, district || null, req.user.id]
    );

    if (req.user.role === 'seller' && (upi_id || business_name)) {
      await db.query(
        'UPDATE seller_profiles SET upi_id=?, business_name=? WHERE user_id=?',
        [upi_id || null, business_name || name, req.user.id]
      );
    }

    res.json({ success: true, message: 'Profile update ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Update failed.' });
  }
};

// ─── CHANGE PASSWORD ─────────────────────────────────────
exports.changePassword = async (req, res) => {
  const { old_password, new_password } = req.body;
  try {
    const [rows] = await db.query('SELECT password FROM users WHERE id=?', [req.user.id]);
    const isMatch = await bcrypt.compare(old_password, rows[0].password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Purana password galat hai.' });

    const hashed = await bcrypt.hash(new_password, 10);
    await db.query('UPDATE users SET password=? WHERE id=?', [hashed, req.user.id]);
    res.json({ success: true, message: 'Password change ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
