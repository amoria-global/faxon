import express from 'express';
import cors from 'cors';
import { config } from './config/config';
import authRoutes from './routes/auth.routes';
import paymentRoutes from './routes/payment.routes';
import propertyRoutes from './routes/property.routes';
import bookingRoutes from './routes/booking.routes';
import uploadRoutes from './routes/upload.routes';

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
  ],
  credentials: true
}));
app.use(express.json());

// Request logger middleware
app.use((req, res, next) => {
  const start = Date.now();
  console.log(`➡️  [${req.method}] ${req.originalUrl}`);
  console.log('Headers:', req.headers);
  if (Object.keys(req.body || {}).length) {
    console.log('Body:', req.body);
  }

  // Capture the original send method
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

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/tours', require('./routes/tours.routes').default); // Importing tours routes


// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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
});
