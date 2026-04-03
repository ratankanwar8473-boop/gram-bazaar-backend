const db = require('../config/db');

exports.getNotifications = async (req, res) => {
  try {
    const [notifs] = await db.query(
      'SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    const [[{ unread }]] = await db.query(
      'SELECT COUNT(*) as unread FROM notifications WHERE user_id=? AND is_read=0',
      [req.user.id]
    );
    res.json({ success: true, notifications: notifs, unread });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.markRead = async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [id, req.user.id]);
    res.json({ success: true, message: 'Read mark kar diya.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.id]);
    res.json({ success: true, message: 'Sab notifications read mark ho gayi.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
