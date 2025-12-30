import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';

const JWT_SECRET = process.env.SESSION_SECRET || 'your-secret-key';

/**
 * JWT Authentication Middleware
 * 
 * Verifies sessionToken cookie and attaches userId to req.user
 * Returns 401 if token is missing or invalid
 */
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    // Read token from cookie (cookie-based JWT auth) or Authorization header (mobile apps)
    let token = req.cookies.sessionToken;
    
    // Fallback to Authorization header for mobile apps where cookies don't work
    if (!token) {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
        console.log('[requireAuth] Using Bearer token from Authorization header');
      }
    }
    
    if (!token) {
      console.log('[requireAuth] No sessionToken cookie or Authorization header found');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verify JWT token
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    
    // Attach user info to request
    req.user = { userId: decoded.userId };
    
    console.log('[requireAuth] ✅ Authenticated user:', decoded.userId);
    next();
    
  } catch (error: any) {
    console.error('[requireAuth] ❌ JWT verification failed:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
