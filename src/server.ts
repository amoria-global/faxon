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
import smsTestRoutes from './routes/sms.test.routes';
import emailTestRoutes from './routes/email.test.routes';
import adminRoutes from './routes/admin.routes';
import XentriPayRoutes from './routes/xentripay.routes';
import pawaPayRoutes from './routes/pawapay.routes'; // PawaPay routes
import pawaPayCallbackRoutes from './routes/pawapay.callback'; // PawaPay callback
import kycReminderRoutes from './routes/kyc-reminder.routes'; // NEW
import bookingCleanupRoutes from './routes/booking-cleanup.routes'; // NEW
import agentCommissionRoutes from './routes/agent-commission.routes'; // NEW
import { ReminderSchedulerService } from './services/reminder-scheduler.service'; // NEW
import { BookingCleanupSchedulerService } from './services/booking-cleanup-scheduler.service'; // NEW
import { PesapalService } from './services/pesapal.service';
import { EmailService } from './services/email.service';
import { EscrowService } from './services/escrow.service';
import { StatusPollerService } from './services/status-poller.service';

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:3001',
    'https://jambolush.com',
    'https://app.jambolush.com',
    'http://jambolush.com',
    'http://app.jambolush.com',
    'https://www.jambolush.com',
    'https://www.app.jambolush.com',
    'https://admin.amoriaglobal.com',
    'https://www.admin.amoriaglobal.com',
    'https://amoriaglobal.com',
    'https://www.amoriaglobal.com'
  ],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Request logger middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`➡️  [${req.method}] ${req.originalUrl}`);
  console.log('Headers:', req.headers);
  if (Object.keys(req.body || {}).length) {
    console.log('Body:', req.body);
  }

  const oldSend = res.send;
  res.send = function (data) {
    const duration = Date.now() - start;
    console.log(`⬅️  Response to [${req.method}] ${req.originalUrl} (${duration}ms)`);
    try {
      console.log('Status:', res.statusCode);
      console.log('Response:', JSON.parse(data as any));
    } catch {
      console.log('Response:', data);
    }
    // @ts-ignore
    return oldSend.apply(res, arguments);
  };

  next();
});

// Initialize services BEFORE using them
const pesapalService = new PesapalService({
  consumerKey: config.pesapal.consumerKey,
  consumerSecret: config.pesapal.consumerSecret,
  baseUrl: config.pesapal.baseUrl,
  environment: config.pesapal.environment,
  timeout: config.pesapal.timeout,
  retryAttempts: config.pesapal.retryAttempts,
  webhookSecret: config.pesapal.webhookSecret,
  callbackUrl: config.pesapal.callbackUrl,
  defaultCurrency: config.escrow.defaultCurrency,
  merchantAccount: config.pesapal.merchantAccount
});

const emailService = new EmailService();
const escrowService = new EscrowService(pesapalService, emailService);

// Initialize status poller
const statusPoller = new StatusPollerService(pesapalService, escrowService);

// NEW: Initialize KYC Reminder Scheduler
const reminderScheduler = new ReminderSchedulerService(2); // Check every 2 minutes

// NEW: Initialize Booking Cleanup Scheduler
const bookingCleanupScheduler = new BookingCleanupSchedulerService(6); // Check every 6 hours

// Start polling if enabled
if (process.env.ENABLE_STATUS_POLLING !== 'false') {
  statusPoller.startPolling();
}

// NEW: Start KYC reminder scheduler if enabled
if (process.env.ENABLE_KYC_REMINDERS !== 'false') {
  reminderScheduler.start();
  console.log('✅ KYC Reminder Scheduler initialized and running');
} else {
  console.log('⏸️  KYC Reminder Scheduler disabled by configuration');
}

// NEW: Start Booking Cleanup scheduler if enabled
if (process.env.ENABLE_BOOKING_CLEANUP !== 'false') {
  bookingCleanupScheduler.start();
  console.log('✅ Booking Cleanup Scheduler initialized and running');
} else {
  console.log('⏸️  Booking Cleanup Scheduler disabled by configuration');
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', require('./routes/escrow.routes').default);
app.use('/api/payments/withdrawal', withdrawalRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/tours', require('./routes/tours.routes').default);
app.use('/api/notifications', notificationRoutes);
app.use('/api/help', helpRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/pesapal', require('./routes/pesapal.callback').default);
app.use('/api/xentripay', require('./routes/xentripay.callback').default);
app.use('/api/pawapay', pawaPayRoutes); // PawaPay API routes
app.use('/api/pawapay/callback', pawaPayCallbackRoutes); // PawaPay callback/webhook
app.use('/api/admin', adminRoutes);
app.use('/api/sms/test', smsTestRoutes);
app.use('/api/email/test', emailTestRoutes);
app.use("/api/payments/xentripay", XentriPayRoutes);
app.use('/api/kyc-reminders', kycReminderRoutes); // NEW: KYC reminder routes
app.use('/api/booking-cleanup', bookingCleanupRoutes); // NEW: Booking cleanup routes
app.use('/api', agentCommissionRoutes); // NEW: Agent commission and owner management routes

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    services: {
      pesapal: 'initialized',
      escrow: 'initialized',
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
  console.log('\n🛑 Received shutdown signal, cleaning up...');

  // Stop schedulers
  if (process.env.ENABLE_STATUS_POLLING !== 'false') {
    // statusPoller.stop(); // If StatusPollerService has a stop method
  }

  if (process.env.ENABLE_KYC_REMINDERS !== 'false') {
    reminderScheduler.stop();
  }

  if (process.env.ENABLE_BOOKING_CLEANUP !== 'false') {
    bookingCleanupScheduler.stop();
  }

  process.exit(0);
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

app.listen(config.port, () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`🌍 Environment: ${config.pesapal.environment}`);
  console.log(`💰 Default currency: ${config.escrow.defaultCurrency}`);
  console.log(`🔒 Escrow enabled: ${config.features.enableEscrowPayments}`);
  console.log(`📧 KYC Reminders: ${process.env.ENABLE_KYC_REMINDERS !== 'false' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`⏰ Status Poller: ${process.env.ENABLE_STATUS_POLLING !== 'false' ? 'ENABLED' : 'DISABLED'}`);
  console.log(`🧹 Booking Cleanup: ${process.env.ENABLE_BOOKING_CLEANUP !== 'false' ? 'ENABLED' : 'DISABLED'}`);
});

export default app;