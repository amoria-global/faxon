# 📋 Migration Checklist - Quick Reference

## ⚡ Quick Start (4 Steps to Zero Data Loss)

### ✅ Step 1: Backup Everything (BEFORE db push)
```bash
npx tsx prisma/migrations/pre-push-data-migration.ts
```
**Result:** All data backed up to `prisma/backups/pre-push-backup-YYYY-MM-DD/`

---

### ✅ Step 2: Push New Schema
```bash
npx prisma db push
```
**Result:** Database schema updated, old tables removed, new `transactions` table created

---

### ✅ Step 3: Restore Data
```bash
# Find your backup directory
ls prisma/backups/

# Run the migration SQL (replace YYYY-MM-DD-HH-MM-SS)
npx prisma db execute --file "prisma/backups/pre-push-backup-YYYY-MM-DD-HH-MM-SS/migration.sql" --schema prisma/schema.prisma
```
**Result:** All transaction data restored to new schema

---

### ✅ Step 4: Verify
```bash
npx prisma studio
```
**Check:**
- `transactions` table has all records
- `wallet_transactions` table unchanged
- `withdrawal_requests` table unchanged

---

## 📊 Verification Queries

### Quick Count Check
```sql
-- Total transactions in new table
SELECT COUNT(*) FROM transactions;

-- By provider
SELECT provider, COUNT(*) FROM transactions GROUP BY provider;

-- By status
SELECT status, COUNT(*) FROM transactions GROUP BY status;
```

### Expected Results
- Total count should equal: old escrow_transactions + old payment_transactions + old pawapay_transactions
- Providers should be: PAWAPAY, XENTRIPAY (Pesapal converted)
- Status distribution should match old data

---

## 🆘 If Something Goes Wrong

### Rollback Steps
1. Stop application
2. Drop transactions table: `DROP TABLE transactions CASCADE;`
3. Restore database from backup (full database backup)
4. Or revert schema: `git checkout HEAD~1 -- prisma/schema.prisma && npx prisma db push`

### Re-run Migration
If you need to try again:
1. Keep the backup files safe
2. Fix any issues in migration script
3. Re-run from Step 2 (db push)

---

## 📝 Pre-Migration Checklist

- [ ] Full database backup created
- [ ] Application downtime scheduled (15-30 min)
- [ ] Users notified of maintenance
- [ ] Background jobs stopped (payment processors, status pollers)
- [ ] Pre-push migration script run successfully
- [ ] Backup files verified (JSON files exist and contain data)
- [ ] Migration SQL file generated
- [ ] Team ready to test after migration

---

## 📝 Post-Migration Checklist

### Immediate (First Hour)
- [ ] Transaction counts verified
- [ ] Wallet balances unchanged
- [ ] Withdrawal requests all present
- [ ] No errors in application logs
- [ ] Application restarted successfully
- [ ] Prisma client regenerated: `npx prisma generate`

### Testing (First Day)
- [ ] Create new booking payment (PawaPay)
- [ ] Create new booking payment (XentriPay)
- [ ] View transaction history for multiple users
- [ ] Process a withdrawal request
- [ ] Check wallet operations (credit/debit)
- [ ] Verify webhook callbacks work
- [ ] Admin dashboard displays correctly
- [ ] Transaction statistics accurate

### Monitoring (First Week)
- [ ] Daily transaction counts match expected volume
- [ ] No payment processing errors
- [ ] Webhook success rate normal
- [ ] No user complaints about missing transactions
- [ ] Wallet balance calculations correct

---

## 🎯 Success Criteria

✅ Migration is complete when:
- All transaction data migrated (counts match)
- No data loss (verified via backups)
- New payments work (PawaPay + XentriPay)
- Old transaction history visible
- Wallet operations work
- Withdrawal requests work
- Admin dashboard accurate
- No errors for 7 days

---

## 📞 Need Help?

Read these docs:
- [ZERO_DATA_LOSS_MIGRATION_GUIDE.md](ZERO_DATA_LOSS_MIGRATION_GUIDE.md) - Full detailed guide
- [MIGRATION_SUMMARY.md](MIGRATION_SUMMARY.md) - What changed
- [SCHEMA_CLEANUP_SUMMARY.md](SCHEMA_CLEANUP_SUMMARY.md) - Schema details

---

## 🔧 Common Issues

### Issue: "Table already exists" error in Step 2
**Fix:** Old schema already pushed. Skip to Step 3.

### Issue: "Reference already exists" in Step 3
**Fix:** Some data already migrated. SQL uses ON CONFLICT DO NOTHING, safe to continue.

### Issue: Transaction counts don't match
**Fix:** Check backup JSON files, some records might be duplicates or invalid.

### Issue: Prisma client errors after migration
**Fix:** Regenerate client: `npx prisma generate && npm run dev`

---

## 💾 Backup Locations

- **JSON Backups:** `prisma/backups/pre-push-backup-YYYY-MM-DD/`
- **Migration SQL:** `prisma/backups/pre-push-backup-YYYY-MM-DD/migration.sql`
- **Instructions:** `prisma/backups/pre-push-backup-YYYY-MM-DD/INSTRUCTIONS.md`

Keep backups for at least 30 days after successful migration.

---

## 🚀 Ready to Go?

```bash
# Step 1: Backup
npx tsx prisma/migrations/pre-push-data-migration.ts

# Review backups
ls prisma/backups/

# Step 2: Push schema
npx prisma db push

# Step 3: Restore data (replace with your backup timestamp)
npx prisma db execute --file "prisma/backups/pre-push-backup-YYYY-MM-DD-HH-MM-SS/migration.sql" --schema prisma/schema.prisma

# Step 4: Verify
npx prisma studio

# Step 5: Regenerate client
npx prisma generate

# Done! 🎉
```

**Total time: 15-30 minutes**

---

**Your data is safe! Every transaction is backed up before any changes are made.** ✅
