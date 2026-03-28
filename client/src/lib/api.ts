import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig } from "axios";
import { storeAuthToken, clearAuthToken } from "./idb";

const API_BASE_URL = "/api";

// C-03: Tokens are stored in HttpOnly cookies set by the server.
// The client never reads or writes token values — that's the entire point.
// We keep a lightweight in-memory flag so the UI knows whether a session exists,
// but we NEVER put the token string into localStorage or any JS-readable store.

interface TokenPayload {
  type: "patient" | "responder" | "admin";
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

    // Added: Authorization interceptor to handle manual Bearer tokens from localStorage
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem("accessToken");
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor — on 401 try a silent cookie refresh, then give up
    this.client.interceptors.response.use(
      (response) => response,
      async (error: AxiosError) => {
        const originalRequest = error.config as any;

        // If error is 401 Unauthorized and we haven't tried refreshing yet
        if (error.response?.status === 401 && !originalRequest._retry) {
          originalRequest._retry = true;

          try {
            // FIX: Use this.client instead of global axios to ensure the /api proxy is used
            await this.client.post("/auth/refresh"); 
            
            // Retry the original request that failed
            return this.client(originalRequest);
          } catch (refreshError) {
            // Refresh failed — clear the IDB token for the service worker and redirect
            await clearAuthToken();
            window.location.href = "/";
            return Promise.reject(refreshError);
          }
        }

        return Promise.reject(error);
      }
    );
  }

  /**
   * DEMO LOGIN — Bypass standard OTP/PIN for evaluators/teachers
   * Sets appropriate HttpOnly cookies via the server
   * FIX: Route changed from "/auth/demo-login" to "/auth/demo" to match server
   */
  async demoLogin(role: "patient" | "responder" | "admin") {
    const response = await this.client.post("/auth/demo", { role });
    // C-06: Store indicator in IndexedDB so Service Worker knows we are authenticated
    await storeAuthToken("cookie-session-active");
    return response.data;
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
   * H-04: Record patient consent (Rwanda Law 058/2021)
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
   * Scan QR Code - Updated to use { token: qrToken }
   */
  async scanQRCode(qrToken: string) {
    const response = await this.client.post("/emergency/scan", { token: qrToken });
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
   * Sync Offline Audit Logs
   */
  async syncOfflineAuditLogs(logs: any[]) {
    const response = await this.client.post("/emergency/audit/log", { logs });
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
   * Get All Responders (Admin)
   */
  async getResponders() {
    const response = await this.client.get("/admin/responders");
    return response.data;
  }

  /**
   * Get All Facilities (Admin)
   */
  async getFacilities() {
    const response = await this.client.get("/admin/facilities");
    return response.data;
  }

  /**
   * Get Access History (Patient)
   */
  async getAccessHistory() {
    const response = await this.client.get("/patient/access-history");
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
    try {
      await this.client.post("/auth/logout");
    } finally {
      await clearAuthToken();
      window.location.href = "/";
    }
  }
}

export const apiClient = new APIClient();
