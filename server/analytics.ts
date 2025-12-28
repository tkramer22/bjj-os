import { Router } from 'express';
import { db } from './db';
import { pageViews } from '@shared/schema';
import geoip from 'geoip-lite';
import crypto from 'crypto';
import { sql, desc, gte, eq, and } from 'drizzle-orm';

const router = Router();

// Hash IP for privacy (don't store raw IPs)
function hashIP(ip: string): string {
  const salt = process.env.IP_SALT || 'bjjos-salt-2025';
  return crypto.createHash('sha256').update(ip + salt).digest('hex').substr(0, 16);
}

// USA state mapping
const usaStates: Record<string, string> = {
  'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas',
  'CA': 'California', 'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware',
  'FL': 'Florida', 'GA': 'Georgia', 'HI': 'Hawaii', 'ID': 'Idaho',
  'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa', 'KS': 'Kansas',
  'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
  'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi',
  'MO': 'Missouri', 'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada',
  'NH': 'New Hampshire', 'NJ': 'New Jersey', 'NM': 'New Mexico', 'NY': 'New York',
  'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio', 'OK': 'Oklahoma',
  'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
  'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah',
  'VT': 'Vermont', 'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia',
  'WI': 'Wisconsin', 'WY': 'Wyoming', 'DC': 'Washington DC',
  'PR': 'Puerto Rico', 'VI': 'Virgin Islands', 'GU': 'Guam'
};

// Country name mapping (most common)
const countryNames: Record<string, string> = {
  'US': 'United States', 'CA': 'Canada', 'GB': 'United Kingdom',
  'AU': 'Australia', 'BR': 'Brazil', 'MX': 'Mexico', 'DE': 'Germany',
  'FR': 'France', 'IT': 'Italy', 'ES': 'Spain', 'JP': 'Japan',
  'CN': 'China', 'IN': 'India', 'RU': 'Russia', 'NL': 'Netherlands',
  'SE': 'Sweden', 'NO': 'Norway', 'DK': 'Denmark', 'FI': 'Finland',
  'BE': 'Belgium', 'CH': 'Switzerland', 'AT': 'Austria', 'PT': 'Portugal',
  'IE': 'Ireland', 'NZ': 'New Zealand', 'SG': 'Singapore', 'HK': 'Hong Kong',
  'KR': 'South Korea', 'TH': 'Thailand', 'PL': 'Poland', 'CZ': 'Czech Republic'
};

// Bot detection patterns (user agent based)
const BOT_PATTERNS = [
  /bot/i, /crawl/i, /spider/i, /curl/i, /wget/i,
  /python/i, /java(?!script)/i, /postman/i, /insomnia/i,
  /axios/i, /http[\/\s]/i, /scraper/i, /headless/i,
  /phantom/i, /selenium/i, /playwright/i, /puppeteer/i,
  /lighthouse/i, /gtmetrix/i, /pingdom/i, /uptime/i,
  /googlebot/i, /bingbot/i, /slackbot/i, /facebookbot/i,
  /twitterbot/i, /linkedinbot/i, /whatsapp/i, /telegrambot/i,
  /archive\.org/i, /semrush/i, /ahref/i, /mj12bot/i,
  /dotbot/i, /rogerbot/i, /yandex/i, /baidu/i
];

// Detect if request is from a bot
function isBot(userAgent: string | undefined): boolean {
  if (!userAgent) return true; // No UA = likely bot
  return BOT_PATTERNS.some(pattern => pattern.test(userAgent));
}

// Get location from IP
function getLocationFromIP(ip: string) {
  // Remove IPv6 prefix if present
  if (ip.includes('::ffff:')) {
    ip = ip.split('::ffff:')[1];
  }
  
  const geo = geoip.lookup(ip);
  
  if (!geo) {
    return {
      countryCode: null,
      countryName: null,
      stateCode: null,
      stateName: null,
      city: null
    };
  }
  
  const stateCode = geo.country === 'US' && geo.region ? geo.region : null;
  
  return {
    countryCode: geo.country,
    countryName: countryNames[geo.country] || geo.country,
    stateCode: stateCode,
    stateName: stateCode ? usaStates[stateCode] : null,
    city: geo.city || null
  };
}

// Track page view
router.post('/pageview', async (req, res) => {
  try {
    const {
      pagePath, pageTitle, visitorId, sessionId,
      referrer, source, utmSource, utmMedium, utmCampaign,
      deviceType, browser, os
    } = req.body;
    
    // Get IP and location
    const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || 
                req.headers['x-real-ip']?.toString() || 
                req.socket.remoteAddress || '';
    
    const location = getLocationFromIP(ip);
    const ipHash = hashIP(ip);
    
    // Get user agent and detect bots
    const userAgent = req.headers['user-agent']?.toString() || '';
    const isBotDetected = isBot(userAgent);
    
    // Log bot detection (only in development)
    if (isBotDetected && process.env.NODE_ENV === 'development') {
      console.log('🤖 [ANALYTICS] Bot detected:', userAgent.substring(0, 60));
    }
    
    await db.insert(pageViews).values({
      pagePath,
      pageTitle,
      visitorId,
      sessionId,
      referrer,
      source,
      utmSource,
      utmMedium,
      utmCampaign,
      deviceType,
      browser,
      os,
      userAgent,
      isBot: isBotDetected,
      countryCode: location.countryCode,
      countryName: location.countryName,
      stateCode: location.stateCode,
      stateName: location.stateName,
      city: location.city,
      ipHash
    });
    
    res.json({ success: true });
  } catch (error) {
    console.error('[ANALYTICS] Error tracking pageview:', error);
    res.json({ success: false }); // Don't expose errors to client
  }
});

// Update time on page (using beacon API)
router.post('/time-on-page', async (req, res) => {
  try {
    const { visitorId, sessionId, pagePath, timeOnPage } = req.body;
    
    // Update the most recent matching page view
    const result = await db
      .update(pageViews)
      .set({ timeOnPage })
      .where(
        and(
          eq(pageViews.visitorId, visitorId),
          eq(pageViews.pagePath, pagePath)
        )
      );
    
    res.json({ success: true });
  } catch (error) {
    console.error('[ANALYTICS] Error updating time on page:', error);
    res.json({ success: false });
  }
});

// Get analytics stats (for admin dashboard)
router.get('/stats', async (req, res) => {
  try {
    // Validate and parse time range parameter
    const range = (req.query.range as string) || 'today';
    const validRanges = ['today', '7d', '30d', 'all'];
    
    if (!validRanges.includes(range)) {
      return res.status(400).json({ 
        error: 'Invalid range parameter. Must be one of: today, 7d, 30d, all' 
      });
    }
    
    // Calculate date range based on parameter
    let startDate: Date | undefined;
    
    switch (range) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case '7d':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case '30d':
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 30);
        startDate.setHours(0, 0, 0, 0);
        break;
      case 'all':
        startDate = undefined; // No date filter
        break;
    }
    
    // Build where clause: exclude bots + optional date filter
    const botFilter = eq(pageViews.isBot, false);
    const dateFilter = startDate ? gte(pageViews.createdAt, startDate) : undefined;
    const whereConditions = dateFilter ? and(botFilter, dateFilter) : botFilter;
    
    // LIVE VISITORS: Active in last 5 minutes (real humans only)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const liveVisitors = await db
      .select({
        count: sql<number>`count(distinct visitor_id)::int`,
      })
      .from(pageViews)
      .where(and(eq(pageViews.isBot, false), gte(pageViews.createdAt, fiveMinutesAgo)));
    
    // Stats with bot exclusion and optional date filter
    const stats = await db
      .select({
        totalViews: sql<number>`count(*)::int`,
        uniqueVisitors: sql<number>`count(distinct visitor_id)::int`,
        sessions: sql<number>`count(distinct session_id)::int`,
      })
      .from(pageViews)
      .where(whereConditions);
    
    // USER AGENT BREAKDOWN: Mobile vs Desktop vs Bot
    const deviceBreakdown = await db
      .select({
        deviceType: pageViews.deviceType,
        views: sql<number>`count(*)::int`,
        uniqueVisitors: sql<number>`count(distinct visitor_id)::int`,
      })
      .from(pageViews)
      .where(dateFilter ? and(eq(pageViews.isBot, false), dateFilter) : eq(pageViews.isBot, false))
      .groupBy(pageViews.deviceType)
      .orderBy(desc(sql`count(*)`));
    
    // BOT COUNT: How many bot requests were filtered
    const botCount = await db
      .select({
        count: sql<number>`count(*)::int`,
      })
      .from(pageViews)
      .where(dateFilter ? and(eq(pageViews.isBot, true), dateFilter) : eq(pageViews.isBot, true));
    
    // Top pages with bot exclusion and optional date filter
    const topPages = await db
      .select({
        pagePath: pageViews.pagePath,
        views: sql<number>`count(*)::int`,
      })
      .from(pageViews)
      .where(whereConditions)
      .groupBy(pageViews.pagePath)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    
    // Traffic sources with bot exclusion and optional date filter
    const sources = await db
      .select({
        source: pageViews.source,
        views: sql<number>`count(*)::int`,
      })
      .from(pageViews)
      .where(whereConditions)
      .groupBy(pageViews.source)
      .orderBy(desc(sql`count(*)`))
      .limit(10);
    
    // USA states breakdown with bot exclusion and optional date filter
    const usaBaseConditions = and(
      botFilter,
      eq(pageViews.countryCode, 'US'),
      sql`${pageViews.stateCode} IS NOT NULL`
    );
    const usaStates = await db
      .select({
        stateCode: pageViews.stateCode,
        stateName: pageViews.stateName,
        views: sql<number>`count(*)::int`,
        uniqueVisitors: sql<number>`count(distinct visitor_id)::int`,
      })
      .from(pageViews)
      .where(dateFilter ? and(dateFilter, usaBaseConditions) : usaBaseConditions)
      .groupBy(pageViews.stateCode, pageViews.stateName)
      .orderBy(desc(sql`count(*)`))
      .limit(20);
    
    // Countries breakdown with bot exclusion and optional date filter
    const countryBaseCondition = and(
      botFilter,
      sql`${pageViews.countryCode} IS NOT NULL`
    );
    const countries = await db
      .select({
        countryCode: pageViews.countryCode,
        countryName: pageViews.countryName,
        views: sql<number>`count(*)::int`,
        uniqueVisitors: sql<number>`count(distinct visitor_id)::int`,
      })
      .from(pageViews)
      .where(dateFilter ? and(dateFilter, countryBaseCondition) : countryBaseCondition)
      .groupBy(pageViews.countryCode, pageViews.countryName)
      .orderBy(desc(sql`count(*)`))
      .limit(20);
    
    res.json({
      range, // Echo back the selected range
      liveVisitors: liveVisitors[0]?.count ?? 0, // Live now (last 5 min)
      botCount: botCount[0]?.count ?? 0, // Filtered bot requests
      deviceBreakdown, // Mobile vs Desktop breakdown
      stats: stats[0] || { totalViews: 0, uniqueVisitors: 0, sessions: 0 },
      topPages,
      sources,
      usaStates,
      countries
    });
  } catch (error) {
    console.error('[ANALYTICS] Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get analytics' });
  }
});

// Get raw visitor data (for debugging/verification)
router.get('/raw-visitors', async (req, res) => {
  try {
    const range = (req.query.range as string) || 'today';
    const includeBot = req.query.includeBots === 'true';
    
    // Calculate date range based on parameter (mirrors /stats endpoint)
    let startDate: Date | undefined = new Date();
    startDate.setHours(0, 0, 0, 0);
    
    switch (range) {
      case 'today':
        // Already set to today
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case 'all':
        startDate = undefined; // No date filter
        break;
    }
    
    // Build where condition
    const botFilter = includeBot ? undefined : eq(pageViews.isBot, false);
    const dateFilter = startDate ? gte(pageViews.createdAt, startDate) : undefined;
    
    let whereCondition;
    if (botFilter && dateFilter) {
      whereCondition = and(botFilter, dateFilter);
    } else if (botFilter) {
      whereCondition = botFilter;
    } else if (dateFilter) {
      whereCondition = dateFilter;
    } else {
      whereCondition = undefined;
    }
    
    // Get raw page views for debugging
    const rawData = await db
      .select({
        id: pageViews.id,
        pagePath: pageViews.pagePath,
        visitorId: pageViews.visitorId,
        sessionId: pageViews.sessionId,
        deviceType: pageViews.deviceType,
        browser: pageViews.browser,
        os: pageViews.os,
        userAgent: pageViews.userAgent,
        isBot: pageViews.isBot,
        source: pageViews.source,
        countryCode: pageViews.countryCode,
        stateCode: pageViews.stateCode,
        createdAt: pageViews.createdAt,
      })
      .from(pageViews)
      .where(whereCondition)
      .orderBy(desc(pageViews.createdAt))
      .limit(100);
    
    // Group visitors by visitor ID for summary
    const visitorSummary: Record<string, any> = {};
    for (const view of rawData) {
      if (!visitorSummary[view.visitorId]) {
        visitorSummary[view.visitorId] = {
          visitorId: view.visitorId,
          deviceType: view.deviceType,
          browser: view.browser,
          os: view.os,
          isBot: view.isBot,
          location: `${view.stateCode || ''} ${view.countryCode || ''}`.trim(),
          firstSeen: view.createdAt,
          lastSeen: view.createdAt,
          pageViews: 1,
          pages: [view.pagePath],
        };
      } else {
        visitorSummary[view.visitorId].pageViews++;
        visitorSummary[view.visitorId].pages.push(view.pagePath);
        if (new Date(view.createdAt) < new Date(visitorSummary[view.visitorId].firstSeen)) {
          visitorSummary[view.visitorId].firstSeen = view.createdAt;
        }
        if (new Date(view.createdAt) > new Date(visitorSummary[view.visitorId].lastSeen)) {
          visitorSummary[view.visitorId].lastSeen = view.createdAt;
        }
      }
    }
    
    const visitors = Object.values(visitorSummary).sort((a: any, b: any) => 
      new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime()
    );
    
    res.json({
      range,
      totalRawViews: rawData.length,
      uniqueVisitors: visitors.length,
      visitors,
      rawPageViews: rawData.slice(0, 50), // Limit to 50 most recent
    });
  } catch (error) {
    console.error('[ANALYTICS] Error getting raw visitors:', error);
    res.status(500).json({ error: 'Failed to get raw visitor data' });
  }
});

export default router;
