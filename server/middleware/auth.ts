/**
 * Responder Guard
 * Ensures the user has a responder role and is currently active.
 * Skips DB lookups when running in Demo Mode.
 */
export const responderAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = req.user;

  // 1. Basic Role Check
  if (!user || user.role !== "responder") {
    return res.status(403).json({ error: "Responder access required" });
  }

  // 2. Demo Mode Bypass
  if (isDemoMode()) {
    // Check against mockStore instead of the database
    const demoResponder = mockStore.respondersByBadge.get(user.badgeId || "");
    
    // Check for explicit demo ID or a valid mock responder
    if (user.id === "responder-demo-1" || (demoResponder && demoResponder.isActive)) {
      req.responder = demoResponder || { 
        id: user.id, 
        name: user.name, 
        isActive: true 
      };
      return next(); // Exit early and move to the controller
    }
    
    return res.status(403).json({ error: "Responder account inactive (Demo)" });
  }

  // 3. Production Database Check
  try {
    const responder = await getResponderById(user.id);
    
    if (!responder || !responder.isActive) {
      return res.status(403).json({ error: "Responder inactive or not found" });
    }

    req.responder = responder;
    next();
  } catch (error) {
    console.error("Database Auth Error:", error);
    res.status(500).json({ error: "Internal server error during authentication" });
  }
};
