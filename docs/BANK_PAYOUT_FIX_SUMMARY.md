# Bank Payout Fix Summary

## Issue Identified
The bank payout system had an error in account saving and retrieval. When users added bank accounts as withdrawal methods, the withdrawal requests were not properly linking to the saved withdrawal method records, causing:
- Loss of bank account information during withdrawal processing
- Inability for admins to see complete account details when approving withdrawals
- Inconsistent data between `WithdrawalMethod` and `WithdrawalRequest` tables

## Root Cause
The `verify-and-withdraw` endpoint in [withdrawal.routes.ts](../src/routes/withdrawal.routes.ts) was creating withdrawal requests WITHOUT linking them to the saved `WithdrawalMethod` records via the `withdrawalMethodId` field.

## Fixes Implemented

### 1. **Updated Withdrawal Request Creation** ([withdrawal.routes.ts:184-313](../src/routes/withdrawal.routes.ts#L184-L313))

**Changes:**
- Added `withdrawalMethodId` parameter support to link saved withdrawal methods
- Added validation to ensure withdrawal methods are approved before use
- Added proper account detail extraction from saved withdrawal methods
- Enhanced error messages for better user experience

**New Flow:**
```javascript
// User can now specify withdrawalMethodId to use saved bank/mobile money account
const { otp, amount, withdrawalMethodId, method, destination } = req.body;

// System validates and retrieves saved withdrawal method
if (withdrawalMethodId) {
  const savedMethod = await prisma.withdrawalMethod.findUnique({
    where: { id: withdrawalMethodId }
  });

  // Validates ownership and approval status
  // Extracts account details for payout processing
}

// Creates withdrawal request WITH link to saved method
await prisma.withdrawalRequest.create({
  data: {
    ...withdrawalData,
    withdrawalMethodId: savedMethodId  // 🔧 FIX: Now properly linked
  }
});
```

### 2. **Enhanced Admin Withdrawal Approval** ([admin.service.ts:3097-3207](../src/services/admin.service.ts#L3097-L3207))

**Changes:**
- Now includes `withdrawalMethod` relation when fetching withdrawal requests
- Parses and validates bank account information from saved methods
- Provides detailed account information in admin notifications
- Validates that linked withdrawal methods are approved

**Improvements:**
```javascript
// Admin now sees complete account details
const withdrawal = await prisma.withdrawalRequest.findUnique({
  where: { id: withdrawalId },
  include: {
    withdrawalMethod: {  // 🔧 FIX: Now includes linked account
      select: {
        methodType: true,
        accountName: true,
        accountDetails: true,
        isApproved: true
      }
    }
  }
});

// Extract complete account info for processing
const accountInfo = {
  methodType: withdrawal.withdrawalMethod.methodType,  // BANK or MOBILE_MONEY
  accountName: withdrawal.withdrawalMethod.accountName,
  providerName: accountDetails.providerName,  // e.g., "Banque de Kigali"
  providerCode: accountDetails.providerCode,  // e.g., "040"
  accountNumber: accountDetails.accountNumber,
};
```

### 3. **Improved Withdrawal History** ([withdrawal.routes.ts:464-531](../src/routes/withdrawal.routes.ts#L464-L531))

**Changes:**
- Added `withdrawalMethod` join to history queries
- Shows complete account details in withdrawal history
- Properly displays bank vs mobile money differentiation

**User Benefits:**
```json
{
  "withdrawals": [
    {
      "id": "...",
      "amount": 50000,
      "method": "BANK",
      "withdrawalMethod": {
        "methodType": "BANK",
        "accountName": "John Doe",
        "providerName": "Banque de Kigali",
        "providerCode": "040",
        "accountNumber": "1234567890"
      }
    }
  ]
}
```

## Updated Withdrawal Flow

### Step 1: User Saves Withdrawal Method
```bash
POST /api/transactions/withdrawal-methods
{
  "userId": 123,
  "methodType": "BANK",
  "accountName": "John Doe",
  "accountDetails": {
    "providerCode": "040",        # Banque de Kigali
    "accountNumber": "1234567890"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clxxx123",
    "methodType": "BANK",
    "isApproved": false,
    "verificationStatus": "pending"
  }
}
```

### Step 2: Admin Approves Withdrawal Method
```bash
POST /api/transactions/withdrawal-methods/clxxx123/approve
{
  "adminId": 1
}
```

### Step 3: User Initiates Withdrawal Using Saved Method
```bash
POST /api/payments/withdrawal/verify-and-withdraw
{
  "otp": "123456",
  "amount": 50000,
  "withdrawalMethodId": "clxxx123",  # ✅ Links to saved bank account
  "method": "BANK"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "withdrawalId": "wd-xxx",
    "amount": 50000,
    "method": "BANK",
    "status": "PENDING",
    "destination": {
      "holderName": "John Doe",
      "accountNumber": "1234567890",
      "providerCode": "040",
      "providerName": "Banque de Kigali"
    }
  }
}
```

### Step 4: Admin Approves Withdrawal
```bash
POST /api/admin/withdrawals/wd-xxx/approve
```

Admin now sees:
- Complete bank account details
- Provider name and code
- Account holder name
- All historical information

## Database Schema

### WithdrawalMethod Table
```prisma
model WithdrawalMethod {
  id                 String   @id @default(cuid())
  userId             Int
  methodType         String   // "BANK" or "MOBILE_MONEY"
  accountName        String   // Account holder name
  accountDetails     Json     // { providerCode, accountNumber, providerName, etc. }
  isApproved         Boolean
  withdrawalRequests WithdrawalRequest[]  // ✅ Relation
}
```

### WithdrawalRequest Table
```prisma
model WithdrawalRequest {
  id                 String            @id @default(cuid())
  userId             Int
  amount             Float
  method             String
  destination        Json
  withdrawalMethodId String?           // ✅ Links to WithdrawalMethod
  withdrawalMethod   WithdrawalMethod? // ✅ Relation
  status             String
  reference          String
}
```

## Key Improvements

### ✅ Data Integrity
- Withdrawal requests now properly link to saved withdrawal methods
- No data loss when processing bank payouts
- Complete audit trail of account usage

### ✅ Security
- Validates withdrawal method ownership
- Ensures methods are approved before use
- Prevents unauthorized account usage

### ✅ Admin Experience
- Complete account details visible during approval
- Clear differentiation between bank and mobile money
- Provider information readily available

### ✅ User Experience
- Can save and reuse bank accounts
- Clear error messages if method not approved
- Withdrawal history shows complete account details

## API Changes Summary

### New Parameters
- `withdrawalMethodId` - Optional parameter in withdrawal request
- Now accepts `MOBILE_MONEY` as valid method type (in addition to `MOBILE` and `BANK`)

### Enhanced Responses
- Withdrawal history now includes `withdrawalMethod` object
- Admin approval includes detailed `accountInfo` in metadata
- Better error messages for unapproved methods

## Testing Checklist

- [ ] Add bank account via `/api/transactions/withdrawal-methods`
- [ ] Verify account shows as "pending" approval
- [ ] Admin approves account via `/api/transactions/withdrawal-methods/:id/approve`
- [ ] User requests withdrawal OTP
- [ ] User initiates withdrawal with `withdrawalMethodId`
- [ ] Verify withdrawal request has `withdrawalMethodId` in database
- [ ] Admin views withdrawal request and sees complete bank details
- [ ] Admin approves withdrawal
- [ ] Verify notification includes complete account information
- [ ] Check withdrawal history shows saved method details

## Supported Providers

### Banks (13)
All Rwanda banks with provider codes (010-951) are supported

### Mobile Money (3)
- MTN Mobile Money (63510)
- Airtel Rwanda (63514)
- SPENN (63509)

## Migration Notes

For existing withdrawal requests without `withdrawalMethodId`:
- System falls back to parsing `destination` JSON field
- No breaking changes for existing data
- Gradual migration as users create new withdrawals

## Error Handling

### Common Errors and Solutions

**Error:** "Withdrawal method not found"
- **Cause:** Invalid `withdrawalMethodId`
- **Solution:** Verify the ID exists and belongs to the user

**Error:** "Withdrawal method is not yet approved"
- **Cause:** Admin hasn't approved the withdrawal method
- **Solution:** Wait for admin approval or use different method

**Error:** "Withdrawal method is not approved. Cannot process withdrawal."
- **Cause:** Admin attempting to approve withdrawal linked to unapproved method
- **Solution:** Admin must first approve the withdrawal method

## Related Documentation

- [Withdrawal Methods Guide](./WITHDRAWAL_METHODS_GUIDE.md) - Complete withdrawal methods documentation
- [Rwanda Provider Codes](../src/types/withdrawal-providers.types.ts) - All supported providers

## Support

For questions or issues:
- Review error messages in API responses
- Check that withdrawal methods are approved
- Verify provider codes match supported list
- Contact: support@jambolush.com
