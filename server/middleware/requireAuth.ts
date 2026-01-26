import jwt from 'jsonwebtoken';
import type { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { authorizedDevices, bjjUsers } from '../../shared/schema';
import { eq, and } from 'drizzle-orm';

// Track activity updates - only update once per minute per user to reduce DB load
const lastActivityUpdates = new Map<string, number>();
const ACTIVITY_UPDATE_INTERVAL = 60000; // 1 minute

const JWT_SECRET = process.env.SESSION_SECRET || 'your-secret-key';

/**
 * JWT Authentication Middleware
 * 
 * Verifies sessionToken cookie or Bearer token and attaches userId to req.user
 * Validates device fingerprint when present for security
 * Returns 401 if token is missing or invalid
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
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
    
    // SECURITY: Validate device fingerprint when present
    if (decoded.deviceFingerprint) {
      const [device] = await db.select({
        id: authorizedDevices.id,
        isActive: authorizedDevices.isActive,
      })
        .from(authorizedDevices)
        .where(and(
          eq(authorizedDevices.userId, decoded.userId),
          eq(authorizedDevices.fingerprint, decoded.deviceFingerprint)
        ))
        .limit(1);
      
      // Block if device exists but is explicitly deactivated
      if (device && !device.isActive) {
        console.log(`[requireAuth] ⚠️ Blocked revoked device: ${decoded.userId}`);
        return res.status(403).json({ 
          error: "Device access revoked. Please log in again.",
          deviceRevoked: true
        });
      }
    }
    
    // Attach user info to request
    req.user = { userId: decoded.userId };
    
    // Track user activity - non-blocking, throttled to once per minute
    const now = Date.now();
    const lastUpdate = lastActivityUpdates.get(decoded.userId) || 0;
    if (now - lastUpdate > ACTIVITY_UPDATE_INTERVAL) {
      lastActivityUpdates.set(decoded.userId, now);
      // Update lastLogin in background - don't await
      db.update(bjjUsers)
        .set({ lastLogin: new Date() })
        .where(eq(bjjUsers.id, decoded.userId))
        .catch((err: any) => console.error('[requireAuth] Activity tracking error:', err.message));
    }
    
    console.log('[requireAuth] ✅ Authenticated user:', decoded.userId);
    next();
    
  } catch (error: any) {
    console.error('[requireAuth] ❌ JWT verification failed:', error.message);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}
