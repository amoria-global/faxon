import express from 'express';
import cors from 'cors';
import { config } from './config/config';
import authRoutes from './routes/auth.routes';
import paymentRoutes from './routes/payment.routes';
import propertyRoutes from './routes/property.routes'; // ADDED: Import property routes consistently

const app = express();

// Middleware
app.use(cors({
  origin: config.clientUrl,
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/properties', propertyRoutes); // UPDATED: Use the imported property routes

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  });
});

app.listen(config.port, () => {
  console.log(`Server running on port ${config.port}`);
});