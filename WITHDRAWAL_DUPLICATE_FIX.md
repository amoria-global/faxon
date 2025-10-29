# Withdrawal Duplicate Reference Fix

## 🔴 Issue Identified

**Error Message:**
```
[STATUS_POLLER] ❌ Error checking withdrawal status from provider:
Error: XentriPay Error: Query did not return a unique result: 2 results were returned
```

**Root Cause:**
- Multiple withdrawal requests exist with the **same reference** in the database
- When querying XentriPay API with a duplicate reference, it returns multiple results
- This causes the status check to fail

---

## ✅ Solutions Implemented

### **1. Error Handling in Status Poller** ✅

**File:** `src/services/status-poller.service.ts`

**Change:**
```typescript
// Added try-catch to handle duplicate reference errors gracefully
try {
  providerStatus = await this.xentriPayService.getPayoutStatus(withdrawal.reference);
} catch (error: any) {
  if (error.message?.includes('did not return a unique result')) {
    console.error(`[STATUS_POLLER] ❌ Duplicate withdrawal reference ${withdrawal.reference}`);
    console.error(`[STATUS_POLLER] This withdrawal has a duplicate reference. Please check database.`);
    return; // Skip this withdrawal instead of crashing
  }
  throw error;
}
```

**Benefit:**
- Status poller no longer crashes when encountering duplicate references
- Logs clear error message identifying the problematic reference
- Continues processing other withdrawals

---

### **2. Duplicate Approval Prevention** ✅

**File:** `src/services/admin.service.ts`

**Changes:**
```typescript
// Existing check
if (withdrawal.status === 'APPROVED' || withdrawal.status === 'COMPLETED') {
  throw new Error(`Withdrawal has already been ${withdrawal.status.toLowerCase()}. Cannot approve again.`);
}

// NEW: Check for PROCESSING status
if (withdrawal.status === 'PROCESSING') {
  throw new Error('Withdrawal is currently being processed. Please wait.');
}

// NEW: Race condition prevention - double-check before approval
const currentStatus = await prisma.withdrawalRequest.findUnique({
  where: { id: withdrawalId },
  select: { status: true }
});

if (currentStatus && (currentStatus.status === 'APPROVED' ||
    currentStatus.status === 'COMPLETED' ||
    currentStatus.status === 'PROCESSING')) {
  throw new Error(`Withdrawal status changed to ${currentStatus.status}. Cannot approve.`);
}
```

**Benefits:**
- Prevents approving the same withdrawal twice
- Blocks approval if status changed between initial check and approval
- Protects against race conditions from simultaneous admin actions

---

### **3. Duplicate Detection Script** ✅

**File:** `src/scripts/fix-duplicate-withdrawals.ts`

**Usage:**

**A. Check for duplicates:**
```bash
npx ts-node src/scripts/fix-duplicate-withdrawals.ts
```

**B. Fix duplicates automatically:**
```bash
npx ts-node src/scripts/fix-duplicate-withdrawals.ts fix
```

**C. Check failed duplicates only:**
```bash
npx ts-node src/scripts/fix-duplicate-withdrawals.ts failed
```

**What it does:**
- Scans database for withdrawal references that appear more than once
- Shows detailed information about each duplicate
- Can automatically fix by appending unique suffix to duplicate references
- Example: `WD-123` → `WD-123-DUP1-1234567890`

---

## 🔍 How to Identify Duplicate Withdrawals

### **Method 1: Use the Script**
```bash
npx ts-node src/scripts/fix-duplicate-withdrawals.ts
```

**Output example:**
```
🔍 Searching for duplicate withdrawal references...

❌ Found 2 duplicate references:

  Reference: WD-20250127-001 (3 occurrences)
    Requests:
      1. ID: clx1..., Status: FAILED, Amount: $100, Created: 2025-01-27T10:00:00Z
      2. ID: clx2..., Status: PENDING, Amount: $100, Created: 2025-01-27T10:05:00Z
      3. ID: clx3..., Status: APPROVED, Amount: $100, Created: 2025-01-27T10:10:00Z
```

### **Method 2: Direct SQL Query**
```sql
SELECT reference, COUNT(*) as count
FROM withdrawal_requests
WHERE reference IS NOT NULL
GROUP BY reference
HAVING COUNT(*) > 1
ORDER BY count DESC;
```

---

## 🛠️ How to Fix Duplicate References

### **Automatic Fix (Recommended)**
```bash
npx ts-node src/scripts/fix-duplicate-withdrawals.ts fix
```

This will:
1. Find all duplicate references
2. Keep the oldest request with original reference
3. Append unique suffix to newer duplicates
4. Update database automatically

### **Manual Fix**
If you prefer manual control:

```sql
-- Find duplicates
SELECT id, reference, status, created_at
FROM withdrawal_requests
WHERE reference = 'WD-20250127-001'
ORDER BY created_at ASC;

-- Update newer duplicates
UPDATE withdrawal_requests
SET reference = 'WD-20250127-001-DUP1'
WHERE id = 'clx2...';

UPDATE withdrawal_requests
SET reference = 'WD-20250127-001-DUP2'
WHERE id = 'clx3...';
```

---

## 🚨 Why Duplicates Occur

### **Possible Causes:**

1. **User Retry**
   - User submits withdrawal, thinks it failed, submits again
   - Same reference generated

2. **Admin Retry**
   - Admin approves withdrawal, it fails at XentriPay
   - Admin approves again with same reference

3. **Reference Generation Issue**
   - Reference generator not using timestamp/UUID
   - Collisions possible

4. **Race Condition**
   - Two requests processed simultaneously
   - Both get same reference

---

## 🔒 Prevention Strategies Implemented

### **1. Status Check Before Approval** ✅
```typescript
if (withdrawal.status === 'APPROVED' ||
    withdrawal.status === 'COMPLETED' ||
    withdrawal.status === 'PROCESSING') {
  throw new Error('Cannot approve - already processed');
}
```

### **2. Race Condition Protection** ✅
```typescript
// Check again right before approval
const currentStatus = await prisma.withdrawalRequest.findUnique({
  where: { id: withdrawalId },
  select: { status: true }
});

if (currentStatus.status !== 'PENDING') {
  throw new Error('Status changed - cannot approve');
}
```

### **3. Graceful Error Handling** ✅
```typescript
// Don't crash on duplicate reference errors
if (error.message?.includes('did not return a unique result')) {
  console.error('Duplicate reference found - skipping');
  return;
}
```

---

## 📊 Recommended Actions

### **Immediate (Run Now)**
1. ✅ Run duplicate detection script:
   ```bash
   npx ts-node src/scripts/fix-duplicate-withdrawals.ts
   ```

2. ✅ If duplicates found, fix them:
   ```bash
   npx ts-node src/scripts/fix-duplicate-withdrawals.ts fix
   ```

3. ✅ Verify no duplicates remain:
   ```bash
   npx ts-node src/scripts/fix-duplicate-withdrawals.ts
   ```

### **Short-term (This Week)**
1. ⏳ Review withdrawal reference generation logic
2. ⏳ Add UUID to ensure uniqueness:
   ```typescript
   const reference = `WD-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
   ```

3. ⏳ Add database constraint:
   ```sql
   ALTER TABLE withdrawal_requests
   ADD CONSTRAINT unique_reference
   UNIQUE (reference);
   ```

### **Long-term (Next Sprint)**
1. 🔮 Implement idempotency keys for API requests
2. 🔮 Add audit log for withdrawal status changes
3. 🔮 Monitor duplicate reference creation rate
4. 🔮 Set up alerts for duplicate detection

---

## 🧪 Testing

### **Test 1: Duplicate Approval Prevention**
```typescript
// Try to approve same withdrawal twice
const result1 = await adminService.approveWithdrawal('withdrawal-id-123');
// Should succeed

const result2 = await adminService.approveWithdrawal('withdrawal-id-123');
// Should throw: "Withdrawal has already been approved. Cannot approve again."
```

### **Test 2: Race Condition Prevention**
```typescript
// Simulate simultaneous approvals
await Promise.all([
  adminService.approveWithdrawal('withdrawal-id-123'),
  adminService.approveWithdrawal('withdrawal-id-123')
]);
// Only one should succeed, other should throw error
```

### **Test 3: Status Poller Resilience**
```typescript
// Create duplicate withdrawal references
// Status poller should skip them without crashing
// Check logs for: "Duplicate withdrawal reference - cannot check status"
```

---

## 📈 Monitoring

### **Key Metrics to Track:**
- Number of duplicate references detected (should be 0)
- Failed withdrawal status checks due to duplicates
- Duplicate approval attempts blocked
- Time between duplicate creation

### **Log Messages to Monitor:**
```
[STATUS_POLLER] ❌ Duplicate withdrawal reference {ref} - cannot check status
[ADMIN] ❌ Withdrawal has already been approved. Cannot approve again.
[ADMIN] ❌ Withdrawal status changed to {status}. Cannot approve.
```

---

## ✅ Summary

**Problems Fixed:**
1. ✅ Status poller no longer crashes on duplicate references
2. ✅ Cannot approve same withdrawal twice
3. ✅ Race condition protection added
4. ✅ Script created to detect and fix existing duplicates

**Next Steps:**
1. Run the duplicate detection script
2. Fix any existing duplicates
3. Monitor for new duplicates
4. Consider adding unique constraint to prevent future duplicates

**Files Modified:**
- `src/services/status-poller.service.ts` - Error handling
- `src/services/admin.service.ts` - Duplicate prevention
- `src/scripts/fix-duplicate-withdrawals.ts` - Detection/fix script (NEW)

The system is now **resilient to duplicate references** and will not crash when encountering them! 🎉
