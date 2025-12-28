import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema } from 'zod';

/**
 * SQL Injection Prevention Middleware
 * 
 * SECURITY NOTES:
 * - All database queries use Drizzle ORM which automatically parameterizes queries
 * - This middleware provides additional validation layer for extra safety
 * - Blocks suspicious patterns that might indicate SQL injection attempts
 */

// Dangerous patterns that indicate potential SQL injection
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|FROM|WHERE)\b)/gi,
  /(--|;|\/\*|\*\/|xp_|sp_)/gi, // SQL comments and system procedures
  /('|"|;|\\|%|_|\*|\(|\))/g, // Special characters in suspicious combinations
];

// XSS patterns
const XSS_PATTERNS = [
  /<script[^>]*>.*?<\/script>/gi,
  /<iframe[^>]*>.*?<\/iframe>/gi,
  /javascript:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi, // Event handlers like onclick=
];

/**
 * Sanitize string input by removing dangerous characters
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return input;
  
  // Remove null bytes
  let sanitized = input.replace(/\0/g, '');
  
  // Trim whitespace
  sanitized = sanitized.trim();
  
  // Limit length to prevent DoS
  if (sanitized.length > 10000) {
    sanitized = sanitized.substring(0, 10000);
  }
  
  return sanitized;
}

/**
 * Check if string contains SQL injection patterns
 */
export function containsSQLInjection(input: string): boolean {
  if (typeof input !== 'string') return false;
  
  // Allow natural language with common contractions
  const naturalLanguagePattern = /\b(i'm|you're|we're|they're|it's|that's|what's|can't|won't|don't)\b/i;
  if (naturalLanguagePattern.test(input)) {
    // Contains common contractions - likely natural language
    return false;
  }
  
  // If input is primarily words with spaces (not SQL-like), allow it
  const words = input.split(/\s+/);
  if (words.length >= 3) {
    // Natural language has multiple words
    // SQL injection typically has commands in specific patterns
    const hasSQL = /\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION)\s+(FROM|INTO|TABLE|DATABASE)\b/gi.test(input);
    if (!hasSQL) {
      // No clear SQL commands found, likely natural language
      return false;
    }
  }
  
  // Check for dangerous SQL patterns (commands + suspicious characters together)
  const hasSQLCommand = /(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|UNION)/gi.test(input);
  const hasSuspiciousChars = /[;]|--|\*\/|xp_|sp_/g.test(input);
  
  // Only flag as SQL injection if BOTH conditions are met
  return hasSQLCommand && hasSuspiciousChars;
}

/**
 * Check if string contains XSS patterns
 */
export function containsXSS(input: string): boolean {
  if (typeof input !== 'string') return false;
  
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(input)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Validate and sanitize request body against schema
 */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate request body
      const validated = schema.parse(req.body);
      
      // Replace request body with validated data
      req.body = validated;
      
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error('[INPUT VALIDATION] Schema validation failed:', error.errors);
        return res.status(400).json({
          error: 'Invalid input',
          details: error.errors.map(e => ({
            field: e.path.join('.'),
            message: e.message
          }))
        });
      }
      
      console.error('[INPUT VALIDATION] Unexpected error:', error);
      return res.status(400).json({ error: 'Invalid input' });
    }
  };
}

/**
 * Security middleware - checks for SQL injection and XSS attempts
 */
export function securityCheck(req: Request, res: Response, next: NextFunction) {
  try {
    // Check all string values in body, query, and params
    const checkObject = (obj: any, path: string = ''): boolean => {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;
        
        if (typeof value === 'string') {
          // Check for SQL injection
          if (containsSQLInjection(value)) {
            console.warn(`[SECURITY] Potential SQL injection detected in ${currentPath}:`, value.substring(0, 100));
            return false;
          }
          
          // Check for XSS
          if (containsXSS(value)) {
            console.warn(`[SECURITY] Potential XSS detected in ${currentPath}:`, value.substring(0, 100));
            return false;
          }
        } else if (typeof value === 'object' && value !== null) {
          if (!checkObject(value, currentPath)) {
            return false;
          }
        }
      }
      return true;
    };
    
    // Check request body
    if (req.body && !checkObject(req.body, 'body')) {
      return res.status(400).json({ 
        error: 'Security check failed',
        message: 'Suspicious input detected. Please rephrase your request.'
      });
    }
    
    // Check query parameters
    if (req.query && !checkObject(req.query, 'query')) {
      return res.status(400).json({ 
        error: 'Security check failed',
        message: 'Suspicious input detected. Please rephrase your request.'
      });
    }
    
    // Check URL parameters
    if (req.params && !checkObject(req.params, 'params')) {
      return res.status(400).json({ 
        error: 'Security check failed',
        message: 'Suspicious input detected. Please rephrase your request.'
      });
    }
    
    next();
  } catch (error) {
    console.error('[SECURITY] Error in security check:', error);
    // Fail closed - block request if security check errors
    return res.status(400).json({ 
      error: 'Security check failed',
      message: 'Unable to process request'
    });
  }
}

/**
 * Sanitize all string inputs in request
 */
export function sanitizeInputs(req: Request, res: Response, next: NextFunction) {
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    } else if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    } else if (typeof obj === 'object' && obj !== null) {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  };
  
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  
  if (req.query) {
    req.query = sanitizeObject(req.query);
  }
  
  next();
}

/**
 * Combined security middleware - sanitize then check
 */
export const securityMiddleware = [sanitizeInputs, securityCheck];

/**
 * Common validation schemas
 */
export const commonSchemas = {
  userId: z.number().int().positive(),
  message: z.string().min(1).max(5000),
  email: z.string().email(),
  phoneNumber: z.string().regex(/^\+[1-9]\d{1,14}$/), // E.164 format
  username: z.string().min(3).max(20).regex(/^[a-z0-9_]+$/),
  beltLevel: z.enum(['white', 'blue', 'purple', 'brown', 'black']),
  pagination: z.object({
    page: z.number().int().min(1).default(1),
    limit: z.number().int().min(1).max(100).default(20)
  })
};
