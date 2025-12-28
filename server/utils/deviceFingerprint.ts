/**
 * Device Fingerprinting & Account Sharing Prevention System
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * CRITICAL FEATURES:
 * - 3-Device limit enforcement
 * - Impossible travel detection
 * - Behavioral pattern analysis
 * - Automatic flagging of suspicious accounts
 */

import crypto from 'crypto';
import type { Request } from 'express';
import { db } from '../db';
import { authorizedDevices, loginEvents, flaggedAccounts, bjjUsers } from '@shared/schema';
import { eq, and, desc, gte, sql } from 'drizzle-orm';

// Device limit constants
const MAX_DEVICES_PER_USER = 3;
const IMPOSSIBLE_TRAVEL_KM_PER_HOUR = 800; // ~500 mph (air travel speed)
const SUSPICIOUS_LOGIN_THRESHOLD_HOURS = 2; // Flag if 2+ logins from different locations within 2 hours

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE FINGERPRINTING
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeviceFingerprintData {
  userAgent: string;
  acceptLanguage: string;
  acceptEncoding: string;
  ipAddress: string;
  timezone?: string; // Can be sent from client
  screenResolution?: string; // Can be sent from client
  platform?: string; // Can be sent from client
}

/**
 * Generate a stable device fingerprint from browser/device characteristics
 * Uses hash of multiple factors to create unique device identifier
 */
export function generateDeviceFingerprint(data: DeviceFingerprintData): string {
  const components = [
    data.userAgent || '',
    data.acceptLanguage || '',
    data.ipAddress || '',
    data.platform || '',
    data.screenResolution || '',
  ].join('||');
  
  return crypto.createHash('sha256').update(components).digest('hex');
}

/**
 * Extract device info from user agent
 */
export function parseUserAgent(userAgent: string): {
  browser: string;
  os: string;
  deviceType: string;
  deviceName: string;
} {
  const ua = userAgent.toLowerCase();
  
  // Detect browser
  let browser = 'Unknown';
  if (ua.includes('chrome')) browser = 'Chrome';
  else if (ua.includes('firefox')) browser = 'Firefox';
  else if (ua.includes('safari')) browser = 'Safari';
  else if (ua.includes('edge')) browser = 'Edge';
  
  // Detect OS
  let os = 'Unknown';
  if (ua.includes('windows')) os = 'Windows';
  else if (ua.includes('mac')) os = 'macOS';
  else if (ua.includes('linux')) os = 'Linux';
  else if (ua.includes('android')) os = 'Android';
  else if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) os = 'iOS';
  
  // Detect device type
  let deviceType = 'desktop';
  if (ua.includes('mobile')) deviceType = 'mobile';
  else if (ua.includes('tablet') || ua.includes('ipad')) deviceType = 'tablet';
  
  const deviceName = `${os} - ${browser}`;
  
  return { browser, os, deviceType, deviceName };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Check if user has reached device limit
 * Returns true if user can log in, false if limit exceeded
 */
export async function checkDeviceLimit(userId: string, fingerprint: string): Promise<{
  allowed: boolean;
  activeDeviceCount: number;
  isNewDevice: boolean;
  message?: string;
}> {
  // Get all active devices for user
  const activeDevices = await db.select()
    .from(authorizedDevices)
    .where(and(
      eq(authorizedDevices.userId, userId),
      eq(authorizedDevices.isActive, true)
    ));
  
  // Check if this device is already authorized
  const existingDevice = activeDevices.find(d => d.fingerprint === fingerprint);
  
  if (existingDevice) {
    // Known device - always allow
    return {
      allowed: true,
      activeDeviceCount: activeDevices.length,
      isNewDevice: false,
    };
  }
  
  // New device - check if limit exceeded
  if (activeDevices.length >= MAX_DEVICES_PER_USER) {
    return {
      allowed: false,
      activeDeviceCount: activeDevices.length,
      isNewDevice: true,
      message: `Device limit reached (${MAX_DEVICES_PER_USER} max). Remove a device in settings to continue.`,
    };
  }
  
  // New device but within limit
  return {
    allowed: true,
    activeDeviceCount: activeDevices.length,
    isNewDevice: true,
  };
}

/**
 * Register or update device on successful login
 */
export async function registerDevice(
  userId: string,
  fingerprint: string,
  deviceInfo: ReturnType<typeof parseUserAgent>,
  ipAddress: string,
  geoData?: { city?: string; country?: string }
): Promise<void> {
  // Check if device already exists
  const [existing] = await db.select()
    .from(authorizedDevices)
    .where(and(
      eq(authorizedDevices.userId, userId),
      eq(authorizedDevices.fingerprint, fingerprint)
    ))
    .limit(1);
  
  if (existing) {
    // Update existing device
    await db.update(authorizedDevices)
      .set({
        lastSeen: new Date(),
        loginCount: sql`${authorizedDevices.loginCount} + 1`,
        ipAddress,
        city: geoData?.city || existing.city,
        country: geoData?.country || existing.country,
        isActive: true,
      })
      .where(eq(authorizedDevices.id, existing.id));
  } else {
    // Create new device
    await db.insert(authorizedDevices).values({
      userId,
      fingerprint,
      deviceName: deviceInfo.deviceName,
      deviceType: deviceInfo.deviceType,
      browser: deviceInfo.browser,
      os: deviceInfo.os,
      ipAddress,
      city: geoData?.city || null,
      country: geoData?.country || null,
      loginCount: 1,
      firstSeen: new Date(),
      lastSeen: new Date(),
      isActive: true,
    });
    
    console.log(`[DEVICE] New device registered for user ${userId}: ${deviceInfo.deviceName}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// LOGIN EVENT TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Track login event for behavioral analysis
 */
export async function trackLoginEvent(
  userId: string,
  fingerprint: string,
  ipAddress: string,
  success: boolean,
  failureReason?: string,
  geoData?: { city?: string; country?: string; latitude?: number; longitude?: number }
): Promise<void> {
  await db.insert(loginEvents).values({
    userId,
    deviceFingerprint: fingerprint,
    ipAddress,
    city: geoData?.city || null,
    country: geoData?.country || null,
    latitude: geoData?.latitude?.toString() || null,
    longitude: geoData?.longitude?.toString() || null,
    success,
    failureReason: failureReason || null,
    loginTime: new Date(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BEHAVIORAL ANALYSIS & FRAUD DETECTION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Calculate distance between two coordinates (Haversine formula)
 * Returns distance in kilometers
 */
function calculateDistance(
  lat1: number, lon1: number, 
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Detect impossible travel (login from geographically distant location too quickly)
 */
export async function detectImpossibleTravel(
  userId: string,
  currentLat: number,
  currentLon: number
): Promise<{ isImpossible: boolean; details?: string }> {
  // Get recent login events with coordinates
  const recentLogins = await db.select()
    .from(loginEvents)
    .where(and(
      eq(loginEvents.userId, userId),
      eq(loginEvents.success, true),
      gte(loginEvents.loginTime, new Date(Date.now() - 24 * 60 * 60 * 1000)) // Last 24 hours
    ))
    .orderBy(desc(loginEvents.loginTime))
    .limit(5);
  
  if (recentLogins.length === 0) return { isImpossible: false };
  
  // Check most recent login
  const lastLogin = recentLogins[0];
  if (!lastLogin.latitude || !lastLogin.longitude) {
    return { isImpossible: false };
  }
  
  const lastLat = parseFloat(lastLogin.latitude);
  const lastLon = parseFloat(lastLogin.longitude);
  
  const distance = calculateDistance(lastLat, lastLon, currentLat, currentLon);
  const hoursSinceLastLogin = (Date.now() - lastLogin.loginTime.getTime()) / (1000 * 60 * 60);
  
  const speedKmPerHour = distance / hoursSinceLastLogin;
  
  if (speedKmPerHour > IMPOSSIBLE_TRAVEL_KM_PER_HOUR) {
    return {
      isImpossible: true,
      details: `Travel of ${distance.toFixed(0)}km in ${hoursSinceLastLogin.toFixed(1)}h (${speedKmPerHour.toFixed(0)} km/h) exceeds ${IMPOSSIBLE_TRAVEL_KM_PER_HOUR} km/h threshold`,
    };
  }
  
  return { isImpossible: false };
}

/**
 * Analyze login patterns for account sharing indicators
 */
export async function analyzeLoginPatterns(userId: string): Promise<{
  suspicious: boolean;
  reasons: string[];
  riskScore: number; // 0-100
}> {
  const reasons: string[] = [];
  let riskScore = 0;
  
  // Get recent login history (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentLogins = await db.select()
    .from(loginEvents)
    .where(and(
      eq(loginEvents.userId, userId),
      gte(loginEvents.loginTime, sevenDaysAgo)
    ))
    .orderBy(desc(loginEvents.loginTime));
  
  if (recentLogins.length < 3) {
    return { suspicious: false, reasons: [], riskScore: 0 };
  }
  
  // Check 1: Multiple locations in short time
  const uniqueLocations = new Set(
    recentLogins
      .filter(l => l.city)
      .map(l => `${l.city},${l.country}`)
  );
  
  if (uniqueLocations.size >= 3) {
    reasons.push(`Multiple locations: ${uniqueLocations.size} different cities in 7 days`);
    riskScore += 20;
  }
  
  // Check 2: Excessive device switching
  const uniqueDevices = new Set(
    recentLogins
      .filter(l => l.deviceFingerprint)
      .map(l => l.deviceFingerprint)
  );
  
  if (uniqueDevices.size > MAX_DEVICES_PER_USER) {
    reasons.push(`Excessive devices: ${uniqueDevices.size} different devices in 7 days`);
    riskScore += 30;
  }
  
  // Check 3: Simultaneous logins from different locations
  for (let i = 0; i < recentLogins.length - 1; i++) {
    const current = recentLogins[i];
    const next = recentLogins[i + 1];
    
    if (!current.city || !next.city) continue;
    if (current.city === next.city) continue;
    
    const timeDiff = Math.abs(current.loginTime.getTime() - next.loginTime.getTime()) / (1000 * 60); // minutes
    
    if (timeDiff < 30) { // Within 30 minutes
      reasons.push(`Simultaneous logins: ${current.city} and ${next.city} within ${timeDiff.toFixed(0)} minutes`);
      riskScore += 40;
    }
  }
  
  const suspicious = riskScore >= 50;
  
  return { suspicious, reasons, riskScore };
}

/**
 * Flag account for admin review if suspicious activity detected
 */
export async function flagAccountIfSuspicious(
  userId: string,
  reason: string,
  data?: any
): Promise<void> {
  // Check if already flagged for this reason
  const [existing] = await db.select()
    .from(flaggedAccounts)
    .where(and(
      eq(flaggedAccounts.userId, userId),
      eq(flaggedAccounts.reason, reason),
      eq(flaggedAccounts.status, 'pending')
    ))
    .limit(1);
  
  if (existing) {
    console.log(`[FRAUD] User ${userId} already flagged for: ${reason}`);
    return;
  }
  
  await db.insert(flaggedAccounts).values({
    userId,
    reason,
    data: data ? JSON.stringify(data) : null,
    status: 'pending',
  });
  
  console.log(`[FRAUD] ⚠️  User ${userId} flagged for review: ${reason}`);
}

/**
 * Run comprehensive fraud checks on login
 */
export async function runFraudChecks(
  userId: string,
  geoData?: { latitude?: number; longitude?: number }
): Promise<void> {
  // Check 1: Impossible travel
  if (geoData?.latitude && geoData?.longitude) {
    const impossibleTravel = await detectImpossibleTravel(
      userId,
      geoData.latitude,
      geoData.longitude
    );
    
    if (impossibleTravel.isImpossible) {
      await flagAccountIfSuspicious(userId, 'impossible_travel', {
        details: impossibleTravel.details,
      });
    }
  }
  
  // Check 2: Login pattern analysis
  const analysis = await analyzeLoginPatterns(userId);
  
  if (analysis.suspicious) {
    await flagAccountIfSuspicious(userId, 'suspicious_login_pattern', {
      riskScore: analysis.riskScore,
      reasons: analysis.reasons,
    });
  }
}
