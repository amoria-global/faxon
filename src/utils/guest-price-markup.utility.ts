// Guest Price Markup Utility
// Applies a 14% markup to all guest-facing prices while keeping base prices unchanged for hosts/agents/admin

const GUEST_PRICE_MARKUP = 0.14; // 14% markup for guest prices

/**
 * Apply 14% markup to a price for guest view
 * @param basePrice - The original base price
 * @returns The marked up price (basePrice * 1.14)
 */
export function applyGuestPriceMarkup(basePrice: number): number {
  if (!basePrice || basePrice <= 0) {
    return basePrice;
  }
  return Math.round(basePrice * (1 + GUEST_PRICE_MARKUP) * 100) / 100; // Round to 2 decimal places
}

/**
 * Apply 14% markup to multiple prices in an object
 * @param priceObj - Object containing price fields
 * @param priceFields - Array of field names that contain prices
 * @returns New object with marked up prices
 */
export function applyGuestPriceMarkupToObject<T extends Record<string, any>>(
  priceObj: T,
  priceFields: (keyof T)[]
): T {
  const markedUpObj = { ...priceObj };

  priceFields.forEach(field => {
    if (typeof markedUpObj[field] === 'number' && markedUpObj[field] > 0) {
      markedUpObj[field] = applyGuestPriceMarkup(markedUpObj[field] as number) as T[keyof T];
    }
  });

  return markedUpObj;
}

/**
 * Apply 14% markup to an array of objects with prices
 * @param items - Array of items with prices
 * @param priceFields - Array of field names that contain prices
 * @returns New array with marked up prices
 */
export function applyGuestPriceMarkupToArray<T extends Record<string, any>>(
  items: T[],
  priceFields: (keyof T)[]
): T[] {
  return items.map(item => applyGuestPriceMarkupToObject(item, priceFields));
}

/**
 * Get the original base price from a marked up guest price
 * @param guestPrice - The price shown to guests (with markup)
 * @returns The original base price
 */
export function getBasePriceFromGuestPrice(guestPrice: number): number {
  if (!guestPrice || guestPrice <= 0) {
    return guestPrice;
  }
  return Math.round((guestPrice / (1 + GUEST_PRICE_MARKUP)) * 100) / 100;
}

/**
 * Get the markup amount from a base price
 * @param basePrice - The original base price
 * @returns The markup amount (basePrice * 0.14)
 */
export function getMarkupAmount(basePrice: number): number {
  if (!basePrice || basePrice <= 0) {
    return 0;
  }
  return Math.round(basePrice * GUEST_PRICE_MARKUP * 100) / 100;
}
