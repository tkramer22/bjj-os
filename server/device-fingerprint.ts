import crypto from 'crypto';
import { Request } from 'express';

export interface DeviceInfo {
  fingerprint: string;
  name: string;
  type: 'mobile' | 'tablet' | 'desktop';
  userAgent: string;
  ipAddress: string;
}

/**
 * Generate a privacy-respecting device fingerprint
 * Uses IP address + User Agent hash (no browser fingerprinting APIs needed)
 */
export function generateDeviceFingerprint(req: Request): DeviceInfo {
  const userAgent = req.headers['user-agent'] || 'unknown';
  const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || 
                    req.socket.remoteAddress || 
                    'unknown';
  
  // Create fingerprint hash from IP + User Agent
  const fingerprintData = `${ipAddress}:${userAgent}`;
  const fingerprint = crypto
    .createHash('sha256')
    .update(fingerprintData)
    .digest('hex')
    .substring(0, 64);
  
  // Detect device type from user agent
  const deviceType = detectDeviceType(userAgent);
  
  // Generate friendly device name
  const deviceName = generateDeviceName(userAgent, deviceType);
  
  return {
    fingerprint,
    name: deviceName,
    type: deviceType,
    userAgent,
    ipAddress,
  };
}

function detectDeviceType(userAgent: string): 'mobile' | 'tablet' | 'desktop' {
  const ua = userAgent.toLowerCase();
  
  if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
    return 'tablet';
  }
  
  if (/mobile|iphone|ipod|blackberry|opera mini|iemobile|wpdesktop/i.test(ua)) {
    return 'mobile';
  }
  
  return 'desktop';
}

function generateDeviceName(userAgent: string, deviceType: string): string {
  const ua = userAgent.toLowerCase();
  
  // Detect OS
  let os = 'Unknown';
  if (/windows/i.test(ua)) os = 'Windows';
  else if (/mac os x/i.test(ua)) os = 'macOS';
  else if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
  else if (/android/i.test(ua)) os = 'Android';
  else if (/linux/i.test(ua)) os = 'Linux';
  
  // Detect browser
  let browser = 'Browser';
  if (/edg/i.test(ua)) browser = 'Edge';
  else if (/chrome/i.test(ua)) browser = 'Chrome';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) browser = 'Safari';
  else if (/firefox/i.test(ua)) browser = 'Firefox';
  
  return `${os} ${browser} (${deviceType})`;
}

/**
 * Generate a secure session token
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a 6-digit verification code
 */
export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
