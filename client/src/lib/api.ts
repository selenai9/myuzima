import axios, { AxiosInstance, AxiosError } from "axios";
import { storeAuthToken, clearAuthToken } from "./idb";

const API_BASE_URL = "/api";

// C-03: Tokens are stored in HttpOnly cookies set by the server.
// The client never reads or writes token values — that's the entire point.
// We keep a lightweight in-memory flag so the UI knows whether a session exists,
// but we NEVER put the token string into localStorage or any JS-readable store.

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
      // C-03: withCredentials ensures the HttpOnly cookie is sent on every request
      withCredentials: true,
    });

    // Response interceptor — on 401 try a silent cookie refresh, then give up
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // The refresh token is an HttpOnly cookie; we just POST to the endpoint.
            // If the cookie is valid the server rotates the access_token cookie silently.
            await axios.post(`${API_BASE_URL}/auth/refresh`, {}, { withCredentials: true });
            return this.client(originalRequest);
          } catch {
            // Refresh failed — clear the IDB token for the service worker and redirect
            await clearAuthToken();
            window.location.href = "/";
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * Patient Registration — send OTP
   */
  async patientRegister(phone: string) {
    const response = await this.client.post("/auth/register", { phone });
    return response.data;
  }

  /**
   * Verify OTP — server sets HttpOnly access_token + refresh_token cookies
   */
  async patientVerifyOTP(phone: string, code: string) {
    const response = await this.client.post("/auth/verify-otp", { phone, code });
    // C-06: Store a token indicator in IDB so the service worker can authenticate
    // background sync requests. We use a placeholder since the real token is HttpOnly.
    // The SW will send credentials:include which carries the cookie automatically;
    // the IDB value is a fallback Authorization header for non-browser clients.
    // Note: this is NOT the actual JWT — it's just a signal the session is active.
    // In a future iteration the server can return a limited-scope SW token here.
    await storeAuthToken("cookie-session-active");
    return response.data;
  }

  /**
   * Responder Login
   */
  async responderLogin(badgeId: string, pin: string) {
    const response = await this.client.post("/auth/responder/login", { badgeId, pin });
    await storeAuthToken("cookie-session-active");
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
   * H-04: Record patient consent with server timestamp (Rwanda Law 058/2021)
   */
  async recordConsent() {
    const response = await this.client.post("/patient/consent");
    return response.data;
  }

  /**
   * Download QR Card as PDF
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
   * Logout — ask server to clear the HttpOnly cookies
   */
  async logout() {
    try {
      await this.client.post("/auth/logout");
    } finally {
      // C-06: Clear IDB token so the service worker stops sending auth headers
      await clearAuthToken();
      window.location.href = "/";
    }
  }
}

export const apiClient = new APIClient();
