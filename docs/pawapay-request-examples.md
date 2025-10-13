# PawaPay Request Examples

## Deposit Request (Money In)

```json
POST /api/pawapay/deposit

{
  "amount": 100,
  "currency": "RWF",
  "phoneNumber": "0788123456",
  "provider": "MTN",
  "country": "RW",
  "description": "Property booking deposit",
  "internalReference": "BOOK_12345",
  "metadata": {
    "bookingId": "12345",
    "propertyId": "1",
    "userId": "1"
  }
}
```

**What happens internally:**
- Phone `0788123456` → formatted to `250788123456`
- Provider `MTN` + Country `RW` → `MTN_MOMO_RWA`
- Amount `100` RWF → `100` (no decimal conversion for RWF)
- Sent to PawaPay as:
```json
{
  "depositId": "DEP_1759794148217_EADD0365",
  "amount": "100",
  "currency": "RWF",
  "payer": {
    "type": "MMO",
    "accountDetails": {
      "phoneNumber": "250788123456",
      "provider": "MTN_MOMO_RWA"
    }
  },
  "customerTimestamp": "2025-10-06T10:15:30.000Z",
  "statementDescription": "Property booking deposit",
  "metadata": [
    { "fieldName": "userId", "fieldValue": "1", "isPII": true },
    { "fieldName": "internalReference", "fieldValue": "BOOK_12345" },
    { "fieldName": "bookingId", "fieldValue": "12345" },
    { "fieldName": "propertyId", "fieldValue": "1" },
    { "fieldName": "userId", "fieldValue": "1", "isPII": true }
  ]
}
```

## Payout Request (Money Out)

```json
POST /api/pawapay/payout

{
  "amount": 5000,
  "currency": "RWF",
  "phoneNumber": "0788987654",
  "provider": "MTN",
  "country": "RW",
  "description": "Property owner payout",
  "internalReference": "PAYOUT_12345",
  "metadata": {
    "ownerId": "456",
    "propertyId": "1"
  }
}
```

**What happens internally:**
- Phone `0788987654` → formatted to `250788987654`
- Provider `MTN` + Country `RW` → `MTN_MOMO_RWA`
- Amount `5000` RWF → `5000` (no decimal conversion for RWF)
- Sent to PawaPay as:
```json
{
  "payoutId": "PAY_1759794148217_EADD0365",
  "amount": "5000",
  "currency": "RWF",
  "recipient": {
    "type": "MMO",
    "accountDetails": {
      "phoneNumber": "250788987654",
      "provider": "MTN_MOMO_RWA"
    }
  },
  "customerTimestamp": "2025-10-06T10:15:30.000Z",
  "statementDescription": "Property owner payout"
}
```

## Supported Providers

### Rwanda (RW/RWA)
- **MTN**: `MTN_MOMO_RWA`
- **Airtel**: `AIRTEL_OAPI_RWA`

### Kenya (KE/KEN)
- **M-Pesa**: `MPESA_KEN`
- **Airtel**: `AIRTEL_OAPI_KEN`

### Uganda (UG/UGA)
- **MTN**: `MTN_MOMO_UGA`
- **Airtel**: `AIRTEL_OAPI_UGA`

### Zambia (ZM/ZMB)
- **MTN**: `MTN_MOMO_ZMB`
- **Airtel**: `AIRTEL_OAPI_ZMB`
- **Zamtel**: `ZAMTEL_ZMB`

## Phone Number Format

Phone numbers should be in international format **without** the `+` sign:
- Rwanda: `250788123456` (not `+250788123456` or `0788123456`)
- Kenya: `254712345678`
- Uganda: `256712345678`
- Zambia: `260712345678`

The API accepts local format (e.g., `0788123456`) and automatically converts it.

## Currency Handling

### Zero-Decimal Currencies (no conversion)
- **RWF** (Rwandan Franc): `100` = 100 RWF
- **UGX** (Ugandan Shilling): `1000` = 1000 UGX

### Two-Decimal Currencies (multiply by 100)
- **KES** (Kenyan Shilling): `100` = 1.00 KES → sent as `"100"`
- **ZMW** (Zambian Kwacha): `5000` = 50.00 ZMW → sent as `"5000"`

## Common Rejection Reasons

1. **Invalid phone number format**
   - Solution: Use international format without `+`

2. **Invalid provider code**
   - Solution: Use exact provider codes (e.g., `MTN_MOMO_RWA`)

3. **Invalid customerTimestamp**
   - Solution: System automatically generates valid ISO 8601 timestamp

4. **Statement description too short/long**
   - Solution: Must be 4-22 characters (handled automatically)

5. **Amount below/above provider limits**
   - Solution: Check provider limits via `/api/pawapay/config/providers/:country`
