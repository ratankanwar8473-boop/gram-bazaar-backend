const jwt = require('jsonwebtoken');

module.exports = (io) => {
  // Auth middleware for socket
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication error'));
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.id;
      socket.userRole = decoded.role;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: user_${socket.userId} (${socket.userRole})`);

    // Join personal room
    socket.join(`user_${socket.userId}`);
    if (socket.userRole === 'seller') {
      socket.join(`seller_${socket.userId}`);
    }

    // Seller online/offline broadcast
    socket.on('seller_status', ({ is_online }) => {
      socket.broadcast.emit('seller_status_change', {
        seller_id: socket.userId,
        is_online
      });
    });

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: user_${socket.userId}`);
    });
  });
};
