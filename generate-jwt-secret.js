// Method 1: Using Node.js crypto module
const crypto = require('crypto');

// Generate a 256-bit (32 bytes) random secret
const jwtSecret = crypto.randomBytes(32).toString('hex');
console.log('JWT Secret (hex):', jwtSecret);

// Generate base64 encoded secret
const jwtSecretBase64 = crypto.randomBytes(32).toString('base64');
console.log('JWT Secret (base64):', jwtSecretBase64);

// Method 2: Generate a longer, more complex secret
const complexSecret = crypto.randomBytes(64).toString('hex');
console.log('Complex JWT Secret:', complexSecret);

// Method 3: Generate UUID-based secret (less secure, but readable)
const { v4: uuidv4 } = require('uuid');
const uuidSecret = uuidv4() + uuidv4(); // Double UUID for more entropy
console.log('UUID-based Secret:', uuidSecret);

// Method 4: Generate secret with specific character set
function generateCustomSecret(length = 64) {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let secret = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomInt(0, charset.length);
    secret += charset[randomIndex];
  }
  
  return secret;
}

console.log('Custom Secret:', generateCustomSecret());

// Method 5: One-liner for quick generation
console.log('Quick Secret:', require('crypto').randomBytes(32).toString('hex'));