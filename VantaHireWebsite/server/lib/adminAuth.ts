import type { Request, Response, NextFunction } from "express";
import { isSuperAdminEnabled } from "./featureGating";

/**
 * Middleware to require super_admin role for admin endpoints.
 * Checks authentication, role, and whether super admin features are enabled.
 */
export function requireSuperAdmin() {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (req.user.role !== 'super_admin') {
      res.status(403).json({ error: 'Super admin access required' });
      return;
    }

    if (!isSuperAdminEnabled()) {
      res.status(403).json({ error: 'Super admin features are disabled' });
      return;
    }

    next();
  };
}
