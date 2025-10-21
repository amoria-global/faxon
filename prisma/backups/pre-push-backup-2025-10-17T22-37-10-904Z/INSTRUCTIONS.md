
# PRE-PUSH DATA MIGRATION INSTRUCTIONS

Generated: 2025-10-17T22:37:29.270Z

## Backup Location
d:\amoria\faxon\prisma\backups\pre-push-backup-2025-10-17T22-37-10-904Z

## Files Created
- escrow_transactions.json
- escrow_notifications.json
- payment_transactions.json
- pawapay_transactions.json
- wallet_transactions.json
- withdrawal_requests.json
- migration.sql

## Data Summary
- Escrow Transactions: 83
- Payment Transactions: 0
- PawaPay Transactions: 52
- Wallet Transactions: 0
- Withdrawal Requests: 0
- Total Records Backed Up: 135

## Migration Steps

### Step 1: ✅ COMPLETED - Data Backed Up
All existing data has been backed up to JSON files.

### Step 2: Run Prisma DB Push
Now you can safely run:
```bash
npx prisma db push
```

This will:
- Create the new unified 'transactions' table
- Remove old escrow_transactions table (if exists)
- Remove old pesapal-related tables (if exists)
- Keep wallet_transactions and withdrawal_requests tables

### Step 3: Import Data to New Schema
After db push completes, run the migration SQL:
```bash
npx prisma db execute --file "d:\amoria\faxon\prisma\backups\pre-push-backup-2025-10-17T22-37-10-904Z\migration.sql" --schema prisma/schema.prisma
```

Or manually connect to your database and run the SQL file.

### Step 4: Verify Migration
```bash
npx prisma studio
```

Check the 'transactions' table to verify all data was migrated correctly.

### Step 5: Run Count Verification
```sql
-- Count transactions by provider
SELECT provider, COUNT(*) FROM transactions GROUP BY provider;

-- Count transactions by type
SELECT transaction_type, COUNT(*) FROM transactions GROUP BY transaction_type;

-- Total count
SELECT COUNT(*) FROM transactions;
```

Expected total: ~135

## Rollback Plan

If something goes wrong:

1. Restore database from backup (before db push)
2. Or use the JSON backup files to restore data
3. Contact support with error details

## Errors (if any)
None

## Next Steps After Migration

1. Test all payment flows
2. Test withdrawal requests
3. Test wallet operations
4. Verify transaction history displays correctly
5. Check admin dashboard statistics

## Support
For issues, check:
- docs/PAYMENT_SCHEMA_MIGRATION.md
- prisma/migrations/README_UNIFIED_TRANSACTIONS.md
- MIGRATION_SUMMARY.md

