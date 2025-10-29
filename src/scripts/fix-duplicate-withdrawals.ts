/**
 * Script to identify and fix duplicate withdrawal references
 * Run this to clean up any duplicate withdrawal requests that may cause XentriPay query errors
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findDuplicateWithdrawalReferences() {
  console.log('🔍 Searching for duplicate withdrawal references...\n');

  // Find withdrawal references that appear more than once
  const duplicates = await prisma.$queryRaw<Array<{ reference: string; count: bigint }>>`
    SELECT reference, COUNT(*) as count
    FROM withdrawal_requests
    WHERE reference IS NOT NULL
    GROUP BY reference
    HAVING COUNT(*) > 1
    ORDER BY count DESC
  `;

  if (duplicates.length === 0) {
    console.log('✅ No duplicate withdrawal references found!\n');
    return [];
  }

  console.log(`❌ Found ${duplicates.length} duplicate references:\n`);

  for (const dup of duplicates) {
    const count = Number(dup.count);
    console.log(`  Reference: ${dup.reference} (${count} occurrences)`);

    // Get details of each duplicate
    const requests = await prisma.withdrawalRequest.findMany({
      where: { reference: dup.reference },
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        createdAt: true,
        approvedAt: true
      },
      orderBy: { createdAt: 'asc' }
    });

    console.log(`    Requests:`);
    requests.forEach((req, idx) => {
      console.log(`      ${idx + 1}. ID: ${req.id}, Status: ${req.status}, Amount: $${req.amount}, Created: ${req.createdAt.toISOString()}`);
    });
    console.log('');
  }

  return duplicates;
}

async function fixDuplicateReferences() {
  console.log('🔧 Fixing duplicate withdrawal references...\n');

  const duplicates = await prisma.$queryRaw<Array<{ reference: string; count: bigint }>>`
    SELECT reference, COUNT(*) as count
    FROM withdrawal_requests
    WHERE reference IS NOT NULL
    GROUP BY reference
    HAVING COUNT(*) > 1
  `;

  if (duplicates.length === 0) {
    console.log('✅ No duplicates to fix!\n');
    return;
  }

  let fixedCount = 0;

  for (const dup of duplicates) {
    const requests = await prisma.withdrawalRequest.findMany({
      where: { reference: dup.reference },
      orderBy: { createdAt: 'asc' }
    });

    // Keep the first one (oldest), update the rest
    for (let i = 1; i < requests.length; i++) {
      const req = requests[i];
      const newReference = `${req.reference}-DUP${i}-${Date.now()}`;

      console.log(`  Updating ${req.id}: ${req.reference} → ${newReference}`);

      await prisma.withdrawalRequest.update({
        where: { id: req.id },
        data: { reference: newReference }
      });

      fixedCount++;
    }
  }

  console.log(`\n✅ Fixed ${fixedCount} duplicate references!\n`);
}

async function identifyFailedDuplicates() {
  console.log('🔍 Identifying failed withdrawals with duplicate references...\n');

  const duplicates = await prisma.$queryRaw<Array<{ reference: string; count: bigint }>>`
    SELECT reference, COUNT(*) as count
    FROM withdrawal_requests
    WHERE reference IS NOT NULL
    AND status IN ('FAILED', 'REJECTED')
    GROUP BY reference
    HAVING COUNT(*) > 1
  `;

  if (duplicates.length === 0) {
    console.log('✅ No failed duplicate references found!\n');
    return;
  }

  console.log(`Found ${duplicates.length} failed duplicate references:\n`);

  for (const dup of duplicates) {
    const requests = await prisma.withdrawalRequest.findMany({
      where: {
        reference: dup.reference,
        status: { in: ['FAILED', 'REJECTED'] }
      },
      select: {
        id: true,
        userId: true,
        amount: true,
        status: true,
        failureReason: true,
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    console.log(`  Reference: ${dup.reference}`);
    requests.forEach((req, idx) => {
      console.log(`    ${idx + 1}. ID: ${req.id}, Status: ${req.status}, Reason: ${req.failureReason || 'N/A'}`);
    });
    console.log('');
  }
}

async function main() {
  console.log('==========================================');
  console.log('  WITHDRAWAL DUPLICATE REFERENCE CHECKER');
  console.log('==========================================\n');

  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'fix') {
    await fixDuplicateReferences();
  } else if (command === 'failed') {
    await identifyFailedDuplicates();
  } else {
    // Default: just find and display
    await findDuplicateWithdrawalReferences();
    console.log('\nℹ️  To fix duplicates, run: npx ts-node src/scripts/fix-duplicate-withdrawals.ts fix');
    console.log('ℹ️  To see failed duplicates, run: npx ts-node src/scripts/fix-duplicate-withdrawals.ts failed\n');
  }

  await prisma.$disconnect();
}

main()
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
