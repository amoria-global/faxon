# PawaPay Integration Setup Guide

This guide explains how to set up and use the PawaPay integration in your application.

## Table of Contents
1. [Overview](#overview)
2. [Environment Variables](#environment-variables)
3. [Available Operations](#available-operations)
4. [API Endpoints](#api-endpoints)
5. [Webhook Setup](#webhook-setup)
6. [Testing](#testing)
7. [Supported Countries & Providers](#supported-countries--providers)

## Overview

PawaPay is a mobile money aggregation platform that enables payments across multiple African countries. This integration provides:

- ✅ **Deposits** (Money In) - Collect payments from customers
- ✅ **Payouts** (Money Out) - Send money to recipients
- ✅ **Refunds** - Refund completed deposits
- ✅ **Bulk Payouts** - Process multiple payouts in one request
- ✅ **Webhook Callbacks** - Real-time transaction status updates
- ✅ **Admin Management** - Full transaction monitoring and management

## Environment Variables

Add these variables to your `.env` file:

```bash
# ==================== PAWAPAY CONFIGURATION ====================

# API Key (REQUIRED)
# Get this from your PawaPay dashboard
PAWAPAY_API_KEY=eyJraWQiOiIxIiwiYWxnIjoiRVMyNTYifQ.eyJ0dCI6IkFBVCIsInN1YiI6IjEwNjU1IiwibWF2IjoiMSIsImV4cCI6MjA3NTMwNTcxNSwiaWF0IjoxNzU5NzcyOTE1LCJwbSI6IkRBRixQQUYiLCJqdGkiOiIyYWRkYmIxOS1mZDVkLTRkM2UtODkyYS05YmMzN2I1ZDZkNWYifQ.qOfIkPH2mqELDhnb176otxttIokhkhYLlrRxXuZlQKU5gQn_qZwfVLjEY-J4cTkiLO0rLbtml5D_Kf8V9lWQWw

# Base URL (OPTIONAL - defaults to production)
# Production: https://api.pawapay.cloud
# Sandbox: https://api.sandbox.pawapay.cloud (if available)
PAWAPAY_BASE_URL=https://api.pawapay.cloud

# Environment (OPTIONAL - defaults to production)
# Options: production, sandbox
# NODE_ENV=production will automatically use production

# Webhook Secret (OPTIONAL but RECOMMENDED)
# Used to validate webhook signatures for security
# Generate a strong random string
PAWAPAY_WEBHOOK_SECRET=your-webhook-secret-here

# Callback URL (REQUIRED for production)
# URL where PawaPay will send transaction status updates
# Must be publicly accessible HTTPS URL in production
PAWAPAY_CALLBACK_URL=https://yourdomain.com/api/pawapay/callback

# Request Timeout (OPTIONAL - defaults to 30000ms)
PAWAPAY_TIMEOUT=30000

# Bulk Payout Settings (OPTIONAL)
# Enable/disable bulk payout feature
PAWAPAY_ENABLE_BULK_PAYOUTS=true

# Batch size for bulk payouts
PAWAPAY_BULK_BATCH_SIZE=100

# Retry Settings (OPTIONAL)
# Number of retry attempts for failed requests
PAWAPAY_RETRY_ATTEMPTS=3

# Delay between retry attempts in milliseconds
PAWAPAY_RETRY_DELAY=5000
```

## Available Operations

### 1. Deposits (Money In)

Collect money from customers via mobile money.

**Supported use cases:**
- Customer payments for bookings
- Wallet top-ups
- Escrow deposits
- Subscription payments

### 2. Payouts (Money Out)

Send money to recipients via mobile money.

**Supported use cases:**
- Withdrawal requests
- Vendor payments
- Commission payments
- Refunds to customers

### 3. Bulk Payouts

Process multiple payouts in a single batch.

**Supported use cases:**
- Monthly commission payouts
- Mass refunds
- Salary disbursements
- Affiliate payments

### 4. Refunds

Refund money to customers for completed deposits.

**Supported use cases:**
- Cancelled bookings
- Service refunds
- Overpayment returns

## API Endpoints

All endpoints are prefixed with `/api/pawapay`

### Public Endpoints

```bash
# Get available providers for a country
GET /api/pawapay/providers/:country
# Example: GET /api/pawapay/providers/RWA

# Get active PawaPay configuration
GET /api/pawapay/config?refresh=true
```

### Authenticated Endpoints

**Note:** All endpoints below require authentication via Bearer token

#### Deposits

```bash
# Initiate a deposit
POST /api/pawapay/deposit
Body: {
  "amount": 1000,
  "currency": "RWF",
  "phoneNumber": "0780371519",
  "provider": "MTN",
  "country": "RW",
  "description": "Payment for booking #123",
  "internalReference": "BOOK_123",
  "metadata": { "bookingId": "123" }
}

# Get deposit status
GET /api/pawapay/deposit/:depositId
```

#### Payouts

```bash
# Initiate a payout
POST /api/pawapay/payout
Body: {
  "amount": 5000,
  "currency": "RWF",
  "phoneNumber": "0780371519",
  "provider": "MTN",
  "country": "RW",
  "description": "Withdrawal payment",
  "internalReference": "WD_456",
  "metadata": { "withdrawalId": "456" }
}

# Get payout status
GET /api/pawapay/payout/:payoutId
```

#### Refunds

```bash
# Initiate a refund
POST /api/pawapay/refund
Body: {
  "depositId": "DEP_1234567890",
  "amount": 1000  // Optional: partial refund
}

# Get refund status
GET /api/pawapay/refund/:refundId
```

### Admin Endpoints

**Note:** All endpoints below require admin authentication

```bash
# Initiate bulk payouts
POST /api/pawapay/admin/bulk-payout
Body: {
  "description": "Monthly commissions",
  "payouts": [
    {
      "amount": 5000,
      "currency": "RWF",
      "phoneNumber": "0780371519",
      "provider": "MTN",
      "country": "RW",
      "description": "Agent commission"
    },
    // ... more payouts
  ]
}

# Get transaction history
GET /api/pawapay/admin/transactions?type=DEPOSIT&status=COMPLETED&page=1&limit=50

# Get transaction statistics
GET /api/pawapay/admin/stats?startDate=2024-01-01&endDate=2024-12-31

# Resend callback for a transaction
POST /api/pawapay/admin/resend-callback/:transactionId
Body: {
  "type": "DEPOSIT"  // or "PAYOUT", "REFUND"
}
```

## Webhook Setup

### 1. Configure Callback URL

Set your callback URL in environment variables:

```bash
PAWAPAY_CALLBACK_URL=https://yourdomain.com/api/pawapay/callback
```

### 2. Set Webhook Secret (Recommended)

Generate a strong random string and set it:

```bash
PAWAPAY_WEBHOOK_SECRET=your-random-secret-here
```

### 3. Webhook Endpoint

The webhook endpoint is automatically registered at:

```
POST /api/pawapay/callback
```

### 4. Webhook Payload

PawaPay will send transaction status updates:

```json
{
  "depositId": "DEP_1234567890",
  "status": "COMPLETED",
  "requestedAmount": "100000",
  "depositedAmount": "100000",
  "currency": "RWF",
  "country": "RWA",
  "correspondent": "MTN_MOMO_RWA",
  "payer": {
    "type": "MSISDN",
    "address": {
      "value": "250780371519"
    }
  },
  "customerTimestamp": "2024-01-15T10:30:00Z",
  "statementDescription": "Payment to Jambolush",
  "created": "2024-01-15T10:30:01Z",
  "receivedByPawaPay": "2024-01-15T10:30:05Z",
  "correspondentIds": {
    "PROVIDER_TRANSACTION_ID": "MTN12345678",
    "FINANCIAL_TRANSACTION_ID": "FIN987654321"
  }
}
```

### 5. Webhook Processing

The system automatically:
- ✅ Validates webhook signature
- ✅ Logs all webhooks to database
- ✅ Updates transaction status
- ✅ Handles linked bookings/escrow transactions
- ✅ Sends notifications to users

## Testing

### 1. Test Deposit

```bash
curl -X POST https://yourdomain.com/api/pawapay/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "amount": 100,
    "currency": "RWF",
    "phoneNumber": "0780371519",
    "provider": "MTN",
    "country": "RW",
    "description": "Test deposit"
  }'
```

### 2. Test Payout

```bash
curl -X POST https://yourdomain.com/api/pawapay/payout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "amount": 50,
    "currency": "RWF",
    "phoneNumber": "0780371519",
    "provider": "MTN",
    "country": "RW",
    "description": "Test payout"
  }'
```

### 3. Check Status

```bash
# Replace DEP_123 with actual transaction ID
curl -X GET https://yourdomain.com/api/pawapay/deposit/DEP_123 \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### 4. Test Webhook

```bash
curl -X GET https://yourdomain.com/api/pawapay/callback
# Should return: { "success": true, "message": "PawaPay callback endpoint is active" }
```

## Supported Countries & Providers

### Rwanda (RWA)
- **MTN Mobile Money**: `MTN_MOMO_RWA`
- **Airtel Money**: `AIRTEL_OAPI_RWA`

### Kenya (KEN)
- **M-Pesa**: `MPESA_KEN`
- **Airtel Money**: `AIRTEL_OAPI_KEN`

### Uganda (UGA)
- **MTN Mobile Money**: `MTN_MOMO_UGA`
- **Airtel Money**: `AIRTEL_OAPI_UGA`

### Tanzania (TZA)
- **M-Pesa**: `MPESA_TZA`
- **Airtel Money**: `AIRTEL_OAPI_TZA`
- **Tigo Pesa**: `TIGO_TZA`
- **Halo Pesa**: `HALOPESA_TZA`

### Zambia (ZMB)
- **MTN Mobile Money**: `MTN_MOMO_ZMB`
- **Airtel Money**: `AIRTEL_OAPI_ZMB`
- **Zamtel Kwacha**: `ZAMTEL_ZMB`

### Ghana (GHA)
- **MTN Mobile Money**: `MTN_MOMO_GHA`
- **Airtel Money**: `AIRTEL_OAPI_GHA`
- **Vodafone Cash**: `VODAFONE_GHA`

### Nigeria (NGA)
- **MTN Mobile Money**: `MTN_MOMO_NGA`
- **Airtel Money**: `AIRTEL_OAPI_NGA`

### Malawi (MWI)
- **Airtel Money**: `AIRTEL_OAPI_MWI`
- **TNM Mpamba**: `TNM_MWI`

### Benin (BEN)
- **MTN Mobile Money**: `MTN_MOMO_BEN`
- **Moov Money**: `MOOV_BEN`

### Cameroon (CMR)
- **MTN Mobile Money**: `MTN_MOMO_CMR`
- **Orange Money**: `ORANGE_CMR`

### DRC (COD)
- **Airtel Money**: `AIRTEL_OAPI_COD`
- **Orange Money**: `ORANGE_COD`
- **Vodacom M-Pesa**: `VODACOM_COD`

## Transaction Statuses

- **ACCEPTED**: Transaction accepted by PawaPay
- **ENQUEUED**: Queued for processing
- **SUBMITTED**: Submitted to mobile network operator
- **COMPLETED**: Successfully completed ✅
- **FAILED**: Failed (will not retry) ❌
- **REJECTED**: Rejected by mobile network operator ❌
- **CANCELLED**: Cancelled ❌

## Best Practices

### 1. Error Handling

Always handle errors gracefully:

```javascript
try {
  const result = await fetch('/api/pawapay/deposit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(depositData)
  });

  const response = await result.json();

  if (response.success) {
    // Handle success
    console.log('Deposit initiated:', response.data.depositId);
  } else {
    // Handle error
    console.error('Deposit failed:', response.message);
  }
} catch (error) {
  console.error('Network error:', error);
}
```

### 2. Transaction Tracking

Always store the transaction ID returned by PawaPay for status checking:

```javascript
const response = await initiateDeposit(data);
const depositId = response.data.depositId;

// Store depositId in your database linked to your internal reference
await saveTransaction(depositId, internalReference);

// Later, check status
const status = await getDepositStatus(depositId);
```

### 3. Webhook Validation

Always validate webhook signatures in production:

```javascript
const signature = req.headers['x-pawapay-signature'];
const isValid = pawaPayService.validateWebhookSignature(
  JSON.stringify(req.body),
  signature
);

if (!isValid) {
  return res.status(401).json({ error: 'Invalid signature' });
}
```

### 4. Idempotency

Use unique transaction IDs to prevent duplicate transactions:

```javascript
// Generate unique ID based on your reference
const depositId = `DEP_${Date.now()}_${uniqueRef}`;
```

## Database Schema

The integration creates these tables:

### PawaPayTransaction
Stores all transactions (deposits, payouts, refunds)

### PawaPayBulkPayout
Stores bulk payout batches

### PawaPayWebhookLog
Logs all webhook callbacks for debugging

## Troubleshooting

### Issue: Webhook not receiving callbacks

**Solution:**
1. Ensure `PAWAPAY_CALLBACK_URL` is a public HTTPS URL
2. Check firewall/security settings
3. Verify webhook is registered in PawaPay dashboard
4. Test with: `curl https://yourdomain.com/api/pawapay/callback`

### Issue: Invalid signature error

**Solution:**
1. Verify `PAWAPAY_WEBHOOK_SECRET` matches PawaPay dashboard
2. Ensure raw body is used for signature validation
3. Check for any middleware that modifies request body

### Issue: Transaction stuck in PENDING

**Solution:**
1. Check transaction status via API: `GET /api/pawapay/deposit/:depositId`
2. Resend callback: `POST /api/pawapay/admin/resend-callback/:transactionId`
3. Contact PawaPay support if issue persists

### Issue: Provider not available

**Solution:**
1. Check active configuration: `GET /api/pawapay/config`
2. Verify country and provider codes are correct
3. Ensure provider is active in your PawaPay account

## Support

For PawaPay-specific issues:
- Documentation: https://docs.pawapay.io
- Support: support@pawapay.io

For integration issues:
- Check logs in `pawapay_webhook_logs` table
- Review transaction history in admin panel
- Contact your development team

## Migration Notes

If migrating from XentriPay or Pesapal:

1. **Currency Handling**: PawaPay uses smallest currency units (e.g., cents for RWF)
2. **Phone Format**: Use international format without `+` (e.g., `250780371519`)
3. **Provider Codes**: Different from other providers (e.g., `MTN_MOMO_RWA`)
4. **Webhooks**: Different payload structure
5. **Status Codes**: Different status naming conventions

## Security Checklist

- ✅ Use HTTPS in production
- ✅ Set strong webhook secret
- ✅ Validate all webhook signatures
- ✅ Never log API keys
- ✅ Implement rate limiting
- ✅ Use environment variables for sensitive data
- ✅ Enable admin authentication for sensitive endpoints
- ✅ Monitor transaction logs regularly
- ✅ Implement proper error handling
- ✅ Use unique transaction IDs

## Next Steps

1. ✅ Set up environment variables
2. ✅ Run database migration: `npx prisma migrate dev`
3. ✅ Configure webhook URL in PawaPay dashboard
4. ✅ Test with small amounts first
5. ✅ Monitor webhook logs
6. ✅ Set up production monitoring
7. ✅ Document your integration flows
8. ✅ Train your team on admin features

---

**Version**: 1.0.0
**Last Updated**: 2024-01-15
**Integration Status**: Production Ready ✅
