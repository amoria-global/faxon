# Unified Payment System Implementation Guide

## Overview

This document outlines the implementation of a unified payment system that consolidates PesaPal, PawaPay, and Xentripay into a single, modular architecture with admin-controlled provider selection.

## Architecture

### Key Components

1. **Unified Types** (`src/types/unified-payment.types.ts`) ✅
   - Common interfaces for all payment providers
   - Provider enums and configuration types
   - Request/Response normalization

2. **Provider Adapters** (`src/services/payment/providers/`)
   - `pesapal.adapter.ts` - Adapts PesaPal API to unified interface
   - `pawapay.adapter.ts` - Adapts PawaPay API to unified interface
   - `xentripay.adapter.ts` - Adapts Xentripay API to unified interface

3. **Provider Factory** (`src/services/payment/payment-provider.factory.ts`)
   - Manages provider instances
   - Handles provider selection based on:
     - Admin configuration (database)
     - Country
     - Payment method
     - Currency
   - Implements fallback logic

4. **Unified Payment Service** (`src/services/payment/unified-payment.service.ts`)
   - Single entry point for all payment operations
   - Delegates to appropriate provider via factory
   - Handles cross-provider operations

5. **Payment Email Service** (`src/services/payment/payment-email.service.ts`)
   - Unified Brevo email notifications
   - Works with all providers

6. **Unified Controller** (`src/controllers/unified-payment.controller.ts`)
   - Single controller for all payment operations
   - Replaces pesapal, pawapay, xentripay controllers

7. **Unified Routes** (`src/routes/unified-payment.routes.ts`)
   - Single route file
   - Replaces separate provider routes

8. **Provider Middleware** (`src/middleware/payment-provider.middleware.ts`)
   - Provider selection logic
   - Rate limiting per provider
   - Request validation

## Database Schema

### Admin Provider Configuration Table

```sql
CREATE TABLE payment_provider_config (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL, -- 'pesapal', 'pawapay', 'xentripay'
  enabled BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 1, -- Lower = higher priority

  -- Supported features
  supported_methods JSONB, -- ['mtn_momo', 'airtel_money', 'visa', etc.]
  supported_countries JSONB, -- ['RW', 'KE', 'UG', etc.]
  supported_currencies JSONB, -- ['RWF', 'USD', 'KES', etc.]

  -- Limits
  min_amount DECIMAL(15,2),
  max_amount DECIMAL(15,2),

  -- API settings (encrypted)
  api_config JSONB, -- { apiKey, baseUrl, environment, etc. }

  -- Features
  supports_deposits BOOLEAN DEFAULT true,
  supports_payouts BOOLEAN DEFAULT true,
  supports_refunds BOOLEAN DEFAULT true,
  supports_bulk_payouts BOOLEAN DEFAULT false,
  supports_recipient_validation BOOLEAN DEFAULT false,

  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Routing rules
CREATE TABLE payment_routing_rules (
  id SERIAL PRIMARY KEY,
  rule_type VARCHAR(50) NOT NULL, -- 'country', 'payment_method', 'currency'
  rule_key VARCHAR(50) NOT NULL, -- 'RW', 'mtn_momo', 'RWF', etc.
  provider VARCHAR(50) NOT NULL,
  priority INTEGER DEFAULT 1,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Transaction provider mapping
ALTER TABLE escrow_transactions ADD COLUMN payment_provider VARCHAR(50);
ALTER TABLE escrow_transactions ADD COLUMN provider_transaction_id VARCHAR(255);
```

## Implementation Steps

### Step 1: Provider Adapters

Each adapter implements the `IPaymentProvider` interface:

```typescript
// Example: pesapal.adapter.ts
import { IPaymentProvider, PaymentProvider, UnifiedDepositRequest, etc } from '../../types/unified-payment.types';
import { PesapalService } from '../pesapal.service';

export class PesapalAdapter implements IPaymentProvider {
  private pesapalService: PesapalService;

  constructor(config: any) {
    this.pesapalService = new PesapalService(config);
  }

  getProviderName(): PaymentProvider {
    return PaymentProvider.PESAPAL;
  }

  async isAvailable(): Promise<boolean> {
    return await this.pesapalService.healthCheck();
  }

  async initiateDeposit(request: UnifiedDepositRequest): Promise<UnifiedDepositResponse> {
    // Convert unified request to Pesapal request
    const pesapalRequest = {
      amount: request.amount,
      currency: request.currency,
      // ... map all fields
    };

    // Call Pesapal service
    const result = await this.pesapalService.createCheckout(pesapalRequest);

    // Convert Pesapal response to unified response
    return {
      success: true,
      transactionId: request.transactionId,
      providerTransactionId: result.order_tracking_id,
      provider: PaymentProvider.PESAPAL,
      // ... map all fields
    };
  }

  // Implement all other IPaymentProvider methods...
}
```

### Step 2: Provider Factory

```typescript
// payment-provider.factory.ts
export class PaymentProviderFactory {
  private providers: Map<PaymentProvider, IPaymentProvider>;
  private config: PaymentProviderSettings;

  constructor() {
    this.providers = new Map();
    this.loadConfiguration(); // From database
    this.initializeProviders();
  }

  async loadConfiguration() {
    // Load from database (payment_provider_config table)
    const configs = await db.query('SELECT * FROM payment_provider_config WHERE enabled = true ORDER BY priority');
    this.config = this.buildSettings(configs);
  }

  private initializeProviders() {
    for (const config of this.config.providers) {
      if (!config.enabled) continue;

      switch (config.provider) {
        case PaymentProvider.PESAPAL:
          this.providers.set(PaymentProvider.PESAPAL, new PesapalAdapter(config));
          break;
        case PaymentProvider.PAWAPAY:
          this.providers.set(PaymentProvider.PAWAPAY, new PawaPawAdapter(config));
          break;
        case PaymentProvider.XENTRIPAY:
          this.providers.set(PaymentProvider.XENTRIPAY, new XentripayAdapter(config));
          break;
      }
    }
  }

  async getProvider(options: {
    provider?: PaymentProvider;
    country?: PaymentCountry;
    paymentMethod?: PaymentMethod;
    currency?: string;
  }): Promise<IPaymentProvider> {
    // 1. If provider explicitly specified, use it
    if (options.provider) {
      return this.providers.get(options.provider);
    }

    // 2. Check routing rules
    const provider = await this.selectProviderByRules(options);
    if (provider) {
      return this.providers.get(provider);
    }

    // 3. Use default provider
    if (this.config.defaultProvider) {
      return this.providers.get(this.config.defaultProvider);
    }

    // 4. Use first available provider
    return Array.from(this.providers.values())[0];
  }

  private async selectProviderByRules(options: any): Promise<PaymentProvider | null> {
    // Check database routing rules
    const rules = await db.query(`
      SELECT provider FROM payment_routing_rules
      WHERE enabled = true
        AND ((rule_type = 'country' AND rule_key = $1)
          OR (rule_type = 'payment_method' AND rule_key = $2)
          OR (rule_type = 'currency' AND rule_key = $3))
      ORDER BY priority LIMIT 1
    `, [options.country, options.paymentMethod, options.currency]);

    return rules.rows[0]?.provider || null;
  }
}
```

### Step 3: Unified Payment Service

```typescript
// unified-payment.service.ts
export class UnifiedPaymentService {
  private factory: PaymentProviderFactory;
  private emailService: PaymentEmailService;

  constructor() {
    this.factory = new PaymentProviderFactory();
    this.emailService = new PaymentEmailService();
  }

  async initiateDeposit(request: UnifiedDepositRequest): Promise<UnifiedDepositResponse> {
    // Get appropriate provider
    const provider = await this.factory.getProvider({
      provider: request.provider,
      country: request.country,
      paymentMethod: request.paymentMethod,
      currency: request.currency
    });

    // Execute deposit
    const response = await provider.initiateDeposit(request);

    // Send email notification
    await this.emailService.sendDepositInitiated({
      to: request.recipient.email,
      transactionId: response.transactionId,
      amount: response.amount,
      provider: response.provider
    });

    return response;
  }

  // Similar for payout, refund, status check, etc.
}
```

### Step 4: Unified Controller

```typescript
// unified-payment.controller.ts
export class UnifiedPaymentController {
  private paymentService: UnifiedPaymentService;

  // POST /api/payments/deposit
  async initiateDeposit(req: Request, res: Response) {
    const request: UnifiedDepositRequest = {
      transactionId: generateId(),
      amount: req.body.amount,
      currency: req.body.currency,
      description: req.body.description,
      recipient: req.body.recipient,
      provider: req.body.provider, // Optional - auto-selected if not provided
      paymentMethod: req.body.paymentMethod,
      country: req.body.country
    };

    const response = await this.paymentService.initiateDeposit(request);
    res.json(response);
  }

  // POST /api/payments/payout
  async initiatePayout(req: Request, res: Response) { ... }

  // POST /api/payments/refund
  async initiateRefund(req: Request, res: Response) { ... }

  // GET /api/payments/:transactionId/status
  async getStatus(req: Request, res: Response) { ... }

  // POST /api/payments/webhook/:provider
  async handleWebhook(req: Request, res: Response) {
    const provider = req.params.provider;
    const providerInstance = await this.factory.getProvider({ provider });

    // Validate webhook
    const isValid = providerInstance.validateWebhook(req.body, req.headers['signature']);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // Parse webhook
    const data = providerInstance.parseWebhook(req.body);

    // Process webhook (update database, send notifications, etc.)
    await this.processWebhook(data);

    res.json({ success: true });
  }
}
```

### Step 5: Unified Routes

```typescript
// unified-payment.routes.ts
const router = express.Router();
const controller = new UnifiedPaymentController();

// Payment operations
router.post('/deposit', authMiddleware, controller.initiateDeposit);
router.post('/payout', authMiddleware, controller.initiatePayout);
router.post('/refund', authMiddleware, adminMiddleware, controller.initiateRefund);
router.get('/:transactionId/status', authMiddleware, controller.getStatus);

// Webhooks (one route per provider)
router.post('/webhook/pesapal', controller.handleWebhook);
router.post('/webhook/pawapay', controller.handleWebhook);
router.post('/webhook/xentripay', controller.handleWebhook);

// Admin routes
router.get('/admin/providers', adminMiddleware, controller.listProviders);
router.put('/admin/providers/:provider', adminMiddleware, controller.updateProviderConfig);
router.post('/admin/routing-rules', adminMiddleware, controller.createRoutingRule);

export default router;
```

### Step 6: Update server.ts

```typescript
// server.ts
import unifiedPaymentRoutes from './routes/unified-payment.routes';

// Replace all old routes with:
app.use('/api/payments', unifiedPaymentRoutes);

// Remove old routes:
// app.use('/api/pesapal', ...);
// app.use('/api/pawapay', ...);
// app.use('/api/xentripay', ...);
```

## Admin Dashboard Configuration

### Provider Management

```typescript
// Admin API to enable/disable providers
PUT /api/payments/admin/providers/pesapal
{
  "enabled": true,
  "priority": 1,
  "supportedMethods": ["mtn_momo", "airtel_money", "visa", "mastercard"],
  "supportedCountries": ["RW", "UG", "KE"],
  "minAmount": 100,
  "maxAmount": 10000000
}
```

### Routing Rules

```typescript
// Configure which provider handles which country/method
POST /api/payments/admin/routing-rules
{
  "ruleType": "country",
  "ruleKey": "RW",
  "provider": "xentripay",
  "priority": 1
}

POST /api/payments/admin/routing-rules
{
  "ruleType": "paymentMethod",
  "ruleKey": "mtn_momo",
  "provider": "pawapay",
  "priority": 1
}
```

## Migration Strategy

1. **Phase 1: Create new structure** (no breaking changes)
   - Create all new files
   - Keep old routes/controllers active

2. **Phase 2: Parallel operation**
   - Run both old and new systems
   - Route new transactions to unified system
   - Keep old transactions on old system

3. **Phase 3: Migration**
   - Migrate old transaction records
   - Update references

4. **Phase 4: Cleanup**
   - Remove old controllers/routes/services
   - Archive old code

## Benefits

1. **Single Integration Point** - One controller, one service, one route file
2. **Dynamic Provider Selection** - Admin can choose providers without code changes
3. **Easy to Add Providers** - Just create new adapter
4. **Unified Monitoring** - All payments tracked the same way
5. **Consistent Email Notifications** - One email service for all providers
6. **Simplified Testing** - Test one interface, not three
7. **Better Error Handling** - Unified error responses
8. **Provider Fallback** - Automatic fallback if one provider fails

## Testing

```typescript
// Test provider selection
describe('PaymentProviderFactory', () => {
  it('should select PawaPay for Kenya MTN', async () => {
    const provider = await factory.getProvider({
      country: PaymentCountry.KENYA,
      paymentMethod: PaymentMethod.MTN_MOMO
    });
    expect(provider.getProviderName()).toBe(PaymentProvider.PAWAPAY);
  });

  it('should select Xentripay for Rwanda', async () => {
    const provider = await factory.getProvider({
      country: PaymentCountry.RWANDA
    });
    expect(provider.getProviderName()).toBe(PaymentProvider.XENTRIPAY);
  });
});
```

## Environment Variables

```env
# Provider selection
DEFAULT_PAYMENT_PROVIDER=pawapay
ENABLE_PAYMENT_FALLBACK=true

# Providers remain the same
PESAPAL_CONSUMER_KEY=xxx
PAWAPAY_API_KEY=xxx
XENTRIPAY_API_KEY=xxx
```

## Next Steps

1. Review this architecture
2. Create provider adapters
3. Create factory and unified service
4. Create controller and routes
5. Add admin provider management UI
6. Test with all three providers
7. Deploy and monitor

Would you like me to proceed with creating the actual implementation files?
