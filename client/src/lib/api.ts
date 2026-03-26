import axios, { AxiosInstance, AxiosError } from "axios";
// Keep IndexedDB for offline decryption support (Service Worker)
import { storeAuthToken, getAuthToken, clearProfileCache } from "./idb";

const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:3000/api";

interface TokenPayload {
  type: "patient" | "responder";
  id: string;
  phone?: string;
  badgeId?: string;
  role?: string;
}

class APIClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
      // C-03: Required to send/receive HttpOnly cookies automatically
      withCredentials: true,
    });

    // Response interceptor for token refresh and IDB synchronization
    this.client.interceptors.response.use(
      (response) => {
        // If the server returns a new token in the body (as a fallback or for SW), store it in IDB
        if (response.data.accessToken) {
          storeAuthToken(response.data.accessToken);
        }
        return response;
      },
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // If 401, attempt to refresh the cookie automatically
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // The refresh cookie is sent automatically by the browser
            const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
            
            if (response.data.accessToken) {
              await storeAuthToken(response.data.accessToken);
            }
            
            return this.client(originalRequest);
          } catch (refreshError) {
            await this.logout();
            window.location.href = "/";
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Patient Registration
   */
  async patientRegister(phone: string) {
    const response = await this.client.post("/auth/register", { phone });
    return response.data;
  }

  /**
   * Patient OTP Verification
   * On success, server sets HttpOnly cookies
   */
  async patientVerifyOTP(phone: string, code: string) {
    const response = await this.client.post("/auth/verify-otp", { phone, code });
    if (response.data.accessToken) {
      await storeAuthToken(response.data.accessToken);
    }
    return response.data;
  }

  /**
   * H-04: Record Patient Consent
   */
  async recordConsent() {
    const response = await this.client.post("/patient/consent");
    return response.data;
  }

  /**
   * Responder Login
   */
  async responderLogin(badgeId: string, pin: string) {
    const response = await this.client.post("/auth/responder/login", { badgeId, pin });
    if (response.data.accessToken) {
      await storeAuthToken(response.data.accessToken);
    }
    return response.data;
  }

  /**
   * Create Emergency Profile
   */
  async createEmergencyProfile(profileData: any) {
    const response = await this.client.post("/patient/profile", profileData);
    return response.data;
  }

  /**
   * Update Emergency Profile
   */
  async updateEmergencyProfile(profileData: any) {
    const response = await this.client.put("/patient/profile", profileData);
    return response.data;
  }

  /**
   * Get Emergency Profile
   */
  async getEmergencyProfile() {
    const response = await this.client.get("/patient/profile");
    return response.data;
  }

  /**
   * Download QR Card
   */
  async downloadQRCard() {
    const response = await this.client.get("/patient/qr", {
      responseType: "blob",
    });
    return response.data;
  }

  /**
   * Scan QR Code
   */
  async scanQRCode(qrToken: string) {
    const response = await this.client.post("/emergency/scan", { qrToken });
    return response.data;
  }

  /**
   * Sync Offline Audit Logs
   */
  async syncOfflineAuditLogs(logs: any[]) {
    const response = await this.client.post("/emergency/audit/log", { logs });
    return response.data;
  }

  /**
   * Get Offline Sync Profiles
   */
  async getOfflineSyncProfiles() {
    const response = await this.client.get("/emergency/offline-sync");
    return response.data;
  }

  /**
   * Get Audit Logs (Admin)
   */
  async getAuditLogs(filters?: any) {
    const response = await this.client.get("/admin/audit-logs", { params: filters });
    return response.data;
  }

  /**
   * Get Admin Stats
   */
  async getAdminStats() {
    const response = await this.client.get("/admin/stats");
    return response.data;
  }

  /**
   * Add Responder (Admin)
   */
  async addResponder(responderData: any) {
    const response = await this.client.post("/admin/responder", responderData);
    return response.data;
  }

  /**
   * Deactivate Responder (Admin)
   */
  async deactivateResponder(responderId: string) {
    const response = await this.client.delete(`/admin/responder/${responderId}`);
    return response.data;
  }

  /**
   * Logout
   * Clears cookies on server and wipes local medical cache
   */
  async logout() {
    try {
      await this.client.post("/auth/logout");
    } finally {
      await storeAuthToken(""); // Clear IDB
      await clearProfileCache(); // Security: Wipe medical cache
    }
  }

  /**
   * Check Auth Status
   * Since cookies are invisible to JS, we call a 'me' endpoint to see who we are
   */
  async getAuthState(): Promise<TokenPayload | null> {
    try {
      const response = await this.client.get("/auth/me");
      return response.data.user;
    } catch {
      return null;
    }
  }

  /**
   * Simple check if session is likely active based on IDB
   */
  async isAuthenticated() {
    const token = await getAuthToken();
    return !!token;
  }
}

export const apiClient = new APIClient();
