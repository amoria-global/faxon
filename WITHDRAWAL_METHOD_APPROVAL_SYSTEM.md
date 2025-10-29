# Withdrawal Method Approval System

## Overview

The Withdrawal Method Approval System ensures that all user-submitted withdrawal methods (bank accounts and mobile money accounts) are reviewed and approved by administrators before they can be used for withdrawals. This adds an additional security layer to prevent fraud and ensure account details are valid.

## Features

### 1. User Workflow
- Users can add withdrawal methods (Bank or Mobile Money)
- Withdrawal methods are created with `isApproved: false` status
- Users are notified their method is pending approval
- Users receive email notifications when their method is approved or rejected
- Only approved methods can be used for actual withdrawals

### 2. Admin Workflow
- Admins receive email notifications when users submit new withdrawal methods
- Email includes complete user and account information for verification
- Admins can review pending withdrawal methods through the admin panel
- Admins can approve or reject withdrawal methods with reasons
- All actions are logged with admin ID and timestamp

### 3. Email Notifications

#### Admin Notification (New Withdrawal Method)
**Sent to:** Admin email (configured via `ADMIN_EMAIL` env variable)

**Triggered when:** User submits a new withdrawal method

**Contains:**
- User information (ID, name, email)
- Withdrawal method details (type, provider, account number, etc.)
- Direct link to review the method in admin panel
- Verification checklist

#### User Approval Notification
**Sent to:** User's registered email

**Triggered when:** Admin approves a withdrawal method

**Contains:**
- Approved method details (masked account number for security)
- Confirmation that the method can now be used for withdrawals
- Link to wallet/withdrawal page

#### User Rejection Notification
**Sent to:** User's registered email

**Triggered when:** Admin rejects a withdrawal method

**Contains:**
- Rejected method details
- Specific reason for rejection from admin
- Instructions on how to correct and resubmit
- Link to add a new withdrawal method

## Database Schema

### WithdrawalMethod Table

```prisma
model WithdrawalMethod {
  id                 String              @id @default(cuid())
  userId             Int
  methodType         String              // "BANK" or "MOBILE_MONEY"
  accountName        String
  accountDetails     Json                // Provider details, account number, etc.
  isDefault          Boolean             @default(false)
  isVerified         Boolean             @default(false)
  isApproved         Boolean             @default(false)  // ⭐ Approval flag
  approvedBy         Int?                // Admin user ID who approved
  approvedAt         DateTime?           // Approval timestamp
  rejectedBy         Int?                // Admin user ID who rejected
  rejectedAt         DateTime?           // Rejection timestamp
  rejectionReason    String?             // Reason for rejection
  verificationStatus String              @default("pending")
  createdAt          DateTime            @default(now())
  updatedAt          DateTime            @updatedAt
  user               User                @relation(fields: [userId], references: [id])
  withdrawalRequests WithdrawalRequest[]
}
```

## API Endpoints

### User Endpoints

#### 1. Add Withdrawal Method
```http
POST /api/transactions/withdrawal-methods
```

**Request Body:**
```json
{
  "userId": 123,
  "methodType": "MOBILE_MONEY",
  "accountName": "John Doe",
  "accountDetails": {
    "providerCode": "MOMO_MTN_RW",
    "accountNumber": "0788123456",
    "providerName": "MTN Mobile Money",
    "country": "RWA",
    "currency": "RWF"
  },
  "isDefault": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "MTN Mobile Money withdrawal method added successfully (pending approval)",
  "data": {
    "id": "clxxx123",
    "userId": 123,
    "methodType": "MOBILE_MONEY",
    "accountName": "John Doe",
    "isApproved": false,
    "verificationStatus": "pending",
    "createdAt": "2025-10-29T10:00:00Z"
  }
}
```

**Email Actions:**
- ✅ Admin receives notification email with withdrawal method details

#### 2. Get User's Withdrawal Methods
```http
GET /api/transactions/withdrawal-methods/:userId
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "clxxx123",
      "methodType": "MOBILE_MONEY",
      "accountName": "John Doe",
      "isApproved": true,
      "isVerified": true,
      "verificationStatus": "verified",
      "approvedAt": "2025-10-29T11:00:00Z",
      "accountDetails": { ... }
    }
  ]
}
```

### Admin Endpoints

#### 1. Get All Pending Withdrawal Methods
```http
GET /api/transactions/withdrawal-methods/pending/all
```

**Query Parameters:**
- `limit` (default: 50)
- `offset` (default: 0)

**Response:**
```json
{
  "success": true,
  "count": 10,
  "total": 25,
  "data": [
    {
      "id": "clxxx123",
      "userId": 123,
      "methodType": "MOBILE_MONEY",
      "accountName": "John Doe",
      "isApproved": false,
      "verificationStatus": "pending",
      "createdAt": "2025-10-29T10:00:00Z",
      "user": {
        "id": 123,
        "email": "john@example.com",
        "firstName": "John",
        "lastName": "Doe"
      }
    }
  ],
  "pagination": {
    "limit": 50,
    "offset": 0,
    "hasMore": false
  }
}
```

#### 2. Approve Withdrawal Method
```http
POST /api/transactions/withdrawal-methods/:id/approve
```

**Request Body:**
```json
{
  "adminId": 1
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal method approved successfully for John Doe",
  "data": {
    "id": "clxxx123",
    "isApproved": true,
    "isVerified": true,
    "verificationStatus": "verified",
    "approvedBy": 1,
    "approvedAt": "2025-10-29T11:00:00Z"
  }
}
```

**Email Actions:**
- ✅ User receives approval notification email

#### 3. Reject Withdrawal Method
```http
POST /api/transactions/withdrawal-methods/:id/reject
```

**Request Body:**
```json
{
  "adminId": 1,
  "reason": "Account number format is invalid. Please provide a valid MTN Rwanda mobile number."
}
```

**Response:**
```json
{
  "success": true,
  "message": "Withdrawal method rejected for John Doe",
  "data": {
    "id": "clxxx123",
    "isApproved": false,
    "isVerified": false,
    "verificationStatus": "rejected",
    "rejectedBy": 1,
    "rejectedAt": "2025-10-29T11:00:00Z",
    "rejectionReason": "Account number format is invalid..."
  }
}
```

**Email Actions:**
- ✅ User receives rejection notification email with reason

## Implementation Details

### Email Service

**File:** `src/utils/brevo.withdrawal-method.ts`

**Class:** `BrevoWithdrawalMethodService`

**Methods:**
- `sendAdminNotificationForNewMethod(data)` - Sends notification to admin
- `sendUserApprovalNotification(data)` - Sends approval email to user
- `sendUserRejectionNotification(data)` - Sends rejection email to user

### Controller Updates

**File:** `src/controllers/unified-transaction.controller.ts`

**Updated Methods:**

1. **`addWithdrawalMethod`**
   - Creates withdrawal method with `isApproved: false`
   - Sends admin notification email
   - Returns success response to user

2. **`approveWithdrawalMethod`**
   - Updates method to approved status
   - Records admin ID and timestamp
   - Sends approval email to user

3. **`rejectWithdrawalMethod`**
   - Updates method to rejected status
   - Records rejection reason and admin ID
   - Sends rejection email to user with reason

## Environment Variables

Add the following to your `.env` file:

```env
# Admin Email for Withdrawal Method Notifications
ADMIN_EMAIL=admin@jambolush.com

# Email Service (Brevo)
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_EMAIL=noreply@jambolush.com

# Company Information (used in emails)
COMPANY_NAME=Jambolush
COMPANY_WEBSITE=https://jambolush.com
COMPANY_SUPPORT_EMAIL=support@jambolush.com
COMPANY_LOGO=https://jambolush.com/favicon.ico
```

## Security Considerations

### 1. Approval Required
- No withdrawal can be processed using an unapproved method
- The withdrawal endpoint checks `isApproved` flag before processing
- Users cannot bypass approval by manipulating requests

### 2. Admin Verification Checklist
Email to admins includes a checklist:
- ✅ Verify account details match user identity
- ✅ Ensure account number format is valid
- ✅ Check for suspicious activity or duplicate submissions
- ✅ Approve or reject with appropriate reason

### 3. Masked Account Information
- User approval/rejection emails show masked account numbers
- Only last 4 digits are visible for security
- Full details are only visible to admins

### 4. Audit Trail
All approval/rejection actions are logged with:
- Admin user ID
- Timestamp
- Reason (for rejections)
- This creates a complete audit trail

## Testing

### Test Scenario 1: User Adds Withdrawal Method

1. **Action:** User submits a new MTN Mobile Money withdrawal method
2. **Expected:**
   - Method created with `isApproved: false`
   - Admin receives email notification
   - User sees "pending approval" status

### Test Scenario 2: Admin Approves Method

1. **Action:** Admin approves the withdrawal method
2. **Expected:**
   - Method updated with `isApproved: true`
   - User receives approval email
   - User can now use this method for withdrawals

### Test Scenario 3: Admin Rejects Method

1. **Action:** Admin rejects the withdrawal method with reason
2. **Expected:**
   - Method updated with `verificationStatus: rejected`
   - User receives rejection email with reason
   - User can submit a corrected method

### Test Scenario 4: Withdrawal with Unapproved Method

1. **Action:** User tries to withdraw using unapproved method
2. **Expected:**
   - Withdrawal request is rejected
   - Error message: "Withdrawal method is not yet approved by admin"

## Email Templates Preview

### Admin Notification Email

**Subject:** 🔔 New Withdrawal Method Requires Approval - John Doe

**Key Sections:**
- User Information Card (ID, name, email)
- Withdrawal Method Details Card (type, provider, account number, country)
- Required Actions Checklist
- "Review & Approve" button linking to admin panel

### User Approval Email

**Subject:** ✅ Withdrawal Method Approved - MTN Mobile Money

**Key Sections:**
- Success alert
- Approved method details (with masked account number)
- "What's Next" instructions
- "Go to Wallet" button

### User Rejection Email

**Subject:** ❌ Withdrawal Method Rejected - MTN Mobile Money

**Key Sections:**
- Rejection alert
- Rejected method details
- Reason for rejection (highlighted)
- "What Can You Do" instructions
- "Add New Method" button

## Integration with Withdrawal Flow

When a user initiates a withdrawal:

```typescript
// In withdrawal.routes.ts - verify-and-withdraw endpoint
if (withdrawalMethodId) {
  const savedMethod = await prisma.withdrawalMethod.findUnique({
    where: { id: withdrawalMethodId }
  });

  // ⚠️ CRITICAL CHECK
  if (!savedMethod.isApproved) {
    return res.status(400).json({
      success: false,
      message: 'Withdrawal method is not yet approved by admin. Please wait for approval or use a different method.'
    });
  }

  // ... proceed with withdrawal
}
```

## Benefits

1. **Fraud Prevention** - All withdrawal destinations verified by admin
2. **Account Validation** - Ensures account numbers are in correct format
3. **User Trust** - Users know their funds will go to verified accounts
4. **Compliance** - Meets regulatory requirements for financial verification
5. **Audit Trail** - Complete record of all approvals/rejections
6. **Communication** - Automated emails keep all parties informed

## Future Enhancements

Potential improvements for future versions:

1. **Automatic Verification** - API integration to verify account ownership
2. **Document Upload** - Users can upload proof of account ownership
3. **Bulk Approval** - Admin can approve multiple methods at once
4. **Verification Tiers** - Different verification levels based on withdrawal amount
5. **SMS Notifications** - In addition to email, send SMS to users
6. **Admin Dashboard** - Web interface for managing withdrawal methods
7. **Re-verification** - Periodic re-verification of old withdrawal methods

## Troubleshooting

### Issue: Admin not receiving emails

**Solution:**
- Check `ADMIN_EMAIL` environment variable is set correctly
- Verify Brevo API key is valid and has sending permissions
- Check email service logs for errors

### Issue: User not receiving approval/rejection emails

**Solution:**
- Verify user's email in database is correct
- Check Brevo sender email is verified
- Review email service error logs

### Issue: Emails going to spam

**Solution:**
- Verify Brevo sender domain is authenticated (SPF, DKIM)
- Ensure sender email matches verified domain
- Add unsubscribe link if required by email provider

## Related Files

- `src/utils/brevo.withdrawal-method.ts` - Email service
- `src/controllers/unified-transaction.controller.ts` - API endpoints
- `src/routes/unified-transaction.routes.ts` - Route definitions
- `prisma/schema.prisma` - Database schema
- `src/routes/withdrawal.routes.ts` - Withdrawal processing

## Support

For issues or questions, contact:
- Technical Support: support@jambolush.com
- Developer: [Your contact info]

---

**Last Updated:** 2025-10-29
**Version:** 1.0.0
