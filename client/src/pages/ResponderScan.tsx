/**
 * REVISED RESPONDER SCAN COMPONENT
 * Handles QR scanning, Offline/Online state, and local caching.
 */

// ... (imports remain the same)

export default function ResponderScan() {
  // ... (states and effects remain the same)

  /**
   * Main Handler for QR Scan results
   * Logic: Try Online first (to get latest data), Fallback to Offline cache.
   */
  const handleQRScan = async (qrToken: string) => {
    setLoading(true);
    setError("");

    try {
      if (online) {
        // 1. ONLINE MODE: Fetch fresh data from the server
        const response = await apiClient.scanQRCode(qrToken);
        setProfile(response.profile);

        // 2. CACHING: Store the profile locally for future offline use
        // We now explicitly include the qrToken so we can find it later without internet
        if (response.profile.dataAvailable) {
          const profileWithTimestamp = {
            ...response.profile,
            qrToken: qrToken, // Explicitly save the token used to find this profile
            lastScanned: new Date(),
          };
          await cacheProfile(profileWithTimestamp);
        }
      } else {
        // 3. OFFLINE MODE: Search the local IndexedDB cache
        const cachedProfiles = await getAllCachedProfiles();
        
        // REVISED: Match against the specific qrToken string instead of the profile ID
        const found = cachedProfiles.find((p) => p.qrToken === qrToken);

        if (found) {
          // Map cached data back to the profile view
          setProfile({ ...found, dataAvailable: true } as EmergencyProfile);
        } else {
          // If not in cache and no internet, we cannot help the responder
          throw new Error(t("errors.profile_not_found"));
        }
      }

      setStep("view");
    } catch (err) {
      const message = err instanceof Error ? err.message : t("errors.network_error");
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  // ... (Return and UI components remain the same)
}
