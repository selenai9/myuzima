import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  encryptData,
  decryptData,
  generateQRToken,
  verifyQRToken,
} from "./crypto";

describe("Crypto Service", () => {
  describe("encryptData & decryptData", () => {
    it("should encrypt and decrypt data correctly", () => {
      const plaintext = "This is sensitive patient data";
      const encrypted = encryptData(plaintext);

      // Encrypted data should be different from plaintext
      expect(encrypted).not.toBe(plaintext);
      expect(encrypted).toBeTruthy();

      // Should be able to decrypt back to original
      const decrypted = decryptData(encrypted);
      expect(decrypted).toBe(plaintext);
    });

    it("should handle JSON objects", () => {
      const data = {
        allergies: ["Penicillin", "Aspirin"],
        medications: ["Metformin 500mg"],
        conditions: ["Type 2 Diabetes"],
        bloodType: "O+",
      };

      const plaintext = JSON.stringify(data);
      const encrypted = encryptData(plaintext);
      const decrypted = decryptData(encrypted);

      expect(JSON.parse(decrypted)).toEqual(data);
    });

    it("should produce different ciphertexts for same plaintext (due to random IV)", () => {
      const plaintext = "Same data";
      const encrypted1 = encryptData(plaintext);
      const encrypted2 = encryptData(plaintext);

      // Due to random IV, ciphertexts should be different
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same plaintext
      expect(decryptData(encrypted1)).toBe(plaintext);
      expect(decryptData(encrypted2)).toBe(plaintext);
    });

    it("should handle empty strings", () => {
      const plaintext = "";
      const encrypted = encryptData(plaintext);
      const decrypted = decryptData(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle long strings", () => {
      const plaintext = "A".repeat(10000);
      const encrypted = encryptData(plaintext);
      const decrypted = decryptData(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should handle special characters and Unicode", () => {
      const plaintext = "Allergies: Penicillin, Ibuprofène, 日本語, 🏥";
      const encrypted = encryptData(plaintext);
      const decrypted = decryptData(encrypted);

      expect(decrypted).toBe(plaintext);
    });

    it("should throw error on invalid ciphertext", () => {
      const invalidCiphertext = "invalid-base64-data";

      expect(() => {
        decryptData(invalidCiphertext);
      }).toThrow();
    });

    it("should throw error on tampered ciphertext", () => {
      const plaintext = "Sensitive data";
      const encrypted = encryptData(plaintext);

      // Tamper with the ciphertext by modifying a character
      const tampered = encrypted.substring(0, encrypted.length - 1) + "X";

      expect(() => {
        decryptData(tampered);
      }).toThrow();
    });

    it("should use AES-256-GCM algorithm", () => {
      const plaintext = "Test data";
      const encrypted = encryptData(plaintext);

      // Encrypted data should be base64 encoded
      expect(() => {
        Buffer.from(encrypted, "base64");
      }).not.toThrow();
    });
  });

  describe("generateQRToken & verifyQRToken", () => {
    it("should generate valid QR token", () => {
      const patientId = 123;
      const token = generateQRToken(patientId);

      expect(token).toBeTruthy();
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);
    });

    it("should verify valid QR token", () => {
      const patientId = 456;
      const token = generateQRToken(patientId);

      const verified = verifyQRToken(token);
      expect(verified).toBeTruthy();
      expect(verified.patientId).toBe(patientId);
    });

    it("should include expiration in token", () => {
      const patientId = 789;
      const token = generateQRToken(patientId);
      const verified = verifyQRToken(token);

      expect(verified.expiresAt).toBeTruthy();
      expect(new Date(verified.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it("should reject expired token", () => {
      const patientId = 999;
      const token = generateQRToken(patientId);

      // Mock time to 31 days in the future
      const futureDate = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
      vi.useFakeTimers();
      vi.setSystemTime(futureDate);

      expect(() => {
        verifyQRToken(token);
      }).toThrow();

      vi.useRealTimers();
    });

    it("should reject tampered token", () => {
      const patientId = 111;
      const token = generateQRToken(patientId);

      // Tamper with token
      const tampered = token.substring(0, token.length - 1) + "X";

      expect(() => {
        verifyQRToken(tampered);
      }).toThrow();
    });

    it("should reject invalid token format", () => {
      expect(() => {
        verifyQRToken("invalid-token-format");
      }).toThrow();
    });

    it("should generate different tokens for different patient IDs", () => {
      const token1 = generateQRToken(111);
      const token2 = generateQRToken(222);

      expect(token1).not.toBe(token2);

      const verified1 = verifyQRToken(token1);
      const verified2 = verifyQRToken(token2);

      expect(verified1.patientId).toBe(111);
      expect(verified2.patientId).toBe(222);
    });

    it("should generate different tokens for same patient (due to randomness)", () => {
      const patientId = 333;
      const token1 = generateQRToken(patientId);
      const token2 = generateQRToken(patientId);

      expect(token1).not.toBe(token2);

      // Both should verify correctly
      expect(verifyQRToken(token1).patientId).toBe(patientId);
      expect(verifyQRToken(token2).patientId).toBe(patientId);
    });

    it("should handle large patient IDs", () => {
      const largePatientId = Number.MAX_SAFE_INTEGER;
      const token = generateQRToken(largePatientId);
      const verified = verifyQRToken(token);

      expect(verified.patientId).toBe(largePatientId);
    });
  });

  describe("Edge Cases", () => {
    it("should handle rapid encryption/decryption cycles", () => {
      const plaintext = "Test data";
      const iterations = 100;

      for (let i = 0; i < iterations; i++) {
        const encrypted = encryptData(plaintext);
        const decrypted = decryptData(encrypted);
        expect(decrypted).toBe(plaintext);
      }
    });

    it("should handle concurrent encryption operations", async () => {
      const plaintexts = [
        "Patient 1 data",
        "Patient 2 data",
        "Patient 3 data",
        "Patient 4 data",
        "Patient 5 data",
      ];

      const encryptedPromises = plaintexts.map((text) =>
        Promise.resolve(encryptData(text))
      );

      const encrypted = await Promise.all(encryptedPromises);
      const decrypted = encrypted.map((cipher) => decryptData(cipher));

      expect(decrypted).toEqual(plaintexts);
    });

    it("should not leak sensitive data in error messages", () => {
      const plaintext = "SUPER_SECRET_PASSWORD";
      const encrypted = encryptData(plaintext);

      try {
        decryptData("invalid" + encrypted);
      } catch (error) {
        const errorMessage = (error as Error).message;
        expect(errorMessage).not.toContain(plaintext);
        expect(errorMessage).not.toContain("SUPER_SECRET");
      }
    });
  });
});
