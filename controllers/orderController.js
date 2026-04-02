const db   = require('../config/db');
const { v4: uuidv4 } = require('uuid');

// Generate order number like GB-20240401-0001
const genOrderNo = () => {
  const d = new Date();
  const date = `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `GB-${date}-${rand}`;
};

// ─── CREATE ORDER ────────────────────────────────────────
exports.createOrder = async (req, res) => {
  const { seller_id, service_type, items, total_amount, notes, address, booking_date, booking_time, payment_method } = req.body;

  try {
    const order_number = genOrderNo();

    const [result] = await db.query(
      `INSERT INTO orders (order_number, customer_id, seller_id, service_type, total_amount,
        items, notes, address, booking_date, booking_time, payment_method)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [order_number, req.user.id, seller_id, service_type, total_amount,
       JSON.stringify(items || []), notes || null, address || null,
       booking_date || null, booking_time || null, payment_method || 'cash']
    );

    // Notify seller via socket
    if (req.io) {
      req.io.to(`seller_${seller_id}`).emit('new_order', {
        order_id: result.insertId,
        order_number,
        service_type,
        customer_name: req.user.name,
        total_amount
      });
    }

    // Save notification in DB
    await db.query(
      'INSERT INTO notifications (user_id, title, body, type, reference_id) VALUES (?,?,?,?,?)',
      [seller_id, '🔔 Nayi Booking!', `${req.user.name} ne ${service_type} book kiya – ₹${total_amount}`, 'new_order', result.insertId]
    );

    res.status(201).json({
      success: true,
      message: 'Order place ho gaya!',
      order_id: result.insertId,
      order_number
    });
  } catch (err) {
    console.error('Create order error:', err);
    res.status(500).json({ success: false, message: 'Order place nahi hua. Dobara try karein.' });
  }
};

// ─── GET MY ORDERS (Customer) ────────────────────────────
exports.getMyOrders = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let q = `SELECT o.*, u.name as seller_name, sp.business_name, sp.upi_id
             FROM orders o
             JOIN users u ON u.id = o.seller_id
             LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
             WHERE o.customer_id = ?`;
    const params = [req.user.id];
    if (status) { q += ' AND o.status = ?'; params.push(status); }
    q += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [orders] = await db.query(q, params);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Orders nahi mile.' });
  }
};

// ─── GET SELLER ORDERS ───────────────────────────────────
exports.getSellerOrders = async (req, res) => {
  const { status, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  try {
    let q = `SELECT o.*, u.name as customer_name, u.phone as customer_phone
             FROM orders o
             JOIN users u ON u.id = o.customer_id
             WHERE o.seller_id = ?`;
    const params = [req.user.id];
    if (status) { q += ' AND o.status = ?'; params.push(status); }
    q += ' ORDER BY o.created_at DESC LIMIT ? OFFSET ?';
    params.push(Number(limit), Number(offset));

    const [orders] = await db.query(q, params);
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Orders nahi mile.' });
  }
};

// ─── UPDATE ORDER STATUS ─────────────────────────────────
exports.updateStatus = async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowed = {
    seller:   ['confirmed','in_progress','completed','cancelled'],
    customer: ['cancelled'],
    admin:    ['pending','confirmed','in_progress','completed','cancelled']
  };

  try {
    const [rows] = await db.query('SELECT * FROM orders WHERE id=?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order nahi mila.' });

    const order = rows[0];
    const canChange = allowed[req.user.role] || [];
    if (!canChange.includes(status)) {
      return res.status(403).json({ success: false, message: 'Yeh status change nahi kar sakte.' });
    }

    // Only seller can update their orders, customer can only cancel their own
    if (req.user.role === 'seller' && order.seller_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Yeh aapka order nahi hai.' });
    }
    if (req.user.role === 'customer' && order.customer_id !== req.user.id) {
      return res.status(403).json({ success: false, message: 'Yeh aapka order nahi hai.' });
    }

    const completedAt = status === 'completed' ? new Date() : null;
    await db.query('UPDATE orders SET status=?, completed_at=? WHERE id=?', [status, completedAt, id]);

    // Update seller earnings if completed
    if (status === 'completed') {
      await db.query(
        'UPDATE seller_profiles SET total_earnings = total_earnings + ? WHERE user_id=?',
        [order.total_amount, order.seller_id]
      );
    }

    // Notify other party
    const notifyUserId = req.user.role === 'seller' ? order.customer_id : order.seller_id;
    const msgs = {
      confirmed:   '✅ Aapki booking confirm ho gayi!',
      in_progress: '🔧 Kaam shuru ho gaya!',
      completed:   '🎉 Order complete ho gaya!',
      cancelled:   '❌ Order cancel ho gaya.'
    };

    await db.query(
      'INSERT INTO notifications (user_id, title, body, type, reference_id) VALUES (?,?,?,?,?)',
      [notifyUserId, 'Order Update', msgs[status] || 'Status update.', 'order_update', id]
    );

    if (req.io) {
      req.io.to(`user_${notifyUserId}`).emit('order_update', { order_id: id, status });
    }

    res.json({ success: true, message: 'Status update ho gaya!' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Update failed.' });
  }
};

// ─── GET ORDER DETAIL ────────────────────────────────────
exports.getOrderDetail = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT o.*,
        c.name as customer_name, c.phone as customer_phone, c.village as customer_village,
        s.name as seller_name, s.phone as seller_phone,
        sp.business_name, sp.upi_id, sp.rating as seller_rating
       FROM orders o
       JOIN users c  ON c.id = o.customer_id
       JOIN users s  ON s.id = o.seller_id
       LEFT JOIN seller_profiles sp ON sp.user_id = o.seller_id
       WHERE o.id = ?`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, message: 'Order nahi mila.' });

    const order = rows[0];
    if (req.user.role === 'customer' && order.customer_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Access denied.' });
    if (req.user.role === 'seller' && order.seller_id !== req.user.id)
      return res.status(403).json({ success: false, message: 'Access denied.' });

    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error.' });
  }
};
