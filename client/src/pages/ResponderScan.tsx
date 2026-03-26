const handleQRScan = async (qrToken: string) => {
  setLoading(true);
  setError("");

  try {
    if (online) {
      // Path A: Online - Fetch and then Cache
      const response = await apiClient.scanQRCode(qrToken);
      setProfile(response.profile);

      if (response.profile.dataAvailable) {
        await cacheProfile({
          ...response.profile,
          qrToken, // Essential for offline lookup
          lastScanned: new Date(),
        });
      }
    } else {
      // Path B: Offline - High-speed Index Lookup (From Version 1)
      const cached = await getProfileByToken(qrToken);

      if (cached) {
        setProfile({ ...cached, dataAvailable: true } as EmergencyProfile);
        toast.info(t("responder.offline_mode_active"));
      } else {
        throw new Error(t("errors.profile_not_found_offline"));
      }
    }
    setStep("view");
  } catch (err) {
    // ... error handling
  } finally {
    setLoading(false);
  }
};
