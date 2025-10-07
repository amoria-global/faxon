# Booking Cleanup System

## Overview

The Booking Cleanup System automatically removes expired bookings and their associated blocked dates when payment is still pending after 24 hours. This ensures that properties and tours remain available for other customers when unpaid bookings expire.

## How It Works

### Automatic Cleanup Process

1. **Detection**: The system checks for bookings that meet these criteria:
   - Created more than 24 hours ago
   - Status: `pending`
   - Payment Status: `pending`

2. **Property Bookings Cleanup**:
   - Removes the expired booking from the database
   - Deletes all associated blocked dates
   - Frees up the property for other bookings

3. **Tour Bookings Cleanup**:
   - Removes the expired tour booking
   - Returns booked slots to the tour schedule
   - Makes the slots available for other participants

### Scheduler Configuration

The cleanup runs automatically every **6 hours** by default. This interval can be adjusted when initializing the scheduler in [server.ts](../src/server.ts#L98):

```typescript
const bookingCleanupScheduler = new BookingCleanupSchedulerService(6); // Check every 6 hours
```

### Environment Variables

Enable or disable the booking cleanup scheduler:

```env
# Enable booking cleanup (default: enabled)
ENABLE_BOOKING_CLEANUP=true

# To disable:
ENABLE_BOOKING_CLEANUP=false
```

## Files Created

### Services

1. **[booking-cleanup.service.ts](../src/services/booking-cleanup.service.ts)**
   - Core cleanup logic
   - Handles both property and tour bookings
   - Manages blocked dates removal
   - Returns slots to tour schedules

2. **[booking-cleanup-scheduler.service.ts](../src/services/booking-cleanup-scheduler.service.ts)**
   - Scheduler wrapper
   - Runs cleanup at regular intervals
   - Provides status monitoring
   - Supports manual triggering

### Routes

3. **[booking-cleanup.routes.ts](../src/routes/booking-cleanup.routes.ts)**
   - Admin-only manual cleanup endpoint
   - Status checking endpoint

## API Endpoints

### Manual Cleanup Trigger (Admin Only)

```http
POST /api/booking-cleanup/manual
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "message": "Booking cleanup completed",
  "results": {
    "propertyBookingsRemoved": 5,
    "tourBookingsRemoved": 2,
    "blockedDatesRemoved": 5,
    "totalRemoved": 7,
    "errors": []
  }
}
```

### Check Cleanup Status (Admin Only)

```http
GET /api/booking-cleanup/status
Authorization: Bearer <admin-token>
```

**Response:**
```json
{
  "success": true,
  "status": {
    "cutoffDate": "2025-10-05T12:00:00.000Z",
    "message": "Bookings older than 24 hours with pending payment will be removed"
  }
}
```

### Health Check

The booking cleanup scheduler status is included in the main health check:

```http
GET /health
```

**Response:**
```json
{
  "status": "ok",
  "services": {
    "bookingCleanup": "running"
  },
  "schedulers": {
    "bookingCleanup": {
      "isRunning": true,
      "intervalMs": 21600000,
      "intervalHours": 6
    }
  }
}
```

## What Gets Cleaned Up

### Property Bookings

For each expired property booking:
- ✅ Booking record deleted from database
- ✅ Associated blocked dates removed
- ✅ Property becomes available for new bookings
- ✅ No notification sent (booking was never confirmed)

### Tour Bookings

For each expired tour booking:
- ✅ Tour booking record deleted
- ✅ Booked slots returned to schedule
- ✅ Other participants can book those slots
- ✅ No notification sent (booking was never confirmed)

## Logging

The system provides detailed console logging:

```
🧹 Running booking cleanup cycle...
📋 Found 5 expired property bookings to remove
✅ Removed expired booking cuid123 and 1 blocked date(s)
📋 Found 2 expired tour bookings to remove
✅ Removed expired tour booking cuid456 and freed 3 slot(s)
📊 Cleanup Results: { propertyBookingsRemoved: 5, tourBookingsRemoved: 2, ... }
```

## Integration with Existing Code

The cleanup system integrates seamlessly with the existing booking service:

- Uses the same `createBlockedDatesForBooking` and `removeBlockedDatesForBooking` pattern
- Respects the same booking statuses
- Works with existing Prisma models
- No changes required to existing booking logic

## Testing

To test the cleanup manually:

1. Create a booking (it will be in pending status)
2. Wait 24+ hours OR manually modify the `createdAt` date in the database
3. Trigger manual cleanup via API or wait for scheduled run
4. Verify the booking and blocked dates are removed

## Benefits

1. **Automatic Resource Management**: Properties and tours don't stay blocked indefinitely
2. **Better Availability**: Improves booking availability for genuine customers
3. **Clean Database**: Removes stale pending bookings automatically
4. **Slot Recovery**: Tour slots are automatically freed for others
5. **No Manual Intervention**: Runs automatically without admin action

## Future Enhancements

Potential improvements:
- Send reminder emails before cleanup (e.g., at 22 hours)
- Configurable timeout period (currently fixed at 24 hours)
- Analytics dashboard for cleanup statistics
- Webhook notifications for property hosts when bookings expire
- Grace period for specific payment methods
