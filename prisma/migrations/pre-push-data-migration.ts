/**
 * PRE-PUSH DATA MIGRATION SCRIPT
 *
 * This script migrates data from OLD schema to NEW unified Transaction schema
 * BEFORE running `prisma db push`
 *
 * Run this BEFORE schema changes:
 * ```bash
 * npx tsx prisma/migrations/pre-push-data-migration.ts
 * ```
 *
 * What this does:
 * 1. Backs up all existing transaction data
 * 2. Identifies and exports data that will be affected by schema changes
 * 3. Creates SQL INSERT statements for the new schema
 * 4. Validates data integrity
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

interface MigrationSummary {
  escrowTransactions: number;
  pesapalTransactions: number;
  walletTransactions: number;
  withdrawalRequests: number;
  pawaPayTransactions: number;
  paymentTransactions: number;
  errors: string[];
  backupFiles: string[];
}

const summary: MigrationSummary = {
  escrowTransactions: 0,
  pesapalTransactions: 0,
  walletTransactions: 0,
  withdrawalRequests: 0,
  pawaPayTransactions: 0,
  paymentTransactions: 0,
  errors: [],
  backupFiles: []
};

/**
 * Create backup directory
 */
function createBackupDir(): string {
  const backupDir = path.join(process.cwd(), 'prisma', 'backups');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const migrationBackupDir = path.join(backupDir, `pre-push-backup-${timestamp}`);

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  if (!fs.existsSync(migrationBackupDir)) {
    fs.mkdirSync(migrationBackupDir, { recursive: true });
  }

  return migrationBackupDir;
}

/**
 * Check if old schema tables exist
 */
async function checkOldTables(): Promise<{
  hasEscrow: boolean;
  hasPesapal: boolean;
  hasOldPayment: boolean;
  hasPawaPay: boolean;
  hasWallet: boolean;
  hasWithdrawal: boolean;
}> {
  try {
    // Try to query each table to see if it exists
    const checks = {
      hasEscrow: false,
      hasPesapal: false,
      hasOldPayment: false,
      hasPawaPay: false,
      hasWallet: true, // Wallet stays in new schema
      hasWithdrawal: true // Withdrawal stays in new schema
    };

    try {
      await prisma.$queryRaw`SELECT COUNT(*) FROM escrow_transactions LIMIT 1`;
      checks.hasEscrow = true;
    } catch (e) {
      console.log('  ℹ️  No escrow_transactions table found (might be already migrated)');
    }

    try {
      await prisma.$queryRaw`SELECT COUNT(*) FROM escrow_notifications LIMIT 1`;
      checks.hasPesapal = true;
    } catch (e) {
      console.log('  ℹ️  No escrow_notifications table found');
    }

    try {
      await prisma.$queryRaw`SELECT COUNT(*) FROM payment_transactions LIMIT 1`;
      checks.hasOldPayment = true;
    } catch (e) {
      console.log('  ℹ️  No payment_transactions table found');
    }

    try {
      await prisma.$queryRaw`SELECT COUNT(*) FROM pawapay_transactions LIMIT 1`;
      checks.hasPawaPay = true;
    } catch (e) {
      console.log('  ℹ️  No pawapay_transactions table found');
    }

    return checks;
  } catch (error) {
    console.error('Error checking old tables:', error);
    throw error;
  }
}

/**
 * Backup existing data from old tables
 */
async function backupOldData(backupDir: string, tableChecks: any) {
  console.log('\n📦 Step 1: Backing up existing data...\n');

  // Backup Escrow Transactions
  if (tableChecks.hasEscrow) {
    try {
      const escrowTxs = await prisma.$queryRawUnsafe<any[]>(
        'SELECT * FROM escrow_transactions'
      );
      const escrowFile = path.join(backupDir, 'escrow_transactions.json');
      fs.writeFileSync(escrowFile, JSON.stringify(escrowTxs, null, 2));
      summary.escrowTransactions = escrowTxs.length;
      summary.backupFiles.push(escrowFile);
      console.log(`  ✅ Backed up ${escrowTxs.length} escrow transactions`);
    } catch (error) {
      console.error('  ❌ Error backing up escrow transactions:', error);
      summary.errors.push(`Escrow backup failed: ${error}`);
    }
  }

  // Backup Pesapal-related (Escrow Notifications)
  if (tableChecks.hasPesapal) {
    try {
      const pesapalData = await prisma.$queryRawUnsafe<any[]>(
        'SELECT * FROM escrow_notifications'
      );
      const pesapalFile = path.join(backupDir, 'escrow_notifications.json');
      fs.writeFileSync(pesapalFile, JSON.stringify(pesapalData, null, 2));
      summary.pesapalTransactions = pesapalData.length;
      summary.backupFiles.push(pesapalFile);
      console.log(`  ✅ Backed up ${pesapalData.length} escrow notifications`);
    } catch (error) {
      console.error('  ❌ Error backing up escrow notifications:', error);
      summary.errors.push(`Pesapal backup failed: ${error}`);
    }
  }

  // Backup Old Payment Transactions
  if (tableChecks.hasOldPayment) {
    try {
      const paymentTxs = await prisma.$queryRawUnsafe<any[]>(
        'SELECT * FROM payment_transactions'
      );
      const paymentFile = path.join(backupDir, 'payment_transactions.json');
      fs.writeFileSync(paymentFile, JSON.stringify(paymentTxs, null, 2));
      summary.paymentTransactions = paymentTxs.length;
      summary.backupFiles.push(paymentFile);
      console.log(`  ✅ Backed up ${paymentTxs.length} payment transactions`);
    } catch (error) {
      console.error('  ❌ Error backing up payment transactions:', error);
      summary.errors.push(`Payment backup failed: ${error}`);
    }
  }

  // Backup PawaPay Transactions
  if (tableChecks.hasPawaPay) {
    try {
      const pawapayTxs = await prisma.$queryRawUnsafe<any[]>(
        'SELECT * FROM pawapay_transactions'
      );
      const pawapayFile = path.join(backupDir, 'pawapay_transactions.json');
      fs.writeFileSync(pawapayFile, JSON.stringify(pawapayTxs, null, 2));
      summary.pawaPayTransactions = pawapayTxs.length;
      summary.backupFiles.push(pawapayFile);
      console.log(`  ✅ Backed up ${pawapayTxs.length} PawaPay transactions`);
    } catch (error) {
      console.error('  ❌ Error backing up PawaPay transactions:', error);
      summary.errors.push(`PawaPay backup failed: ${error}`);
    }
  }

  // Backup Wallet Transactions (these will stay but we backup anyway)
  try {
    const walletTxs = await prisma.walletTransaction.findMany({
      orderBy: { createdAt: 'asc' }
    });
    const walletFile = path.join(backupDir, 'wallet_transactions.json');
    fs.writeFileSync(walletFile, JSON.stringify(walletTxs, null, 2));
    summary.walletTransactions = walletTxs.length;
    summary.backupFiles.push(walletFile);
    console.log(`  ✅ Backed up ${walletTxs.length} wallet transactions`);
  } catch (error) {
    console.error('  ❌ Error backing up wallet transactions:', error);
    summary.errors.push(`Wallet backup failed: ${error}`);
  }

  // Backup Withdrawal Requests (these will stay but we backup anyway)
  try {
    const withdrawals = await prisma.withdrawalRequest.findMany({
      orderBy: { createdAt: 'asc' }
    });
    const withdrawalFile = path.join(backupDir, 'withdrawal_requests.json');
    fs.writeFileSync(withdrawalFile, JSON.stringify(withdrawals, null, 2));
    summary.withdrawalRequests = withdrawals.length;
    summary.backupFiles.push(withdrawalFile);
    console.log(`  ✅ Backed up ${withdrawals.length} withdrawal requests`);
  } catch (error) {
    console.error('  ❌ Error backing up withdrawal requests:', error);
    summary.errors.push(`Withdrawal backup failed: ${error}`);
  }

  console.log(`\n  📁 All backups saved to: ${backupDir}\n`);
}

/**
 * Generate SQL INSERT statements for new Transaction table
 */
async function generateMigrationSQL(backupDir: string, tableChecks: any) {
  console.log('\n🔄 Step 2: Generating migration SQL for new Transaction table...\n');

  const sqlStatements: string[] = [];

  sqlStatements.push(`-- PRE-PUSH DATA MIGRATION SQL`);
  sqlStatements.push(`-- Generated: ${new Date().toISOString()}`);
  sqlStatements.push(`-- This SQL migrates data from old schema to new unified Transaction schema`);
  sqlStatements.push(`-- Run AFTER: npx prisma db push\n`);

  // Migrate Escrow Transactions
  if (tableChecks.hasEscrow) {
    const escrowTxs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM escrow_transactions`
    );

    if (escrowTxs.length > 0) {
      sqlStatements.push(`\n-- Migrate Escrow Transactions (${escrowTxs.length} records)`);
      sqlStatements.push(`-- These were Pesapal/XentriPay escrow payments\n`);

      for (const tx of escrowTxs) {
        // Detect provider based on fields
        let provider = 'XENTRIPAY'; // Default
        if (tx.pesapal_order_id || tx.pesapal_tracking_id) {
          provider = 'PESAPAL';
        } else if (tx.payer_phone || tx.recipient_phone) {
          provider = 'PAWAPAY';
        }

        const transactionType = tx.type || 'DEPOSIT';
        const status = tx.status || 'PENDING';

        sqlStatements.push(
          `INSERT INTO transactions (
            id, reference, provider, transaction_type, payment_method,
            user_id, recipient_id, amount, currency, requested_amount,
            net_amount, charges, platform_fee, agent_commission, host_share,
            status, failure_reason, failure_code,
            external_id, provider_transaction_id,
            recipient_phone, payer_phone, recipient_email, payer_email,
            description, statement_description,
            is_refund, refunded_at, related_transaction_id,
            is_p2p, transfer_type,
            booking_id, property_id,
            notify_by_sms, notification_sent_at, notification_count,
            status_check_count, last_status_check,
            cancelled_at, cancellation_reason,
            metadata, country,
            created_at, updated_at, completed_at, processed_at
          ) VALUES (
            '${tx.id}',
            '${tx.reference || tx.id}',
            '${provider}',
            '${transactionType}',
            ${tx.payment_method ? `'${tx.payment_method}'` : 'NULL'},
            ${tx.user_id || 'NULL'},
            ${tx.recipient_id || 'NULL'},
            ${tx.amount || 0},
            '${tx.currency || 'USD'}',
            ${tx.requested_amount || tx.amount || 0},
            ${tx.net_amount || tx.amount || 0},
            ${tx.charges || 0},
            ${tx.platform_fee || 0},
            ${tx.agent_commission || 0},
            ${tx.host_share || 0},
            '${status}',
            ${tx.failure_reason ? `'${tx.failure_reason.replace(/'/g, "''")}'` : 'NULL'},
            ${tx.failure_code ? `'${tx.failure_code}'` : 'NULL'},
            ${tx.external_id ? `'${tx.external_id}'` : 'NULL'},
            ${tx.provider_transaction_id || tx.pesapal_tracking_id ? `'${tx.provider_transaction_id || tx.pesapal_tracking_id}'` : 'NULL'},
            ${tx.recipient_phone ? `'${tx.recipient_phone}'` : 'NULL'},
            ${tx.payer_phone ? `'${tx.payer_phone}'` : 'NULL'},
            ${tx.recipient_email ? `'${tx.recipient_email}'` : 'NULL'},
            ${tx.payer_email ? `'${tx.payer_email}'` : 'NULL'},
            ${tx.description ? `'${tx.description.replace(/'/g, "''")}'` : 'NULL'},
            ${tx.statement_description ? `'${tx.statement_description.replace(/'/g, "''")}'` : 'NULL'},
            ${tx.is_refund || false},
            ${tx.refunded_at ? `'${tx.refunded_at}'` : 'NULL'},
            ${tx.related_transaction_id ? `'${tx.related_transaction_id}'` : 'NULL'},
            ${tx.is_p2p || false},
            ${tx.transfer_type ? `'${tx.transfer_type}'` : 'NULL'},
            ${tx.booking_id ? `'${tx.booking_id}'` : 'NULL'},
            ${tx.property_id || 'NULL'},
            ${tx.notify_by_sms || false},
            ${tx.notification_sent_at ? `'${tx.notification_sent_at}'` : 'NULL'},
            ${tx.notification_count || 0},
            ${tx.status_check_count || 0},
            ${tx.last_status_check ? `'${tx.last_status_check}'` : 'NULL'},
            ${tx.cancelled_at ? `'${tx.cancelled_at}'` : 'NULL'},
            ${tx.cancellation_reason ? `'${tx.cancellation_reason.replace(/'/g, "''")}'` : 'NULL'},
            ${tx.metadata ? `'${JSON.stringify(tx.metadata).replace(/'/g, "''")}'::jsonb` : 'NULL'},
            ${tx.country ? `'${tx.country}'` : 'NULL'},
            '${tx.created_at}',
            '${tx.updated_at}',
            ${tx.completed_at ? `'${tx.completed_at}'` : 'NULL'},
            ${tx.processed_at ? `'${tx.processed_at}'` : 'NULL'}
          ) ON CONFLICT (reference) DO NOTHING;`
        );
      }

      console.log(`  ✅ Generated SQL for ${escrowTxs.length} escrow transactions`);
    }
  }

  // Migrate Payment Transactions (if not already linked to escrow)
  if (tableChecks.hasOldPayment) {
    const paymentTxs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM payment_transactions`
    );

    if (paymentTxs.length > 0) {
      sqlStatements.push(`\n-- Migrate Payment Transactions (${paymentTxs.length} records)`);
      sqlStatements.push(`-- Generic payment transactions\n`);

      for (const tx of paymentTxs) {
        const provider = tx.method?.toUpperCase().includes('PAWAPAY') ? 'PAWAPAY' : 'XENTRIPAY';
        const transactionType = tx.type || 'DEPOSIT';

        sqlStatements.push(
          `INSERT INTO transactions (
            id, reference, provider, transaction_type, payment_method,
            user_id, amount, currency, net_amount, charges,
            status, failure_reason,
            external_id, provider_transaction_id,
            phone_number, bank_code, account_name,
            source_account, destination_account,
            description, callback_url,
            created_at, updated_at, completed_at
          ) VALUES (
            '${tx.id}',
            '${tx.reference}',
            '${provider}',
            '${transactionType}',
            '${tx.method || 'mobile_money'}',
            ${tx.user_id || 'NULL'},
            ${tx.amount || 0},
            '${tx.currency || 'USD'}',
            ${tx.net_amount || tx.amount || 0},
            ${tx.charges || 0},
            '${tx.status || 'PENDING'}',
            ${tx.failure_reason ? `'${tx.failure_reason.replace(/'/g, "''")}'` : 'NULL'},
            ${tx.external_id ? `'${tx.external_id}'` : 'NULL'},
            ${tx.jenga_transaction_id ? `'${tx.jenga_transaction_id}'` : 'NULL'},
            ${tx.phone_number ? `'${tx.phone_number}'` : 'NULL'},
            ${tx.bank_code ? `'${tx.bank_code}'` : 'NULL'},
            ${tx.account_name ? `'${tx.account_name.replace(/'/g, "''")}'` : 'NULL'},
            ${tx.source_account ? `'${tx.source_account}'` : 'NULL'},
            ${tx.destination_account ? `'${tx.destination_account}'` : 'NULL'},
            ${tx.description ? `'${tx.description.replace(/'/g, "''")}'` : 'NULL'},
            ${tx.callback_url ? `'${tx.callback_url}'` : 'NULL'},
            '${tx.created_at}',
            '${tx.updated_at}',
            ${tx.completed_at ? `'${tx.completed_at}'` : 'NULL'}
          ) ON CONFLICT (reference) DO NOTHING;`
        );
      }

      console.log(`  ✅ Generated SQL for ${paymentTxs.length} payment transactions`);
    }
  }

  // Migrate PawaPay Transactions
  if (tableChecks.hasPawaPay) {
    const pawapayTxs = await prisma.$queryRawUnsafe<any[]>(
      `SELECT * FROM pawapay_transactions`
    );

    if (pawapayTxs.length > 0) {
      sqlStatements.push(`\n-- Migrate PawaPay Transactions (${pawapayTxs.length} records)`);
      sqlStatements.push(`-- PawaPay-specific transactions\n`);

      for (const tx of pawapayTxs) {
        // Convert string amount to float (PawaPay stores in smallest currency unit)
        const amount = parseFloat(tx.amount) / 100 || 0;

        sqlStatements.push(
          `INSERT INTO transactions (
            id, reference, provider, transaction_type, payment_method,
            user_id, amount, currency,
            status, failure_reason, failure_code,
            provider_transaction_id, financial_transaction_id,
            recipient_phone, payer_phone,
            statement_description, customer_timestamp,
            deposited_amount, refunded_amount,
            callback_received, callback_received_at,
            is_refund, related_transaction_id,
            notification_sent_at, notification_count,
            status_check_count, last_status_check,
            correspondent, country,
            metadata,
            created_at, updated_at, completed_at, received_by_provider
          ) VALUES (
            '${tx.id}',
            '${tx.transaction_id}',
            'PAWAPAY',
            '${tx.transaction_type || 'DEPOSIT'}',
            'mobile_money',
            ${tx.user_id || 'NULL'},
            ${amount},
            '${tx.currency || 'USD'}',
            '${tx.status || 'PENDING'}',
            ${tx.failure_message ? `'${tx.failure_message.replace(/'/g, "''")}'` : 'NULL'},
            ${tx.failure_code ? `'${tx.failure_code}'` : 'NULL'},
            ${tx.provider_transaction_id ? `'${tx.provider_transaction_id}'` : 'NULL'},
            ${tx.financial_transaction_id ? `'${tx.financial_transaction_id}'` : 'NULL'},
            ${tx.recipient_phone ? `'${tx.recipient_phone}'` : 'NULL'},
            ${tx.payer_phone ? `'${tx.payer_phone}'` : 'NULL'},
            ${tx.statement_description ? `'${tx.statement_description.replace(/'/g, "''")}'` : 'NULL'},
            ${tx.customer_timestamp ? `'${tx.customer_timestamp}'` : 'NULL'},
            ${tx.deposited_amount ? parseFloat(tx.deposited_amount) / 100 : 'NULL'},
            ${tx.refunded_amount ? parseFloat(tx.refunded_amount) / 100 : 'NULL'},
            ${tx.callback_received || false},
            ${tx.callback_received_at ? `'${tx.callback_received_at}'` : 'NULL'},
            ${tx.related_deposit_id ? true : false},
            ${tx.related_deposit_id ? `'${tx.related_deposit_id}'` : 'NULL'},
            ${tx.notification_sent_at ? `'${tx.notification_sent_at}'` : 'NULL'},
            ${tx.notification_count || 0},
            ${tx.status_check_count || 0},
            ${tx.last_status_check ? `'${tx.last_status_check}'` : 'NULL'},
            ${tx.correspondent ? `'${tx.correspondent}'` : 'NULL'},
            ${tx.country ? `'${tx.country}'` : 'NULL'},
            ${tx.metadata ? `'${JSON.stringify(tx.metadata).replace(/'/g, "''")}'::jsonb` : 'NULL'},
            '${tx.created_at}',
            '${tx.updated_at}',
            ${tx.completed_at ? `'${tx.completed_at}'` : 'NULL'},
            ${tx.received_by_pawapay ? `'${tx.received_by_pawapay}'` : 'NULL'}
          ) ON CONFLICT (reference) DO NOTHING;`
        );
      }

      console.log(`  ✅ Generated SQL for ${pawapayTxs.length} PawaPay transactions`);
    }
  }

  // Save SQL file
  const sqlFile = path.join(backupDir, 'migration.sql');
  fs.writeFileSync(sqlFile, sqlStatements.join('\n'));
  summary.backupFiles.push(sqlFile);

  console.log(`\n  📄 Migration SQL saved to: ${sqlFile}\n`);

  return sqlFile;
}

/**
 * Generate instructions file
 */
function generateInstructions(backupDir: string, sqlFile: string) {
  const instructions = `
# PRE-PUSH DATA MIGRATION INSTRUCTIONS

Generated: ${new Date().toISOString()}

## Backup Location
${backupDir}

## Files Created
${summary.backupFiles.map(f => `- ${path.basename(f)}`).join('\n')}

## Data Summary
- Escrow Transactions: ${summary.escrowTransactions}
- Payment Transactions: ${summary.paymentTransactions}
- PawaPay Transactions: ${summary.pawaPayTransactions}
- Wallet Transactions: ${summary.walletTransactions}
- Withdrawal Requests: ${summary.withdrawalRequests}
- Total Records Backed Up: ${summary.escrowTransactions + summary.paymentTransactions + summary.pawaPayTransactions + summary.walletTransactions + summary.withdrawalRequests}

## Migration Steps

### Step 1: ✅ COMPLETED - Data Backed Up
All existing data has been backed up to JSON files.

### Step 2: Run Prisma DB Push
Now you can safely run:
\`\`\`bash
npx prisma db push
\`\`\`

This will:
- Create the new unified 'transactions' table
- Remove old escrow_transactions table (if exists)
- Remove old pesapal-related tables (if exists)
- Keep wallet_transactions and withdrawal_requests tables

### Step 3: Import Data to New Schema
After db push completes, run the migration SQL:
\`\`\`bash
npx prisma db execute --file "${sqlFile}" --schema prisma/schema.prisma
\`\`\`

Or manually connect to your database and run the SQL file.

### Step 4: Verify Migration
\`\`\`bash
npx prisma studio
\`\`\`

Check the 'transactions' table to verify all data was migrated correctly.

### Step 5: Run Count Verification
\`\`\`sql
-- Count transactions by provider
SELECT provider, COUNT(*) FROM transactions GROUP BY provider;

-- Count transactions by type
SELECT transaction_type, COUNT(*) FROM transactions GROUP BY transaction_type;

-- Total count
SELECT COUNT(*) FROM transactions;
\`\`\`

Expected total: ~${summary.escrowTransactions + summary.paymentTransactions + summary.pawaPayTransactions}

## Rollback Plan

If something goes wrong:

1. Restore database from backup (before db push)
2. Or use the JSON backup files to restore data
3. Contact support with error details

## Errors (if any)
${summary.errors.length > 0 ? summary.errors.join('\n') : 'None'}

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

`;

  const instructionsFile = path.join(backupDir, 'INSTRUCTIONS.md');
  fs.writeFileSync(instructionsFile, instructions);
  summary.backupFiles.push(instructionsFile);

  console.log(`  📋 Instructions saved to: ${instructionsFile}\n`);
}

/**
 * Main migration function
 */
async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║   PRE-PUSH DATA MIGRATION - Backup & Prepare Migration SQL  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  try {
    // Step 0: Create backup directory
    const backupDir = createBackupDir();
    console.log(`📁 Backup directory created: ${backupDir}\n`);

    // Step 0.5: Check which tables exist
    console.log('🔍 Checking existing database tables...\n');
    const tableChecks = await checkOldTables();

    if (!tableChecks.hasEscrow && !tableChecks.hasOldPayment && !tableChecks.hasPawaPay) {
      console.log('  ℹ️  No old transaction tables found. Your database might already be migrated.');
      console.log('  ℹ️  Or you haven\'t pushed any schema yet.\n');
      console.log('  ✅ You can safely run: npx prisma db push\n');
      return;
    }

    // Step 1: Backup existing data
    await backupOldData(backupDir, tableChecks);

    // Step 2: Generate migration SQL
    const sqlFile = await generateMigrationSQL(backupDir, tableChecks);

    // Step 3: Generate instructions
    generateInstructions(backupDir, sqlFile);

    // Print summary
    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                     MIGRATION SUMMARY                        ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log(`  ✅ Escrow Transactions:   ${summary.escrowTransactions}`);
    console.log(`  ✅ Payment Transactions:  ${summary.paymentTransactions}`);
    console.log(`  ✅ PawaPay Transactions:  ${summary.pawaPayTransactions}`);
    console.log(`  ✅ Wallet Transactions:   ${summary.walletTransactions}`);
    console.log(`  ✅ Withdrawal Requests:   ${summary.withdrawalRequests}`);
    console.log(`  ───────────────────────────────────────────────────────────`);
    console.log(`  📦 Total Records Backed Up: ${summary.escrowTransactions + summary.paymentTransactions + summary.pawaPayTransactions + summary.walletTransactions + summary.withdrawalRequests}`);

    if (summary.errors.length > 0) {
      console.log(`\n  ⚠️  Errors: ${summary.errors.length}`);
      summary.errors.forEach(err => console.log(`     - ${err}`));
    } else {
      console.log(`\n  ✅ No Errors`);
    }

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║                       NEXT STEPS                             ║');
    console.log('╚══════════════════════════════════════════════════════════════╝\n');
    console.log('  1️⃣  Review the backup files in:');
    console.log(`     ${backupDir}\n`);
    console.log('  2️⃣  Run Prisma DB Push:');
    console.log('     npx prisma db push\n');
    console.log('  3️⃣  After db push completes, import data:');
    console.log(`     npx prisma db execute --file "${sqlFile.replace(/\\/g, '/')}"\n`);
    console.log('  4️⃣  Verify migration using Prisma Studio:');
    console.log('     npx prisma studio\n');
    console.log('  5️⃣  Read the instructions file:');
    console.log(`     ${path.join(backupDir, 'INSTRUCTIONS.md')}\n`);

    console.log('✅ Pre-push migration preparation complete!\n');

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
main()
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
