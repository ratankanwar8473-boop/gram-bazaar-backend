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
    if (id === 'all') {
      await db.query('UPDATE notifications SET is_read=1 WHERE user_id=?', [req.user.id]);
    } else {
      await db.query('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?', [id, req.user.id]);
    }
    res.json({ success: true, message: 'Read mark kar diya.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
