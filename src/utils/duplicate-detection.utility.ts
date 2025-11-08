/**
 * Duplicate Detection Utility
 * Provides similarity scoring and duplicate detection for properties and tours
 */

/**
 * Calculate Levenshtein distance between two strings
 * Used for fuzzy string matching
 */
function levenshteinDistance(str1: string, str2: string): number {
  const len1 = str1.length;
  const len2 = str2.length;
  const matrix: number[][] = [];

  // Initialize matrix
  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  // Fill matrix
  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = str1[i - 1] === str2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost // substitution
      );
    }
  }

  return matrix[len1][len2];
}

/**
 * Calculate similarity percentage between two strings (0-100%)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  // Normalize strings
  const normalized1 = str1.toLowerCase().trim();
  const normalized2 = str2.toLowerCase().trim();

  if (normalized1 === normalized2) return 100;

  const maxLength = Math.max(normalized1.length, normalized2.length);
  if (maxLength === 0) return 100;

  const distance = levenshteinDistance(normalized1, normalized2);
  const similarity = ((maxLength - distance) / maxLength) * 100;

  return Math.round(similarity * 100) / 100; // Round to 2 decimal places
}

/**
 * Normalize string by removing extra spaces, punctuation, and converting to lowercase
 */
function normalizeString(str: string): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' '); // Normalize spaces
}

/**
 * Check if two strings are similar considering word order variations
 * e.g., "Beach Villa" vs "Villa Beach" should be detected as similar
 */
function areStringsInvertedSimilar(str1: string, str2: string): boolean {
  if (!str1 || !str2) return false;

  const words1 = normalizeString(str1).split(' ').sort();
  const words2 = normalizeString(str2).split(' ').sort();

  if (words1.length !== words2.length) return false;

  // Check if sorted words match
  return words1.every((word, index) => word === words2[index]);
}

/**
 * Calculate address similarity score
 * Considers word order variations and common abbreviations
 */
function calculateAddressSimilarity(address1: string, address2: string): number {
  if (!address1 || !address2) return 0;

  // Common address abbreviations normalization
  const normalizeAddress = (addr: string): string => {
    return normalizeString(addr)
      .replace(/\bstreet\b/g, 'st')
      .replace(/\bavenue\b/g, 'ave')
      .replace(/\broad\b/g, 'rd')
      .replace(/\bapartment\b/g, 'apt')
      .replace(/\bbuilding\b/g, 'bldg')
      .replace(/\bfloor\b/g, 'fl');
  };

  const norm1 = normalizeAddress(address1);
  const norm2 = normalizeAddress(address2);

  // Check exact match after normalization
  if (norm1 === norm2) return 100;

  // Check inverted similarity
  if (areStringsInvertedSimilar(address1, address2)) return 100;

  // Calculate string similarity
  return calculateStringSimilarity(norm1, norm2);
}

/**
 * Calculate overall property similarity score
 */
export interface PropertySimilarityResult {
  overallScore: number;
  nameSimilarity: number;
  addressSimilarity: number;
  locationSimilarity: number;
  isDuplicate: boolean;
  reasons: string[];
}

/**
 * Compare two properties and return similarity analysis
 */
export function compareProperties(
  property1: {
    name: string;
    propertyAddress?: string | null;
    location: string;
    hostId?: number | null;
  },
  property2: {
    name: string;
    propertyAddress?: string | null;
    location: string;
    hostId?: number | null;
  },
  threshold: number = 95
): PropertySimilarityResult {
  const reasons: string[] = [];

  // Calculate name similarity
  let nameSimilarity = calculateStringSimilarity(property1.name, property2.name);
  const nameInverted = areStringsInvertedSimilar(property1.name, property2.name);

  // If names are inverted (same words, different order), treat as 100% similar
  if (nameInverted) {
    nameSimilarity = 100;
    reasons.push(`Property names are inverted versions: "${property1.name}" vs "${property2.name}"`);
  } else if (nameSimilarity >= threshold) {
    reasons.push(`Property names are ${nameSimilarity.toFixed(1)}% similar`);
  }

  // Calculate address similarity if both have addresses
  let addressSimilarity = 0;
  if (property1.propertyAddress && property2.propertyAddress) {
    addressSimilarity = calculateAddressSimilarity(
      property1.propertyAddress,
      property2.propertyAddress
    );

    if (addressSimilarity >= threshold) {
      reasons.push(`Property addresses are ${addressSimilarity.toFixed(1)}% similar`);
    }
  }

  // Calculate location similarity
  const locationSimilarity = calculateStringSimilarity(
    property1.location,
    property2.location
  );

  if (locationSimilarity >= threshold) {
    reasons.push(`Locations are ${locationSimilarity.toFixed(1)}% similar`);
  }

  // Calculate overall weighted score
  // Name is most important (50%), address (30%), location (20%)
  const weights = {
    name: 0.5,
    address: property1.propertyAddress && property2.propertyAddress ? 0.3 : 0,
    location: property1.propertyAddress && property2.propertyAddress ? 0.2 : 0.5,
  };

  const overallScore =
    nameSimilarity * weights.name +
    addressSimilarity * weights.address +
    locationSimilarity * weights.location;

  // Check if same owner
  if (property1.hostId && property2.hostId && property1.hostId === property2.hostId) {
    reasons.push('Same property owner');
  }

  const isDuplicate = overallScore >= threshold;

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    nameSimilarity: Math.round(nameSimilarity * 100) / 100,
    addressSimilarity: Math.round(addressSimilarity * 100) / 100,
    locationSimilarity: Math.round(locationSimilarity * 100) / 100,
    isDuplicate,
    reasons,
  };
}

/**
 * Tour similarity result interface
 */
export interface TourSimilarityResult {
  overallScore: number;
  titleSimilarity: number;
  descriptionSimilarity: number;
  isDuplicate: boolean;
  reasons: string[];
}

/**
 * Compare two tours and return similarity analysis
 */
export function compareTours(
  tour1: {
    title: string;
    description: string;
    tourGuideId: number;
  },
  tour2: {
    title: string;
    description: string;
    tourGuideId: number;
  },
  threshold: number = 95
): TourSimilarityResult {
  const reasons: string[] = [];

  // Calculate title similarity
  let titleSimilarity = calculateStringSimilarity(tour1.title, tour2.title);
  const titleInverted = areStringsInvertedSimilar(tour1.title, tour2.title);

  // If titles are inverted (same words, different order), treat as 100% similar
  if (titleInverted) {
    titleSimilarity = 100;
    reasons.push(`Tour titles are inverted versions: "${tour1.title}" vs "${tour2.title}"`);
  } else if (titleSimilarity >= threshold) {
    reasons.push(`Tour titles are ${titleSimilarity.toFixed(1)}% similar`);
  }

  // Calculate description similarity (first 500 chars for performance)
  const desc1 = tour1.description?.substring(0, 500) || '';
  const desc2 = tour2.description?.substring(0, 500) || '';
  const descriptionSimilarity = calculateStringSimilarity(desc1, desc2);

  if (descriptionSimilarity >= threshold) {
    reasons.push(`Tour descriptions are ${descriptionSimilarity.toFixed(1)}% similar`);
  }

  // Calculate overall weighted score
  // Title is more important (70%), description (30%)
  const overallScore = titleSimilarity * 0.7 + descriptionSimilarity * 0.3;

  // Check if same tour guide
  if (tour1.tourGuideId === tour2.tourGuideId) {
    reasons.push('Same tour guide');
  }

  const isDuplicate = overallScore >= threshold;

  return {
    overallScore: Math.round(overallScore * 100) / 100,
    titleSimilarity: Math.round(titleSimilarity * 100) / 100,
    descriptionSimilarity: Math.round(descriptionSimilarity * 100) / 100,
    isDuplicate,
    reasons,
  };
}

/**
 * Batch check a property against a list of existing properties
 * Returns all duplicates found
 */
export function findDuplicateProperties(
  newProperty: {
    name: string;
    propertyAddress?: string | null;
    location: string;
    hostId?: number | null;
  },
  existingProperties: Array<{
    id: number;
    name: string;
    propertyAddress?: string | null;
    location: string;
    hostId?: number | null;
    status?: string;
  }>,
  threshold: number = 95
): Array<{
  propertyId: number;
  status?: string;
  similarity: PropertySimilarityResult;
}> {
  const duplicates: Array<{
    propertyId: number;
    status?: string;
    similarity: PropertySimilarityResult;
  }> = [];

  for (const existingProperty of existingProperties) {
    const similarity = compareProperties(newProperty, existingProperty, threshold);

    if (similarity.isDuplicate) {
      duplicates.push({
        propertyId: existingProperty.id,
        status: existingProperty.status,
        similarity,
      });
    }
  }

  return duplicates;
}

/**
 * Batch check a tour against a list of existing tours
 * Returns all duplicates found
 */
export function findDuplicateTours(
  newTour: {
    title: string;
    description: string;
    tourGuideId: number;
  },
  existingTours: Array<{
    id: string;
    title: string;
    description: string;
    tourGuideId: number;
    status?: string;
  }>,
  threshold: number = 95
): Array<{
  tourId: string;
  status?: string;
  similarity: TourSimilarityResult;
}> {
  const duplicates: Array<{
    tourId: string;
    status?: string;
    similarity: TourSimilarityResult;
  }> = [];

  for (const existingTour of existingTours) {
    const similarity = compareTours(newTour, existingTour, threshold);

    if (similarity.isDuplicate) {
      duplicates.push({
        tourId: existingTour.id,
        status: existingTour.status,
        similarity,
      });
    }
  }

  return duplicates;
}
