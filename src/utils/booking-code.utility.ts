/**
 * Booking Code Utility
 * Generates unique 6-character alphanumeric booking codes for two-way check-in verification
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Generate a random 6-character uppercase alphanumeric code
 * Format: ABC123, XYZ789, etc.
 */
export function generateBookingCode(): string {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluded I, O, 0, 1 to avoid confusion
  let code = '';

  for (let i = 0; i < 6; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    code += characters[randomIndex];
  }

  return code;
}

/**
 * Generate a unique booking code that doesn't exist in database
 * Checks both Booking and TourBooking tables
 * @param maxAttempts - Maximum number of attempts to generate unique code (default: 10)
 * @returns Promise<string> - Unique booking code
 */
export async function generateUniqueBookingCode(maxAttempts: number = 10): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const code = generateBookingCode();

    // Check if code already exists in Booking table
    const existingBooking = await prisma.booking.findFirst({
      where: { bookingCode: code }
    });

    // Check if code already exists in TourBooking table
    const existingTourBooking = await prisma.tourBooking.findFirst({
      where: { bookingCode: code }
    });

    // If code doesn't exist in either table, return it
    if (!existingBooking && !existingTourBooking) {
      return code;
    }

    console.log(`[BOOKING_CODE] Code ${code} already exists, generating new one (attempt ${attempt + 1}/${maxAttempts})`);
  }

  // If we couldn't generate a unique code after max attempts, throw error
  throw new Error(`Failed to generate unique booking code after ${maxAttempts} attempts`);
}

/**
 * Validate booking code format
 * @param code - Booking code to validate
 * @returns boolean - True if valid format
 */
export function isValidBookingCodeFormat(code: string): boolean {
  // Must be exactly 6 characters, uppercase alphanumeric
  const regex = /^[A-Z0-9]{6}$/;
  return regex.test(code);
}

/**
 * Verify booking with booking ID and booking code (two-way verification)
 * @param bookingId - Booking ID
 * @param bookingCode - Booking code
 * @returns Promise<{ valid: boolean, booking?: any, error?: string }>
 */
export async function verifyBookingCode(
  bookingId: string,
  bookingCode: string
): Promise<{ valid: boolean; booking?: any; error?: string }> {
  try {
    // Validate format first
    if (!isValidBookingCodeFormat(bookingCode)) {
      return {
        valid: false,
        error: 'Invalid booking code format. Must be 6 uppercase alphanumeric characters.'
      };
    }

    // Try to find in Booking table first
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        bookingCode: bookingCode
      },
      include: {
        property: {
          include: {
            host: true,
            agent: true
          }
        },
        guest: true
      }
    });

    if (booking) {
      return {
        valid: true,
        booking
      };
    }

    // Try to find in TourBooking table
    const tourBooking = await prisma.tourBooking.findFirst({
      where: {
        id: bookingId,
        bookingCode: bookingCode
      },
      include: {
        tour: {
          include: {
            tourGuide: true
          }
        },
        user: true
      }
    });

    if (tourBooking) {
      return {
        valid: true,
        booking: tourBooking
      };
    }

    // If not found, invalid credentials
    return {
      valid: false,
      error: 'Invalid booking ID or booking code. Please check and try again.'
    };

  } catch (error: any) {
    console.error('[BOOKING_CODE] Error verifying booking code:', error);
    return {
      valid: false,
      error: 'Error verifying booking. Please try again later.'
    };
  }
}

export default {
  generateBookingCode,
  generateUniqueBookingCode,
  isValidBookingCodeFormat,
  verifyBookingCode
};
