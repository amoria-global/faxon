# Faxon Backend - Quick Summary

> **What it does:** Connects guests with properties/tours, handles payments, splits money automatically, and keeps everyone informed.

---

## How It Works (3 Simple Steps)

```
1. GUEST BOOKS & PAYS
   ↓
2. SYSTEM PROCESSES PAYMENT & SPLITS MONEY
   ↓
3. EVERYONE GETS NOTIFICATIONS & WALLET UPDATES
```

---

## User Journeys

### 🏠 Guest Books Property
1. Browse properties → Select dates → Choose payment method
2. Pay via Mobile Money/Card/Cash at Property
3. Get booking confirmation email
4. Check in → Enjoy stay

### 🏡 Host Lists Property
1. Create listing → Submit for approval
2. Admin approves → Property goes live
3. Receive bookings → Earn 80-90% per booking
4. Withdraw to bank/mobile money

### 💼 Agent Manages Properties
1. Host assigns you to property (10% commission)
2. Auto-earn 10% on every booking
3. Track earnings in wallet
4. Withdraw anytime

---

## Payment Methods

| Method | Provider | Speed | Details |
|--------|----------|-------|---------|
| **Mobile Money** | PawaPay | 10-30 sec | MTN, Airtel, SPENN |
| **Credit Card** | XentriPay | 30 sec-2 min | Visa, Mastercard |
| **Cash at Property** | Manual | Instant | Pay at check-in |

---

## Money Split Rules

**With Agent:**
- Host: 80%
- Agent: 10%
- Platform: 10%

**Without Agent:**
- Host: 90%
- Platform: 10%

---

## Complete Example

```
Sarah books villa for $100 (2 nights)
    ↓
Pays via MTN Mobile Money
    ↓
System converts: $100 USD → 130,500 RWF
    ↓
Payment completes in 15 seconds
    ↓
Money splits automatically:
    • Host (John): +$80
    • Agent (Mary): +$10
    • Platform: +$10
    ↓
Everyone gets email confirmation
    ↓
John can withdraw $80 anytime
```

---

## What Happens Automatically

✅ Payment status checking (every 30 seconds)
✅ Money distribution (within 5 seconds)
✅ Email notifications (instant)
✅ Currency conversion (USD ↔ RWF)
✅ Date blocking (no double bookings)
✅ Wallet updates (real-time)

---

## Tech Stack

- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL + Prisma ORM
- **Payments:** PawaPay (mobile) + XentriPay (cards)
- **Emails:** Brevo
- **Exchange Rates:** Hexarate API

---

## Key Features

| Feature | Benefit |
|---------|---------|
| 3 Payment Methods | Flexibility for all users |
| Instant Distribution | No manual transfers needed |
| Real-time Notifications | Everyone stays informed |
| Wallet System | Track earnings easily |
| Admin Oversight | Quality & security control |
| Auto Currency Conversion | Seamless USD ↔ RWF |

---

## FAQs

**Q: How long does payment take?**
A: Mobile Money: 10-30s, Card: 30s-2min, Cash: Instant when collected

**Q: When can I withdraw?**
A: Anytime from available balance (pending balance releases after check-in)

**Q: What if payment fails?**
A: You get notified and can retry immediately

**Q: How do I track earnings?**
A: Check wallet balance + transaction history

---

**That's it!** The system handles everything automatically so you can focus on hospitality.

*For full technical details, see [BACKEND_DATA_FLOW_DIAGRAM.md](./BACKEND_DATA_FLOW_DIAGRAM.md)*
