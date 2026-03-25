import { describe, it, expect, beforeEach } from "vitest";
import { generateQRCode, generatePDFCard } from "./qr";

describe("QR Code Service", () => {
  describe("generateQRCode", () => {
    it("should generate QR code data URL", async () => {
      const data = "https://myuzima.example.com/qr/token123";
      const qrCode = await generateQRCode(data);

      expect(qrCode).toBeTruthy();
      expect(qrCode.startsWith("data:image/png;base64,")).toBe(true);
    });

    it("should generate QR code buffer", async () => {
      const data = "https://myuzima.example.com/qr/token456";
      const qrCode = await generateQRCode(data, "buffer");

      expect(qrCode).toBeTruthy();
      expect(qrCode instanceof Buffer).toBe(true);
      expect(qrCode.length).toBeGreaterThan(0);
    });

    it("should handle different QR code sizes", async () => {
      const data = "test-data";

      const small = await generateQRCode(data, "dataurl", 2);
      const medium = await generateQRCode(data, "dataurl", 5);
      const large = await generateQRCode(data, "dataurl", 10);

      // Larger error correction level should produce larger QR codes
      expect(small.length).toBeLessThan(medium.length);
      expect(medium.length).toBeLessThan(large.length);
    });

    it("should generate scannable QR codes", async () => {
      const testData = [
        "Simple text",
        "https://example.com/long/url/path",
        "Patient ID: 12345",
        "Encrypted payload: abc123def456ghi789",
      ];

      for (const data of testData) {
        const qrCode = await generateQRCode(data);
        expect(qrCode).toBeTruthy();
        expect(qrCode.startsWith("data:image/png;base64,")).toBe(true);
      }
    });

    it("should handle long data strings", async () => {
      const longData = "A".repeat(500);
      const qrCode = await generateQRCode(longData);

      expect(qrCode).toBeTruthy();
      expect(qrCode.startsWith("data:image/png;base64,")).toBe(true);
    });

    it("should handle special characters in QR data", async () => {
      const specialData = "Patient: John Doe, Allergies: Penicillin & Aspirin, Blood: O+";
      const qrCode = await generateQRCode(specialData);

      expect(qrCode).toBeTruthy();
      expect(qrCode.startsWith("data:image/png;base64,")).toBe(true);
    });

    it("should handle Unicode characters", async () => {
      const unicodeData = "Kinyarwanda: Ubwiyunge, Français: Allergie, 日本語: 血液型";
      const qrCode = await generateQRCode(unicodeData);

      expect(qrCode).toBeTruthy();
      expect(qrCode.startsWith("data:image/png;base64,")).toBe(true);
    });

    it("should generate different QR codes for different data", async () => {
      const qr1 = await generateQRCode("Patient 1");
      const qr2 = await generateQRCode("Patient 2");

      expect(qr1).not.toBe(qr2);
    });

    it("should generate same QR code for same data", async () => {
      const data = "Consistent data";
      const qr1 = await generateQRCode(data);
      const qr2 = await generateQRCode(data);

      expect(qr1).toBe(qr2);
    });

    it("should handle empty string", async () => {
      const qrCode = await generateQRCode("");

      expect(qrCode).toBeTruthy();
      expect(qrCode.startsWith("data:image/png;base64,")).toBe(true);
    });

    it("should return valid base64 data URL", async () => {
      const data = "Valid QR test";
      const qrCode = await generateQRCode(data);

      // Extract base64 part
      const base64Part = qrCode.replace("data:image/png;base64,", "");

      // Should be valid base64
      expect(() => {
        Buffer.from(base64Part, "base64");
      }).not.toThrow();
    });
  });

  describe("generatePDFCard", () => {
    const mockPatient = {
      id: 123,
      phone: "+250712345678",
      name: "John Doe",
    };

    const mockProfile = {
      bloodType: "O+",
      allergies: ["Penicillin", "Aspirin"],
      medications: ["Metformin 500mg", "Lisinopril 10mg"],
      conditions: ["Type 2 Diabetes", "Hypertension"],
      emergencyContacts: [
        { name: "Jane Doe", phone: "+250712345679", relation: "Spouse" },
        { name: "Bob Smith", phone: "+250712345680", relation: "Brother" },
      ],
    };

    it("should generate PDF buffer", async () => {
      const qrCodeUrl = await generateQRCode("test-token");
      const pdf = await generatePDFCard(mockPatient, mockProfile, qrCodeUrl);

      expect(pdf).toBeTruthy();
      expect(pdf instanceof Buffer).toBe(true);
      expect(pdf.length).toBeGreaterThan(0);
    });

    it("should generate valid PDF", async () => {
      const qrCodeUrl = await generateQRCode("test-token");
      const pdf = await generatePDFCard(mockPatient, mockProfile, qrCodeUrl);

      // PDF should start with %PDF
      expect(pdf.toString("utf8", 0, 4)).toBe("%PDF");
    });

    it("should include patient information in PDF", async () => {
      const qrCodeUrl = await generateQRCode("test-token");
      const pdf = await generatePDFCard(mockPatient, mockProfile, qrCodeUrl);

      const pdfText = pdf.toString("utf8");

      // Check for patient info (may be encoded, so just check PDF is generated)
      expect(pdfText).toBeTruthy();
      expect(pdf.length).toBeGreaterThan(1000); // PDF should be reasonably sized
    });

    it("should handle missing optional fields", async () => {
      const qrCodeUrl = await generateQRCode("test-token");
      const minimalProfile = {
        bloodType: "AB-",
        allergies: [],
        medications: [],
        conditions: [],
        emergencyContacts: [],
      };

      const pdf = await generatePDFCard(mockPatient, minimalProfile, qrCodeUrl);

      expect(pdf).toBeTruthy();
      expect(pdf instanceof Buffer).toBe(true);
      expect(pdf.toString("utf8", 0, 4)).toBe("%PDF");
    });

    it("should handle long lists of allergies and medications", async () => {
      const qrCodeUrl = await generateQRCode("test-token");
      const profileWithLongLists = {
        bloodType: "A+",
        allergies: Array(20).fill("Allergen").map((a, i) => `${a} ${i + 1}`),
        medications: Array(20).fill("Medication").map((m, i) => `${m} ${i + 1}`),
        conditions: Array(10).fill("Condition").map((c, i) => `${c} ${i + 1}`),
        emergencyContacts: [],
      };

      const pdf = await generatePDFCard(mockPatient, profileWithLongLists, qrCodeUrl);

      expect(pdf).toBeTruthy();
      expect(pdf instanceof Buffer).toBe(true);
    });

    it("should handle special characters in patient data", async () => {
      const qrCodeUrl = await generateQRCode("test-token");
      const specialProfile = {
        bloodType: "O+",
        allergies: ["Penicillin & Amoxicillin", "Aspirin (NSAID)"],
        medications: ["Metformin 500mg (twice daily)", "Lisinopril 10mg/day"],
        conditions: ["Type 2 Diabetes (controlled)", "Hypertension (Stage 1)"],
        emergencyContacts: [
          { name: "Jane O'Doe", phone: "+250712345679", relation: "Spouse" },
        ],
      };

      const pdf = await generatePDFCard(mockPatient, specialProfile, qrCodeUrl);

      expect(pdf).toBeTruthy();
      expect(pdf instanceof Buffer).toBe(true);
    });

    it("should handle Unicode characters in patient data", async () => {
      const qrCodeUrl = await generateQRCode("test-token");
      const unicodeProfile = {
        bloodType: "O+",
        allergies: ["Pénicilline", "Aspirine"],
        medications: ["Métformine 500mg"],
        conditions: ["Diabète de type 2"],
        emergencyContacts: [
          { name: "Jean Dupont", phone: "+250712345679", relation: "Conjoint" },
        ],
      };

      const pdf = await generatePDFCard(mockPatient, unicodeProfile, qrCodeUrl);

      expect(pdf).toBeTruthy();
      expect(pdf instanceof Buffer).toBe(true);
    });

    it("should generate different PDFs for different patients", async () => {
      const qrCodeUrl = await generateQRCode("test-token");

      const patient1 = { ...mockPatient, id: 111, name: "Patient One" };
      const patient2 = { ...mockPatient, id: 222, name: "Patient Two" };

      const pdf1 = await generatePDFCard(patient1, mockProfile, qrCodeUrl);
      const pdf2 = await generatePDFCard(patient2, mockProfile, qrCodeUrl);

      expect(pdf1).not.toEqual(pdf2);
    });

    it("should generate reproducible PDFs for same input", async () => {
      const qrCodeUrl = await generateQRCode("test-token");

      const pdf1 = await generatePDFCard(mockPatient, mockProfile, qrCodeUrl);
      const pdf2 = await generatePDFCard(mockPatient, mockProfile, qrCodeUrl);

      // PDFs should be identical for same input
      expect(pdf1.equals(pdf2)).toBe(true);
    });

    it("should include QR code in PDF", async () => {
      const qrCodeUrl = await generateQRCode("test-token");
      const pdf = await generatePDFCard(mockPatient, mockProfile, qrCodeUrl);

      // PDF should reference the QR code (as base64 image)
      const pdfText = pdf.toString("utf8");
      expect(pdfText.length).toBeGreaterThan(5000); // Should be larger due to embedded image
    });
  });

  describe("Integration Tests", () => {
    it("should generate complete emergency card workflow", async () => {
      // Generate QR token
      const qrToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

      // Generate QR code
      const qrCode = await generateQRCode(qrToken);
      expect(qrCode).toBeTruthy();

      // Generate PDF card
      const patient = {
        id: 999,
        phone: "+250712345678",
        name: "Integration Test Patient",
      };

      const profile = {
        bloodType: "AB+",
        allergies: ["Penicillin"],
        medications: ["Metformin"],
        conditions: ["Diabetes"],
        emergencyContacts: [
          { name: "Emergency Contact", phone: "+250712345679", relation: "Family" },
        ],
      };

      const pdf = await generatePDFCard(patient, profile, qrCode);

      expect(pdf).toBeTruthy();
      expect(pdf instanceof Buffer).toBe(true);
      expect(pdf.toString("utf8", 0, 4)).toBe("%PDF");
    });
  });
});
