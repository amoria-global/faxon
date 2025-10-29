// src/server.ts
import express from 'express';
import cors from 'cors';
import config from './config/config';
import authRoutes from './routes/auth.routes';
import propertyRoutes from './routes/property.routes';
import bookingRoutes from './routes/booking.routes';
import uploadRoutes from './routes/upload.routes';
import withdrawalRoutes from './routes/withdrawal.routes';
import notificationRoutes from './routes/notification.routes';
import helpRoutes from './routes/help.routes';
import settingsRoutes from './routes/settings.routes';
import adminRoutes from './routes/admin.routes';
import publicRoutes from './routes/public.routes';
import XentriPayRoutes from './routes/xentripay.routes';
import pawaPayRoutes from './routes/pawapay.routes'; // PawaPay routes
import pawaPayCallbackRoutes from './routes/pawapay.callback'; // PawaPay callback
import kycReminderRoutes from './routes/kyc-reminder.routes'; // NEW
import bookingCleanupRoutes from './routes/booking-cleanup.routes'; // NEW
import agentCommissionRoutes from './routes/agent-commission.routes'; // NEW
import bookingLeadsRoutes from './routes/booking-leads.routes'; // NEW - Booking leads/archive management
import { ReminderSchedulerService } from './services/reminder-scheduler.service'; // NEW
import { BookingCleanupSchedulerService } from './services/booking-cleanup-scheduler.service'; // NEW
import { StatusPollerService } from './services/status-poller.service';
import { PawaPayService } from './services/pawapay.service';
import { XentriPayService } from './services/xentripay.service';
import unifiedTransactionRoutes from './routes/unified-transaction.routes';
import checkinRoutes from './routes/checkin.routes';

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'https://jambolush.com',
    'https://app.jambolush.com',
    'http://jambolush.com',
    'http://app.jambolush.com',
    'https://www.jambolush.com',
    'https://www.app.jambolush.com',
    'https://admin.amoriaglobal.com',
    'https://www.admin.amoriaglobal.com',
    'https://amoriaglobal.com',
    'https://www.amoriaglobal.com',
    'https://api.pawapay.io',
    'https://api.sandbox.pawapay.io',
    'https://pawapay.io',
    'https://dashboard.pawapay.io'
  ],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lightweight request logger (only in development)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      console.log(`[${req.method}] ${req.originalUrl} - ${res.statusCode} (${duration}ms)`);
    });
    next();
  });
}

// Initialize PawaPay service
const pawaPayService = new PawaPayService({
  apiKey: config.pawapay.apiKey,
  baseUrl: config.pawapay.baseUrl,
  environment: config.pawapay.environment
});

// Initialize XentriPay service
const xentriPayService = new XentriPayService({
  apiKey: config.xentripay.apiKey,
  baseUrl: config.xentripay.baseUrl,
  environment: config.xentripay.environment
});

// Initialize status poller with all payment services
const statusPoller = new StatusPollerService(
  pawaPayService,
  xentriPayService
);

const reminderScheduler = new ReminderSchedulerService(2);
const bookingCleanupScheduler = new BookingCleanupSchedulerService(6);

// Start schedulers if enabled
if (process.env.ENABLE_STATUS_POLLING !== 'false') statusPoller.startPolling();
if (process.env.ENABLE_KYC_REMINDERS !== 'false') reminderScheduler.start();
if (process.env.ENABLE_BOOKING_CLEANUP !== 'false') bookingCleanupScheduler.start();

// Routes
app.use('/api/public', publicRoutes); // Public routes (no auth required)
app.use('/api/auth', authRoutes);
app.use('/api/payments/withdrawal', withdrawalRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/tours', require('./routes/tours.routes').default);
app.use('/api/notifications', notificationRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/xentripay', require('./routes/xentripay.callback').default);
app.use('/api/pawapay', pawaPayRoutes); // PawaPay API routes
app.use('/api/pawapay/callback', pawaPayCallbackRoutes); // PawaPay callback/webhook
app.use('/api/admin', adminRoutes);
app.use("/api/payments/xentripay", XentriPayRoutes);
app.use('/api/kyc-reminders', kycReminderRoutes); // NEW: KYC reminder routes
app.use('/api/booking-cleanup', bookingCleanupRoutes); // NEW: Booking cleanup routes
app.use('/api', agentCommissionRoutes); // NEW: Agent commission and owner management routes
app.use('/api/admin/booking-leads', bookingLeadsRoutes); // NEW: Booking leads/archive management (admin only)
app.use('/api/transactions', unifiedTransactionRoutes); // NEW: Unified transaction routes (all providers)
app.use('/api/checkin', checkinRoutes); // NEW: Check-in/check-out routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    services: {
      xentripay: 'initialized',
      pawapay: 'initialized', // PawaPay integration
      statusPoller: process.env.ENABLE_STATUS_POLLING !== 'false' ? 'running' : 'disabled',
      kycReminders: process.env.ENABLE_KYC_REMINDERS !== 'false' ? 'running' : 'disabled',
      bookingCleanup: process.env.ENABLE_BOOKING_CLEANUP !== 'false' ? 'running' : 'disabled' // NEW
    },
    schedulers: {
      statusPoller: {
        enabled: process.env.ENABLE_STATUS_POLLING !== 'false',
        status: 'running'
      },
      kycReminders: reminderScheduler.getStatus(),
      bookingCleanup: bookingCleanupScheduler.getStatus() // NEW
    }
  });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('❌ Error stack:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  });
});

// Graceful shutdown
const gracefulShutdown = () => {
  console.log('Shutting down gracefully...');
  if (process.env.ENABLE_KYC_REMINDERS !== 'false') reminderScheduler.stop();
  if (process.env.ENABLE_BOOKING_CLEANUP !== 'false') bookingCleanupScheduler.stop();
  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port} [${process.env.NODE_ENV || 'development'}]`);
  console.log(`XentriPay Base URL: ${config.xentripay.baseUrl}`);
});

export default app;