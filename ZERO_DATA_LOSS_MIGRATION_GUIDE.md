# Zero Data Loss Migration Guide

## 🎯 Objective

Migrate from old payment schema (with Escrow, Pesapal, and separate transaction tables) to the new unified Transaction schema **WITHOUT LOSING ANY DATA**.

---

## 📋 Current Situation

### Old Schema (Currently in Database)
- `escrow_transactions` - Escrow payments (Pesapal/XentriPay)
- `payment_transactions` - Generic payment tracking
- `pawapay_transactions` - PawaPay-specific transactions
- `wallet_transactions` - Wallet operations (STAYS)
- `withdrawal_requests` - Withdrawal requests (STAYS, but loses `pesapalPayoutId` field)

### New Schema (In schema.prisma, Not Yet Pushed)
- `transactions` - Unified table for ALL transactions (PawaPay, XentriPay)
- `wallet_transactions` - Unchanged
- `withdrawal_requests` - Unchanged (except removed `pesapalPayoutId`)

---

## ⚠️ Critical Points

1. **Database Still Has OLD Schema** - You haven't run `npx prisma db push` yet
2. **No Data Loss** - We'll backup everything before any changes
3. **Safe Migration** - Script generates SQL to restore all data after schema push
4. **Pesapal Removed** - Old Pesapal data will be migrated but provider changed to XENTRIPAY/PAWAPAY

---

## 🚀 Step-by-Step Migration Process

### Step 1: Backup Current Data (BEFORE db push)

Run the pre-push migration script:

```bash
npx tsx prisma/migrations/pre-push-data-migration.ts
```

**What this does:**
- ✅ Backs up all `escrow_transactions` to JSON
- ✅ Backs up all `payment_transactions` to JSON
- ✅ Backs up all `pawapay_transactions` to JSON
- ✅ Backs up all `wallet_transactions` to JSON
- ✅ Backs up all `withdrawal_requests` to JSON
- ✅ Generates SQL INSERT statements for new schema
- ✅ Creates detailed instructions file

**Output:**
```
📁 Backup directory: prisma/backups/pre-push-backup-YYYY-MM-DD/
  - escrow_transactions.json
  - payment_transactions.json
  - pawapay_transactions.json
  - wallet_transactions.json
  - withdrawal_requests.json
  - migration.sql (SQL to restore data after db push)
  - INSTRUCTIONS.md (Detailed instructions)
```

### Step 2: Review Backups

Check the backup directory:
```bash
ls prisma/backups/pre-push-backup-*/
```

Verify JSON files contain your data:
```bash
cat prisma/backups/pre-push-backup-*/escrow_transactions.json | head
```

### Step 3: Push New Schema to Database

**THIS IS THE CRITICAL STEP - Database schema changes happen here**

```bash
npx prisma db push
```

**What happens:**
- ❌ Old `escrow_transactions` table **DROPPED** (data lost if not backed up!)
- ❌ Old `pesapal` fields **REMOVED**
- ✅ New `transactions` table **CREATED**
- ✅ `wallet_transactions` table **UNCHANGED**
- ✅ `withdrawal_requests` table **UPDATED** (pesapalPayoutId removed)

**Database changes are NOW APPLIED - your old transaction tables are GONE!**

### Step 4: Restore Data to New Schema

Import the migration SQL that was generated in Step 1:

```bash
# Find your backup directory
ls prisma/backups/

# Run the migration SQL (replace YYYY-MM-DD with your backup timestamp)
npx prisma db execute --file "prisma/backups/pre-push-backup-YYYY-MM-DD/migration.sql" --schema prisma/schema.prisma
```

**Or connect to database manually:**
```bash
# For PostgreSQL
psql -U your_user -d your_database -f prisma/backups/pre-push-backup-YYYY-MM-DD/migration.sql
```

**What this does:**
- ✅ Inserts all old escrow transactions into new `transactions` table
- ✅ Inserts all old payment transactions into new `transactions` table
- ✅ Inserts all old PawaPay transactions into new `transactions` table
- ✅ Converts Pesapal transactions to XENTRIPAY/PAWAPAY provider
- ✅ Preserves all fields: amounts, status, timestamps, metadata

### Step 5: Verify Migration

**Check transaction counts:**
```bash
npx prisma studio
```

**Or use SQL:**
```sql
-- Count by provider
SELECT provider, COUNT(*) FROM transactions GROUP BY provider;

-- Count by type
SELECT transaction_type, COUNT(*) FROM transactions GROUP BY transaction_type;

-- Count by status
SELECT status, COUNT(*) FROM transactions GROUP BY status;

-- Total count
SELECT COUNT(*) FROM transactions;
```

**Expected totals should match:**
- Old escrow_transactions count + old payment_transactions count + old pawapay_transactions count = New transactions count

### Step 6: Regenerate Prisma Client

```bash
npx prisma generate
```

This updates your TypeScript types to match the new schema.

### Step 7: Verify Wallet and Withdrawal Data

```sql
-- Verify wallet transactions are intact
SELECT COUNT(*) FROM wallet_transactions;

-- Verify withdrawal requests are intact (pesapalPayoutId should be gone)
SELECT COUNT(*) FROM withdrawal_requests;
```

---

## 🔍 Verification Queries

### Check All Transaction Data

```sql
-- View sample transactions
SELECT
  id,
  reference,
  provider,
  transaction_type,
  amount,
  currency,
  status,
  created_at
FROM transactions
ORDER BY created_at DESC
LIMIT 20;

-- Check for any NULL user_ids (might need investigation)
SELECT COUNT(*) FROM transactions WHERE user_id IS NULL;

-- Check amount ranges
SELECT
  provider,
  MIN(amount) as min_amount,
  MAX(amount) as max_amount,
  AVG(amount) as avg_amount,
  COUNT(*) as count
FROM transactions
GROUP BY provider;
```

### Check Wallet Data Integrity

```sql
-- Verify wallet balances still match transaction history
SELECT
  w.id,
  w.user_id,
  w.balance,
  COUNT(wt.id) as transaction_count,
  SUM(CASE WHEN wt.type = 'CREDIT' THEN wt.amount ELSE -wt.amount END) as calculated_balance
FROM wallets w
LEFT JOIN wallet_transactions wt ON wt.wallet_id = w.id
GROUP BY w.id, w.user_id, w.balance
HAVING w.balance != SUM(CASE WHEN wt.type = 'CREDIT' THEN wt.amount ELSE -wt.amount END)
LIMIT 10;
```

### Check Withdrawal Requests

```sql
-- Verify all withdrawal requests are still present
SELECT
  id,
  user_id,
  amount,
  currency,
  status,
  method,
  created_at
FROM withdrawal_requests
ORDER BY created_at DESC
LIMIT 20;
```

---

## 🔄 Rollback Plan (If Something Goes Wrong)

### Option 1: Restore from JSON Backups

If migration SQL fails or data is incorrect:

1. **Drop the new transactions table:**
```sql
DROP TABLE IF EXISTS transactions CASCADE;
```

2. **Revert schema to old version:**
```bash
git checkout HEAD~1 -- prisma/schema.prisma
```

3. **Push old schema back:**
```bash
npx prisma db push --force-reset
```

4. **Manually restore data from JSON backups** using a custom script or SQL inserts

### Option 2: Database Backup Restore

If you have a full database backup:

1. Stop your application
2. Restore database from backup (before db push)
3. Fix any issues in migration script
4. Try migration again

---

## 📊 Data Mapping Reference

### Escrow Transaction → Transaction

| Old Field (escrow_transactions) | New Field (transactions) | Notes |
|--------------------------------|-------------------------|-------|
| `id` | `id` | Direct copy |
| `reference` | `reference` | Direct copy |
| `user_id` | `userId` | Direct copy |
| `recipient_id` | `recipientId` | Direct copy |
| `type` | `transactionType` | DEPOSIT, PAYOUT, etc. |
| `amount` | `amount` | Direct copy |
| `currency` | `currency` | Direct copy |
| `status` | `status` | Direct copy |
| `pesapal_order_id` | `externalId` | Mapped |
| `pesapal_tracking_id` | `providerTransactionId` | Mapped |
| `is_escrow` | *removed* | No longer used |
| `escrow_status` | *removed* | No longer used |
| `funded_at` | *removed* | No longer used |
| `released_at` | `completedAt` | Mapped |
| `platform_fee` | `platformFee` | Direct copy |
| `agent_commission` | `agentCommission` | Direct copy |
| `host_share` | `hostShare` | Direct copy |
| *new* | `provider` | Auto-detected: PESAPAL/PAWAPAY/XENTRIPAY |

### Payment Transaction → Transaction

| Old Field (payment_transactions) | New Field (transactions) | Notes |
|---------------------------------|-------------------------|-------|
| `id` | `id` | Direct copy |
| `reference` | `reference` | Direct copy |
| `user_id` | `userId` | Direct copy |
| `type` | `transactionType` | Direct copy |
| `method` | `paymentMethod` | Direct copy |
| `amount` | `amount` | Direct copy |
| `currency` | `currency` | Direct copy |
| `status` | `status` | Direct copy |
| `external_id` | `externalId` | Direct copy |
| `jenga_transaction_id` | `providerTransactionId` | Mapped |
| `phone_number` | `payerPhone` or `recipientPhone` | Based on type |
| `bank_code` | `bankCode` | Direct copy |
| *new* | `provider` | Auto-detected from method |

### PawaPay Transaction → Transaction

| Old Field (pawapay_transactions) | New Field (transactions) | Notes |
|---------------------------------|-------------------------|-------|
| `id` | `id` | Direct copy |
| `transaction_id` | `reference` | Mapped |
| `user_id` | `userId` | Direct copy |
| `transaction_type` | `transactionType` | Direct copy |
| `amount` (string, cents) | `amount` (float, dollars) | Converted: /100 |
| `currency` | `currency` | Direct copy |
| `status` | `status` | Direct copy |
| `payer_phone` | `payerPhone` | Direct copy |
| `recipient_phone` | `recipientPhone` | Direct copy |
| `correspondent` | `correspondent` | Direct copy (MNO code) |
| `provider_transaction_id` | `providerTransactionId` | Direct copy |
| `related_deposit_id` | `relatedTransactionId` | Direct copy |
| *constant* | `provider` | Always 'PAWAPAY' |

---

## 🧪 Testing Checklist

After migration, test these flows:

### Payment Flows
- [ ] Create a new booking payment (PawaPay)
- [ ] Create a new booking payment (XentriPay)
- [ ] View transaction history for a user
- [ ] Check transaction details page
- [ ] Verify webhook callbacks update transaction status

### Wallet Operations
- [ ] Check wallet balance for users
- [ ] View wallet transaction history
- [ ] Credit wallet (admin operation)
- [ ] Debit wallet (admin operation)

### Withdrawal Flows
- [ ] Create a new withdrawal request
- [ ] View withdrawal request history
- [ ] Process a withdrawal (admin)
- [ ] Verify withdrawal linked to transaction

### Admin Operations
- [ ] View all transactions in admin panel
- [ ] Filter transactions by provider
- [ ] Filter transactions by status
- [ ] Export transaction data
- [ ] View transaction statistics

### API Endpoints
- [ ] GET /api/transactions (user transactions)
- [ ] GET /api/transactions/:id (transaction details)
- [ ] GET /api/admin/transactions (all transactions)
- [ ] GET /api/wallet/transactions (wallet history)
- [ ] POST /api/withdrawals (create withdrawal)

---

## 📝 Migration Timeline

### Before Migration (5-10 minutes)
1. Inform users of scheduled maintenance
2. Stop any background jobs that process payments
3. Create full database backup
4. Run pre-push migration script

### During Migration (2-5 minutes)
1. Run `npx prisma db push` (schema changes)
2. Run migration SQL (data restore)
3. Regenerate Prisma client
4. Run verification queries

### After Migration (10-15 minutes)
1. Restart application
2. Test critical payment flows
3. Monitor error logs
4. Verify transaction counts
5. Test wallet and withdrawal operations
6. Resume background jobs

**Total estimated downtime: 15-30 minutes**

---

## 🆘 Troubleshooting

### Issue: Migration SQL fails with "duplicate key value"

**Cause:** Some transactions already exist in new table

**Solution:**
```sql
-- The migration SQL uses ON CONFLICT DO NOTHING
-- So duplicates are safely skipped
-- Check which records failed:
SELECT reference FROM transactions WHERE reference IN (
  SELECT reference FROM old_backup_table
);
```

### Issue: Transaction counts don't match

**Cause:** Some records might have been filtered or duplicated

**Solution:**
```sql
-- Compare detailed counts
SELECT
  'escrow_old' as source, COUNT(*) as count FROM escrow_transactions
UNION ALL
SELECT
  'payment_old' as source, COUNT(*) as count FROM payment_transactions
UNION ALL
SELECT
  'pawapay_old' as source, COUNT(*) as count FROM pawapay_transactions
UNION ALL
SELECT
  'transactions_new' as source, COUNT(*) as count FROM transactions;
```

Check backup JSON files for missing records.

### Issue: Wallet balances seem incorrect

**Cause:** Wallet transactions are unchanged, but transaction history might be linked incorrectly

**Solution:**
```sql
-- Recalculate wallet balances from transaction history
UPDATE wallets w
SET balance = (
  SELECT COALESCE(SUM(
    CASE
      WHEN wt.type = 'CREDIT' THEN wt.amount
      WHEN wt.type = 'DEBIT' THEN -wt.amount
      ELSE 0
    END
  ), 0)
  FROM wallet_transactions wt
  WHERE wt.wallet_id = w.id
);
```

### Issue: Withdrawal requests missing pesapalPayoutId

**Expected behavior** - This field is intentionally removed from the schema as Pesapal is no longer supported. Old withdrawal requests will still work, just without the Pesapal reference.

---

## 📞 Support

If you encounter issues:

1. **Check backup files:**
   - `prisma/backups/pre-push-backup-*/`

2. **Review documentation:**
   - [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md)
   - [SCHEMA_CLEANUP_SUMMARY.md](SCHEMA_CLEANUP_SUMMARY.md)
   - [docs/PAYMENT_SCHEMA_MIGRATION.md](docs/PAYMENT_SCHEMA_MIGRATION.md)

3. **Check logs:**
   - Application error logs
   - Database query logs
   - Migration script output

4. **Database backup:**
   - Always keep a full database backup before migration
   - Can restore entire database if needed

---

## ✅ Success Criteria

Migration is successful when:

- ✅ All old transaction data appears in new `transactions` table
- ✅ Transaction counts match (old totals = new total)
- ✅ Wallet balances are unchanged
- ✅ Withdrawal requests are all present
- ✅ New payment flows work (PawaPay, XentriPay)
- ✅ Transaction history displays correctly in UI
- ✅ Admin dashboard shows accurate statistics
- ✅ No errors in application logs
- ✅ Webhook callbacks process correctly

---

## 🎉 Post-Migration

### Cleanup (After 30 Days)

Once you've verified everything works for 30 days:

1. Archive backup files
2. Update any documentation referencing old schema
3. Remove any commented-out code for old transaction models
4. Celebrate successful migration! 🎊

### Monitoring

- Monitor transaction creation for first 7 days
- Watch for any errors in payment processing
- Compare transaction volumes to pre-migration
- Check user-reported issues related to payments

---

## 🔐 Security Notes

- Backup files contain sensitive transaction data
- Store backups securely (encrypted if possible)
- Delete backups after retention period
- Audit who has access to backup files
- Don't commit backup files to git

---

## Summary

This migration is designed to be **zero data loss**:

1. ✅ **Backup first** - All data backed up to JSON before any changes
2. ✅ **Schema push** - New schema applied to database
3. ✅ **Data restore** - All data restored from backups to new schema
4. ✅ **Verification** - Counts and data integrity verified
5. ✅ **Testing** - All flows tested to ensure functionality

**Your data is safe!** The migration script ensures every transaction, wallet operation, and withdrawal request is preserved.

---

**Ready to migrate? Start with Step 1!**

```bash
npx tsx prisma/migrations/pre-push-data-migration.ts
```
