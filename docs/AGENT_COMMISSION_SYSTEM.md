# Agent Commission and Owner Management System

## Overview

This document describes the comprehensive agent commission, owner management, and payment tracking system implemented in the Faxon platform.

## Key Features

### 1. Agent Property Management
- **Agents can upload properties on behalf of owners**
- **Agent can never be the property owner**
- **Clear relationship tracking**: Property has separate `hostId`, `ownerId`, and `agentId`
- **Commission tracking**: Agents earn commission on every booking

### 2. Owner Account Creation
- **Automatic owner account creation** when agent uploads a property
- **Email notification** sent to new owners with temporary password
- **Owner must complete verification** before property is displayed:
  - Email verification
  - KYC completion (status: 'approved')
  - Wallet setup (active wallet required)
  - Account activation (status: 'active')

### 3. Property Visibility Rules
Properties are **hidden from public view** if:
- Owner has no wallet information
- Owner hasn't completed KYC
- Owner's account is not active
- Property is not verified

Agents can see **all properties they upload** regardless of status.

### 4. Commission System
- **Automatic commission calculation** when booking is paid
- **Default commission rate**: 10% (configurable per property)
- **Commission statuses**:
  - `pending`: Payment received, waiting for check-in
  - `earned`: Check-in validated by host
  - `paid`: Commission paid to agent

### 5. Host Payment System
- **Payment tracking** with platform fee deduction
- **Check-in validation required** before money release
- **Payment statuses**:
  - `pending`: Payment received, waiting for check-in
  - `approved`: Check-in validated, ready for payout
  - `paid`: Paid to host

### 6. Check-in/Check-out Validation
- **Host validates check-in** to trigger payment release
- **Optional check-in/check-out codes** for security
- **Automatic status updates** when validation occurs

## Database Schema

### New Fields in Property Model
```prisma
model Property {
  hostId          Int              // The host managing the property
  ownerId         Int?             // Actual property owner (can differ from hostId)
  agentId         Int?             // Agent who uploaded the property
  commissionRate  Float?  @default(0.10)  // Agent commission rate
  // ... relations
  owner           User?   @relation("OwnedProperties")
  agent           User?   @relation("AgentProperties")
  agentCommissions AgentCommission[]
}
```

### New Fields in Booking Model
```prisma
model Booking {
  checkInValidated     Boolean   @default(false)
  checkInValidatedAt   DateTime?
  checkInValidatedBy   Int?
  checkOutValidated    Boolean   @default(false)
  checkOutValidatedAt  DateTime?
  checkOutValidatedBy  Int?
  checkInCode          String?
  checkOutCode         String?
  agentCommissions     AgentCommission[]
  hostPayments         HostPayment[]
}
```

### New Models

#### AgentCommission
```prisma
model AgentCommission {
  id              String
  agentId         Int
  propertyId      Int
  bookingId       String
  amount          Float
  commissionRate  Float
  status          String  // pending, earned, paid, cancelled
  earnedAt        DateTime?
  paidAt          DateTime?
  payoutMethod    String?
  transactionId   String?
  notes           String?
}
```

#### HostPayment
```prisma
model HostPayment {
  id                    String
  hostId                Int
  bookingId             String
  amount                Float
  platformFee           Float
  netAmount             Float
  currency              String  @default("USD")
  status                String  // pending, approved, paid, cancelled
  checkInRequired       Boolean @default(true)
  checkInValidated      Boolean @default(false)
  checkInValidatedAt    DateTime?
  approvedAt            DateTime?
  paidAt                DateTime?
}
```

## API Endpoints

### Agent Endpoints

#### 1. Create Property (Agent)
```
POST /api/agent/properties
Authorization: Bearer <agent_token>

Body:
{
  "name": "Beautiful Villa",
  "location": {...},
  "type": "villa",
  "category": "entire_place",
  "pricePerNight": 150,
  "beds": 3,
  "baths": 2,
  "maxGuests": 6,
  "features": ["wifi", "pool"],
  "images": {...},
  "availabilityDates": {
    "start": "2024-01-01",
    "end": "2024-12-31"
  },
  "ownerDetails": {
    "names": "John Doe",
    "email": "owner@example.com",
    "phone": "+1234567890",
    "address": "123 Main St, City, Country"
  }
}

Response:
{
  "success": true,
  "message": "Property created successfully. Owner has been notified.",
  "data": { property object }
}
```

#### 2. Get Agent Properties
```
GET /api/agent/properties?page=1&limit=20
Authorization: Bearer <agent_token>

Response:
{
  "success": true,
  "data": {
    "properties": [
      {
        ...property data,
        "ownerVerificationStatus": {
          "hasWallet": true,
          "hasCompletedKyc": true,
          "isAccountActive": true,
          "isReadyForDisplay": true
        },
        "totalCommissionEarned": 1500,
        "totalBookings": 10
      }
    ],
    "total": 50,
    "page": 1,
    "limit": 20,
    "totalPages": 3
  }
}
```

#### 3. Get Pending Commissions
```
GET /api/agent/commissions/pending
Authorization: Bearer <agent_token>

Response:
{
  "success": true,
  "data": {
    "commissions": [
      {
        "id": "comm_123",
        "amount": 150,
        "status": "earned",
        "property": {
          "name": "Beautiful Villa",
          "location": "Bali"
        },
        "booking": {
          "checkIn": "2024-06-01",
          "checkOut": "2024-06-05",
          "guest": {
            "firstName": "Jane",
            "lastName": "Smith"
          }
        }
      }
    ],
    "summary": {
      "totalPending": 300,
      "totalEarned": 1200,
      "totalCount": 15
    }
  }
}
```

### Host Endpoints

#### 4. Get Pending Payments
```
GET /api/host/payments/pending
Authorization: Bearer <host_token>

Response:
{
  "success": true,
  "data": {
    "payments": [
      {
        "id": "pay_456",
        "netAmount": 1350,
        "status": "pending",
        "checkInValidated": false,
        "booking": {
          "checkIn": "2024-06-01",
          "property": {
            "name": "Beautiful Villa"
          },
          "guest": {
            "firstName": "Jane",
            "lastName": "Smith"
          }
        }
      }
    ],
    "summary": {
      "totalPendingCheckIn": 2700,
      "totalApproved": 4500,
      "totalCount": 10,
      "pendingCheckInCount": 5,
      "approvedCount": 5
    }
  }
}
```

#### 5. Validate Check-in
```
POST /api/host/bookings/:bookingId/validate-checkin
Authorization: Bearer <host_token>

Body (optional):
{
  "checkInCode": "ABC123"
}

Response:
{
  "success": true,
  "message": "Check-in validated successfully. Payments are now approved for release."
}
```

#### 6. Validate Check-out
```
POST /api/host/bookings/:bookingId/validate-checkout
Authorization: Bearer <host_token>

Body (optional):
{
  "checkOutCode": "XYZ789"
}

Response:
{
  "success": true,
  "message": "Check-out validated successfully. Booking is now completed."
}
```

### Payment Processing Endpoint

#### 7. Process Booking Payment (Webhook)
```
POST /api/bookings/:bookingId/process-payment

Response:
{
  "success": true,
  "message": "Payment processed successfully. Commission and host payment records created."
}
```

## Workflow

### Property Upload by Agent

1. **Agent uploads property** with owner details
2. **System checks if owner exists** by email
   - If exists: Links property to existing owner
   - If new: Creates owner account with temporary password
3. **Owner receives email** with login credentials
4. **Property status = 'pending'** and **not displayed** on platform
5. **Agent can see property** in their dashboard with owner verification status

### Owner Verification Process

1. Owner logs in with temporary password
2. Owner completes:
   - Email verification
   - KYC submission and approval
   - Wallet setup
   - Account activation
3. Once all complete, property becomes visible on platform

### Booking and Payment Flow

1. **Guest books property** and pays
2. **System creates**:
   - `AgentCommission` record (status: 'pending')
   - `HostPayment` record (status: 'pending')
3. **On check-in date**:
   - Host validates check-in
   - `AgentCommission` status → 'earned'
   - `HostPayment` status → 'approved'
   - Money release process starts
4. **On check-out date**:
   - Host validates check-out
   - Booking status → 'completed'

## Payment Breakdown Example

**Booking Total: $1,500**

- **Agent Commission (10%)**: $150
- **Platform Fee (5%)**: $75
- **Host Net Payment**: $1,275

## Services

### OwnerAccountService
- `createOrGetOwner()`: Create or retrieve owner account
- `sendOwnerWelcomeEmail()`: Send welcome email with credentials
- `isOwnerReadyForDisplay()`: Check if owner completed all requirements
- `getOwnerVerificationStatus()`: Get detailed verification status

### AgentCommissionService
- `createPropertyByAgent()`: Create property with owner management
- `getAgentProperties()`: Get all agent-managed properties
- `calculateAndCreateCommission()`: Calculate and record commission
- `createHostPayment()`: Create host payment record
- `validateCheckIn()`: Validate guest check-in
- `validateCheckOut()`: Validate guest check-out
- `getAgentPendingCommissions()`: Get agent's pending earnings
- `getHostPendingPayments()`: Get host's pending payments
- `shouldDisplayProperty()`: Check if property should be visible

## Security Considerations

1. **Agent Restrictions**:
   - Agent can never be the owner
   - Agent can only manage properties they uploaded
   - Agent sees all properties regardless of status

2. **Host Restrictions**:
   - Host can only validate check-in/check-out for their properties
   - Host can only see their own pending payments

3. **Payment Security**:
   - Payments held until check-in validation
   - Optional check-in/check-out codes for additional security
   - All payment records are auditable

## Migration

To apply the schema changes:

```bash
# The migration file is already created at:
# prisma/migrations/add_agent_commission_owner_tracking/migration.sql

# Apply the migration:
npx prisma migrate deploy

# Or for development:
npx prisma migrate dev
```

## Environment Variables

No new environment variables required. The system uses existing configuration.

## Testing

### Test Flow 1: Agent Creates Property

1. Login as agent
2. Create property with owner details
3. Verify owner receives email
4. Check property appears in agent dashboard
5. Verify property is not publicly visible
6. Login as owner and complete verification
7. Verify property becomes publicly visible

### Test Flow 2: Booking and Payment

1. Create booking for agent-managed property
2. Process payment via webhook
3. Verify commission and host payment records created
4. Login as host
5. Validate check-in
6. Verify commission status changes to 'earned'
7. Verify host payment status changes to 'approved'

## Future Enhancements

1. **Bulk operations** for agents managing multiple properties
2. **Commission tiers** based on performance
3. **Automated payout scheduling**
4. **Detailed analytics dashboard** for agents
5. **Owner portal** for direct property management
6. **Multi-currency support** for international transactions
7. **Commission dispute resolution** workflow

## Support

For questions or issues, contact the development team.
