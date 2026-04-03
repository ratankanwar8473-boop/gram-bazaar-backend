const jwt = require('jsonwebtoken');
const db  = require('../config/db');

// ─── Verify JWT token ───────────────────────────────────
const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Token nahi mila. Login karein.' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await db.query(
      'SELECT id, uuid, name, phone, email, role, is_active FROM users WHERE id = ?',
      [decoded.id]
    );

    if (!rows.length || !rows[0].is_active) {
      return res.status(401).json({ success: false, message: 'User nahi mila ya deactivated hai.' });
    }

    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, message: 'Session expire ho gaya. Dobara login karein.' });
    }
    return res.status(401).json({ success: false, message: 'Invalid token.' });
  }
};

// ─── Role Guard ─────────────────────────────────────────
// super_admin aur admin dono admin routes access kar sakte hain
const requireRole = (...roles) => (req, res, next) => {
  const userRole = req.user.role;
  // super_admin can access everything admin can
  if (userRole === 'super_admin') return next();
  if (!roles.includes(userRole)) {
    return res.status(403).json({ success: false, message: 'Access denied. Aapko permission nahi hai.' });
  }
  next();
};

module.exports = { authMiddleware, requireRole };
