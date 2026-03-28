import crypto from "crypto";

/**
 * AES-256-GCM encryption service for sensitive patient medical data
 * All patient PII (allergies, medications, conditions, contacts, blood type) is encrypted
 * at the application layer before database write.
 *
 * Encryption key is stored in environment variable ENCRYPTION_KEY (never in source code)
 * Key must be 32 bytes (256 bits) for AES-256
 */

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits for GCM

// FIXED: Lazy initialization to prevent crash at module load when ENCRYPTION_KEY is not yet set
let _keyBuffer: Buffer | null = null;

function getKeyBuffer(): Buffer {
  if (_keyBuffer) return _keyBuffer;

  const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
  if (!ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY environment variable is required for AES-256-GCM encryption");
  }

  _keyBuffer = Buffer.from(ENCRYPTION_KEY, "hex");
  if (_keyBuffer.length !== 32) {
    throw new Error(`ENCRYPTION_KEY must be 32 bytes (256 bits), got ${_keyBuffer.length} bytes`);
  }
  return _keyBuffer;
}

/**
 * Encrypt sensitive data using AES-256-GCM
 * Returns: iv + authTag + ciphertext (all base64 encoded and concatenated)
 * Format: base64(iv):base64(authTag):ciphertext(hex)
 */
export function encryptData(plaintext: string | object): string {
  try {
    const keyBuffer = getKeyBuffer();
    const data = typeof plaintext === "string" ? plaintext : JSON.stringify(plaintext);
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

    let encrypted = cipher.update(data, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Combine: iv:authTag:ciphertext (all base64)
    const combined = `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted}`;
    return combined;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Decrypt sensitive data using AES-256-GCM
 * Expects format: base64(iv):base64(authTag):ciphertext(hex)
 */
export function decryptData(encrypted: string): string {
  try {
    const keyBuffer = getKeyBuffer();
    const parts = encrypted.split(":");
    if (parts.length !== 3) {
      throw new Error("Invalid encrypted data format: expected iv:authTag:ciphertext");
    }

    const [ivBase64, authTagBase64, ciphertextHex] = parts;
    const iv = Buffer.from(ivBase64, "base64");
    const authTag = Buffer.from(authTagBase64, "base64");

    if (iv.length !== IV_LENGTH) {
      throw new Error(`Invalid IV length: expected ${IV_LENGTH}, got ${iv.length}`);
    }
    if (authTag.length !== AUTH_TAG_LENGTH) {
      throw new Error(`Invalid auth tag length: expected ${AUTH_TAG_LENGTH}, got ${authTag.length}`);
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Decrypt and parse JSON data
 */
export function decryptJSON<T = unknown>(encrypted: string): T {
  const decrypted = decryptData(encrypted);
  return JSON.parse(decrypted) as T;
}

/**
 * Generate encrypted QR payload token
 * This is a reference token that the server can decrypt to identify the profile
 * Format: profileId:timestamp:randomNonce (encrypted)
 */
export function generateQRPayloadToken(profileId: string): string {
  const timestamp = Date.now();
  const nonce = crypto.randomBytes(16).toString("hex");
  const payload = `${profileId}:${timestamp}:${nonce}`;
  return encryptData(payload);
}

/**
 * Verify and extract profileId from QR payload token
 */
export function verifyQRPayloadToken(token: string): { profileId: string; timestamp: number } {
  const payload = decryptData(token);
  const [profileId, timestampStr] = payload.split(":");

  if (!profileId || !timestampStr) {
    throw new Error("Invalid QR payload token format");
  }

  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    throw new Error("Invalid timestamp in QR payload token");
  }

  // Tokens valid for 30 days
  const tokenAgeMs = Date.now() - timestamp;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  if (tokenAgeMs > thirtyDaysMs) {
    throw new Error("QR token has expired");
  }

  return { profileId, timestamp };
}
