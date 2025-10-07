# Host/Owner Merge & Withdrawal System Migration Guide

## Overview
This migration consolidates the `host` and `owner` roles into a single `owner` role, implements check-in approval requirements, and adds a comprehensive withdrawal method system with admin approval.

## Key Changes

### 1. **Host and Owner Merge**

#### Before:
- `Property.hostId` - User who managed the property
- `Property.ownerId` - Actual property owner (optional)
- `Property.ownerDetails` - JSON field for owner info

#### After:
- `Property.ownerId` - Single owner field (merged from hostId)
- Property owner has full control over their properties
- Owner must approve check-ins before payments are processed

### 2. **User Relationships**

#### Removed Relations:
- `User.hostedProperties` → Removed
- `Property.host` → Removed

#### Added/Updated Relations:
- `User.ownedProperties` → All properties owned by user
- `User.ownerEarnings` → Earnings from owned properties
- `User.ownerPayments` → Payments for owned properties
- `User.withdrawalMethods` → Withdrawal methods for the user

### 3. **New Models**

#### **OwnerEarning**
Replaces `HostEarning` for new bookings.

```prisma
model OwnerEarning {
  id           String   @id @default(cuid())
  ownerId      Int
  bookingId    String   @unique
  propertyId   Int
  grossAmount  Float
  platformFee  Float
  ownerEarning Float
  currency     String   @default("USD")
  payoutId     String?
  status       String   @default("pending")
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  earnedAt     DateTime?
}
```

#### **OwnerPayment**
Replaces `HostPayment` for new bookings.

```prisma
model OwnerPayment {
  id                    String    @id @default(cuid())
  ownerId               Int
  propertyId            Int
  bookingId             String
  amount                Float
  platformFee           Float     @default(0)
  netAmount             Float
  currency              String    @default("USD")
  status                String    @default("pending")
  checkInRequired       Boolean   @default(true)
  checkInValidated      Boolean   @default(false)
  checkInValidatedAt    DateTime?
  approvedAt            DateTime?
  paidAt                DateTime?
  payoutMethod          String?
  transactionId         String?
  notes                 String?
}
```

**Payment Flow:**
1. Guest books property → Payment held in escrow
2. Guest checks in → Owner must validate check-in
3. Check-in validated → Payment status changes to "approved"
4. Payment processed → Money transferred to owner's wallet

#### **WithdrawalMethod**
User's withdrawal methods (bank accounts, mobile money, etc.) that require admin approval.

```prisma
model WithdrawalMethod {
  id                  String    @id @default(cuid())
  userId              Int
  methodType          String    // bank_account, mobile_money, crypto, paypal, etc
  accountName         String
  accountDetails      Json      // Flexible storage for different method types
  isDefault           Boolean   @default(false)
  isVerified          Boolean   @default(false)
  isApproved          Boolean   @default(false)  // Admin approval required
  approvedBy          Int?
  approvedAt          DateTime?
  rejectedBy          Int?
  rejectedAt          DateTime?
  rejectionReason     String?
  verificationStatus  String    @default("pending")
}
```

**Withdrawal Method Types:**
- `bank_account` - Bank transfer details
- `mobile_money` - Mobile money (MTN, Airtel, etc.)
- `crypto` - Cryptocurrency wallet
- `paypal` - PayPal account

**Account Details JSON Structure:**

```json
// Bank Account
{
  "accountNumber": "1234567890",
  "accountName": "John Doe",
  "bankName": "Bank of Kigali",
  "bankCode": "BOK",
  "swiftCode": "BKIGKWRW",
  "branchCode": "001"
}

// Mobile Money
{
  "phoneNumber": "+250788123456",
  "provider": "MTN",
  "accountName": "John Doe"
}

// Crypto
{
  "walletAddress": "0x1234567890abcdef",
  "network": "Ethereum",
  "accountName": "John Doe"
}
```

### 4. **Updated Models**

#### **Wallet**
Enhanced with unique identifier and pending balance tracking.

```prisma
model Wallet {
  id                String    @id @default(cuid())
  userId            Int       @unique
  balance           Float     @default(0)
  pendingBalance    Float     @default(0)    // NEW: Balance pending approval
  currency          String    @default("RWF")
  walletNumber      String    @unique        // NEW: Unique identifier
  accountNumber     String?
  isActive          Boolean   @default(true)
  isVerified        Boolean   @default(false)
}
```

**Wallet Number Format:** `WLT-00000001-abc123`

**Balance Types:**
- `balance` - Available for withdrawal
- `pendingBalance` - Awaiting check-in validation or admin approval

#### **WithdrawalRequest**
Enhanced with admin approval workflow.

```prisma
model WithdrawalRequest {
  id                    String      @id @default(cuid())
  userId                Int
  amount                Float
  currency              String      @default("RWF")
  withdrawalMethodId    String?     // NEW: Links to approved method
  method                String
  status                String      @default("PENDING")
  destination           Json
  adminNotes            String?     // NEW: Admin notes
  approvedBy            Int?        // NEW: Admin who approved
  approvedAt            DateTime?   // NEW
  rejectedBy            Int?        // NEW: Admin who rejected
  rejectedAt            DateTime?   // NEW
  processedBy           Int?        // NEW: Admin who processed
}
```

**Status Flow:**
1. `PENDING` - User created withdrawal request
2. `APPROVED` - Admin approved the request
3. `PROCESSING` - Payment being processed
4. `COMPLETED` - Successfully paid out
5. `REJECTED` - Admin rejected the request
6. `CANCELLED` - User cancelled the request

#### **Booking**
Updated to reflect owner terminology and check-in validation.

```prisma
model Booking {
  ownerResponse        String?      // Renamed from hostResponse
  checkInValidated     Boolean      @default(false)
  checkInValidatedAt   DateTime?
  checkInValidatedBy   Int?         // Must be property owner
  checkOutValidated    Boolean      @default(false)
  checkOutValidatedAt  DateTime?
  checkOutValidatedBy  Int?         // Must be property owner
}
```

## Migration Steps

### 1. **Database Migration**

Run the migration SQL:

```bash
# Apply the migration
npx prisma migrate deploy

# Or for development
npx prisma migrate dev
```

The migration will:
- Add `walletNumber` and `pendingBalance` to wallets
- Rename `Booking.hostResponse` to `Booking.ownerResponse`
- Merge `Property.hostId` into `Property.ownerId`
- Copy `host_earnings` → `owner_earnings`
- Copy `host_payments` → `owner_payments`
- Create `withdrawal_methods` table
- Add new fields to `withdrawal_requests`

### 2. **Update Services**

#### Owner Account Service
Update [owner-account.service.ts](../src/services/owner-account.service.ts):

```typescript
// OLD: Creates owner with userType 'host'
userType: 'host'

// NEW: Creates owner with userType 'owner'
userType: 'owner'
```

#### Property Service
Update property queries to use `ownerId` instead of `hostId`:

```typescript
// OLD
const property = await prisma.property.findUnique({
  where: { id },
  include: { host: true }
});

// NEW
const property = await prisma.property.findUnique({
  where: { id },
  include: { owner: true }
});
```

#### Booking Service
Add check-in validation enforcement:

```typescript
async validateCheckIn(bookingId: string, ownerId: number) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { property: true }
  });

  // Ensure only property owner can validate
  if (booking.property.ownerId !== ownerId) {
    throw new Error('Only property owner can validate check-in');
  }

  // Update booking
  await prisma.booking.update({
    where: { id: bookingId },
    data: {
      checkInValidated: true,
      checkInValidatedAt: new Date(),
      checkInValidatedBy: ownerId
    }
  });

  // Update owner payment status
  await prisma.ownerPayment.updateMany({
    where: { bookingId },
    data: {
      status: 'approved',
      checkInValidated: true,
      checkInValidatedAt: new Date(),
      approvedAt: new Date()
    }
  });

  // Transfer from pending to available balance
  // ... wallet update logic
}
```

### 3. **Create Withdrawal Services**

#### Withdrawal Method Service

```typescript
// src/services/withdrawal-method.service.ts
export class WithdrawalMethodService {
  async createWithdrawalMethod(userId: number, data: CreateWithdrawalMethodDto) {
    return await prisma.withdrawalMethod.create({
      data: {
        userId,
        methodType: data.methodType,
        accountName: data.accountName,
        accountDetails: data.accountDetails,
        isDefault: data.isDefault || false,
        verificationStatus: 'pending',
        isApproved: false
      }
    });
  }

  async approveWithdrawalMethod(methodId: string, adminId: number) {
    return await prisma.withdrawalMethod.update({
      where: { id: methodId },
      data: {
        isApproved: true,
        isVerified: true,
        verificationStatus: 'verified',
        approvedBy: adminId,
        approvedAt: new Date()
      }
    });
  }

  async rejectWithdrawalMethod(
    methodId: string,
    adminId: number,
    reason: string
  ) {
    return await prisma.withdrawalMethod.update({
      where: { id: methodId },
      data: {
        isApproved: false,
        verificationStatus: 'rejected',
        rejectedBy: adminId,
        rejectedAt: new Date(),
        rejectionReason: reason
      }
    });
  }
}
```

#### Withdrawal Request Service

```typescript
// src/services/withdrawal-request.service.ts
export class WithdrawalRequestService {
  async createWithdrawalRequest(userId: number, data: CreateWithdrawalRequestDto) {
    const wallet = await prisma.wallet.findUnique({ where: { userId } });

    if (wallet.balance < data.amount) {
      throw new Error('Insufficient balance');
    }

    return await prisma.withdrawalRequest.create({
      data: {
        userId,
        amount: data.amount,
        currency: wallet.currency,
        withdrawalMethodId: data.withdrawalMethodId,
        method: data.method,
        destination: data.destination,
        status: 'PENDING',
        reference: generateReference()
      }
    });
  }

  async approveWithdrawalRequest(requestId: string, adminId: number) {
    return await prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: 'APPROVED',
        approvedBy: adminId,
        approvedAt: new Date()
      }
    });
  }

  async processWithdrawal(requestId: string, adminId: number) {
    const request = await prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: 'PROCESSING',
        processedBy: adminId
      }
    });

    // Deduct from wallet
    await prisma.wallet.update({
      where: { userId: request.userId },
      data: {
        balance: { decrement: request.amount }
      }
    });

    // Process payment via payment gateway
    // ... payment logic

    // Mark as completed
    await prisma.withdrawalRequest.update({
      where: { id: requestId },
      data: {
        status: 'COMPLETED',
        completedAt: new Date()
      }
    });
  }
}
```

### 4. **Update Controllers**

Add new endpoints for withdrawal methods and check-in validation:

```typescript
// Check-in validation endpoint
router.post('/bookings/:id/validate-checkin',
  authenticateUser,
  async (req, res) => {
    await bookingService.validateCheckIn(req.params.id, req.user.id);
    res.json({ success: true });
  }
);

// Withdrawal method endpoints
router.post('/withdrawal-methods', authenticateUser, createWithdrawalMethod);
router.get('/withdrawal-methods', authenticateUser, getUserWithdrawalMethods);
router.patch('/withdrawal-methods/:id/approve', isAdmin, approveWithdrawalMethod);
router.patch('/withdrawal-methods/:id/reject', isAdmin, rejectWithdrawalMethod);

// Withdrawal request endpoints
router.post('/withdrawal-requests', authenticateUser, createWithdrawalRequest);
router.get('/withdrawal-requests', authenticateUser, getUserWithdrawalRequests);
router.patch('/withdrawal-requests/:id/approve', isAdmin, approveWithdrawalRequest);
router.patch('/withdrawal-requests/:id/reject', isAdmin, rejectWithdrawalRequest);
router.patch('/withdrawal-requests/:id/process', isAdmin, processWithdrawal);
```

## User Flows

### Property Owner Flow

1. **Property Upload** (by Agent or Owner):
   - Agent uploads property with `agentId` and `ownerId`
   - Owner account created if doesn't exist
   - Owner receives welcome email with credentials

2. **Account Setup**:
   - Owner logs in and completes KYC
   - Adds wallet information
   - Creates withdrawal methods (pending admin approval)

3. **Booking Received**:
   - Guest books property → Payment in escrow
   - Owner notified of booking

4. **Check-in**:
   - Guest arrives and checks in
   - **Owner validates check-in** (required)
   - Payment released from escrow to owner's wallet pending balance

5. **Withdrawal**:
   - Owner creates withdrawal request using approved method
   - Admin reviews and approves request
   - Payment processed
   - Funds transferred to owner's account

### Guest Flow

1. **Booking**: Search, select property, pay
2. **Check-in**: Arrive and check in (owner validates)
3. **Check-out**: Complete stay
4. **Review**: Leave review for property

### Agent Flow

1. **Property Upload**: Upload property on behalf of owner
2. **Commission**: Earn commission on bookings
3. **Withdrawal**: Request withdrawal of commissions

### Admin Flow

1. **Withdrawal Method Approval**:
   - Review withdrawal method details
   - Verify account information
   - Approve or reject

2. **Withdrawal Request Processing**:
   - Review withdrawal request
   - Approve request
   - Process payment
   - Mark as completed

## Legacy Support

The migration maintains backward compatibility:

- `HostEarning` model kept for historical data
- `HostPayment` model kept for historical data
- Legacy relations preserved with "Legacy" prefix

## Testing Checklist

- [ ] Property creation with ownerId works
- [ ] Booking creation works
- [ ] Check-in validation by owner works
- [ ] Check-in validation by non-owner fails
- [ ] Owner earnings created on booking
- [ ] Owner payments created on booking
- [ ] Wallet balance updates correctly
- [ ] Pending balance moves to available after check-in
- [ ] Withdrawal method creation works
- [ ] Withdrawal method admin approval works
- [ ] Withdrawal request creation works
- [ ] Withdrawal request admin approval works
- [ ] Withdrawal processing works
- [ ] All users can create withdrawal requests
- [ ] Agent commission withdrawals work

## API Changes

### Breaking Changes

#### Property Endpoints
```typescript
// OLD Response
{
  "id": 1,
  "hostId": 10,
  "host": { ... }
}

// NEW Response
{
  "id": 1,
  "ownerId": 10,
  "owner": { ... }
}
```

#### Booking Endpoints
```typescript
// OLD Response
{
  "id": "abc123",
  "hostResponse": "Welcome!"
}

// NEW Response
{
  "id": "abc123",
  "ownerResponse": "Welcome!"
}
```

### New Endpoints

#### Withdrawal Methods
- `POST /api/withdrawal-methods` - Create withdrawal method
- `GET /api/withdrawal-methods` - Get user's withdrawal methods
- `PATCH /api/withdrawal-methods/:id/approve` - Approve method (admin)
- `PATCH /api/withdrawal-methods/:id/reject` - Reject method (admin)

#### Withdrawal Requests
- `POST /api/withdrawal-requests` - Create withdrawal request
- `GET /api/withdrawal-requests` - Get user's requests
- `GET /api/withdrawal-requests/:id` - Get request details
- `PATCH /api/withdrawal-requests/:id/approve` - Approve (admin)
- `PATCH /api/withdrawal-requests/:id/reject` - Reject (admin)
- `PATCH /api/withdrawal-requests/:id/process` - Process (admin)

#### Booking Check-in
- `POST /api/bookings/:id/validate-checkin` - Validate guest check-in (owner only)
- `POST /api/bookings/:id/validate-checkout` - Validate guest check-out (owner only)

## Security Considerations

1. **Check-in Validation**: Only property owner can validate check-ins
2. **Withdrawal Method Approval**: Only admins can approve withdrawal methods
3. **Withdrawal Processing**: Only admins can process withdrawals
4. **Balance Protection**: Users cannot withdraw more than available balance
5. **Pending Balance**: Locked until check-in validation

## Rollback Plan

If issues arise:

1. Revert schema changes
2. Restore from `host_earnings` and `host_payments` tables (kept as legacy)
3. Update services to use old field names
4. Re-deploy previous version

## Support

For questions or issues, contact the development team or create an issue in the repository.
