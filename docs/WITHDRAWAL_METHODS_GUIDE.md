# Rwanda Withdrawal Methods Guide

This guide explains how to use the withdrawal methods API for Rwanda, including both bank transfers and mobile money withdrawals.

## Supported Providers

### Banks (13 providers)
- **Investment and Mortgage Bank** - Code: `010`
- **Banque de Kigali** - Code: `040`
- **Guaranty Trust Bank (Rwanda)** - Code: `070`
- **National Commercial Bank of Africa** - Code: `025`
- **Ecobank Rwanda** - Code: `100`
- **Access Bank Rwanda** - Code: `115`
- **Urwego Opportunity Bank** - Code: `145`
- **Equity Bank** - Code: `192`
- **Banque Populaire du Rwanda** - Code: `400`
- **Zigama Credit and Savings Scheme** - Code: `800`
- **Bank of Africa Rwanda** - Code: `900`
- **Unguka Bank** - Code: `950`
- **Banque Nationale du Rwanda** - Code: `951`

### Mobile Money (3 providers)
- **MTN Mobile Money** - Code: `63510`
- **Airtel Rwanda** - Code: `63514`
- **SPENN** - Code: `63509`

## API Endpoints

### 1. Get All Available Withdrawal Methods

**GET** `/api/transactions/withdrawal-methods/rwanda`

Returns all supported banks and mobile money providers for Rwanda.

**Response:**
```json
{
  "success": true,
  "country": "RWA",
  "countryName": "Rwanda",
  "currency": "RWF",
  "count": 16,
  "data": {
    "banks": [...],
    "mobileMoney": [...],
    "all": [...]
  },
  "summary": {
    "totalProviders": 16,
    "banks": 13,
    "mobileMoney": 3
  }
}
```

### 2. Add a Withdrawal Method

**POST** `/api/transactions/withdrawal-methods`

Add a new bank account or mobile money number for withdrawals.

**Request Body:**
```json
{
  "userId": 123,
  "methodType": "BANK",
  "accountName": "John Doe",
  "accountDetails": {
    "providerCode": "040",
    "accountNumber": "1234567890",
    "phoneNumber": "0788123456"
  },
  "isDefault": true
}
```

**For Mobile Money:**
```json
{
  "userId": 123,
  "methodType": "MOBILE_MONEY",
  "accountName": "John Doe",
  "accountDetails": {
    "providerCode": "63510",
    "accountNumber": "0788123456",
    "phoneNumber": "0788123456"
  },
  "isDefault": false
}
```

**Response:**
```json
{
  "success": true,
  "message": "Banque de Kigali withdrawal method added successfully (pending approval)",
  "data": {
    "id": "clxxx...",
    "userId": 123,
    "methodType": "BANK",
    "accountName": "John Doe",
    "accountDetails": {
      "providerCode": "040",
      "accountNumber": "1234567890",
      "providerName": "Banque de Kigali",
      "providerType": "BANK",
      "currency": "RWF",
      "country": "RWA"
    },
    "isDefault": true,
    "isVerified": false,
    "isApproved": false,
    "verificationStatus": "pending",
    "providerInfo": {
      "code": "040",
      "name": "Banque de Kigali",
      "type": "BANK",
      "currency": "RWF"
    }
  }
}
```

### 3. Get User's Withdrawal Methods

**GET** `/api/transactions/withdrawal-methods/:userId`

Query params: `?approved=true` (filter by approval status)

**Response:**
```json
{
  "success": true,
  "count": 2,
  "data": [...],
  "summary": {
    "total": 2,
    "approved": 1,
    "pending": 1,
    "rejected": 0,
    "hasDefault": true
  }
}
```

### 4. Admin: Approve Withdrawal Method

**POST** `/api/transactions/withdrawal-methods/:id/approve`

```json
{
  "adminId": 1
}
```

### 5. Admin: Reject Withdrawal Method

**POST** `/api/transactions/withdrawal-methods/:id/reject`

```json
{
  "adminId": 1,
  "reason": "Invalid account information"
}
```

## Validation Rules

### Bank Accounts
- Account number must be 10-16 digits
- Account name is required
- Provider code must match a valid Rwanda bank

### Mobile Money
- **MTN Mobile Money**: Phone must start with `078` or `079` (10 digits)
- **Airtel Rwanda**: Phone must start with `073` (10 digits)
- **SPENN**: Phone must start with `07` (10 digits)

## Account Details Structure

The `accountDetails` field is a JSON object that must include:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `providerCode` | string | Yes | Bank/Mobile Money provider code |
| `accountNumber` | string | Yes | Account number or phone number |
| `phoneNumber` | string | No | Phone number (for mobile money) |
| `bankName` | string | No | Auto-populated from provider |

The system will automatically enhance this with:
- `providerName`: Full name of the provider
- `providerType`: BANK or MOBILE_MONEY
- `currency`: RWF
- `country`: RWA

## Workflow

1. **User adds withdrawal method**
   - User selects provider (bank or mobile money)
   - Enters account details
   - Submits for approval
   - Status: `pending`

2. **Admin reviews**
   - Admin checks account details
   - Verifies information
   - Approves or rejects

3. **Method approved**
   - Status changes to `verified`
   - User can now use this method for withdrawals
   - Can be set as default

4. **Withdrawal processing**
   - User requests withdrawal
   - System validates approved withdrawal method
   - Processes payout to selected account

## Error Handling

### Invalid Provider Code
```json
{
  "success": false,
  "message": "Invalid provider code: 999. Please use a valid Rwanda bank or mobile money provider code."
}
```

### Invalid Account Format
```json
{
  "success": false,
  "message": "Invalid account number format for MTN Mobile Money. MTN Mobile Money Number should match: 0788123456",
  "accountFormat": {
    "label": "MTN Mobile Money Number",
    "placeholder": "078XXXXXXX or 079XXXXXXX",
    "pattern": "^(078|079)[0-9]{7}$",
    "example": "0788123456"
  }
}
```

### Method Type Mismatch
```json
{
  "success": false,
  "message": "Provider type mismatch. Provider Banque de Kigali is of type BANK, but you specified MOBILE_MONEY"
}
```

## Example Usage

### Adding MTN Mobile Money

```javascript
const response = await fetch('/api/transactions/withdrawal-methods', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 123,
    methodType: 'MOBILE_MONEY',
    accountName: 'Jane Smith',
    accountDetails: {
      providerCode: '63510',
      accountNumber: '0788123456',
      phoneNumber: '0788123456'
    },
    isDefault: true
  })
});
```

### Adding Bank Account

```javascript
const response = await fetch('/api/transactions/withdrawal-methods', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 123,
    methodType: 'BANK',
    accountName: 'Jane Smith',
    accountDetails: {
      providerCode: '040', // Banque de Kigali
      accountNumber: '1234567890123'
    },
    isDefault: false
  })
});
```

## Best Practices

1. **Always validate provider codes** before submitting
2. **Use the correct methodType** (BANK or MOBILE_MONEY)
3. **Format phone numbers correctly** for mobile money
4. **Set one default method** per user for easier withdrawals
5. **Wait for admin approval** before attempting withdrawals
6. **Keep account information up to date**

## Security Notes

- All withdrawal methods require admin approval
- Account details are stored securely
- Users can only view their own withdrawal methods
- Admins can view all pending approvals
- Failed verification attempts are logged

## Support

For issues or questions about withdrawal methods:
- Contact: support@jambolush.com
- Check provider documentation for account format requirements
- Verify your KYC status is approved before adding withdrawal methods
