# Faxon Backend - How It Works
## User-Friendly Data Flow Guide

> **Last Updated**: 2025-10-20
> **Purpose**: Understand how Faxon handles bookings, payments, and earnings

---

## Quick Start: What Does This System Do?

Faxon connects guests with properties and tours, processes payments automatically, splits money fairly, and keeps everyone informed. Think of it as the engine that powers the entire booking platform.

---

## Table of Contents
1. [Main User Journeys](#main-user-journeys)
2. [How Payments Work](#how-payments-work)
3. [How Money Gets Split](#how-money-gets-split)
4. [The Wallet System](#the-wallet-system)
5. [What Happens Automatically](#what-happens-automatically)
6. [Technical Details (For Developers)](#technical-details-for-developers)

---

## Main User Journeys

### 🏠 For Guests (Booking Properties/Tours)

**Your Journey:**
1. Browse properties or tours (no login needed)
2. Find something you like and select dates
3. Choose how to pay:
   - **Mobile Money** (MTN/Airtel) - instant on your phone
   - **Credit Card** - secure online payment
   - **Cash at Property** - pay when you arrive
4. Booking confirmed! You, the host, and agent all get emails

**Behind the Scenes:**
```
You click "Book"
    ↓
System checks if dates are available ✓
    ↓
Calculates total price ($100 for 2 nights)
    ↓
Creates your booking (status: pending)
    ↓
You pay via your chosen method
    ↓
Money automatically splits:
    • Host gets 80-90%
    • Agent gets 10% (if there's an agent)
    • Platform gets 10%
    ↓
Everyone receives confirmation emails
```

---

### 🏡 For Hosts (Listing Properties)

**Your Journey:**
1. Create a property listing (photos, price, location, amenities)
2. Submit for review (admins check quality and legitimacy)
3. Get approved - your property goes live!
4. Receive booking notifications automatically
5. Earn money in your wallet (80-90% of each booking)
6. Withdraw earnings to your bank or mobile money

**Behind the Scenes:**
```
You submit property
    ↓
Saved as "pending" in database
    ↓
Admin reviews and approves ✓
    ↓
Status changes to "active"
    ↓
Guests can now see and book it
    ↓
When someone books:
    • 80-90% → Your wallet
    • Email notification sent
    • You can withdraw anytime
```

---

### 💼 For Agents (Managing Properties)

**Your Journey:**
1. Host assigns you to manage their property (10% commission)
2. Get notified of all bookings for properties you manage
3. Earn 10% commission automatically in your wallet
4. Track all your earnings and properties

**Behind the Scenes:**
```
Host assigns you to property
    ↓
Commission rate set at 10%
    ↓
Guest books the property
    ↓
Payment splits automatically:
    • Host: 80%
    • You: 10% 💰
    • Platform: 10%
    ↓
Commission appears in your wallet
    ↓
You get email notification
```

---

### 🎒 For Tour Guides

**Your Journey:**
1. Create tours (title, description, price, schedule)
2. Set availability (dates, times, max participants)
3. Receive tour bookings
4. Earn money in your wallet
5. Withdraw earnings

**Behind the Scenes:**
```
You create tour → Stored in database
    ↓
Guests book tour slots
    ↓
Payment processed
    ↓
Money goes to your wallet
    ↓
You can withdraw to bank/mobile money
```

---

## How Payments Work

### 💳 Payment Options

#### 1. Mobile Money (via PawaPay)
```
Guest selects "Mobile Money"
    ↓
Enters phone number (250XXXXXXXXX)
    ↓
Selects provider (MTN/Airtel/SPENN)
    ↓
System converts: $100 USD → 130,500 RWF
    ↓
PawaPay sends payment prompt to phone
    ↓
Guest enters PIN on phone
    ↓
Payment completes within 30 seconds
    ↓
System detects completion and splits money
```

**Supported Providers:**
- 📱 MTN Mobile Money Rwanda
- 📱 Airtel Money Rwanda
- 📱 SPENN Rwanda

---

#### 2. Credit Card (via XentriPay)
```
Guest selects "Credit Card"
    ↓
System converts: $100 USD → 130,500 RWF
    ↓
Creates secure payment link
    ↓
Guest redirected to payment page
    ↓
Enters card details (Visa/Mastercard)
    ↓
XentriPay processes payment
    ↓
Callback received → Payment confirmed
    ↓
System splits money automatically
```

---

#### 3. Cash at Property
```
Guest selects "Pay at Property"
    ↓
Booking created (status: pending payment)
    ↓
Guest gets email: "Pay when you check in"
    ↓
Host gets email: "Collect payment at check-in"
    ↓
[Later] Guest checks in and pays
    ↓
Host marks payment as "collected" in system
    ↓
System splits money to wallets
```

---

### 💱 Currency Conversion

**How It Works:**
- You see prices in **USD** (user-friendly)
- Payment providers need **RWF** (local currency)
- System fetches live exchange rate from Hexarate API
- Adds small spread (0.5%) for deposits, subtracts for payouts
- Cached for 1 hour to keep things fast

**Example:**
```
Property costs: $100 USD
Exchange rate: 1 USD = 1,300 RWF
Deposit rate: 1,300 × 1.005 = 1,306.5 RWF
You pay: 130,650 RWF
```

---

## How Money Gets Split

### 💰 Payment Distribution Rules

#### Scenario 1: Property WITH Agent
```
Guest pays $100
    ↓
╔════════════════════════╗
║   Payment Split        ║
╠════════════════════════╣
║ Host:      $80 (80%)  ║
║ Agent:     $10 (10%)  ║
║ Platform:  $10 (10%)  ║
╚════════════════════════╝
    ↓
Money instantly appears in each wallet
```

#### Scenario 2: Property WITHOUT Agent
```
Guest pays $100
    ↓
╔════════════════════════╗
║   Payment Split        ║
╠════════════════════════╣
║ Host:      $90 (90%)  ║
║ Platform:  $10 (10%)  ║
╚════════════════════════╝
    ↓
Money instantly appears in each wallet
```

---

### 🔄 Automatic Distribution Process
```
Payment COMPLETED
    ↓
System fetches booking details
    ↓
Identifies: Host, Agent (if any), Property
    ↓
Calculates split percentages
    ↓
Updates each wallet balance (+USD amount)
    ↓
Creates transaction records
    ↓
Creates commission/earning records
    ↓
Marks booking as "walletDistributed"
    ↓
Sends earnings notifications via email
```

**⏱️ How Fast?** Distribution happens within **5 seconds** of payment confirmation!

---

## The Wallet System

### 💼 Your Digital Wallet

Think of your wallet as your Faxon bank account:

```
╔═══════════════════════════════╗
║      YOUR WALLET              ║
╠═══════════════════════════════╣
║ Available Balance:  $250.00   ║
║ Pending Balance:     $50.00   ║
║ Currency:            USD       ║
╚═══════════════════════════════╝
```

**What Each Balance Means:**
- **Available Balance**: Money you can withdraw right now
- **Pending Balance**: Money from bookings that haven't happened yet (after check-in, moves to available)

---

### 📊 Wallet Transaction Types

1. **DEPOSIT** - You added money to wallet
2. **COMMISSION** - You earned from a booking (agents)
3. **BOOKING_EARNINGS** - You earned from a booking (hosts)
4. **WITHDRAWAL** - You withdrew money
5. **REFUND** - Money returned from cancelled booking

**Transaction History Example:**
```
╔═══════════════════════════════════════════════════╗
║ Date       │ Type        │ Amount  │ Balance     ║
╠═══════════════════════════════════════════════════╣
║ 2025-10-20 │ COMMISSION  │ +$10.00 │ $260.00    ║
║ 2025-10-19 │ WITHDRAWAL  │ -$100.00│ $250.00    ║
║ 2025-10-18 │ EARNINGS    │ +$80.00 │ $350.00    ║
║ 2025-10-17 │ DEPOSIT     │ +$50.00 │ $270.00    ║
╚═══════════════════════════════════════════════════╝
```

---

### 💸 Withdrawing Your Money

**Step-by-Step:**
```
1. Add Withdrawal Method
    ↓
   Choose: Bank Account or Mobile Money
    ↓
   Enter account details
    ↓
   Status: Pending Admin Approval

2. Admin Reviews & Approves
    ↓
   Verifies account is legitimate
    ↓
   Status: Approved ✓

3. Request Withdrawal
    ↓
   Enter amount to withdraw
    ↓
   System checks: balance ≥ amount?
    ↓
   Creates withdrawal request

4. Admin Approves Payout
    ↓
   Reviews request
    ↓
   Approves payout

5. Money Sent
    ↓
   XentriPay processes transfer
    ↓
   Money arrives in your account
    ↓
   Wallet balance updated
    ↓
   Email confirmation sent
```

**⏱️ Processing Time:** Usually 1-3 business days

---

## What Happens Automatically

### 🤖 Behind-the-Scenes Automation

#### 1. Email Notifications (via Brevo)
```
Automatic Emails Sent:
├── Welcome email (new users)
├── Booking confirmations (guest, host, agent)
├── Payment receipts
├── Check-in reminders (24 hours before)
├── Earnings notifications
├── Withdrawal confirmations
├── Property approval/rejection
└── Password reset links
```

#### 2. Payment Status Checking
```
Status Poller Service runs every 30 seconds
    ↓
Checks all PENDING transactions
    ↓
Queries payment provider (PawaPay/XentriPay)
    ↓
If COMPLETED:
    • Updates transaction status
    • Triggers wallet distribution
    • Sends notifications
    ↓
If FAILED:
    • Updates status
    • Notifies user
    • Allows retry
```

**Why It Matters:** You don't have to manually refresh - the system catches payments instantly!

---

#### 3. Exchange Rate Updates
```
Every Hour:
    ↓
Fetch latest USD → RWF rate from Hexarate
    ↓
Cache rate for fast lookups
    ↓
Apply rate to all new transactions
```

---

#### 4. Availability Management
```
When booking is created:
    ↓
System blocks dates automatically
    ↓
Other guests can't book same dates
    ↓
If booking cancelled:
    • Dates unblocked
    • Calendar updated
    • Property available again
```

---

## Real-World Example: Complete Booking Flow

### 📖 Story: Sarah Books a Villa for 2 Nights

```
DAY 1 - BOOKING
═══════════════════════════════════════════════════════

10:00 AM - Sarah finds "Kigali Villa" ($50/night)
    ↓
10:05 AM - Selects dates: Oct 25-27 (2 nights)
    ↓
    System checks availability ✓
    Calculates: 2 nights × $50 = $100
    ↓
10:10 AM - Chooses payment: MTN Mobile Money
    ↓
    System converts: $100 → 130,500 RWF
    Creates booking (status: pending)
    Sends payment request to PawaPay
    ↓
10:11 AM - Sarah's phone buzzes with MTN prompt
    ↓
    Enters PIN: ****
    Payment successful!
    ↓
10:11 AM (15 seconds later) - System detects payment ✓
    ↓
    ╔═══════════════════════════════════╗
    ║     MONEY DISTRIBUTION            ║
    ╠═══════════════════════════════════╣
    ║ Host (John):      +$80 (80%)     ║
    ║ Agent (Mary):     +$10 (10%)     ║
    ║ Platform (Faxon): +$10 (10%)     ║
    ╚═══════════════════════════════════╝
    ↓
10:11 AM - Emails sent automatically:
    ✉️ Sarah: "Booking confirmed! #BK-12345"
    ✉️ John (Host): "New booking! You earned $80"
    ✉️ Mary (Agent): "Commission earned: $10"


DAY 2 - CHECK-IN REMINDER
═══════════════════════════════════════════════════════

Oct 24, 9:00 AM - 24 hours before check-in
    ↓
    System sends reminder emails:
    ✉️ Sarah: "Your check-in is tomorrow!"
    ✉️ John: "Guest arriving tomorrow - prepare property"


DAY 3 - CHECK-IN
═══════════════════════════════════════════════════════

Oct 25 - Sarah checks in
    Host balance: $80 moves from pending → available
    Sarah can now leave reviews


DAY 5 - CHECK-OUT & WITHDRAWAL
═══════════════════════════════════════════════════════

Oct 27 - Sarah checks out, leaves 5-star review

Oct 28 - John withdraws earnings
    ↓
    Requests $80 withdrawal to MTN Mobile Money
    ↓
    Admin approves within 2 hours
    ↓
    XentriPay processes payout
    ↓
    Money arrives in John's phone
    ↓
    ✉️ John: "Withdrawal successful: $80"
```

---

## Technical Details (For Developers)

### System Architecture

**Technology Stack:**
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Architecture**: RESTful API with Service-Oriented Architecture

### External Integrations

```
┌─────────────────────────────────────────┐
│         FAXON BACKEND API               │
├─────────────────────────────────────────┤
│                                         │
│  ┌─────────────────────────────────┐   │
│  │   Core Services                 │   │
│  ├─────────────────────────────────┤   │
│  │ • Auth & User Management        │   │
│  │ • Property Management           │   │
│  │ • Booking Management            │   │
│  │ • Payment Processing            │   │
│  │ • Wallet System                 │   │
│  │ • Commission Distribution       │   │
│  │ • Notification System           │   │
│  │ • Admin Operations              │   │
│  └─────────────────────────────────┘   │
│                                         │
└─────────────────────────────────────────┘
            ↕                ↕
    ┌───────────────┐   ┌───────────────┐
    │ Payment APIs  │   │ Other Services│
    ├───────────────┤   ├───────────────┤
    │ • PawaPay     │   │ • Brevo       │
    │ • XentriPay   │   │ • Hexarate    │
    │               │   │ • Google Auth │
    └───────────────┘   └───────────────┘
```

### Database Schema Summary

**Key Tables:**

```
Users & Authentication
├── User (profiles, credentials, KYC status)
├── UserSession (JWT tokens, login sessions)

Properties & Tours
├── Property (listings, pricing, features)
├── Tour (tour offerings, schedules)
├── TourBooking (tour reservations)

Bookings
├── Booking (property reservations, dates, status)
├── BlockedDate (unavailable dates)

Payments & Wallets
├── Transaction (all payment records)
├── Wallet (user balances in USD)
├── WalletTransaction (transaction history)

Commissions & Earnings
├── AgentCommission (agent earnings per booking)
├── OwnerEarning (host earnings per booking)

Withdrawals
├── WithdrawalMethod (bank/mobile money details)
├── WithdrawalRequest (payout requests)
```

---

### API Endpoints Overview

**Public Routes** (No login required):
- `GET /api/public/properties` - Browse properties
- `GET /api/public/tours` - Browse tours
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Login

**Authenticated Routes** (Login required):
- `POST /api/properties` - Create property
- `GET /api/bookings` - View bookings
- `POST /api/transactions/deposit` - Make payment
- `GET /api/wallets/balance` - Check wallet
- `POST /api/withdrawals` - Request withdrawal

**Admin Routes** (Admin only):
- `GET /api/admin/properties/pending` - Review properties
- `PATCH /api/admin/properties/:id/approve` - Approve property
- `GET /api/admin/users` - Manage users
- `PATCH /api/admin/withdrawals/:id/approve` - Approve payouts

---

### Security Features

1. **Password Security**
   - Hashed with bcrypt (10 rounds)
   - Never stored in plain text

2. **JWT Authentication**
   - Access token: 15 minutes (short-lived)
   - Refresh token: 7 days (stored securely)
   - Device/IP tracking

3. **KYC Verification**
   - Identity document upload
   - Admin review required
   - Required for withdrawals

4. **Payment Security**
   - All transactions logged
   - PCI-compliant payment providers
   - Transaction reference tracking
   - Failed payment alerts

---

### Performance Features

1. **Caching**
   - Exchange rates: 1 hour cache
   - Provider configs: 1 hour cache
   - Reduces API calls by 90%

2. **Database Optimization**
   - Indexed fields for fast queries
   - Efficient joins and relations
   - Transaction isolation levels

3. **Background Jobs**
   - Payment status polling (every 30s)
   - Email queue processing
   - Automatic wallet distribution

---

## System Overview (Original Technical Documentation)

**System Name**: Faxon Backend API
**Technology Stack**: Node.js + Express + TypeScript + Prisma + PostgreSQL
**Architecture**: RESTful API with Service-Oriented Architecture

### Core Business Functions
1. **User Management** - Authentication, authorization, profile management
2. **Property Management** - Listing, searching, booking properties
3. **Tour Management** - Tour guides, schedules, tour bookings
4. **Payment Processing** - Unified transaction system with multiple providers
5. **Wallet System** - Balance management, earnings, withdrawals
6. **Commission System** - Agent commissions, payment distributions
7. **Notification System** - Email & SMS notifications via Brevo
8. **Admin Operations** - User management, property approval, payment oversight

---

## External Entities

### 1. Users (Actors)
- **Guests** - Property/tour bookers
- **Property Owners/Hosts** - List and manage properties
- **Tour Guides** - Offer and manage tours
- **Agents** - Manage properties on behalf of owners
- **Admins** - Platform administrators

### 2. External Systems
- **PawaPay API** - Mobile money payments (MTN, Airtel, etc.)
- **XentriPay API** - Card payments and bank transfers
- **Brevo (Sendinblue)** - Email & SMS notifications
- **Hexarate API** - Currency exchange rates (USD ↔ RWF)
- **Google OAuth** - Authentication provider
- **PostgreSQL Database** - Primary data store

---

## Context Diagram (Level 0)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                     FAXON BACKEND SYSTEM                             │
│                                                                      │
│  Handles: Authentication, Bookings, Payments, Notifications,       │
│           Property/Tour Management, Wallet Operations               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
                           ▲         │
                           │         │
        ┌──────────────────┴─────────┴──────────────────┐
        │                                                │
        │                                                │
┌───────▼────────┐                              ┌───────▼────────┐
│                │                              │                │
│   USERS        │                              │  EXTERNAL      │
│   (Guests,     │                              │  SYSTEMS       │
│   Hosts,       │                              │  (Payment,     │
│   Agents,      │                              │   Email, SMS,  │
│   Admins)      │                              │   Exchange)    │
│                │                              │                │
└────────────────┘                              └────────────────┘
        │                                                │
        │       User requests, Data queries              │
        │                                                │
        └────────────────────┬───────────────────────────┘
                             │
                             │
                    ┌────────▼────────┐
                    │                 │
                    │   PostgreSQL    │
                    │   Database      │
                    │                 │
                    └─────────────────┘
```

---

## Level 1 DFD - Main Subsystems

```
                    ┌────────────────────────────────────────────┐
                    │         FAXON BACKEND SYSTEM               │
                    └────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│                                                                          │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │ 1.0          │    │ 2.0          │    │ 3.0          │              │
│  │ AUTH &       │───▶│ PROPERTY     │───▶│ BOOKING      │              │
│  │ USER MGMT    │    │ MANAGEMENT   │    │ MANAGEMENT   │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│        │                    │                    │                       │
│        │                    │                    │                       │
│        ▼                    ▼                    ▼                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │ 4.0          │    │ 5.0          │    │ 6.0          │              │
│  │ TOUR         │───▶│ PAYMENT      │───▶│ WALLET       │              │
│  │ MANAGEMENT   │    │ PROCESSING   │    │ SYSTEM       │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│        │                    │                    │                       │
│        │                    │                    │                       │
│        ▼                    ▼                    ▼                       │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐              │
│  │ 7.0          │    │ 8.0          │    │ 9.0          │              │
│  │ COMMISSION   │───▶│ NOTIFICATION │───▶│ ADMIN        │              │
│  │ SYSTEM       │    │ SYSTEM       │    │ OPERATIONS   │              │
│  └──────────────┘    └──────────────┘    └──────────────┘              │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                │
                                │
                                ▼
                    ┌──────────────────────┐
                    │  PostgreSQL Database │
                    │  - Users             │
                    │  - Properties        │
                    │  - Bookings          │
                    │  - Transactions      │
                    │  - Wallets           │
                    │  - Tours             │
                    │  - Commissions       │
                    └──────────────────────┘
```

---

## Level 2 DFD - Detailed Processes

### 1.0 Authentication & User Management

```
┌─────────────┐                           ┌─────────────┐
│   Users     │──── Register/Login ──────▶│   1.1       │
│             │                           │  Auth       │
└─────────────┘                           │  Service    │
                                          └──────┬──────┘
                                                 │
                      ┌──────────────────────────┼──────────────────────┐
                      │                          │                      │
                      ▼                          ▼                      ▼
              ┌──────────────┐          ┌──────────────┐      ┌──────────────┐
              │   1.1.1      │          │   1.1.2      │      │   1.1.3      │
              │  Validate    │          │  Hash/Verify │      │  Generate    │
              │  Credentials │          │  Password    │      │  JWT Tokens  │
              └──────┬───────┘          └──────┬───────┘      └──────┬───────┘
                     │                         │                     │
                     │                         │                     │
                     └─────────────────────────┴─────────────────────┘
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │  Users Table (DB)   │
                                    │  - id               │
                                    │  - email            │
                                    │  - password (hash)  │
                                    │  - userType         │
                                    │  - kycStatus        │
                                    └─────────────────────┘
```

**Sub-processes:**
- **1.1.1** - Validate user credentials
- **1.1.2** - Hash passwords (bcrypt), verify login
- **1.1.3** - Generate JWT access & refresh tokens
- **1.1.4** - OAuth authentication (Google)
- **1.1.5** - Session management
- **1.1.6** - Password reset (OTP via email/SMS)
- **1.1.7** - User profile updates
- **1.1.8** - KYC verification

---

### 2.0 Property Management

```
┌──────────────┐                          ┌──────────────┐
│ Property     │─── Create/Update ───────▶│   2.1        │
│ Owners/Hosts │    Property              │  Property    │
└──────────────┘                          │  Service     │
                                          └──────┬───────┘
                                                 │
                    ┌────────────────────────────┼──────────────────┐
                    │                            │                  │
                    ▼                            ▼                  ▼
            ┌──────────────┐            ┌──────────────┐   ┌──────────────┐
            │   2.1.1      │            │   2.1.2      │   │   2.1.3      │
            │  Validate    │            │  Store       │   │  Search &    │
            │  Property    │            │  Property    │   │  Filter      │
            │  Data        │            │  Data        │   │  Properties  │
            └──────┬───────┘            └──────┬───────┘   └──────┬───────┘
                   │                           │                  │
                   └───────────────────────────┴──────────────────┘
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │ Properties Table    │
                                    │ - id                │
                                    │ - hostId (owner)    │
                                    │ - agentId           │
                                    │ - name, location    │
                                    │ - pricePerNight     │
                                    │ - status            │
                                    │ - features, images  │
                                    └─────────────────────┘
```

**Sub-processes:**
- **2.1.1** - Validate property data (name, location, pricing, features)
- **2.1.2** - Store property with images and metadata
- **2.1.3** - Search properties with filters (location, price, type)
- **2.1.4** - Property approval workflow (admin)
- **2.1.5** - Property analytics and views
- **2.1.6** - Availability calendar management
- **2.1.7** - Pricing rules and dynamic pricing
- **2.1.8** - Agent assignment and commission rates

---

### 3.0 Booking Management

```
┌─────────────┐                           ┌──────────────┐
│   Guests    │──── Create Booking ──────▶│   3.1        │
│             │                           │  Booking     │
└─────────────┘                           │  Service     │
                                          └──────┬───────┘
                                                 │
                    ┌────────────────────────────┼───────────────────┐
                    │                            │                   │
                    ▼                            ▼                   ▼
            ┌──────────────┐            ┌──────────────┐    ┌──────────────┐
            │   3.1.1      │            │   3.1.2      │    │   3.1.3      │
            │  Check       │            │  Calculate   │    │  Create      │
            │  Availability│            │  Total Price │    │  Booking     │
            └──────┬───────┘            └──────┬───────┘    └──────┬───────┘
                   │                           │                   │
                   └───────────────────────────┴───────────────────┘
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │ Bookings Table      │
                                    │ - id                │
                                    │ - propertyId        │
                                    │ - guestId           │
                                    │ - checkIn/checkOut  │
                                    │ - totalPrice        │
                                    │ - status            │
                                    │ - paymentStatus     │
                                    └─────────────────────┘
```

**Sub-processes:**
- **3.1.1** - Check property availability and conflicts
- **3.1.2** - Calculate total price (nights, guests, pricing rules)
- **3.1.3** - Create booking record with pending status
- **3.1.4** - Block dates in availability calendar
- **3.1.5** - Send booking notifications (guest, host, agent)
- **3.1.6** - Handle booking cancellations
- **3.1.7** - Check-in/check-out validation
- **3.1.8** - Booking status updates

---

### 4.0 Tour Management

```
┌──────────────┐                          ┌──────────────┐
│ Tour Guides  │─── Create/Manage ───────▶│   4.1        │
│              │    Tours                 │  Tour        │
└──────────────┘                          │  Service     │
                                          └──────┬───────┘
                                                 │
                    ┌────────────────────────────┼──────────────┐
                    │                            │              │
                    ▼                            ▼              ▼
            ┌──────────────┐            ┌──────────────┐  ┌──────────────┐
            │   4.1.1      │            │   4.1.2      │  │   4.1.3      │
            │  Tour        │            │  Schedule    │  │  Tour        │
            │  Creation    │            │  Management  │  │  Booking     │
            └──────┬───────┘            └──────┬───────┘  └──────┬───────┘
                   │                           │                 │
                   └───────────────────────────┴─────────────────┘
                                               │
                                               ▼
                                    ┌─────────────────────┐
                                    │ Tours & TourBookings│
                                    │ - tourId            │
                                    │ - tourGuideId       │
                                    │ - schedules         │
                                    │ - bookings          │
                                    │ - participants      │
                                    └─────────────────────┘
```

**Sub-processes:**
- **4.1.1** - Create and manage tour offerings
- **4.1.2** - Schedule management (dates, times, availability)
- **4.1.3** - Tour booking processing
- **4.1.4** - Participant management
- **4.1.5** - Tour guide earnings tracking

---

### 5.0 Payment Processing (Unified Transaction System)

```
┌─────────────┐                           ┌──────────────┐
│   Payers    │──── Initiate Payment ────▶│   5.1        │
│  (Guests)   │                           │  Unified     │
└─────────────┘                           │  Transaction │
                                          │  Controller  │
                                          └──────┬───────┘
                                                 │
                ┌────────────────────────────────┼──────────────────────┐
                │                                │                      │
                ▼                                ▼                      ▼
        ┌──────────────┐              ┌──────────────┐        ┌──────────────┐
        │   5.1.1      │              │   5.1.2      │        │   5.1.3      │
        │  Mobile      │              │  Card        │        │  Property    │
        │  Money       │              │  Payment     │        │  Payment     │
        │  (PawaPay)   │              │  (XentriPay) │        │  (Cash)      │
        └──────┬───────┘              └──────┬───────┘        └──────┬───────┘
               │                             │                       │
               │                             │                       │
               ▼                             ▼                       ▼
        ┌──────────────┐              ┌──────────────┐        ┌──────────────┐
        │  PawaPay API │              │ XentriPay API│        │  Mark as     │
        │  - MTN       │              │  - Card      │        │  Pending     │
        │  - Airtel    │              │    Processing│        │  Collection  │
        └──────┬───────┘              └──────┬───────┘        └──────┬───────┘
               │                             │                       │
               └─────────────────────────────┴───────────────────────┘
                                             │
                                             ▼
                                  ┌─────────────────────────┐
                                  │ Transactions Table      │
                                  │ - reference             │
                                  │ - provider (PAWAPAY,    │
                                  │   XENTRIPAY, PROPERTY)  │
                                  │ - transactionType       │
                                  │ - paymentMethod         │
                                  │ - amount (RWF)          │
                                  │ - status                │
                                  │ - userId                │
                                  │ - bookingId             │
                                  └─────────────────────────┘
```

**Sub-processes:**
- **5.1.1** - Mobile money deposits via PawaPay (MTN, Airtel)
- **5.1.2** - Card payments via XentriPay
- **5.1.3** - Property/cash payments (collected at check-in)
- **5.1.4** - Currency conversion (USD ↔ RWF)
- **5.1.5** - Transaction status polling
- **5.1.6** - Payment callbacks/webhooks
- **5.1.7** - Refund processing
- **5.1.8** - Payment notifications

**Data Flow:**
```
User → Select Payment Method → Route to Provider
     ↓
[MOMO] → PawaPay API → Create Transaction → Poll Status → Update DB
[CARD] → XentriPay API → Redirect to Payment Page → Callback → Update DB
[PROPERTY] → Mark as Pending → Host Collects → Mark as Collected → Update DB
```

---

### 6.0 Wallet System

```
┌──────────────┐                          ┌──────────────┐
│ Users        │─── View/Manage ──────────▶│   6.1        │
│ (All types)  │    Wallet                │  Wallet      │
└──────────────┘                          │  Management  │
                                          └──────┬───────┘
                                                 │
                    ┌────────────────────────────┼──────────────────┐
                    │                            │                  │
                    ▼                            ▼                  ▼
            ┌──────────────┐            ┌──────────────┐   ┌──────────────┐
            │   6.1.1      │            │   6.1.2      │   │   6.1.3      │
            │  Deposit to  │            │  Process     │   │  Withdrawal  │
            │  Wallet      │            │  Earnings    │   │  Request     │
            └──────┬───────┘            └──────┬───────┘   └──────┬───────┘
                   │                           │                  │
                   └───────────────────────────┴──────────────────┘
                                               │
                                               ▼
                                    ┌─────────────────────────┐
                                    │ Wallets & Wallet        │
                                    │ Transactions            │
                                    │ - userId                │
                                    │ - balance               │
                                    │ - pendingBalance        │
                                    │ - currency (USD)        │
                                    │ - transaction history   │
                                    └─────────────────────────┘
```

**Sub-processes:**
- **6.1.1** - Deposit funds to wallet
- **6.1.2** - Automatic earnings distribution from bookings
- **6.1.3** - Withdrawal requests
- **6.1.4** - Withdrawal method management (bank, mobile money)
- **6.1.5** - Wallet transaction history
- **6.1.6** - Balance inquiries

---

### 7.0 Commission & Distribution System

```
┌──────────────┐                          ┌──────────────┐
│ Payment      │─── Completed ───────────▶│   7.1        │
│ Received     │    Booking               │  Payment     │
└──────────────┘                          │  Distribution│
                                          └──────┬───────┘
                                                 │
                    ┌────────────────────────────┼──────────────────┐
                    │                            │                  │
                    ▼                            ▼                  ▼
            ┌──────────────┐            ┌──────────────┐   ┌──────────────┐
            │   7.1.1      │            │   7.1.2      │   │   7.1.3      │
            │  Calculate   │            │  Distribute  │   │  Record      │
            │  Split       │            │  to Wallets  │   │  Commission  │
            └──────┬───────┘            └──────┬───────┘   └──────┬───────┘
                   │                           │                  │
                   │   Split Rules:            │                  │
                   │   - Host: 80%             │                  │
                   │   - Agent: 10%            │                  │
                   │   - Platform: 10%         │                  │
                   │                           │                  │
                   └───────────────────────────┴──────────────────┘
                                               │
                                               ▼
                                    ┌─────────────────────────┐
                                    │ OwnerEarnings,          │
                                    │ AgentCommissions,       │
                                    │ OwnerPayments           │
                                    └─────────────────────────┘
```

**Sub-processes:**
- **7.1.1** - Calculate payment splits (host/agent/platform)
- **7.1.2** - Distribute earnings to wallets
- **7.1.3** - Record commission transactions
- **7.1.4** - Agent commission tracking
- **7.1.5** - Host/owner earnings management
- **7.1.6** - Platform fee collection

**Split Rules:**
- **Without Agent**: Host 90%, Platform 10%
- **With Agent**: Host 80%, Agent 10%, Platform 10%

---

### 8.0 Notification System

```
┌──────────────┐                          ┌──────────────┐
│ System       │─── Trigger Event ───────▶│   8.1        │
│ Events       │                          │  Notification│
└──────────────┘                          │  Service     │
                                          └──────┬───────┘
                                                 │
                    ┌────────────────────────────┼──────────────┐
                    │                            │              │
                    ▼                            ▼              ▼
            ┌──────────────┐            ┌──────────────┐  ┌──────────────┐
            │   8.1.1      │            │   8.1.2      │  │   8.1.3      │
            │  Email       │            │  SMS         │  │  In-App      │
            │  (Brevo)     │            │  (Brevo)     │  │  Notification│
            └──────┬───────┘            └──────┬───────┘  └──────┬───────┘
                   │                           │                 │
                   ▼                           ▼                 ▼
            Brevo Email API            Brevo SMS API      Database Storage
```

**Notification Types:**
- **Authentication**: Welcome, password reset, 2FA
- **Booking**: Confirmation, cancellation, check-in reminders
- **Payment**: Receipt, refund, wallet deposit
- **Property**: Submission, approval, rejection
- **Commission**: Earnings notification
- **Admin**: System alerts, pending approvals

---

### 9.0 Admin Operations

```
┌──────────────┐                          ┌──────────────┐
│ Admins       │─── Manage System ───────▶│   9.1        │
│              │                          │  Admin       │
└──────────────┘                          │  Service     │
                                          └──────┬───────┘
                                                 │
                ┌────────────────────────────────┼──────────────────────┐
                │                                │                      │
                ▼                                ▼                      ▼
        ┌──────────────┐              ┌──────────────┐        ┌──────────────┐
        │   9.1.1      │              │   9.1.2      │        │   9.1.3      │
        │  User        │              │  Property    │        │  Payment     │
        │  Management  │              │  Approval    │        │  Oversight   │
        └──────────────┘              └──────────────┘        └──────────────┘
                │                                │                      │
                ▼                                ▼                      ▼
        ┌──────────────┐              ┌──────────────┐        ┌──────────────┐
        │   9.1.4      │              │   9.1.5      │        │   9.1.6      │
        │  Booking     │              │  Withdrawal  │        │  Analytics & │
        │  Leads       │              │  Approval    │        │  Reports     │
        └──────────────┘              └──────────────┘        └──────────────┘
```

**Admin Sub-processes:**
- **9.1.1** - User management, KYC approval
- **9.1.2** - Property approval/rejection
- **9.1.3** - Payment oversight and reconciliation
- **9.1.4** - Booking leads management
- **9.1.5** - Withdrawal method approval
- **9.1.6** - System analytics and reports
- **9.1.7** - Commission rate adjustments

---

## Data Stores

### Primary Database Tables (PostgreSQL)

#### Users & Authentication
```sql
User
├── id (PK)
├── email, firstName, lastName
├── password (hashed)
├── userType (guest, host, agent, tourGuide, admin)
├── kycStatus, kycCompleted
├── provider (manual, google, facebook)
├── phone, phoneCountryCode
└── timestamps

UserSession
├── id (PK)
├── userId (FK → User)
├── sessionToken, refreshToken
├── device, browser, ipAddress
└── expiresAt
```

#### Properties
```sql
Property
├── id (PK)
├── hostId (FK → User)
├── agentId (FK → User)
├── name, location, propertyAddress
├── type, category
├── pricePerNight, pricePerTwoNights
├── beds, baths, maxGuests
├── features (JSON), images (JSON)
├── status (pending, active, inactive)
├── availableFrom, availableTo
└── commissionRate
```

#### Bookings
```sql
Booking
├── id (PK)
├── propertyId (FK → Property)
├── guestId (FK → User)
├── checkIn, checkOut
├── guests, totalPrice
├── status (pending, confirmed, cancelled, completed)
├── paymentStatus (pending, completed, refunded)
├── paymentMethod (momo, card, property)
├── transactionId
├── walletDistributed
└── payAtProperty
```

#### Tours
```sql
Tour
├── id (PK)
├── tourGuideId (FK → User)
├── title, description, category
├── price, currency
├── duration, maxGroupSize
├── location, meetingPoint
└── itinerary (JSON)

TourBooking
├── id (PK)
├── tourId (FK → Tour)
├── userId (FK → User)
├── scheduleId (FK → TourSchedule)
├── numberOfParticipants
├── participants (JSON)
├── totalAmount
├── paymentStatus
└── walletDistributed
```

#### Transactions
```sql
Transaction
├── id (PK)
├── reference (unique)
├── provider (PAWAPAY, XENTRIPAY, PROPERTY)
├── transactionType (DEPOSIT, PAYOUT, REFUND)
├── paymentMethod (mobile_money, card, cash_at_property)
├── userId (FK → User)
├── recipientId (FK → User)
├── amount, currency (RWF)
├── requestedAmount (USD)
├── status (PENDING, COMPLETED, FAILED)
├── bookingId (FK → Booking)
├── propertyId, tourId
├── metadata (JSON)
│   ├── originalAmountUSD
│   ├── exchangeRate
│   ├── splitRules
│   └── providerDetails
└── timestamps
```

#### Wallets
```sql
Wallet
├── id (PK)
├── userId (FK → User)
├── balance (available)
├── pendingBalance
├── currency (USD)
└── walletNumber

WalletTransaction
├── id (PK)
├── walletId (FK → Wallet)
├── type (DEPOSIT, WITHDRAWAL, COMMISSION)
├── amount
├── balanceBefore, balanceAfter
├── reference
├── description
└── timestamp
```

#### Commissions & Earnings
```sql
AgentCommission
├── id (PK)
├── agentId (FK → User)
├── propertyId (FK → Property)
├── bookingId (FK → Booking)
├── amount, commissionRate
├── status (pending, paid)
└── earnedAt, paidAt

OwnerEarning
├── id (PK)
├── ownerId (FK → User)
├── propertyId (FK → Property)
├── bookingId (FK → Booking)
├── grossAmount
├── platformFee
├── ownerEarning (net)
├── status
└── earnedAt
```

#### Withdrawal Methods
```sql
WithdrawalMethod
├── id (PK)
├── userId (FK → User)
├── methodType (BANK, MOBILE_MONEY)
├── accountDetails (JSON)
│   ├── providerCode
│   ├── accountNumber
│   ├── providerName
│   └── currency
├── isDefault, isVerified, isApproved
└── verificationStatus

WithdrawalRequest
├── id (PK)
├── userId (FK → User)
├── amount, currency
├── method
├── status (PENDING, APPROVED, REJECTED, COMPLETED)
├── destination (JSON)
├── reference
└── timestamps
```

---

## Data Flow Details

### 1. User Registration Flow
```
User Input → Auth Controller → Auth Service
    ↓
Validate email/password
    ↓
Hash password (bcrypt)
    ↓
Create User record → Database
    ↓
Generate JWT tokens
    ↓
Send welcome email → Brevo API
    ↓
Return auth response → User
```

### 2. Property Creation Flow
```
Host Input → Property Controller → Property Service
    ↓
Validate property data
    ↓
Upload images (if any)
    ↓
Create Property record → Database (status: pending)
    ↓
Send submission email → Brevo API
    ↓
Notify admins for approval
    ↓
Return property info → Host
```

### 3. Booking Creation Flow
```
Guest Input → Booking Controller → Booking Service
    ↓
Check availability (BlockedDates, existing Bookings)
    ↓
Calculate total price
    ↓
Create Booking record → Database (status: pending)
    ↓
Create BlockedDate record → Database
    ↓
Send confirmation email → Brevo API (guest, host, agent)
    ↓
Return booking info → Guest
```

### 4. Payment Flow (Unified)

#### 4a. Mobile Money (PawaPay)
```
User → Unified Transaction Controller
    ↓
Select payment method: "momo"
    ↓
Convert USD to RWF → Currency Exchange Service
    ↓
Format phone number
    ↓
Create deposit request → PawaPay API
    ↓
Store Transaction → Database (provider: PAWAPAY)
    ↓
Poll status → Status Poller Service
    ↓
Update Transaction status
    ↓
If COMPLETED → Distribute to wallets
    ↓
Send payment confirmation → Brevo API
```

#### 4b. Card Payment (XentriPay)
```
User → Unified Transaction Controller
    ↓
Select payment method: "card"
    ↓
Convert USD to RWF → Currency Exchange Service
    ↓
Create collection request → XentriPay API
    ↓
Receive payment URL
    ↓
Store Transaction → Database (provider: XENTRIPAY)
    ↓
Redirect user to payment page
    ↓
Await callback from XentriPay
    ↓
Update Transaction status
    ↓
If SUCCESS → Distribute to wallets
    ↓
Send payment confirmation → Brevo API
```

#### 4c. Property Payment (Cash)
```
User → Unified Transaction Controller
    ↓
Select payment method: "property"
    ↓
Store Transaction → Database (provider: PROPERTY, status: PENDING_PROPERTY_PAYMENT)
    ↓
Update Booking (payAtProperty: true)
    ↓
Send instructions → Brevo API (guest: "pay at property", host: "collect payment")
    ↓
[Later] Host marks payment as collected
    ↓
Update Transaction status → COMPLETED
    ↓
Distribute to wallets
```

### 5. Payment Distribution Flow
```
Transaction COMPLETED → Payment Distribution Service
    ↓
Fetch booking details (property, host, agent)
    ↓
Calculate split amounts
│   ├─ Has Agent: Host 80%, Agent 10%, Platform 10%
│   └─ No Agent:  Host 90%, Platform 10%
    ↓
Update Host Wallet (+80% or +90%)
    ↓
Update Agent Wallet (+10% if applicable)
    ↓
Update Platform Wallet (+10%)
    ↓
Create WalletTransaction records
    ↓
Create OwnerEarning record
    ↓
Create AgentCommission record (if applicable)
    ↓
Mark booking as walletDistributed
    ↓
Send earnings notification → Brevo API
```

### 6. Withdrawal Request Flow
```
User → Withdrawal Controller
    ↓
Select withdrawal method (bank/mobile money)
    ↓
Check wallet balance
    ↓
Create WithdrawalRequest → Database (status: PENDING)
    ↓
Notify admin for approval
    ↓
[Admin] Review and approve
    ↓
Process payout via XentriPay API
    ↓
Update WithdrawalRequest status → COMPLETED
    ↓
Deduct from wallet balance
    ↓
Create WalletTransaction (type: WITHDRAWAL)
    ↓
Send withdrawal confirmation → Brevo API
```

### 7. Admin Approval Flow (Property)
```
Host submits property → Database (status: pending)
    ↓
Admin views pending properties
    ↓
Admin reviews property details
    ↓
Admin approves/rejects
    ↓
Update Property status → active/rejected
    ↓
Send approval/rejection email → Brevo API
    ↓
If approved: Property becomes visible to guests
```

### 8. KYC Verification Flow
```
User submits KYC documents
    ↓
Upload documents (nationalId, verificationDocument)
    ↓
Update User (kycSubmittedAt, kycStatus: pending)
    ↓
Notify admin
    ↓
Admin reviews documents
    ↓
Admin approves/rejects
    ↓
Update User (kycStatus: approved/rejected, kycCompleted)
    ↓
Send KYC result email → Brevo API
```

---

## Integration Flows

### 1. PawaPay Integration
**Purpose**: Mobile money payments (MTN, Airtel, SPENN)

**Endpoints Used**:
- `POST /deposits` - Initiate deposit
- `GET /deposits/{depositId}` - Check status
- `POST /payouts` - Initiate payout
- `GET /active-conf` - Get available providers

**Data Flow**:
```
System → PawaPay API
    ├── Deposit Request
    │   ├── depositId (UUID)
    │   ├── amount (RWF, no decimals)
    │   ├── currency: "RWF"
    │   ├── payer.type: "MMO"
    │   ├── payer.phoneNumber (250XXXXXXXXX)
    │   ├── payer.provider (MTN_MOMO_RWA, AIRTEL_RWA)
    │   └── metadata (JSON array)
    │
    ├── Response
    │   ├── status (SUBMITTED, ACCEPTED, COMPLETED, FAILED)
    │   ├── correspondentIds
    │   ├── customerTimestamp
    │   └── failureReason (if failed)
    │
    └── Status Polling (every 30s)
        └── Update Transaction status
```

**Provider Codes**:
- `MTN_MOMO_RWA` - MTN Rwanda
- `AIRTEL_RWA` - Airtel Rwanda
- `SPENN_RWA` - Spenn Rwanda

### 2. XentriPay Integration
**Purpose**: Card payments, bank transfers, mobile money payouts

**Endpoints Used**:
- `POST /api/collections/initiate` - Initiate card collection
- `GET /api/collections/status/{refid}` - Check collection status
- `POST /api/payment-requests` - Initiate payout
- `GET /api/payment-requests/check-status` - Check payout status
- `GET /api/wallets/my-business` - Get wallet balance

**Data Flow**:
```
System → XentriPay API
    ├── Collection Request (Card)
    │   ├── email, cname (customer name)
    │   ├── amount (RWF)
    │   ├── currency: "RWF"
    │   ├── cnumber (10 digits: 0780371519)
    │   ├── msisdn (with country code: 250780371519)
    │   ├── pmethod: "cc" (card)
    │   └── chargesIncluded: "true"
    │
    ├── Response
    │   ├── success: 1
    │   ├── url (payment page)
    │   ├── refid (reference)
    │   ├── tid (transaction id)
    │   └── authkey
    │
    └── Callback/Webhook
        ├── status: "SUCCESS", "PENDING", "FAILED"
        └── Update Transaction
```

**Provider IDs** (for payouts):
- `63510` - MTN Rwanda
- `63514` - Airtel Rwanda
- `63509` - SPENN
- `010`, `040`, `070`, etc. - Banks (BK, Equity, etc.)

### 3. Brevo (Email & SMS)
**Purpose**: Transactional emails and SMS notifications

**Services**:
- `BrevoPropertyMailingService` - Property-related emails
- `BrevoBookingMailingService` - Booking notifications
- `BrevoPaymentStatusMailingService` - Payment confirmations
- `BrevoMailingService` - General auth emails
- `BrevoSMSService` - SMS notifications

**Email Templates**:
- Welcome email
- Property submission confirmation
- Booking confirmation (guest, host, agent)
- Payment receipt
- KYC approval/rejection
- Withdrawal confirmation
- Password reset
- Check-in reminders

**Data Flow**:
```
System → Brevo API
    ├── Email Request
    │   ├── to: { email, name }
    │   ├── templateId
    │   ├── params: { user, company, booking/property/payment data }
    │   └── subject
    │
    └── SMS Request
        ├── recipient (phone)
        ├── content (message)
        └── sender (company name)
```

### 4. Currency Exchange (Hexarate)
**Purpose**: Real-time USD ↔ RWF exchange rates

**Endpoint**: `GET https://api.hexarate.paikama.co/api/rates/latest/USD?target=RWF`

**Data Flow**:
```
System → Hexarate API
    ├── Request: GET /USD?target=RWF
    │
    └── Response
        ├── status_code: 200
        └── data
            ├── base: "USD"
            ├── target: "RWF"
            ├── mid: 1300.50 (exchange rate)
            └── timestamp
```

**Conversion Logic**:
- **Deposit Rate** = base rate + 0.5% (1.005x)
- **Payout Rate** = base rate - 0.5% (0.995x)
- **Cached** for 1 hour to reduce API calls

---

## Key Business Rules

### 1. Payment Split Rules
```javascript
Without Agent:
  - Host: 90%
  - Platform: 10%

With Agent:
  - Host: 80%
  - Agent: 10%
  - Platform: 10%
```

### 2. Currency Handling
- **User Input**: USD
- **Database Storage**: USD (for wallets), RWF (for transactions)
- **Payment Providers**: RWF
- **Conversion**: Real-time via Hexarate API with spread

### 3. Transaction Status Flow
```
PENDING → PROCESSING → COMPLETED
              ↓
            FAILED
              ↓
           REFUNDED
```

### 4. Booking Status Flow
```
pending → confirmed → completed
    ↓
cancelled
```

### 5. Payment Methods
- **mobile_money** - PawaPay (MTN, Airtel, SPENN)
- **card** - XentriPay (Visa, Mastercard)
- **cash_at_property** - Pay at check-in

### 6. Withdrawal Approval
1. User adds withdrawal method → pending
2. Admin reviews and approves → approved
3. User can only withdraw to approved methods

---

## Security & Authentication

### JWT Token Structure
```javascript
Access Token (15 minutes):
{
  userId: number,
  email: string,
  userType: string,
  iat: timestamp,
  exp: timestamp
}

Refresh Token (7 days):
{
  userId: number,
  email: string,
  sessionId: string,
  iat: timestamp,
  exp: timestamp
}
```

### API Routes Protection
```javascript
Public Routes:
  - /api/public/* (property listings, public info)
  - /api/auth/register
  - /api/auth/login

Authenticated Routes:
  - /api/properties/* (create, update)
  - /api/bookings/*
  - /api/transactions/*
  - /api/wallets/*

Admin Routes:
  - /api/admin/*
```

---

## Performance Optimizations

### 1. Status Polling Service
- Polls pending transactions every 30 seconds
- Only checks transactions < 24 hours old
- Updates status and triggers wallet distribution

### 2. Caching
- Exchange rates cached for 1 hour
- Active configuration (PawaPay) cached for 1 hour

### 3. Database Indexes
- User email (unique)
- Transaction reference (unique)
- Booking dates (checkIn, checkOut)
- Property location, status
- Wallet userId (unique)

---

## Error Handling

### Payment Failures
```
Transaction FAILED
    ↓
Store failure reason
    ↓
Send failure notification → User
    ↓
Allow retry or refund
```

### Wallet Distribution Failures
```
Distribution Error
    ↓
Set distributionError field
    ↓
Increment distributionAttempts
    ↓
Log error
    ↓
Admin can manually retry via API
```

---

## Monitoring & Logging

### Logged Events
- All API requests (method, URL, status, duration)
- Payment transactions (initiated, completed, failed)
- Wallet operations (deposits, withdrawals, distributions)
- Authentication attempts (success, failure, 2FA)
- Admin actions (approvals, rejections)

### Key Metrics
- Transaction success rate
- Average payment processing time
- Wallet balance distribution accuracy
- Booking conversion rate
- Property approval time

---

## Future Enhancements (Based on Code Analysis)

1. **Real-time notifications** - WebSocket integration
2. **Advanced analytics** - Revenue trends, occupancy rates
3. **Multi-currency support** - Beyond USD/RWF
4. **Automated KYC** - Third-party verification services
5. **Dynamic pricing** - Seasonal/demand-based pricing
6. **Review system** - Property and tour reviews with photos
7. **Referral program** - User referral tracking and rewards
8. **Loyalty program** - VIP clients and benefits

---

## Glossary

- **Host**: Property owner who lists properties
- **Guest**: User who books properties or tours
- **Agent**: Intermediary who manages properties for hosts
- **Tour Guide**: User who offers tours
- **UPI**: Universal Property Identifier
- **KYC**: Know Your Customer verification
- **Wallet**: User's balance stored in the system
- **Commission**: Agent's earnings from bookings
- **Platform Fee**: System's cut from transactions
- **Deposit**: Money coming into the system (from users)
- **Payout**: Money going out of the system (to users)
- **Distribution**: Splitting payments among stakeholders

---

## Quick Reference Guide

### Payment Provider Details

**PawaPay (Mobile Money)**
- **Providers**: MTN, Airtel, SPENN
- **Speed**: 10-30 seconds
- **Format**: Phone must be 250XXXXXXXXX
- **Currency**: RWF only
- **Status Check**: Polling every 30s

**XentriPay (Cards & Bank)**
- **Methods**: Visa, Mastercard, Bank Transfer
- **Speed**: Instant to 5 minutes
- **Redirect**: User goes to payment page
- **Currency**: RWF only
- **Status Check**: Callback webhook

---

### Money Flow Summary

```
┌─────────────────────────────────────────────────┐
│                  GUEST PAYS                      │
│                    $100 USD                      │
└───────────────────┬─────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  Currency Conversion  │
        │  $100 → 130,500 RWF   │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │   Payment Provider    │
        │ (PawaPay/XentriPay)   │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │   Payment Complete    │
        │   Status: COMPLETED   │
        └───────────┬───────────┘
                    │
                    ▼
        ┌───────────────────────────────────┐
        │     AUTOMATIC DISTRIBUTION        │
        ├───────────────────────────────────┤
        │  Host Wallet:     +$80 (80%)     │
        │  Agent Wallet:    +$10 (10%)     │
        │  Platform Wallet: +$10 (10%)     │
        └───────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │  Email Notifications  │
        │  sent to all parties  │
        └───────────────────────┘
```

---

### Transaction Status States

| Status | Meaning | Next Action |
|--------|---------|-------------|
| `PENDING` | Payment initiated, waiting for confirmation | Auto-polling checks status |
| `PROCESSING` | Payment provider is processing | System continues polling |
| `COMPLETED` | Payment successful | Money distributed to wallets |
| `FAILED` | Payment failed | User notified, can retry |
| `REFUNDED` | Money returned to payer | Wallet balances adjusted |

---

### Booking Status States

| Status | Meaning | What Happens |
|--------|---------|--------------|
| `pending` | Booking created, awaiting payment | Guest has time to pay |
| `confirmed` | Payment received | Host prepares property |
| `completed` | Check-out done | Money moves to available balance |
| `cancelled` | Booking cancelled | Dates unblocked, refund processed |

---

### Common Questions & Answers

**Q: How long does payment take?**
- Mobile Money: 10-30 seconds
- Credit Card: 30 seconds to 2 minutes
- Cash at Property: Instant when marked collected

**Q: When can I withdraw my earnings?**
- Available balance can be withdrawn anytime
- Pending balance becomes available after guest checks in

**Q: What happens if payment fails?**
- Guest receives notification
- Can retry payment immediately
- Booking held for 24 hours

**Q: How do I know if I got paid?**
- Instant email notification
- Check wallet balance
- View transaction history

**Q: Can I cancel a booking?**
- Yes, within cancellation policy
- Refund processed automatically
- Dates become available again

---

### For Developers: File Structure

```
faxon-backend/
├── src/
│   ├── controllers/          # API route handlers
│   │   ├── auth.controller.ts
│   │   ├── property.controller.ts
│   │   ├── booking.controller.ts
│   │   ├── unified-transaction.controller.ts
│   │   ├── wallet.controller.ts
│   │   └── admin.controller.ts
│   │
│   ├── services/             # Business logic
│   │   ├── auth.service.ts
│   │   ├── property.service.ts
│   │   ├── unified-transaction.service.ts
│   │   ├── payment-distribution.service.ts
│   │   ├── status-poller.service.ts
│   │   ├── pawapay.service.ts
│   │   ├── xentripay.service.ts
│   │   └── email.service.ts
│   │
│   ├── routes/               # API route definitions
│   ├── middleware/           # Auth, validation
│   ├── types/                # TypeScript interfaces
│   ├── utils/                # Helper functions
│   └── config/               # Configuration
│
├── prisma/
│   ├── schema.prisma         # Database schema
│   └── migrations/           # Database migrations
│
└── docs/                     # Documentation
    └── BACKEND_DATA_FLOW_DIAGRAM.md (this file)
```

---

### Key Concepts Explained

**Unified Transaction System**
- Single API for all payment types
- Handles mobile money, cards, and cash
- Automatic provider routing
- Consistent response format

**Wallet System**
- Virtual balance in USD
- Real-time updates
- Transaction history
- Pending vs available balance

**Payment Distribution**
- Automatic after payment
- Configurable split rules
- Commission tracking
- Earnings records

**Status Polling**
- Background service
- Checks pending payments every 30s
- Updates status automatically
- Triggers distribution on completion

---

## Summary: What Makes Faxon Special

✅ **Three Payment Methods** - Mobile money, cards, or cash at property
✅ **Instant Distribution** - Money splits automatically within seconds
✅ **Real-Time Notifications** - Everyone knows what's happening via email
✅ **Fair Commission System** - Transparent splits for hosts, agents, platform
✅ **Wallet Management** - Track earnings, view history, withdraw anytime
✅ **Admin Oversight** - Quality control for properties, KYC, withdrawals
✅ **Currency Handling** - USD for users, RWF for payments (seamless conversion)
✅ **Status Automation** - No manual checking required, system handles it all

---

**End of User-Friendly Data Flow Guide**

**For Technical Details:**
- Database Schema: [prisma/schema.prisma](../prisma/schema.prisma)
- API Controllers: [src/controllers/](../src/controllers/)
- Business Logic: [src/services/](../src/services/)
- Type Definitions: [src/types/](../src/types/)

**For Users:**
This guide explains how money flows through the Faxon system from booking to withdrawal. Whether you're a guest, host, agent, or tour guide, the system handles payments automatically so you can focus on hospitality.

---

*Generated with love for the Faxon team 💙*
*Last Updated: 2025-10-20*
