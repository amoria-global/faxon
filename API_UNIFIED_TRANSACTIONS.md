# Unified Transaction API Reference

## Base URL
```
/api/transactions
```

## Endpoints

### 1. Get All Transactions
```http
GET /api/transactions
```

**Query Parameters:**
- `userId` (number, optional) - Filter by user ID
- `recipientId` (number, optional) - Filter by recipient ID
- `provider` (string, optional) - Filter by provider: `PESAPAL`, `PAWAPAY`, `XENTRIPAY`
- `type` (string, optional) - Filter by type: `DEPOSIT`, `PAYOUT`, `REFUND`, `ESCROW`
- `status` (string, optional) - Filter by status
- `fromDate` (ISO date, optional) - Start date filter
- `toDate` (ISO date, optional) - End date filter
- `limit` (number, optional, default: 100) - Number of results
- `offset` (number, optional, default: 0) - Pagination offset

**Example:**
```bash
GET /api/transactions?provider=PAWAPAY&type=DEPOSIT&limit=50
```

**Response:**
```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "id": "clxxx...",
      "provider": "PAWAPAY",
      "type": "DEPOSIT",
      "status": "COMPLETED",
      "amount": "100000",
      "currency": "RWF",
      "reference": "dep_xxx",
      "externalId": "ext_xxx",
      "userId": 123,
      "recipientPhone": "250788123456",
      "payerPhone": "250788654321",
      "description": "Booking payment",
      "metadata": {},
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:05:00.000Z",
      "completedAt": "2024-01-01T00:05:00.000Z",
      "providerTransactionId": "prov_xxx",
      "financialTransactionId": "fin_xxx"
    }
  ]
}
```

---

### 2. Get User Transactions
```http
GET /api/transactions/user/:userId
```

**Path Parameters:**
- `userId` (number, required) - User ID

**Query Parameters:**
Same as "Get All Transactions" (except `userId`)

**Example:**
```bash
GET /api/transactions/user/123?provider=PAWAPAY
```

**Response:**
```json
{
  "success": true,
  "userId": 123,
  "count": 5,
  "data": [...]
}
```

---

### 3. Get Recipient Transactions
```http
GET /api/transactions/recipient/:recipientId
```

**Path Parameters:**
- `recipientId` (number, required) - Recipient user ID

**Query Parameters:**
Same as "Get All Transactions" (except `recipientId`)

**Note:** Only returns escrow transactions where user is the recipient

**Example:**
```bash
GET /api/transactions/recipient/456
```

**Response:**
```json
{
  "success": true,
  "recipientId": 456,
  "count": 3,
  "data": [...]
}
```

---

### 4. Get Transaction by ID
```http
GET /api/transactions/:id
```

**Path Parameters:**
- `id` (string, required) - Transaction ID

**Query Parameters:**
- `provider` (string, optional) - Hint which provider to check first

**Example:**
```bash
GET /api/transactions/clxxx123?provider=PAWAPAY
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "clxxx123",
    "provider": "PAWAPAY",
    "type": "PAYOUT",
    ...
  }
}
```

**Error Response (404):**
```json
{
  "success": false,
  "message": "Transaction not found"
}
```

---

### 5. Get Transaction Statistics
```http
GET /api/transactions/stats
```

**Query Parameters:**
- `userId` (number, optional) - Get stats for specific user

**Example:**
```bash
GET /api/transactions/stats?userId=123
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalTransactions": 150,
    "byProvider": {
      "PAWAPAY": 80,
      "PESAPAL": 50,
      "XENTRIPAY": 20
    },
    "byStatus": {
      "COMPLETED": 120,
      "PENDING": 20,
      "FAILED": 10
    },
    "byType": {
      "DEPOSIT": 80,
      "PAYOUT": 50,
      "REFUND": 10,
      "ESCROW": 10
    },
    "totalVolume": {
      "RWF": 15000000,
      "USD": 5000,
      "KES": 200000
    }
  }
}
```

---

## Transaction Object Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique transaction ID |
| `provider` | string | Payment provider: PESAPAL, PAWAPAY, XENTRIPAY |
| `type` | string | Transaction type: DEPOSIT, PAYOUT, REFUND, ESCROW |
| `status` | string | Current status (varies by provider) |
| `amount` | number/string | Transaction amount |
| `currency` | string | ISO 4217 currency code |
| `reference` | string | Transaction reference/ID from provider |
| `externalId` | string? | External tracking ID |
| `userId` | number? | User who initiated transaction |
| `recipientId` | number? | Recipient user (escrow only) |
| `recipientPhone` | string? | Recipient phone (PawaPay) |
| `payerPhone` | string? | Payer phone (PawaPay) |
| `description` | string? | Transaction description |
| `metadata` | object? | Additional metadata |
| `createdAt` | ISO date | Creation timestamp |
| `updatedAt` | ISO date | Last update timestamp |
| `completedAt` | ISO date? | Completion timestamp |
| `failureReason` | string? | Failure reason if failed |
| `providerTransactionId` | string? | Provider's internal ID |
| `financialTransactionId` | string? | Financial system ID |

---

## Status Codes

### Success Responses
- `200 OK` - Request successful

### Error Responses
- `400 Bad Request` - Invalid parameters
- `404 Not Found` - Transaction not found
- `500 Internal Server Error` - Server error

---

## Common Use Cases

### 1. Get all my transactions
```bash
GET /api/transactions/user/123
```

### 2. Get only completed PawaPay deposits
```bash
GET /api/transactions?provider=PAWAPAY&type=DEPOSIT&status=COMPLETED
```

### 3. Get transactions from last month
```bash
GET /api/transactions/user/123?fromDate=2024-01-01&toDate=2024-01-31
```

### 4. Get pending transactions across all providers
```bash
GET /api/transactions?status=PENDING
```

### 5. Check my transaction statistics
```bash
GET /api/transactions/stats?userId=123
```

### 6. Admin: View all transactions
```bash
GET /api/transactions?limit=1000
```

### 7. Get transactions I received (escrow)
```bash
GET /api/transactions/recipient/123
```

---

## Auto Status Updates

The system automatically checks PawaPay transaction statuses every 30 seconds via the status poller service.

**What gets checked:**
- PawaPay deposits with status: PENDING, ACCEPTED, SUBMITTED
- PawaPay payouts with status: PENDING, ACCEPTED, SUBMITTED
- PawaPay refunds with status: PENDING, ACCEPTED, SUBMITTED
- Transactions created within the last 24 hours

**What gets updated:**
- Transaction status
- Deposited/payout amounts
- Failure codes and messages
- Provider transaction IDs
- Completion timestamps

No manual intervention needed - the system handles it automatically!
