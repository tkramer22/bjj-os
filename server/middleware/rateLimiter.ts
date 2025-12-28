import rateLimit from 'express-rate-limit';
import slowDown from 'express-slow-down';
import type { Request, Response } from 'express';

// Aggressive rate limiting for Professor OS messages
export const messageLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: async (req: Request) => {
    // Get user from request (set by JWT middleware)
    const user = req.user;
    
    // Tiered limits based on subscription:
    // Paid users: 100 messages/day
    // Free/trial users: 10 messages/day
    // No user (shouldn't happen): 5 messages/day
    if (user?.subscriptionStatus === 'active' && 
        (user?.subscriptionType === 'monthly' || 
         user?.subscriptionType === 'annual' || 
         user?.subscriptionType === 'lifetime')) {
      return 100;
    } else if (user) {
      return 10;
    } else {
      return 5;
    }
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.log(`[RATE LIMIT] User ${req.user?.id || 'unknown'} hit daily message limit`);
    res.status(429).json({
      error: 'Daily message limit reached',
      message: 'You have reached your daily message limit. Upgrade to premium for 100 messages/day.',
      upgradeUrl: '/pricing',
      limit: req.user?.subscriptionStatus === 'active' ? 100 : 10
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for admin users
    if (req.user?.isAdmin === true) return true;
    
    // Skip rate limiting for test simulation users (development only)
    const testUserIds = ['c2cfc0c7-96f2-4f02-8251-bf30b8f6860a', '056cce24-8926-4f7d-a414-becd06cac54a'];
    const bodyUserId = req.body?.userId;
    if (process.env.NODE_ENV === 'development' && testUserIds.includes(bodyUserId)) {
      return true;
    }
    
    return false;
  }
});

// Slow down rapid requests (before they hit rate limit)
// TEMPORARILY DISABLED - ValidationError with express-slow-down v3
// The rate limiter above (messageLimiter) already provides adequate protection
export const messageSlowDown = (req: any, res: any, next: any) => next();

// Signup rate limiting (prevent bot signups)
// Increased from 3 to 100 per hour to avoid blocking real beta testers
export const signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 100, // 100 signups per hour per IP (increased from 3)
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.log(`[RATE LIMIT] IP ${req.ip} hit signup limit`);
    res.status(429).json({
      error: 'Too many signup attempts',
      message: 'Please wait before trying again.'
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for lifetime invites (pre-authenticated via token)
    if (req.body?.inviteToken || req.body?.token) {
      return true;
    }
    return false;
  }
});

// General API rate limiting (catch-all)
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.log(`[RATE LIMIT] IP ${req.ip} hit general API limit on ${req.path}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please slow down. Maximum 100 requests per 15 minutes.'
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for admin users
    return req.user?.isAdmin === true;
  }
});

// Video search rate limiting (prevent abuse)
export const videoSearchLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30, // 30 searches per hour
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: Request, res: Response) => {
    console.log(`[RATE LIMIT] User ${req.user?.id || req.ip} hit video search limit`);
    res.status(429).json({
      error: 'Too many searches',
      message: 'Please wait an hour before searching again.'
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for admin users
    return req.user?.isAdmin === true;
  }
});
