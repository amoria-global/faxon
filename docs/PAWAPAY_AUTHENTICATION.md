# PawaPay Bearer Token Authentication Setup

This document explains how bearer token authentication is implemented for PawaPay integration in both API requests and webhook callbacks.

## Overview

The PawaPay integration uses bearer token authentication for:
1. **Outgoing API requests** - When our server calls PawaPay API
2. **Incoming webhook callbacks** - When PawaPay sends transaction updates to our server

## Configuration

### Environment Variables

Add these to your `.env` file:

**Sandbox (Default):**
```env
PAWAPAY_ENVIRONMENT=sandbox
PAWAPAY_API_KEY=your_sandbox_api_key
PAWAPAY_WEBHOOK_SECRET=your_webhook_secret
PAWAPAY_CALLBACK_URL=http://localhost:5000/api/pawapay/callback
```

**Production:**
```env
PAWAPAY_ENVIRONMENT=production
PAWAPAY_API_KEY=your_production_api_key
PAWAPAY_WEBHOOK_SECRET=your_webhook_secret
PAWAPAY_CALLBACK_URL=https://yourdomain.com/api/pawapay/callback
PAWAPAY_ALLOWED_IPS=1.2.3.4,5.6.7.8
```

**URLs:**
- Sandbox: `https://api.sandbox.pawapay.io`
- Production: `https://api.pawapay.io`

### Configuration File

The configuration is defined in `src/config/config.ts`:

```typescript
pawapay: {
  apiKey: process.env.PAWAPAY_API_KEY!,
  baseUrl: process.env.PAWAPAY_BASE_URL || (process.env.PAWAPAY_ENVIRONMENT === 'production' ? 'https://api.pawapay.io' : 'https://api.sandbox.pawapay.io'),
  environment: (process.env.PAWAPAY_ENVIRONMENT || 'sandbox') as 'production' | 'sandbox',
  webhookSecret: process.env.PAWAPAY_WEBHOOK_SECRET || '',
  callbackUrl: process.env.PAWAPAY_CALLBACK_URL || 'http://localhost:5000/api/pawapay/callback',
  timeout: parseInt(process.env.PAWAPAY_TIMEOUT || '30000'),
}
```

## Implementation Details

### 1. Outgoing API Requests (Server → PawaPay)

**File**: `src/services/pawapay.service.ts`

The PawaPay service automatically includes the bearer token in all API requests:

```typescript
this.client = axios.create({
  baseURL: this.config.baseUrl,
  timeout: this.config.timeout,
  headers: {
    'Authorization': `Bearer ${this.config.apiKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});
```

**What this does:**
- Adds `Authorization: Bearer <token>` header to all API requests
- PawaPay validates this token and processes the request
- No additional action needed in controllers

### 2. Incoming Webhook Callbacks (PawaPay → Server)

**Files**:
- `src/middleware/pawapay.middleware.ts` - Authentication logic
- `src/routes/pawapay.callback.ts` - Webhook endpoint

The webhook endpoint validates incoming requests using multiple security layers:

#### Layer 1: Bearer Token Validation

```typescript
const bearerToken = req.headers['authorization'] as string;
const expectedToken = `Bearer ${config.pawapay.apiKey}`;

if (bearerToken !== expectedToken) {
  res.status(401).json({
    success: false,
    message: 'Unauthorized: Invalid bearer token'
  });
  return;
}
```

#### Layer 2: Webhook Signature Validation (HMAC-SHA256)

```typescript
const signature = req.headers['x-pawapay-signature'] as string;
const rawBody = JSON.stringify(req.body);
const isValid = pawaPayService.validateWebhookSignature(rawBody, signature);

if (!isValid) {
  res.status(401).json({
    success: false,
    message: 'Unauthorized: Invalid webhook signature'
  });
  return;
}
```

#### Layer 3: IP Whitelist (Optional)

```typescript
const allowedIPs = process.env.PAWAPAY_ALLOWED_IPS?.split(',') || [];
const clientIP = (req.ip || req.connection.remoteAddress || '').replace('::ffff:', '');

if (!allowedIPs.includes(clientIP)) {
  res.status(403).json({
    success: false,
    message: 'Forbidden: IP not whitelisted'
  });
  return;
}
```

## Webhook Flow

```
PawaPay Server
      ↓
   [HTTPS Request]
      ↓
   POST /api/pawapay/callback
      ↓
   Headers:
   - Authorization: Bearer <token>
   - X-PawaPay-Signature: <hmac>
   - Content-Type: application/json
      ↓
   [logPawaPayRequest middleware]
      ↓
   [validatePawaPayWebhook middleware]
      ↓
   - Check bearer token ✓
   - Validate signature ✓
   - Check IP (if configured) ✓
      ↓
   [Webhook Handler]
      ↓
   - Log to database
   - Update transaction status
   - Trigger business logic
      ↓
   Response: 200 OK
```

## API Endpoints

### Webhook Endpoint

**URL**: `POST /api/pawapay/callback`

**Authentication**: Bearer token + HMAC signature

**Request Headers**:
```http
Authorization: Bearer eyJraWQiOiIxIiwiYWxnIjoiRVMyNTYifQ...
X-PawaPay-Signature: abc123def456...
Content-Type: application/json
```

**Request Body** (Deposit Example):
```json
{
  "depositId": "DEP_1234567890",
  "status": "COMPLETED",
  "requestedAmount": "10000",
  "depositedAmount": "10000",
  "currency": "RWF",
  "country": "RWA",
  "correspondent": "MTN_MOMO_RWA",
  "payer": {
    "type": "MSISDN",
    "address": {
      "value": "250788123456"
    }
  },
  "customerTimestamp": "2024-01-15T10:30:00Z",
  "statementDescription": "Payment for booking",
  "correspondentIds": {
    "PROVIDER_TRANSACTION_ID": "MP123456",
    "FINANCIAL_TRANSACTION_ID": "FIN789012"
  }
}
```

**Response**:
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "transactionId": "DEP_1234567890",
  "status": "COMPLETED"
}
```

### Regular API Endpoints

All authenticated endpoints under `/api/pawapay/*` require user authentication via JWT token.

**Example**: Initiate Deposit

**URL**: `POST /api/pawapay/deposit`

**Headers**:
```http
Authorization: Bearer <user_jwt_token>
Content-Type: application/json
```

**Body**:
```json
{
  "amount": 10000,
  "currency": "RWF",
  "phoneNumber": "0788123456",
  "provider": "MTN",
  "country": "RW",
  "description": "Payment for booking #123"
}
```

## Security Best Practices

### 1. Environment-Specific Configuration

**Development/Sandbox:**
```env
PAWAPAY_API_KEY=sandbox_token_here
PAWAPAY_BASE_URL=https://test.pawapay.cloud
PAWAPAY_ENVIRONMENT=sandbox
```

**Production:**
```env
PAWAPAY_API_KEY=production_token_here
PAWAPAY_BASE_URL=https://api.pawapay.cloud
PAWAPAY_ENVIRONMENT=production
```

### 2. Webhook Secret Management

1. Get webhook secret from PawaPay dashboard
2. Store in environment variable: `PAWAPAY_WEBHOOK_SECRET`
3. Never commit to version control
4. Rotate periodically (every 90 days recommended)

### 3. IP Whitelisting (Production Only)

1. Get PawaPay's webhook IP addresses
2. Add to `.env`:
   ```env
   PAWAPAY_ALLOWED_IPS=52.12.34.56,52.12.34.57
   ```
3. Enable in production only

### 4. HTTPS Required

- Always use HTTPS for webhook endpoints in production
- PawaPay will reject HTTP callbacks
- Update callback URL: `https://yourdomain.com/api/pawapay/callback`

## Testing

### Test Bearer Token Authentication

1. **Test outgoing requests**:

```bash
# Check logs for successful API calls
curl -X GET "http://localhost:5000/api/pawapay/config"
```

Look for log entries:
```
PawaPay API Request: GET /active-conf
PawaPay API Response: 200
```

2. **Test incoming webhooks**:

```bash
# Simulate PawaPay webhook
curl -X POST http://localhost:5000/api/pawapay/callback \
  -H "Authorization: Bearer YOUR_PAWAPAY_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "depositId": "TEST_DEP_123",
    "status": "COMPLETED",
    "requestedAmount": "5000",
    "currency": "RWF",
    "country": "RWA",
    "correspondent": "MTN_MOMO_RWA",
    "payer": {
      "type": "MSISDN",
      "address": {"value": "250788123456"}
    }
  }'
```

Expected response:
```json
{
  "success": true,
  "message": "Webhook processed successfully",
  "transactionId": "TEST_DEP_123",
  "status": "COMPLETED"
}
```

### Test Invalid Bearer Token

```bash
curl -X POST http://localhost:5000/api/pawapay/callback \
  -H "Authorization: Bearer INVALID_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"depositId": "TEST_123"}'
```

Expected response (401):
```json
{
  "success": false,
  "message": "Unauthorized: Invalid bearer token"
}
```

## Troubleshooting

### Issue: "Unauthorized: Invalid bearer token"

**Cause**: Bearer token in webhook doesn't match configured API key

**Solution**:
1. Verify `PAWAPAY_API_KEY` in `.env`
2. Check PawaPay dashboard for correct API key
3. Ensure no extra spaces or quotes in `.env` file
4. Restart server after updating `.env`

### Issue: "Invalid webhook signature"

**Cause**: HMAC signature validation failed

**Solution**:
1. Verify `PAWAPAY_WEBHOOK_SECRET` in `.env`
2. Ensure raw body is used for signature validation
3. Check PawaPay dashboard for webhook secret
4. In development, temporarily disable signature validation

### Issue: "Forbidden: IP not whitelisted"

**Cause**: Request from unauthorized IP

**Solution**:
1. Check `PAWAPAY_ALLOWED_IPS` configuration
2. Get correct IP addresses from PawaPay
3. In development, remove IP whitelist
4. Verify no proxy/CDN modifying IP addresses

### Issue: Bearer token not being sent to PawaPay API

**Cause**: Service not initialized or config missing

**Solution**:
1. Check `PAWAPAY_API_KEY` is set in `.env`
2. Verify service initialization in `server.ts`
3. Check axios client headers in logs
4. Test with PawaPay sandbox first

## Monitoring and Logging

All webhook requests are logged to the database in `PawaPayWebhookLog` table:

```sql
SELECT * FROM "PawaPayWebhookLog"
WHERE "signatureValid" = false
ORDER BY "createdAt" DESC
LIMIT 10;
```

Check application logs for authentication issues:

```
PawaPay webhook headers { hasSignature: true, hasBearer: true, ... }
PawaPay bearer token validated successfully
PawaPay webhook signature validated successfully
```

## References

- [PawaPay API Documentation](https://docs.pawapay.cloud)
- [PawaPay Webhook Guide](https://docs.pawapay.cloud/webhooks)
- [Bearer Token Authentication RFC 6750](https://tools.ietf.org/html/rfc6750)

## Support

For issues related to:
- **Bearer token setup**: Check this documentation
- **PawaPay API keys**: Contact PawaPay support
- **Integration issues**: Check application logs and webhook logs in database
