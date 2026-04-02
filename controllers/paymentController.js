const db = require('../config/db');

// ─── INITIATE UPI PAYMENT ────────────────────────────────
exports.initiateUpi = async (req, res) => {
  const { order_id } = req.body;
  try {
    const [rows] = await db.query(
      `SELECT o.*, sp.upi_id, sp.business_name
       FROM orders o
       JOIN seller_profiles sp ON sp.user_id = o.seller_id
       WHERE o.id=? AND o.customer_id=?`,
      [order_id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order nahi mila.' });

    const order = rows[0];
    const upiLink = `upi://pay?pa=${order.upi_id}&pn=${encodeURIComponent(order.business_name)}&am=${order.total_amount}&tn=GramBazaar-${order.order_number}&cu=INR`;

    res.json({
      success: true,
      upi_id:       order.upi_id,
      business_name: order.business_name,
      amount:        order.total_amount,
      order_number:  order.order_number,
      upi_link:      upiLink,
      message:       'UPI QR se payment karein ya UPI app mein link kholen.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};

// ─── CONFIRM PAYMENT ─────────────────────────────────────
exports.confirmPayment = async (req, res) => {
  const { order_id, upi_ref, payment_method } = req.body;
  try {
    await db.query(
      'UPDATE orders SET payment_status="paid", payment_ref=?, payment_method=? WHERE id=? AND customer_id=?',
      [upi_ref || null, payment_method || 'upi', order_id, req.user.id]
    );

    // Log transaction
    const [rows] = await db.query('SELECT seller_id, total_amount FROM orders WHERE id=?', [order_id]);
    if (rows.length) {
      await db.query(
        'INSERT INTO transactions (order_id, user_id, type, amount, upi_ref, status) VALUES (?,?,?,?,?,?)',
        [order_id, rows[0].seller_id, 'credit', rows[0].total_amount, upi_ref || null, 'success']
      );

      // Notify seller
      await db.query(
        'INSERT INTO notifications (user_id, title, body, type, reference_id) VALUES (?,?,?,?,?)',
        [rows[0].seller_id, '💰 Payment Mili!', `₹${rows[0].total_amount} ka payment aa gaya. UPI Ref: ${upi_ref || 'N/A'}`, 'payment', order_id]
      );

      if (req.io) req.io.to(`seller_${rows[0].seller_id}`).emit('payment_received', { order_id, amount: rows[0].total_amount });
    }

    res.json({ success: true, message: 'Payment confirm ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Confirmation failed.' });
  }
};

// ─── GET SELLER TRANSACTIONS ─────────────────────────────
exports.getTransactions = async (req, res) => {
  try {
    const [txns] = await db.query(
      `SELECT t.*, o.order_number, o.service_type, c.name as customer_name
       FROM transactions t
       JOIN orders o ON o.id = t.order_id
       JOIN users c ON c.id = o.customer_id
       WHERE t.user_id=?
       ORDER BY t.created_at DESC LIMIT 50`,
      [req.user.id]
    );
    res.json({ success: true, transactions: txns });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Transactions nahi mile.' });
  }
};
