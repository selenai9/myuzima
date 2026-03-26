import axios, { AxiosInstance, AxiosError } from "axios";
// NEW: Import our IndexedDB helpers to persist tokens for offline use
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
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      headers: {
        "Content-Type": "application/json",
      },
    });

    // Add request interceptor to include auth token
    this.client.interceptors.request.use(
      (config) => {
        if (this.accessToken) {
          config.headers.Authorization = `Bearer ${this.accessToken}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Add response interceptor to handle token refresh
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        if (error.response?.status === 401 && this.refreshToken && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
              refreshToken: this.refreshToken,
            });

            // Persist the new token to IndexedDB after a successful refresh
            await this.setTokens(response.data.accessToken, this.refreshToken);
            
            originalRequest.headers.Authorization = `Bearer ${this.accessToken}`;
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

    // Initial load of tokens from storage
    this.loadTokens();
  }

  private async setTokens(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    await storeAuthToken(accessToken);
    localStorage.setItem("refreshToken", refreshToken);
    localStorage.setItem("accessToken", accessToken); // Added for loadTokens consistency
  }

  private async loadTokens() {
    this.accessToken = await getAuthToken() || localStorage.getItem("accessToken");
    this.refreshToken = localStorage.getItem("refreshToken");
  }

  private async clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
    await storeAuthToken(""); 
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("accessToken");
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
   */
  async patientVerifyOTP(phone: string, code: string) {
    const response = await this.client.post("/auth/verify-otp", { phone, code });
    if (response.data.accessToken && response.data.refreshToken) {
      await this.setTokens(response.data.accessToken, response.data.refreshToken);
    }
    return response.data;
  }

  /**
   * NEW: Record Patient Consent (H-04 Compliance)
   * This is called in PatientRegister.tsx after OTP success.
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
    if (response.data.accessToken && response.data.refreshToken) {
      await this.setTokens(response.data.accessToken, response.data.refreshToken);
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
   */
  async logout() {
    await this.clearTokens();
    await clearProfileCache(); 
  }

  /**
   * Get current auth state via JWT decoding
   */
  getAuthState() {
    if (!this.accessToken) return null;

    try {
      const parts = this.accessToken.split(".");
      if (parts.length !== 3) return null;

      const payload = JSON.parse(atob(parts[1]));
      return payload as TokenPayload;
    } catch {
      return null;
    }
  }

  /**
   * Check if authenticated
   */
  isAuthenticated() {
    return !!this.accessToken;
  }
}

export const apiClient = new APIClient();
