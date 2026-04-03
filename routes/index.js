const express = require('express');
const router  = express.Router();
const { authMiddleware, requireRole } = require('../middleware/auth');

const authCtrl   = require('../controllers/authController');
const orderCtrl  = require('../controllers/orderController');
const sellerCtrl = require('../controllers/sellerController');
const adminCtrl  = require('../controllers/adminController');
const payCtrl    = require('../controllers/paymentController');
const notifCtrl  = require('../controllers/notificationController');
const licCtrl    = require('../controllers/licenseController');

// ─── AUTH ────────────────────────────────────────────────
router.post('/auth/register',         authCtrl.register);
router.post('/auth/login',            authCtrl.login);
router.post('/auth/logout',           authMiddleware, authCtrl.logout);
router.get ('/auth/profile',          authMiddleware, authCtrl.getProfile);
router.put ('/auth/profile',          authMiddleware, authCtrl.updateProfile);
router.put ('/auth/change-password',  authMiddleware, authCtrl.changePassword);

// ─── SELLERS (public) ────────────────────────────────────
router.get('/sellers',                sellerCtrl.getSellers);
router.get('/sellers/:id',            sellerCtrl.getSellerDetail);

// ─── SELLER (protected) ──────────────────────────────────
router.post('/seller/toggle-online',  authMiddleware, requireRole('seller'), sellerCtrl.toggleOnline);
router.get ('/seller/dashboard',      authMiddleware, requireRole('seller'), sellerCtrl.getDashboard);
router.get ('/seller/services',       authMiddleware, requireRole('seller'), sellerCtrl.getMyServices);
router.post('/seller/services',       authMiddleware, requireRole('seller'), sellerCtrl.upsertService);
router.post('/seller/review',         authMiddleware, requireRole('customer'), sellerCtrl.submitReview);

// ─── ORDERS ──────────────────────────────────────────────
router.post('/orders',                authMiddleware, requireRole('customer'), orderCtrl.createOrder);
router.get ('/orders/my',             authMiddleware, requireRole('customer'), orderCtrl.getMyOrders);
router.get ('/orders/seller',         authMiddleware, requireRole('seller'),   orderCtrl.getSellerOrders);
router.get ('/orders/:id',            authMiddleware, orderCtrl.getOrderDetail);
router.put ('/orders/:id/status',     authMiddleware, orderCtrl.updateStatus);

// ─── PAYMENT ─────────────────────────────────────────────
router.post('/payment/upi/initiate',  authMiddleware, requireRole('customer'), payCtrl.initiateUpi);
router.post('/payment/confirm',       authMiddleware, requireRole('customer'), payCtrl.confirmPayment);
router.get ('/payment/transactions',  authMiddleware, requireRole('seller'),   payCtrl.getTransactions);

// ─── NOTIFICATIONS ───────────────────────────────────────
router.get ('/notifications',         authMiddleware, notifCtrl.getNotifications);
router.put ('/notifications/:id/read',authMiddleware, notifCtrl.markRead);

// ─── ADMIN & SUPER ADMIN ─────────────────────────────────
router.get ('/admin/overview',         authMiddleware, requireRole('admin'), adminCtrl.overview);
router.get ('/admin/users',            authMiddleware, requireRole('admin'), adminCtrl.listUsers);
router.put ('/admin/users/:id/toggle', authMiddleware, requireRole('admin'), adminCtrl.toggleUser);
router.get ('/admin/orders',           authMiddleware, requireRole('admin'), adminCtrl.listOrders);
router.post('/admin/broadcast',        authMiddleware, requireRole('admin'), adminCtrl.broadcast);
router.post('/admin/make-superadmin',  authMiddleware, adminCtrl.createSuperAdmin);

// ─── LICENSES (Super Admin only) ─────────────────────────
router.get ('/admin/licenses',              authMiddleware, requireRole('super_admin'), licCtrl.getLicenses);
router.get ('/admin/licenses/seller/:sellerId', authMiddleware, requireRole('super_admin'), licCtrl.getSellerLicense);
router.post('/admin/licenses',              authMiddleware, requireRole('super_admin'), licCtrl.createLicense);
router.put ('/admin/licenses/:id',          authMiddleware, requireRole('super_admin'), licCtrl.updateLicense);
router.delete('/admin/licenses/:id',        authMiddleware, requireRole('super_admin'), licCtrl.deleteLicense);

module.exports = router;
