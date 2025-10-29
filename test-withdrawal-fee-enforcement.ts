/**
 * Test Script: Withdrawal Fee Enforcement
 *
 * This script tests the comprehensive withdrawal fee enforcement system
 * to ensure users NEVER receive withdrawals without proper fee deduction.
 */

import { PrismaClient } from '@prisma/client';
import { calculateWithdrawalFee, shouldDoubleFee, validateWithdrawalWithFee } from './src/utils/withdrawal-fee.utility';

const prisma = new PrismaClient();

async function testFeeCalculation() {
  console.log('\n=== TEST 1: Fee Calculation ===\n');

  const testCases = [
    { amount: 100, method: 'MOBILE', currency: 'USD' },
    { amount: 100, method: 'BANK', currency: 'USD' },
    { amount: 1000, method: 'MOBILE', currency: 'USD' },
    { amount: 4000, method: 'MOBILE', currency: 'USD' },
    { amount: 0.40, method: 'MOBILE', currency: 'USD' }, // Should fail
  ];

  for (const testCase of testCases) {
    const isDoubleFee = shouldDoubleFee(testCase.method);
    const feeCalc = calculateWithdrawalFee(testCase.amount, testCase.currency, isDoubleFee);

    console.log(`Amount: $${testCase.amount}, Method: ${testCase.method}`);
    console.log(`  Fee: $${feeCalc.feeAmount.toFixed(2)} (${feeCalc.feeTier})`);
    console.log(`  Net: $${feeCalc.netAmount.toFixed(2)}`);
    console.log(`  Doubled: ${isDoubleFee ? 'YES' : 'NO'}`);
    console.log(`  Valid: ${feeCalc.netAmount > 0 ? '✅' : '❌'}\n`);
  }
}

async function testWithdrawalRequestCreation() {
  console.log('\n=== TEST 2: Withdrawal Request Creation ===\n');

  try {
    // Find a test user with balance
    const user = await prisma.user.findFirst({
      where: {
        wallet: {
          balance: {
            gte: 100
          }
        }
      },
      include: {
        wallet: true
      }
    });

    if (!user || !user.wallet) {
      console.log('❌ No test user found with sufficient balance');
      console.log('💡 Create a test user with wallet balance >= $100 first\n');
      return;
    }

    console.log(`Found test user: ${user.email}`);
    console.log(`Wallet balance: $${user.wallet.balance.toFixed(2)}\n`);

    // Test withdrawal request with fee calculation
    const withdrawalAmount = 50;
    const method = 'MOBILE';

    const isDoubleFee = shouldDoubleFee(method);
    const feeCalc = calculateWithdrawalFee(withdrawalAmount, 'USD', isDoubleFee);

    console.log(`Creating test withdrawal request:`);
    console.log(`  Amount: $${withdrawalAmount}`);
    console.log(`  Fee: $${feeCalc.feeAmount.toFixed(2)}`);
    console.log(`  Net Amount: $${feeCalc.netAmount.toFixed(2)}`);
    console.log(`  Fee Tier: ${feeCalc.feeTier}\n`);

    // Validate
    const validation = validateWithdrawalWithFee(withdrawalAmount, 'USD', isDoubleFee);

    if (!validation.valid) {
      console.log(`❌ Validation failed: ${validation.error}\n`);
      return;
    }

    console.log('✅ Validation passed\n');

    // Create withdrawal request
    const reference = `TEST-WD-${Date.now()}-${user.id}`;

    const withdrawal = await prisma.withdrawalRequest.create({
      data: {
        userId: user.id,
        amount: withdrawalAmount,
        feeAmount: feeCalc.feeAmount,
        netAmount: feeCalc.netAmount,
        feeTier: feeCalc.feeTier,
        currency: 'USD',
        method: method,
        destination: JSON.stringify({
          holderName: `${user.firstName} ${user.lastName}`,
          accountNumber: user.phone || '250788000000',
          countryCode: 'RW',
          mobileProvider: 'MTN'
        }),
        reference,
        status: 'PENDING'
      }
    });

    console.log('✅ Withdrawal request created successfully!');
    console.log(`  ID: ${withdrawal.id}`);
    console.log(`  Reference: ${withdrawal.reference}`);
    console.log(`  Status: ${withdrawal.status}`);
    console.log(`  Amount: $${withdrawal.amount}`);
    console.log(`  Fee: $${withdrawal.feeAmount}`);
    console.log(`  Net: $${withdrawal.netAmount}\n`);

    // Verify database record
    const verifyWithdrawal = await prisma.withdrawalRequest.findUnique({
      where: { id: withdrawal.id }
    });

    if (verifyWithdrawal &&
        verifyWithdrawal.feeAmount === feeCalc.feeAmount &&
        verifyWithdrawal.netAmount === feeCalc.netAmount &&
        verifyWithdrawal.feeTier === feeCalc.feeTier) {
      console.log('✅ Database verification PASSED - All fee fields stored correctly!\n');
    } else {
      console.log('❌ Database verification FAILED - Fee fields mismatch!\n');
    }

    // Clean up test data
    console.log('Cleaning up test withdrawal request...');
    await prisma.withdrawalRequest.delete({
      where: { id: withdrawal.id }
    });
    console.log('✅ Test data cleaned up\n');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testExistingWithdrawals() {
  console.log('\n=== TEST 3: Existing Withdrawal Requests ===\n');

  try {
    // Check for withdrawals without fee data (legacy requests)
    const withdrawalsWithoutFees = await prisma.withdrawalRequest.count({
      where: {
        OR: [
          { feeAmount: 0 },
          { netAmount: null },
          { feeTier: null }
        ]
      }
    });

    console.log(`Withdrawals without fee data: ${withdrawalsWithoutFees}`);

    if (withdrawalsWithoutFees > 0) {
      console.log('⚠️  Some withdrawal requests are missing fee data');
      console.log('💡 These will use legacy fallback calculation during admin approval\n');
    } else {
      console.log('✅ All withdrawal requests have proper fee data!\n');
    }

    // Check recent withdrawals
    const recentWithdrawals = await prisma.withdrawalRequest.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        reference: true,
        amount: true,
        feeAmount: true,
        netAmount: true,
        feeTier: true,
        status: true,
        createdAt: true
      }
    });

    if (recentWithdrawals.length > 0) {
      console.log('Recent withdrawal requests:\n');
      recentWithdrawals.forEach((w, i) => {
        console.log(`${i + 1}. ${w.reference}`);
        console.log(`   Amount: $${w.amount.toFixed(2)}`);
        console.log(`   Fee: $${w.feeAmount.toFixed(2)}`);
        console.log(`   Net: ${w.netAmount ? '$' + w.netAmount.toFixed(2) : 'N/A'}`);
        console.log(`   Tier: ${w.feeTier || 'N/A'}`);
        console.log(`   Status: ${w.status}`);
        console.log(`   Created: ${w.createdAt.toISOString()}\n`);
      });
    } else {
      console.log('No withdrawal requests found in database\n');
    }

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
  }
}

async function testFeeValidation() {
  console.log('\n=== TEST 4: Fee Validation ===\n');

  const testCases = [
    { amount: 100, method: 'MOBILE', shouldPass: true },
    { amount: 0.40, method: 'MOBILE', shouldPass: false }, // Too small
    { amount: 0.46, method: 'MOBILE', shouldPass: false }, // Exactly fee amount
    { amount: 0.50, method: 'MOBILE', shouldPass: true }, // Slightly above fee
    { amount: 1000, method: 'BANK', shouldPass: true }, // Large amount with doubled fee
  ];

  for (const testCase of testCases) {
    const isDoubleFee = shouldDoubleFee(testCase.method);
    const validation = validateWithdrawalWithFee(testCase.amount, 'USD', isDoubleFee);

    console.log(`Amount: $${testCase.amount}, Method: ${testCase.method}`);
    console.log(`  Valid: ${validation.valid ? '✅' : '❌'}`);

    if (validation.valid && validation.calculation) {
      console.log(`  Net Amount: $${validation.calculation.netAmount.toFixed(2)}`);
    } else if (!validation.valid) {
      console.log(`  Error: ${validation.error}`);
    }

    const result = validation.valid === testCase.shouldPass ? '✅ PASS' : '❌ FAIL';
    console.log(`  Expected: ${testCase.shouldPass ? 'VALID' : 'INVALID'} → ${result}\n`);
  }
}

async function testFeeConsistency() {
  console.log('\n=== TEST 5: Fee Consistency Check ===\n');

  // Test that fee calculation is consistent
  const amount = 100;
  const method = 'MOBILE';

  console.log('Testing fee calculation consistency (5 calculations):\n');

  const calculations = [];
  for (let i = 0; i < 5; i++) {
    const isDoubleFee = shouldDoubleFee(method);
    const feeCalc = calculateWithdrawalFee(amount, 'USD', isDoubleFee);
    calculations.push(feeCalc);

    console.log(`Calculation ${i + 1}:`);
    console.log(`  Fee: $${feeCalc.feeAmount.toFixed(4)}`);
    console.log(`  Net: $${feeCalc.netAmount.toFixed(4)}`);
  }

  // Check consistency
  const firstCalc = calculations[0];
  const allMatch = calculations.every(calc =>
    calc.feeAmount === firstCalc.feeAmount &&
    calc.netAmount === firstCalc.netAmount &&
    calc.feeTier === firstCalc.feeTier
  );

  if (allMatch) {
    console.log('\n✅ All calculations are consistent!\n');
  } else {
    console.log('\n❌ Calculations are inconsistent!\n');
  }
}

async function runAllTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║  Withdrawal Fee Enforcement - Comprehensive Test Suite  ║');
  console.log('╚════════════════════════════════════════════════════════╝');

  try {
    await testFeeCalculation();
    await testFeeValidation();
    await testFeeConsistency();
    await testExistingWithdrawals();
    await testWithdrawalRequestCreation();

    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║               All Tests Completed!                      ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

  } catch (error: any) {
    console.error('Test suite failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run tests
runAllTests();
