// Fixed version with corrected scrambling algorithm
interface EncoderConfig {
  saltLength: number;
  iterations: number;
  includeChecksum: boolean;
  customKey?: string;
}

const DEFAULT_CONFIG: EncoderConfig = {
  saltLength: 8,
  iterations: 3,
  includeChecksum: true,
  customKey: 'SecureKey2024'
};

const generateSalt = (length: number): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const xorCipher = (text: string, key: string): string => {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
    result += String.fromCharCode(charCode);
  }
  return result;
};

const calculateChecksum = (data: string): string => {
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data.charCodeAt(i) * (i + 1);
  }
  return (sum % 9973).toString(36);
};

// FIXED: Improved scrambling algorithm that's truly reversible
const improvedScramble = (text: string, salt: string): string => {
  const chars = text.split('');
  const saltChars = salt.split('');
  
  // Create deterministic permutation based on salt
  const permutation = Array.from({length: chars.length}, (_, i) => i);
  
  // Shuffle permutation based on salt
  for (let i = 0; i < permutation.length; i++) {
    const saltIndex = i % saltChars.length;
    const swapIndex = (i + saltChars[saltIndex].charCodeAt(0)) % permutation.length;
    [permutation[i], permutation[swapIndex]] = [permutation[swapIndex], permutation[i]];
  }
  
  // Apply permutation
  const scrambled = new Array(chars.length);
  for (let i = 0; i < chars.length; i++) {
    scrambled[permutation[i]] = chars[i];
  }
  
  // Simple character transformation
  return scrambled.map((char, i) => {
    if (i % 2 === 1) {
      return String.fromCharCode((char.charCodeAt(0) + 13) % 256);
    }
    return char;
  }).join('');
};

const improvedUnscramble = (text: string, salt: string): string => {
  const chars = text.split('');
  const saltChars = salt.split('');
  
  // Reverse character transformation
  const unTransformed = chars.map((char, i) => {
    if (i % 2 === 1) {
      return String.fromCharCode((char.charCodeAt(0) - 13 + 256) % 256);
    }
    return char;
  });
  
  // Recreate the same permutation
  const permutation = Array.from({length: chars.length}, (_, i) => i);
  
  for (let i = 0; i < permutation.length; i++) {
    const saltIndex = i % saltChars.length;
    const swapIndex = (i + saltChars[saltIndex].charCodeAt(0)) % permutation.length;
    [permutation[i], permutation[swapIndex]] = [permutation[swapIndex], permutation[i]];
  }
  
  // Create reverse permutation
  const reversePermutation = new Array(permutation.length);
  for (let i = 0; i < permutation.length; i++) {
    reversePermutation[permutation[i]] = i;
  }
  
  // Apply reverse permutation
  const unscrambled = new Array(chars.length);
  for (let i = 0; i < chars.length; i++) {
    unscrambled[reversePermutation[i]] = unTransformed[i];
  }
  
  return unscrambled.join('');
};

const toUrlSafeBase64 = (str: string): string => {
  try {
    // Convert to bytes first to handle binary data properly
    const bytes = Array.from(str).map(char => char.charCodeAt(0));
    const binaryString = String.fromCharCode(...bytes);
    return btoa(binaryString)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  } catch (error) {
    throw new Error('Failed to encode to Base64');
  }
};

const fromUrlSafeBase64 = (str: string): string => {
  try {
    let padded = str.replace(/-/g, '+').replace(/_/g, '/');
    while (padded.length % 4) {
      padded += '=';
    }
    const binaryString = atob(padded);
    return Array.from(binaryString).map(char => String.fromCharCode(char.charCodeAt(0))).join('');
  } catch (error) {
    throw new Error('Failed to decode from Base64');
  }
};

export const encodeId = (
  id: number | string, 
  config: Partial<EncoderConfig> = {}
): string => {
  try {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    const idStr = String(id);
    
    const salt = generateSalt(finalConfig.saltLength);
    const metadata = `${idStr.length}:${Date.now() % 100000}`;
    const dataWithMeta = `${idStr}|${metadata}`;
    
    let processData = dataWithMeta;
    if (finalConfig.includeChecksum) {
      const checksum = calculateChecksum(dataWithMeta);
      processData = `${dataWithMeta}#${checksum}`;
    }
    
    let encoded = processData;
    for (let i = 0; i < finalConfig.iterations; i++) {
      encoded = xorCipher(encoded, finalConfig.customKey + salt);
      encoded = improvedScramble(encoded, salt + i);
    }
    
    const combined = `${salt}${encoded}`;
    return toUrlSafeBase64(combined);
    
  } catch (error) {
    console.error('Error encoding ID:', error);
    throw new Error('Failed to encode ID');
  }
};

export const decodeId = (
  encodedId: string, 
  config: Partial<EncoderConfig> = {}
): string | null => {
  try {
    const finalConfig = { ...DEFAULT_CONFIG, ...config };
    
    const combined = fromUrlSafeBase64(encodedId);
    const salt = combined.substring(0, finalConfig.saltLength);
    let encoded = combined.substring(finalConfig.saltLength);
    
    for (let i = finalConfig.iterations - 1; i >= 0; i--) {
      encoded = improvedUnscramble(encoded, salt + i);
      encoded = xorCipher(encoded, finalConfig.customKey + salt);
    }
    
    if (finalConfig.includeChecksum) {
      const parts = encoded.split('#');
      if (parts.length !== 2) return null;
      
      const [dataWithMeta, checksum] = parts;
      const calculatedChecksum = calculateChecksum(dataWithMeta);
      
      if (checksum !== calculatedChecksum) {
        console.warn('Checksum validation failed');
        return null;
      }
      
      encoded = dataWithMeta;
    }
    
    const mainParts = encoded.split('|');
    if (mainParts.length !== 2) return null;
    
    const [originalId, metadata] = mainParts;
    const [lengthStr] = metadata.split(':');
    const expectedLength = parseInt(lengthStr);
    
    if (originalId.length !== expectedLength) {
      console.warn('Length validation failed');
      return null;
    }
    
    return originalId;
    
  } catch (error) {
    console.error('Error decoding ID:', error);
    return null;
  }
};

// Test function to verify encoding/decoding works
export const testEncoder = () => {
  const testIds = ['123', '456789', 'abc123', '999999'];
  
  console.log('Testing encoder...');
  for (const testId of testIds) {
    try {
      const encoded = encodeId(testId);
      const decoded = decodeId(encoded);
      console.log(`ID: ${testId} -> Encoded: ${encoded} -> Decoded: ${decoded} -> Match: ${testId === decoded}`);
    } catch (error) {
      console.error(`Failed for ID ${testId}:`, error);
    }
  }
};