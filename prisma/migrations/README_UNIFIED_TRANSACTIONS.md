# Unified Transaction Migration - Quick Start Guide

## Overview

This migration consolidates **all payment transactions** from three separate tables (`EscrowTransaction`, `PaymentTransaction`, `PawaPayTransaction`) into a single unified `Transaction` table.

## What's Changed

### ✅ NEW: Single Transaction Table
- All Pesapal, PawaPay, and XentriPay transactions in one place
- Unified schema with all fields from previous models
- Better performance with optimized indexes
- Simplified querying and maintenance

### ⚠️ DEPRECATED: Old Transaction Tables
- `EscrowTransaction` - Marked as deprecated, kept for compatibility
- `PaymentTransaction` - Marked as deprecated, kept for compatibility
- `PawaPayTransaction` - Marked as deprecated, kept for compatibility

**Note:** Old tables are NOT deleted automatically. They remain in the database for safety and can be manually removed after verification.

---

## Migration Steps

### 1. Create the New Table

Run the Prisma migration to create the `transactions` table:

```bash
npx prisma migrate dev --name add_unified_transaction_model
```

Or for production:

```bash
npx prisma migrate deploy
```

This creates the new `transactions` table without affecting existing data.

### 2. Migrate Existing Data

Run the migration script to copy all existing transaction data to the new table:

```bash
npx tsx prisma/migrations/migrate-to-unified-transactions.ts
```

**What this does:**
1. Migrates all `EscrowTransaction` records → Detects provider (Pesapal/XentriPay/PawaPay) from metadata
2. Migrates all `PaymentTransaction` records → Skips escrow-linked duplicates
3. Migrates all `PawaPayTransaction` records → Converts string amounts to float

**Expected Output:**
```
Starting migration to unified Transaction table...

Step 1: Migrating EscrowTransactions...
Found 150 escrow transactions to migrate
  Migrated 100 escrow transactions...
✓ Completed: 150 escrow transactions migrated

Step 2: Migrating PaymentTransactions...
Found 80 payment transactions to migrate
  Migrated 50 payment transactions...
  Skipped payment xyz - already migrated via escrow
✓ Completed: 50 payment transactions migrated

Step 3: Migrating PawaPayTransactions...
Found 200 PawaPay transactions to migrate
  Migrated 100 PawaPay transactions...
  Migrated 200 PawaPay transactions...
✓ Completed: 200 PawaPay transactions migrated

═══════════════════════════════════════════════════════
MIGRATION SUMMARY
═══════════════════════════════════════════════════════
EscrowTransactions migrated:   150
PaymentTransactions migrated:  50
PawaPayTransactions migrated:  200
───────────────────────────────────────────────────────
TOTAL MIGRATED:                400
ERRORS:                        0
═══════════════════════════════════════════════════════

✓ Migration completed successfully!
```

### 3. Regenerate Prisma Client

After migration, regenerate the Prisma client:

```bash
npx prisma generate
```

### 4. Verification Queries

Check that all data migrated correctly:

```sql
-- Count transactions by provider
SELECT provider, COUNT(*) as count
FROM transactions
GROUP BY provider;

-- Expected output:
-- PESAPAL   | 150
-- XENTRIPAY | 50
-- PAWAPAY   | 200

-- Count transactions by type
SELECT transaction_type, COUNT(*) as count
FROM transactions
GROUP BY transaction_type;

-- Compare old vs new counts
SELECT
  (SELECT COUNT(*) FROM escrow_transactions) as escrow_count,
  (SELECT COUNT(*) FROM payment_transactions) as payment_count,
  (SELECT COUNT(*) FROM pawapay_transactions) as pawapay_count,
  (SELECT COUNT(*) FROM transactions) as unified_count;

-- Should roughly match (accounting for escrow-linked duplicates)
```

---

## Using the New Transaction Model

### Query Examples

```typescript
import { unifiedTransactionService } from './services/unified-transaction.service';

// Get all transactions for a user
const userTransactions = await unifiedTransactionService.getTransactionsByUserId(userId);

// Get transactions by provider
const pesapalTxs = await unifiedTransactionService.getTransactionsByProvider('PESAPAL');
const pawapayTxs = await unifiedTransactionService.getTransactionsByProvider('PAWAPAY');
const xentripayTxs = await unifiedTransactionService.getTransactionsByProvider('XENTRIPAY');

// Get escrow transactions
const escrowTransactions = await unifiedTransactionService.getEscrowTransactions(userId);

// Get transactions for a booking
const bookingTxs = await unifiedTransactionService.getTransactionsByBookingId(bookingId);

// Get pending transactions (for status polling)
const pendingTxs = await unifiedTransactionService.getPendingTransactions();

// Get transaction statistics
const stats = await unifiedTransactionService.getTransactionStats(userId);
console.log(stats);
// {
//   totalTransactions: 400,
//   byProvider: { PESAPAL: 150, XENTRIPAY: 50, PAWAPAY: 200 },
//   byStatus: { COMPLETED: 300, PENDING: 80, FAILED: 20 },
//   byType: { DEPOSIT: 250, PAYOUT: 100, REFUND: 50 },
//   totalVolume: { USD: 50000, RWF: 13000000 },
//   completedVolume: { USD: 45000, RWF: 11000000 },
//   pendingVolume: { USD: 5000, RWF: 2000000 }
// }
```

### Direct Prisma Queries

```typescript
import { prisma } from './prisma';

// Get all Pesapal deposits
const pesapalDeposits = await prisma.transaction.findMany({
  where: {
    provider: 'PESAPAL',
    transactionType: 'DEPOSIT'
  }
});

// Get completed transactions in date range
const completedTxs = await prisma.transaction.findMany({
  where: {
    status: 'COMPLETED',
    createdAt: {
      gte: new Date('2024-01-01'),
      lte: new Date('2024-12-31')
    }
  },
  include: {
    user: true,
    recipient: true
  }
});

// Get escrow transactions waiting for release
const heldEscrow = await prisma.transaction.findMany({
  where: {
    isEscrow: true,
    escrowStatus: 'HELD'
  }
});
```

---

## Provider-Specific Details

### Pesapal Transactions
- **Provider**: `"PESAPAL"`
- **Currency**: Stored in RWF (converted from USD)
- **Order ID**: Stored in `providerOrderId`
- **Tracking ID**: Stored in `providerTransactionId`
- **Detection**: Default for escrow transactions, or `metadata.provider === 'PESAPAL'`

### PawaPay Transactions
- **Provider**: `"PAWAPAY"`
- **Amount**: Converted from string (smallest unit) to float
- **Phone Numbers**: `payerPhone` and `recipientPhone`
- **MNO Provider**: Stored in `correspondent` (e.g., `MTN_MOMO_RWA`)
- **Country**: ISO 3166-1 alpha-3 code (e.g., `RWA`)

### XentriPay Transactions
- **Provider**: `"XENTRIPAY"`
- **Detection**: `metadata.xentriPayRefId` exists
- **Supports**: Mobile money and bank transfers in Rwanda
- **Provider IDs**: Stored in metadata

---

## Rollback Instructions

If you need to rollback:

### 1. Stop Using New Table
The old tables still exist and contain all original data. Simply revert service code to use old models.

### 2. Clear Migration (Optional)
If you want to remove the new table:

```sql
-- Remove all data from transactions table
TRUNCATE TABLE transactions;

-- Or drop the table entirely
DROP TABLE transactions;
```

### 3. Re-run Migration
Fix any issues, then re-run the migration script:

```bash
npx tsx prisma/migrations/migrate-to-unified-transactions.ts
```

---

## Important Notes

### Data Safety
- ✅ Old tables are NOT deleted
- ✅ Original data remains intact
- ✅ Migration script is idempotent (can be re-run safely if it uses UPSERT logic)
- ✅ No data is modified in source tables

### Performance
- ✅ 15+ indexes for fast queries
- ✅ Single table scan vs. 3 table scans
- ✅ Better query planner optimization
- ✅ Reduced JOIN operations

### Backward Compatibility
- ✅ Old models still work during transition
- ✅ Gradual migration possible
- ✅ Services can run in parallel mode
- ✅ Remove old models only after verification

---

## Testing Checklist

Before removing old tables, verify:

- [ ] All transaction counts match (accounting for duplicates)
- [ ] Booking payment flow works end-to-end
- [ ] Pesapal webhooks update Transaction correctly
- [ ] PawaPay webhooks update Transaction correctly
- [ ] XentriPay webhooks update Transaction correctly
- [ ] Escrow release functionality works
- [ ] Refund processing works
- [ ] Status polling updates correctly
- [ ] Transaction statistics are accurate
- [ ] API endpoints return correct data
- [ ] Admin panel displays correctly
- [ ] No errors in application logs
- [ ] Performance is improved or similar

---

## Support

For issues or questions:
1. **Check migration logs** for detailed error messages
2. **Review the migration script**: `migrate-to-unified-transactions.ts`
3. **Check comprehensive docs**: `docs/PAYMENT_SCHEMA_MIGRATION.md`
4. **Review service implementation**: `src/services/unified-transaction.service.ts`
5. **Contact development team** if issues persist

---

## Timeline

**Recommended migration timeline:**

- **Day 1**: Run migration on staging environment
- **Days 2-3**: Test all payment flows on staging
- **Day 4**: Run migration on production
- **Weeks 1-4**: Monitor production, verify all flows work
- **Week 5+**: After verification, optionally remove old models

---

## Quick Reference

### Key Files
- Schema: `prisma/schema.prisma`
- Migration Script: `prisma/migrations/migrate-to-unified-transactions.ts`
- Service: `src/services/unified-transaction.service.ts`
- Full Docs: `docs/PAYMENT_SCHEMA_MIGRATION.md`

### Key Commands
```bash
# Create table
npx prisma migrate dev --name add_unified_transaction_model

# Migrate data
npx tsx prisma/migrations/migrate-to-unified-transactions.ts

# Regenerate client
npx prisma generate

# Format schema
npx prisma format

# View in Prisma Studio
npx prisma studio
```

### Transaction Providers
- `PESAPAL` - Primary payment gateway (Deposits & Withdrawals)
- `PAWAPAY` - Multi-country mobile money
- `XENTRIPAY` - Rwanda-focused (Mobile money & Banks)

### Transaction Types
- `DEPOSIT` - Money in (customer payment)
- `PAYOUT` - Money out (withdrawal to user)
- `REFUND` - Return payment
- `ESCROW` - Held payment (booking)
- `TRANSFER` - Internal transfer
- `COMMISSION` - Agent/platform fee
- `FEE` - Transaction fee

### Transaction Statuses
- `PENDING` - Initiated, awaiting processing
- `PROCESSING` - In progress
- `HELD` - Escrow held (awaiting release)
- `COMPLETED` - Successfully completed
- `FAILED` - Transaction failed
- `CANCELLED` - User/admin cancelled
- `REFUNDED` - Payment refunded
- `REVERSED` - Payment reversed

---

**Ready to migrate? Run the commands above and monitor the output!**
