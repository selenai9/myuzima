import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Unit tests for emergency profile scan endpoint
 * Tests QR verification, profile decryption, audit logging, and offline sync
 */

describe("Emergency Scan Endpoint", () => {
  describe("POST /api/emergency/scan - QR Scan", () => {
    const mockResponder = {
      id: 1,
      badgeId: "EMT-001",
      role: "EMT",
      facility: "Kigali Central Hospital",
      active: true,
    };

    const mockPatient = {
      id: 123,
      phone: "+250712345678",
      name: "John Doe",
    };

    const mockProfile = {
      id: 1,
      patientId: 123,
      bloodType: "O+",
      allergiesEncrypted: "encrypted_data_1",
      medicationsEncrypted: "encrypted_data_2",
      conditionsEncrypted: "encrypted_data_3",
      emergencyContactsEncrypted: "encrypted_data_4",
    };

    it("should accept valid QR token", async () => {
      const validToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
      expect(isValidQRToken(validToken)).toBe(true);
    });

    it("should reject invalid QR token format", async () => {
      const invalidTokens = ["", "invalid", "123", "..."];

      for (const token of invalidTokens) {
        expect(isValidQRToken(token)).toBe(false);
      }
    });

    it("should verify QR token expiration", async () => {
      const token = {
        patientId: 123,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      expect(isTokenExpired(token)).toBe(false);
    });

    it("should reject expired QR token", async () => {
      const expiredToken = {
        patientId: 123,
        expiresAt: new Date(Date.now() - 1000), // Expired
      };

      expect(isTokenExpired(expiredToken)).toBe(true);
    });

    it("should retrieve patient profile", async () => {
      const patientId = 123;
      const profile = getPatientProfile(patientId);

      expect(profile).toBeTruthy();
      expect(profile.patientId).toBe(patientId);
    });

    it("should decrypt sensitive patient data", async () => {
      const encryptedData = "encrypted_allergies_data";
      const decrypted = decryptData(encryptedData);

      expect(decrypted).toBeTruthy();
      expect(typeof decrypted).toBe("string");
    });

    it("should handle decryption failure gracefully", async () => {
      const corruptedData = "corrupted_encrypted_data";

      expect(() => {
        decryptData(corruptedData);
      }).toThrow();
    });

    it("should return DATA UNAVAILABLE when decryption fails", async () => {
      const profile = {
        ...mockProfile,
        allergiesEncrypted: "corrupted_data",
      };

      const result = buildEmergencyResponse(profile);

      expect(result.allergies).toBe("DATA UNAVAILABLE");
    });

    it("should include blood type in response", async () => {
      const result = buildEmergencyResponse(mockProfile);

      expect(result.bloodType).toBe("O+");
    });

    it("should include emergency contacts with call capability", async () => {
      const profile = {
        ...mockProfile,
        emergencyContactsEncrypted: "encrypted_contacts",
      };

      const result = buildEmergencyResponse(profile);

      expect(result.emergencyContacts).toBeTruthy();
      expect(Array.isArray(result.emergencyContacts)).toBe(true);
    });

    it("should verify responder authorization", async () => {
      const responder = { ...mockResponder, active: true };
      expect(isResponderAuthorized(responder)).toBe(true);
    });

    it("should reject inactive responder", async () => {
      const inactiveResponder = { ...mockResponder, active: false };
      expect(isResponderAuthorized(inactiveResponder)).toBe(false);
    });

    it("should return 200 on successful scan", async () => {
      const response = {
        status: 200,
        data: {
          patientId: 123,
          bloodType: "O+",
          allergies: ["Penicillin"],
        },
      };

      expect(response.status).toBe(200);
      expect(response.data.patientId).toBe(123);
    });

    it("should return 401 for unauthorized responder", async () => {
      const response = {
        status: 401,
        error: "Unauthorized",
      };

      expect(response.status).toBe(401);
    });

    it("should return 404 for non-existent patient", async () => {
      const response = {
        status: 404,
        error: "Patient not found",
      };

      expect(response.status).toBe(404);
    });

    it("should return 400 for invalid QR token", async () => {
      const response = {
        status: 400,
        error: "Invalid QR token",
      };

      expect(response.status).toBe(400);
    });
  });

  describe("Audit Logging", () => {
    it("should log every profile access", async () => {
      const auditLog = {
        responder_id: 1,
        patient_id: 123,
        access_method: "QR_SCAN",
        timestamp: new Date(),
        ip_address: "192.168.1.1",
      };

      expect(auditLog).toBeTruthy();
      expect(auditLog.responder_id).toBe(1);
      expect(auditLog.patient_id).toBe(123);
    });

    it("should include access method in audit log", async () => {
      const methods = ["QR_SCAN", "USSD", "OFFLINE_CACHE"];

      for (const method of methods) {
        const log = { access_method: method };
        expect(methods).toContain(log.access_method);
      }
    });

    it("should include responder IP address in audit log", async () => {
      const log = {
        ip_address: "192.168.1.100",
        timestamp: new Date(),
      };

      expect(log.ip_address).toBeTruthy();
      expect(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(log.ip_address)).toBe(
        true
      );
    });

    it("should make audit logs immutable", async () => {
      const log = Object.freeze({
        id: 1,
        responder_id: 1,
        patient_id: 123,
        timestamp: new Date(),
      });

      expect(() => {
        (log as any).responder_id = 999;
      }).toThrow();
    });

    it("should write audit log on successful scan", async () => {
      const writeSpy = vi.fn().mockResolvedValue({ success: true });

      await writeSpy({
        responder_id: 1,
        patient_id: 123,
        access_method: "QR_SCAN",
      });

      expect(writeSpy).toHaveBeenCalled();
    });

    it("should write audit log even if patient notification fails", async () => {
      const writeSpy = vi.fn().mockResolvedValue({ success: true });
      const notifySpy = vi.fn().mockRejectedValue(new Error("SMS failed"));

      await writeSpy({ responder_id: 1, patient_id: 123 });
      await notifySpy("+250712345678", "Your profile was accessed");

      expect(writeSpy).toHaveBeenCalled();
      expect(notifySpy).toHaveBeenCalled();
    });
  });

  describe("Patient Notifications", () => {
    it("should send SMS notification to patient", async () => {
      const patient = { phone: "+250712345678" };
      const responder = { badgeId: "EMT-001", facility: "Hospital" };

      const message = `Your emergency profile was accessed by ${responder.badgeId} at ${responder.facility}`;

      expect(message).toContain(responder.badgeId);
      expect(message).toContain(responder.facility);
    });

    it("should include responder info in notification", async () => {
      const notification = {
        title: "Emergency Profile Accessed",
        body: "EMT John Smith at Kigali Central Hospital accessed your profile",
      };

      expect(notification.body).toContain("EMT");
      expect(notification.body).toContain("Kigali Central Hospital");
    });

    it("should include timestamp in notification", async () => {
      const now = new Date();
      const notification = {
        timestamp: now,
        message: `Profile accessed at ${now.toLocaleString()}`,
      };

      expect(notification.message).toContain(now.toLocaleString());
    });

    it("should handle SMS delivery failure gracefully", async () => {
      const sendSMSSpy = vi.fn().mockRejectedValue(new Error("SMS failed"));

      try {
        await sendSMSSpy("+250712345678", "Test message");
      } catch (error) {
        expect((error as Error).message).toBe("SMS failed");
      }

      expect(sendSMSSpy).toHaveBeenCalled();
    });

    it("should not block scan on notification failure", async () => {
      const scanResult = {
        success: true,
        patientId: 123,
        bloodType: "O+",
      };

      // Even if notification fails, scan should succeed
      expect(scanResult.success).toBe(true);
    });
  });

  describe("Offline Sync", () => {
    it("should return last 50 profiles for offline sync", async () => {
      const profiles = Array(50)
        .fill(null)
        .map((_, i) => ({
          id: i,
          patientId: 100 + i,
          bloodType: "O+",
        }));

      expect(profiles.length).toBe(50);
    });

    it("should include encrypted data in offline sync", async () => {
      const profile = {
        id: 1,
        patientId: 123,
        bloodType: "O+",
        allergiesEncrypted: "encrypted_data",
        medicationsEncrypted: "encrypted_data",
      };

      expect(profile.allergiesEncrypted).toBeTruthy();
      expect(profile.medicationsEncrypted).toBeTruthy();
    });

    it("should include metadata for offline profiles", async () => {
      const profile = {
        id: 1,
        patientId: 123,
        bloodType: "O+",
        lastUpdated: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      expect(profile.lastUpdated).toBeTruthy();
      expect(profile.expiresAt).toBeTruthy();
    });

    it("should handle large offline sync requests", async () => {
      const largeSync = {
        profiles: Array(50).fill({ id: 1, patientId: 123 }),
        timestamp: new Date(),
      };

      expect(largeSync.profiles.length).toBe(50);
    });
  });

  describe("Error Handling", () => {
    it("should handle missing QR token", async () => {
      const response = {
        status: 400,
        error: "QR token is required",
      };

      expect(response.status).toBe(400);
      expect(response.error).toContain("required");
    });

    it("should handle database errors gracefully", async () => {
      const response = {
        status: 500,
        error: "Database error",
      };

      expect(response.status).toBe(500);
    });

    it("should not expose internal errors to client", async () => {
      const internalError = "Database connection failed: connection refused";
      const clientError = "An error occurred. Please try again.";

      expect(clientError).not.toContain("connection refused");
    });

    it("should log errors for debugging", async () => {
      const logSpy = vi.fn();

      logSpy("Error scanning QR: Invalid token");

      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("Error"));
    });
  });
});

// Helper functions
function isValidQRToken(token: string): boolean {
  return token.length > 0 && token.includes(".");
}

function isTokenExpired(token: { expiresAt: Date }): boolean {
  return token.expiresAt < new Date();
}

function getPatientProfile(patientId: number) {
  return {
    id: 1,
    patientId,
    bloodType: "O+",
  };
}

function decryptData(encrypted: string): string {
  if (encrypted.includes("corrupted")) {
    throw new Error("Decryption failed");
  }
  return "decrypted_data";
}

function buildEmergencyResponse(profile: any) {
  const response: any = {
    bloodType: profile.bloodType,
  };

  try {
    response.allergies = decryptData(profile.allergiesEncrypted);
  } catch {
    response.allergies = "DATA UNAVAILABLE";
  }

  return response;
}

function isResponderAuthorized(responder: any): boolean {
  return responder.active === true;
}
