# Payment Schema Migration: Unified Transaction Model

## Overview

This document describes the consolidation of all payment-related tables into a single unified `Transaction` model. This migration simplifies payment tracking, improves query performance, and provides a single source of truth for all payment transactions across multiple providers.

## Migration Summary

### Deprecated Models (Marked for Removal)
- `EscrowTransaction` → Migrated to `Transaction`
- `PaymentTransaction` → Migrated to `Transaction`
- `PawaPayTransaction` → Migrated to `Transaction`

### New Unified Model
- `Transaction` - Single table for all payment transactions

### Kept Models (Unchanged)
- `Wallet` - User wallet balances
- `WalletTransaction` - Wallet transaction history
- `WithdrawalRequest` - Withdrawal requests
- `WithdrawalMethod` - User withdrawal methods
- `BankAccount` - User bank accounts
- `MobileMoneyAccount` - Mobile money accounts
- `PaymentSettings` - User payment preferences
- `OwnerEarning` / `HostEarning` - Earning records
- `OwnerPayment` / `HostPayment` - Payment distribution records
- `AgentCommission` - Agent commission records
- `Payout` - Bulk payout records
- `PawaPayBulkPayout` - PawaPay bulk payout tracking
- `PawaPayWebhookLog` - PawaPay webhook logs
- `EscrowNotification` - Payment notifications

---

## New Transaction Schema

### Key Features

1. **Multi-Provider Support**: Tracks transactions from Pesapal, PawaPay, and XentriPay in one table
2. **Flexible Transaction Types**: DEPOSIT, PAYOUT, REFUND, ESCROW, TRANSFER, COMMISSION, FEE
3. **Comprehensive Fields**: All fields from the three deprecated models consolidated
4. **Backward Compatible**: Old tables kept temporarily during migration
5. **Optimized Indexing**: 15+ indexes for fast queries across all use cases

### Schema Structure

```prisma
model Transaction {
  // Core Identification
  id        String   @id @default(cuid())
  reference String   @unique

  // Provider & Type
  provider         String   // PESAPAL, PAWAPAY, XENTRIPAY
  transactionType  String   // DEPOSIT, PAYOUT, REFUND, ESCROW, TRANSFER, COMMISSION, FEE
  paymentMethod    String?  // mobile_money, bank_transfer, card, wallet, cash

  // User Relationships
  userId           Int?     // Payer/Initiator
  recipientId      Int?     // Recipient

  // Amount & Currency
  amount           Float
  currency         String   @default("USD")
  requestedAmount  Float?
  netAmount        Float?
  charges          Float?
  platformFee      Float?

  // Status
  status           String   @default("PENDING")
  failureReason    String?
  failureCode      String?

  // Provider IDs
  externalId                String?
  providerTransactionId     String?
  financialTransactionId    String?
  providerOrderId           String?

  // Escrow Features
  isEscrow                  Boolean  @default(false)
  escrowStatus              String?
  fundedAt                  DateTime?
  releasedAt                DateTime?
  releasedBy                Int?

  // Dispute Management
  disputedAt                DateTime?
  disputedBy                Int?
  disputeReason             String?

  // Refund Tracking
  isRefund                  Boolean  @default(false)
  refundedAt                DateTime?
  relatedTransactionId      String?

  // Booking Linkage
  bookingId                 String?
  propertyId                Int?
  tourId                    String?

  // Metadata
  metadata                  Json?

  // Timestamps
  createdAt                 DateTime @default(now())
  updatedAt                 DateTime @updatedAt
  completedAt               DateTime?

  // Relations
  user      User?  @relation("UserTransactions")
  recipient User?  @relation("RecipientTransactions")
}
```

---

## Field Mapping

### From EscrowTransaction to Transaction

| EscrowTransaction Field | Transaction Field | Notes |
|------------------------|-------------------|-------|
| `id` | `id` | Direct mapping |
| `userId` | `userId` | Direct mapping |
| `recipientId` | `recipientId` | Direct mapping |
| `type` | `transactionType` | Renamed for clarity |
| `amount` | `amount` | Direct mapping |
| `currency` | `currency` | Direct mapping |
| `status` | `status` | Direct mapping |
| `reference` | `reference` | Direct mapping |
| `description` | `description` | Direct mapping |
| `externalId` | `externalId` | Direct mapping |
| `paymentUrl` | `paymentUrl` | Direct mapping |
| `pesapalOrderId` | `providerOrderId` | Generalized |
| `pesapalTrackingId` | `providerTransactionId` | Generalized |
| `fundedAt` | `fundedAt` | Direct mapping |
| `releasedAt` | `releasedAt` | Direct mapping |
| `metadata` | `metadata` | Provider detected from metadata |

### From PaymentTransaction to Transaction

| PaymentTransaction Field | Transaction Field | Notes |
|-------------------------|-------------------|-------|
| `id` | `id` | Direct mapping |
| `userId` | `userId` | Direct mapping |
| `type` | `transactionType` | Renamed |
| `method` | `paymentMethod` | Renamed |
| `amount` | `amount` | Direct mapping |
| `currency` | `currency` | Direct mapping |
| `status` | `status` | Direct mapping |
| `reference` | `reference` | Direct mapping |
| `jengaTransactionId` | `providerTransactionId` | Generalized |
| `charges` | `charges` | Direct mapping |
| `netAmount` | `netAmount` | Direct mapping |
| `phoneNumber` | `payerPhone` | Renamed |
| `bankCode` | `bankCode` | Direct mapping |
| `accountName` | `accountName` | Direct mapping |
| `callbackUrl` | `callbackUrl` | Direct mapping |

### From PawaPayTransaction to Transaction

| PawaPayTransaction Field | Transaction Field | Notes |
|-------------------------|-------------------|-------|
| `id` | `id` | Direct mapping |
| `userId` | `userId` | Direct mapping |
| `transactionId` | `reference` | Used as reference |
| `transactionType` | `transactionType` | Direct mapping |
| `amount` | `amount` | Converted from string to float |
| `currency` | `currency` | Direct mapping |
| `status` | `status` | Direct mapping |
| `providerTransactionId` | `providerTransactionId` | Direct mapping |
| `financialTransactionId` | `financialTransactionId` | Direct mapping |
| `payerPhone` | `payerPhone` | Direct mapping |
| `recipientPhone` | `recipientPhone` | Direct mapping |
| `correspondent` | `correspondent` | Direct mapping |
| `failureCode` | `failureCode` | Direct mapping |
| `failureMessage` | `failureReason` | Renamed |
| `relatedDepositId` | `relatedTransactionId` | For refunds |

---

## Migration Process

### Step 1: Create New Transaction Table

```bash
# Generate migration
npx prisma migrate dev --name add_unified_transaction_model
```

### Step 2: Run Data Migration Script

```bash
# Migrate existing data to new Transaction table
npx tsx prisma/migrations/migrate-to-unified-transactions.ts
```

This script will:
1. Migrate all `EscrowTransaction` records
2. Migrate all `PaymentTransaction` records (skip escrow-linked ones)
3. Migrate all `PawaPayTransaction` records
4. Provide detailed migration statistics and error reporting

### Step 3: Verify Migration

```bash
# Check migration results
SELECT provider, transaction_type, COUNT(*)
FROM transactions
GROUP BY provider, transaction_type;
```

Expected output:
```
PESAPAL | DEPOSIT | 150
PESAPAL | PAYOUT  | 30
PESAPAL | REFUND  | 5
XENTRIPAY | DEPOSIT | 80
XENTRIPAY | PAYOUT  | 15
PAWAPAY | DEPOSIT | 200
PAWAPAY | PAYOUT  | 50
PAWAPAY | REFUND  | 10
```

### Step 4: Update Application Code

All payment services, controllers, and webhooks have been updated to use the new `Transaction` model. The old models are kept for backward compatibility but marked as deprecated.

### Step 5: Monitor & Test

1. Test all payment flows (deposit, payout, refund)
2. Verify webhook handlers work correctly
3. Test escrow release functionality
4. Validate booking payment flows
5. Check transaction status polling

### Step 6: Remove Old Models (After Verification)

Once verified (recommended: after 30 days of successful operation), remove:
- `EscrowTransaction` model
- `PaymentTransaction` model
- `PawaPayTransaction` model

---

## Benefits of Unified Model

### 1. **Simplified Queries**
**Before** (querying across 3 tables):
```typescript
const escrowTxs = await prisma.escrowTransaction.findMany({ where: { userId } });
const paymentTxs = await prisma.paymentTransaction.findMany({ where: { userId } });
const pawapayTxs = await prisma.pawaPayTransaction.findMany({ where: { userId } });
const allTransactions = [...escrowTxs, ...paymentTxs, ...pawapayTxs].sort(...);
```

**After** (single query):
```typescript
const allTransactions = await prisma.transaction.findMany({
  where: { userId },
  orderBy: { createdAt: 'desc' }
});
```

### 2. **Better Performance**
- Single table scan instead of 3 table scans
- Unified indexes for faster lookups
- Reduced JOIN operations
- Better query planner optimization

### 3. **Easier Maintenance**
- One model to update instead of three
- Consistent field naming across all providers
- Simpler migration scripts for schema changes
- Single source of truth for transaction data

### 4. **Improved Analytics**
- Cross-provider analytics in single query
- Unified transaction statistics
- Easier reporting and dashboards
- Simplified admin panel queries

### 5. **Future-Proof**
- Easy to add new payment providers
- Flexible metadata field for provider-specific data
- Extensible for new transaction types
- Backward-compatible migration path

---

## API Changes

### UnifiedTransactionService

The service has been completely rewritten to use the new `Transaction` model:

```typescript
import { unifiedTransactionService } from './services/unified-transaction.service';

// Get all transactions for a user
const transactions = await unifiedTransactionService.getTransactionsByUserId(userId);

// Get transactions by provider
const pesapalTxs = await unifiedTransactionService.getTransactionsByProvider('PESAPAL');

// Get escrow transactions
const escrowTxs = await unifiedTransactionService.getEscrowTransactions(userId);

// Get pending transactions
const pending = await unifiedTransactionService.getPendingTransactions();

// Get transaction stats
const stats = await unifiedTransactionService.getTransactionStats(userId);
```

### New Filter Options

```typescript
interface UnifiedTransactionFilters {
  userId?: number;
  recipientId?: number;
  provider?: 'PESAPAL' | 'PAWAPAY' | 'XENTRIPAY';
  transactionType?: 'DEPOSIT' | 'PAYOUT' | 'REFUND' | 'ESCROW' | 'TRANSFER';
  status?: string;
  isEscrow?: boolean;
  isRefund?: boolean;
  bookingId?: string;
  propertyId?: number;
  tourId?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}
```

---

## Provider-Specific Notes

### Pesapal
- Provider value: `"PESAPAL"`
- Stores `pesapalOrderId` in `providerOrderId`
- Stores `pesapalTrackingId` in `providerTransactionId`
- Currency conversion from USD to RWF handled in service layer

### PawaPay
- Provider value: `"PAWAPAY"`
- Stores MNO provider code in `correspondent` field
- Amount stored as float (converted from string)
- Phone numbers in `payerPhone` and `recipientPhone`
- Country code in `country` field

### XentriPay
- Provider value: `"XENTRIPAY"`
- Detected via `metadata.xentriPayRefId`
- Supports mobile money and bank transfers
- Provider ID stored in metadata

---

## Rollback Plan

If issues occur during migration:

### 1. Stop using Transaction table
```typescript
// Revert services to use old models
// Old code is still present, just commented out
```

### 2. Keep old data intact
```sql
-- Old tables are not dropped automatically
-- Data remains safe in original tables
```

### 3. Fix issues and re-run migration
```bash
# Clear Transaction table
TRUNCATE TABLE transactions;

# Re-run migration script
npx tsx prisma/migrations/migrate-to-unified-transactions.ts
```

---

## Testing Checklist

- [ ] All existing EscrowTransaction records migrated successfully
- [ ] All existing PaymentTransaction records migrated successfully
- [ ] All existing PawaPayTransaction records migrated successfully
- [ ] No data loss (record counts match)
- [ ] Booking payment flow works end-to-end
- [ ] Pesapal webhooks update Transaction correctly
- [ ] PawaPay webhooks update Transaction correctly
- [ ] XentriPay webhooks update Transaction correctly
- [ ] Escrow release functionality works
- [ ] Refund processing works
- [ ] Status polling updates Transaction correctly
- [ ] Transaction statistics are accurate
- [ ] API endpoints return correct data
- [ ] Admin panel displays transactions correctly

---

## Support & Questions

For issues or questions about this migration:
1. Check the migration logs for detailed error messages
2. Review the migration script at `prisma/migrations/migrate-to-unified-transactions.ts`
3. Check the UnifiedTransactionService implementation
4. Contact the development team

---

## Timeline

- **Week 1**: Schema created, migration script tested
- **Week 2**: Migration run on staging, services updated
- **Week 3**: Migration run on production, monitoring
- **Week 4-8**: Parallel operation with old models (verification period)
- **Week 9**: Remove deprecated models if all tests pass

---

## Conclusion

The unified Transaction model provides a solid foundation for payment processing across multiple providers. It simplifies code, improves performance, and makes the system more maintainable and extensible.

All payment-related operations now go through a single, well-indexed table with comprehensive tracking capabilities, making it easier to monitor payments, debug issues, and generate analytics.
