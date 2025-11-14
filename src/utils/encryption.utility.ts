import * as crypto from 'crypto';
import config from '../config/config';

/**
 * Encryption Utility for securing sensitive credentials
 * Uses AES-256-GCM for encryption with authentication
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const TAG_POSITION = SALT_LENGTH + IV_LENGTH;
const ENCRYPTED_POSITION = TAG_POSITION + TAG_LENGTH;

export class EncryptionService {
  private encryptionKey: Buffer;

  constructor() {
    // Get encryption key from environment or config
    const key = process.env.ENCRYPTION_KEY || config.security.encryptionKey;

    if (!key) {
      throw new Error('ENCRYPTION_KEY is not set in environment variables');
    }

    // Derive a 32-byte key from the provided key
    this.encryptionKey = crypto.scryptSync(key, 'salt', 32);
  }

  /**
   * Encrypt sensitive data
   * @param data - Plain text data to encrypt
   * @returns Encrypted string with salt, IV, auth tag, and encrypted data
   */
  encrypt(data: string): string {
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(SALT_LENGTH);
      const iv = crypto.randomBytes(IV_LENGTH);

      // Derive key from password and salt
      const key = crypto.scryptSync(this.encryptionKey, salt, 32);

      // Create cipher
      const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

      // Encrypt the data
      const encrypted = Buffer.concat([
        cipher.update(data, 'utf8'),
        cipher.final(),
      ]);

      // Get authentication tag
      const tag = cipher.getAuthTag();

      // Combine salt + IV + tag + encrypted data
      const result = Buffer.concat([salt, iv, tag, encrypted]);

      // Return as base64 string
      return result.toString('base64');
    } catch (error: any) {
      console.error('Encryption error:', error.message);
      throw new Error(`Failed to encrypt data: ${error.message}`);
    }
  }

  /**
   * Decrypt encrypted data
   * @param encryptedData - Encrypted string (base64)
   * @returns Decrypted plain text
   */
  decrypt(encryptedData: string): string {
    try {
      // Convert from base64
      const buffer = Buffer.from(encryptedData, 'base64');

      // Extract salt, IV, tag, and encrypted data
      const salt = buffer.subarray(0, SALT_LENGTH);
      const iv = buffer.subarray(SALT_LENGTH, TAG_POSITION);
      const tag = buffer.subarray(TAG_POSITION, ENCRYPTED_POSITION);
      const encrypted = buffer.subarray(ENCRYPTED_POSITION);

      // Derive key from password and salt
      const key = crypto.scryptSync(this.encryptionKey, salt, 32);

      // Create decipher
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);

      // Decrypt the data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);

      return decrypted.toString('utf8');
    } catch (error: any) {
      console.error('Decryption error:', error.message);
      throw new Error(`Failed to decrypt data: ${error.message}`);
    }
  }

  /**
   * Encrypt an object (converts to JSON then encrypts)
   * @param obj - Object to encrypt
   * @returns Encrypted string
   */
  encryptObject<T>(obj: T): string {
    const jsonString = JSON.stringify(obj);
    return this.encrypt(jsonString);
  }

  /**
   * Decrypt to an object
   * @param encryptedData - Encrypted string
   * @returns Decrypted object
   */
  decryptObject<T>(encryptedData: string): T {
    const jsonString = this.decrypt(encryptedData);
    return JSON.parse(jsonString) as T;
  }

  /**
   * Hash a string (one-way, for comparison)
   * @param data - Data to hash
   * @returns Hash string
   */
  hash(data: string): string {
    return crypto
      .createHash('sha256')
      .update(data)
      .digest('hex');
  }

  /**
   * Compare a plain text with a hash
   * @param data - Plain text data
   * @param hash - Hash to compare against
   * @returns True if match
   */
  compareHash(data: string, hash: string): boolean {
    const dataHash = this.hash(data);
    return crypto.timingSafeEqual(
      Buffer.from(dataHash),
      Buffer.from(hash)
    );
  }

  /**
   * Generate a random secure token
   * @param length - Length of token in bytes (default: 32)
   * @returns Random token as hex string
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Mask sensitive data for display (shows only last 4 characters)
   * @param data - Data to mask
   * @param visibleChars - Number of visible characters at end (default: 4)
   * @returns Masked string
   */
  maskSensitiveData(data: string, visibleChars: number = 4): string {
    if (!data || data.length <= visibleChars) {
      return '***';
    }
    const masked = '*'.repeat(data.length - visibleChars);
    const visible = data.slice(-visibleChars);
    return masked + visible;
  }
}

// Export singleton instance
export const encryptionService = new EncryptionService();

// Export helper functions
export const encrypt = (data: string) => encryptionService.encrypt(data);
export const decrypt = (data: string) => encryptionService.decrypt(data);
export const encryptObject = <T>(obj: T) => encryptionService.encryptObject(obj);
export const decryptObject = <T>(data: string) => encryptionService.decryptObject<T>(data);
export const hash = (data: string) => encryptionService.hash(data);
export const compareHash = (data: string, hash: string) => encryptionService.compareHash(data, hash);
export const generateToken = (length?: number) => encryptionService.generateToken(length);
export const maskSensitiveData = (data: string, visibleChars?: number) => encryptionService.maskSensitiveData(data, visibleChars);
