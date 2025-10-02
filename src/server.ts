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
import { StatusPollerService } from './services/status-poller.service';
import { PesapalService } from './services/pesapal.service';
import { EscrowService } from './services/escrow.service';
import { EmailService } from './services/email.service';

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

// Start polling if enabled
if (process.env.ENABLE_STATUS_POLLING !== 'false') {
  statusPoller.startPolling();
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
app.use('/api/admin', adminRoutes);
app.use('/api/sms/test', smsTestRoutes);
app.use('/api/email/test', emailTestRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    services: {
      pesapal: 'initialized',
      escrow: 'initialized',
      statusPoller: process.env.ENABLE_STATUS_POLLING !== 'false' ? 'running' : 'disabled'
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

app.listen(config.port, () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`🌍 Environment: ${config.pesapal.environment}`);
  console.log(`💰 Default currency: ${config.escrow.defaultCurrency}`);
  console.log(`🔒 Escrow enabled: ${config.features.enableEscrowPayments}`);
});

export default app;