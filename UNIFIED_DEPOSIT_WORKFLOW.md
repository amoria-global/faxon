# Unified Deposit Workflow - Quick Reference

## Endpoint
```
POST /api/transactions/deposit
```

## Payment Method Routing
- **Mobile Money** (`paymentMethod: "momo"`) → **PawaPay**
- **Card Payment** (`paymentMethod: "card"`) → **XentriPay**

---

## Frontend Request Bodies

### Mobile Money (MoMo)
```json
{
  "paymentMethod": "momo",
  "amount": 100,
  "phoneNumber": "0788123456",
  "provider": "MTN_RWANDA",
  "country": "RW",
  "description": "Booking payment",
  "internalReference": "BOOKING-123"
}
```

**Required:** `paymentMethod`, `amount`, `phoneNumber`, `provider`

---

### Card Payment
```json
{
  "paymentMethod": "card",
  "amount": 100,
  "email": "user@example.com",
  "customerName": "John Doe",
  "phoneNumber": "0780000000",
  "description": "Booking payment",
  "internalReference": "BOOKING-123"
}
```

**Required:** `paymentMethod`, `amount`, `email`, `customerName`

---

## Response Flow

### Mobile Money Response
- Returns: `depositId`, `status`, `amountUSD`, `amountRWF`, `exchangeRate`
- User receives: Mobile prompt on their phone
- Action: Poll status or wait for webhook

### Card Payment Response
- Returns: `depositId`, `refId`, `paymentUrl`, `status`, `amountUSD`, `amountRWF`
- User action: Redirect to `paymentUrl` to complete payment
- Callback: XentriPay redirects back after payment

---

## Key Points
✅ Single endpoint for all payments
✅ Amount in USD (auto-converted to RWF)
✅ All transactions stored in unified `Transaction` table
✅ Exchange rate included in response
✅ Internal reference links to bookings
