# PawaPay Integration Fixes

## Issues Identified and Fixed

### 1. **Country Code Format (CRITICAL)**
**Problem:** API was sending 2-letter ISO country codes (e.g., "RW") instead of 3-letter ISO 3166-1 alpha-3 codes.

**Solution:**
- Added `convertToISO3CountryCode()` method to convert 2-letter to 3-letter codes
- Updated request to include `country` field with ISO alpha-3 format (e.g., "RWA", "KEN", "UGA")
- Supports all African countries in PawaPay's coverage

**Example:**
```typescript
// Before (WRONG)
country: "RW"

// After (CORRECT)
country: "RWA"
```

### 2. **Metadata Format (CRITICAL)**
**Problem:** Metadata was sent as a plain object `{ key: value }`, but PawaPay expects an array of objects.

**Solution:**
- Created `PawaPayMetadataField` interface
- Convert metadata from object to array format with `fieldName`, `fieldValue`, and optional `isPII` fields
- Automatically marks user/customer fields as PII (Personally Identifiable Information)

**Example:**
```typescript
// Before (WRONG)
metadata: {
  userId: "16",
  bookingId: "12345"
}

// After (CORRECT)
metadata: [
  { fieldName: "userId", fieldValue: "16", isPII: true },
  { fieldName: "bookingId", fieldValue: "12345" }
]
```

### 3. **Statement Description Length (IMPORTANT)**
**Problem:** Statement description exceeded the 22-character maximum allowed by PawaPay.

**Solution:**
- Truncate description to maximum 22 characters
- Ensure minimum 4 characters (pad with spaces if needed)

**Example:**
```typescript
// Before (WRONG - 25 chars)
statementDescription: "Property booking deposit"

// After (CORRECT - 22 chars)
statementDescription: "Property booking depos"
```

## Changes Made

### Files Modified

1. **[src/types/pawapay.types.ts](../src/types/pawapay.types.ts)**
   - Added `PawaPayMetadataField` interface
   - Updated `DepositRequest` to include `country` field and array-based `metadata`
   - Updated `PayoutRequest` to use array-based `metadata`
   - Added field length documentation (4-22 characters for statement description)

2. **[src/services/pawapay.service.ts](../src/services/pawapay.service.ts)**
   - Added `convertToISO3CountryCode()` helper method
   - Maps 2-letter country codes to 3-letter ISO alpha-3 codes
   - Supports 16+ African countries

3. **[src/controllers/pawapay.controller.ts](../src/controllers/pawapay.controller.ts)**
   - Updated `initiateDeposit()` to:
     - Convert country code to ISO alpha-3
     - Format metadata as array
     - Truncate/pad statement description
   - Updated `initiatePayout()` with same fixes

## Testing

### Test Request (Before Fix - FAILED)
```json
POST /api/pawapay/deposit
{
  "amount": 100,
  "currency": "RWF",
  "phoneNumber": "0788123456",
  "provider": "MTN",
  "country": "RW",
  "description": "Property booking deposit",
  "metadata": { "bookingId": "12345", "propertyId": "prop-001", "userId": "1" }
}

Response: 400 - Invalid input
```

### Test Request (After Fix - SUCCESS EXPECTED)
```json
POST /api/pawapay/deposit
{
  "amount": 100,
  "currency": "RWF",
  "phoneNumber": "0788123456",
  "provider": "MTN",
  "country": "RW",
  "description": "Property booking deposit"
}

Expected PawaPay Request:
{
  "depositId": "DEP_1759793206381_9A90564B",
  "amount": "100",
  "currency": "RWF",
  "country": "RWA",
  "correspondent": "MTN_MOMO_RWA",
  "payer": {
    "type": "MSISDN",
    "address": {
      "value": "250788123456"
    }
  },
  "customerTimestamp": "2025-10-06T23:26:46.381Z",
  "statementDescription": "Property booking dep",
  "metadata": [
    { "fieldName": "userId", "fieldValue": "16", "isPII": true }
  ]
}

Expected Response: 200 - Deposit initiated successfully
```

## Supported Countries

The integration now supports the following country codes:

| ISO Alpha-2 | ISO Alpha-3 | Country |
|-------------|-------------|---------|
| RW | RWA | Rwanda |
| KE | KEN | Kenya |
| UG | UGA | Uganda |
| TZ | TZA | Tanzania |
| ZM | ZMB | Zambia |
| GH | GHA | Ghana |
| NG | NGA | Nigeria |
| MW | MWI | Malawi |
| BJ | BEN | Benin |
| CM | CMR | Cameroon |
| CD | COD | DRC |
| CI | CIV | Ivory Coast |
| SN | SEN | Senegal |
| ZW | ZWE | Zimbabwe |
| BW | BWA | Botswana |
| ET | ETH | Ethiopia |
| ZA | ZAF | South Africa |

## API Documentation Reference

- PawaPay Deposit API: https://docs.pawapay.io/v1/api-reference/deposits/request-deposit
- PawaPay Using the API: https://docs.pawapay.io/using_the_api
- Country Codes Standard: ISO 3166-1 alpha-3

## Next Steps

1. Test the deposit endpoint with the corrected request format
2. Monitor PawaPay API responses for any additional validation errors
3. Update payout and refund operations to follow the same patterns
4. Consider adding request validation middleware to catch format errors early

## Notes

- All fixes are backward compatible - the API still accepts the same input format
- Country code conversion happens automatically
- Metadata conversion is transparent to API consumers
- Statement description truncation ensures API calls don't fail due to length
