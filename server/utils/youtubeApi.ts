/**
 * YouTube Data API Integration
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Fetches channel statistics for instructor priority calculation:
 * - Subscriber count
 * - Video count
 * - Channel metadata
 * 
 * API Docs: https://developers.google.com/youtube/v3/docs/channels/list
 */

import { trackChannelStatCall, markQuotaExceeded } from '../youtube-quota-monitor';

interface YouTubeChannelStats {
  subscriberCount: number;
  videoCount: number;
  channelTitle: string;
  channelId: string;
  lastScraped: Date;
}

/**
 * Extract channel ID from various YouTube URL formats
 * Supports:
 * - https://www.youtube.com/@handle
 * - https://www.youtube.com/c/CustomName
 * - https://www.youtube.com/channel/UC...
 * - Direct channel ID (UC...)
 * - Direct handle (@username)
 */
export function parseYouTubeUrl(input: string): { type: 'channelId' | 'handle' | 'customUrl'; value: string } {
  if (!input) {
    throw new Error('YouTube URL or identifier is required');
  }

  const trimmed = input.trim();

  // Direct channel ID (starts with UC)
  if (trimmed.startsWith('UC') && trimmed.length === 24) {
    return { type: 'channelId', value: trimmed };
  }

  // Direct handle (@username)
  if (trimmed.startsWith('@')) {
    return { type: 'handle', value: trimmed };
  }

  // URL parsing
  try {
    const url = new URL(trimmed);
    const hostname = url.hostname.toLowerCase();

    if (!hostname.includes('youtube.com') && !hostname.includes('youtu.be')) {
      throw new Error('Invalid YouTube URL');
    }

    // Handle format: youtube.com/@username or youtube.com/@username/videos
    if (url.pathname.startsWith('/@')) {
      const handle = url.pathname.substring(1).split('/')[0]; // Remove leading / and get first segment
      return { type: 'handle', value: handle };
    }

    // Channel ID format: youtube.com/channel/UC...
    if (url.pathname.startsWith('/channel/')) {
      const channelId = url.pathname.split('/channel/')[1]?.split('/')[0];
      if (channelId?.startsWith('UC')) {
        return { type: 'channelId', value: channelId };
      }
    }

    // Custom URL format: youtube.com/c/CustomName
    if (url.pathname.startsWith('/c/')) {
      const customUrl = url.pathname.split('/c/')[1]?.split('/')[0];
      return { type: 'customUrl', value: customUrl || '' };
    }

    // User format: youtube.com/user/Username (legacy)
    if (url.pathname.startsWith('/user/')) {
      const username = url.pathname.split('/user/')[1]?.split('/')[0];
      return { type: 'customUrl', value: username || '' };
    }

    throw new Error('Unsupported YouTube URL format');
  } catch (error: any) {
    // Not a valid URL, treat as raw input
    if (error.message === 'Invalid URL') {
      // Might be a custom URL or username
      return { type: 'customUrl', value: trimmed };
    }
    throw error;
  }
}

/**
 * Fetch channel statistics from YouTube Data API
 */
export async function fetchYouTubeChannelStats(input: string): Promise<YouTubeChannelStats> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    throw new Error('YOUTUBE_API_KEY environment variable is not set');
  }

  // Import quota monitor functions
  const { isQuotaLikelyExceeded } = await import('../youtube-quota-monitor');
  
  // Check quota before making calls
  if (isQuotaLikelyExceeded()) {
    throw new Error('QUOTA_EXCEEDED: YouTube API daily quota limit reached. Resets at midnight Pacific Time.');
  }

  const parsed = parseYouTubeUrl(input);
  let channelId: string | null = null;

  // Step 1: Resolve to channel ID if needed
  if (parsed.type === 'channelId') {
    channelId = parsed.value;
  } else if (parsed.type === 'handle') {
    // YouTube API v3 supports handle-based lookup with forHandle parameter
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
    searchUrl.searchParams.set('part', 'id');
    searchUrl.searchParams.set('forHandle', parsed.value.replace('@', '')); // Remove @ prefix
    searchUrl.searchParams.set('key', apiKey);

    // Track quota usage
    trackChannelStatCall();

    const searchResponse = await fetch(searchUrl.toString());
    
    if (!searchResponse.ok) {
      const errorData = await searchResponse.json().catch(() => ({}));
      const reason = (errorData as any)?.error?.errors?.[0]?.reason;
      
      if (reason === 'quotaExceeded' || searchResponse.status === 403) {
        markQuotaExceeded();
        throw new Error('QUOTA_EXCEEDED: YouTube API daily quota limit reached. Resets at midnight Pacific Time.');
      }
      
      throw new Error(`YouTube API error (handle lookup): ${searchResponse.status} - ${JSON.stringify(errorData)}`);
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.items || searchData.items.length === 0) {
      throw new Error(`No YouTube channel found for handle: ${parsed.value}`);
    }

    channelId = searchData.items[0].id;
  } else {
    // Custom URL - use search API
    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.set('part', 'snippet');
    searchUrl.searchParams.set('q', parsed.value);
    searchUrl.searchParams.set('type', 'channel');
    searchUrl.searchParams.set('maxResults', '1');
    searchUrl.searchParams.set('key', apiKey);

    // Track quota usage
    trackChannelStatCall();

    const searchResponse = await fetch(searchUrl.toString());
    
    if (!searchResponse.ok) {
      const errorData = await searchResponse.json().catch(() => ({}));
      const reason = (errorData as any)?.error?.errors?.[0]?.reason;
      
      if (reason === 'quotaExceeded' || searchResponse.status === 403) {
        markQuotaExceeded();
        throw new Error('QUOTA_EXCEEDED: YouTube API daily quota limit reached. Resets at midnight Pacific Time.');
      }
      
      throw new Error(`YouTube API error (custom URL search): ${searchResponse.status} - ${JSON.stringify(errorData)}`);
    }

    const searchData = await searchResponse.json();
    
    if (!searchData.items || searchData.items.length === 0) {
      throw new Error(`No YouTube channel found for: ${parsed.value}`);
    }

    channelId = searchData.items[0].id.channelId || searchData.items[0].snippet.channelId;
  }

  if (!channelId) {
    throw new Error('Failed to resolve channel ID');
  }

  // Step 2: Fetch channel statistics
  const statsUrl = new URL('https://www.googleapis.com/youtube/v3/channels');
  statsUrl.searchParams.set('part', 'statistics,snippet');
  statsUrl.searchParams.set('id', channelId);
  statsUrl.searchParams.set('key', apiKey);

  // Track quota usage
  trackChannelStatCall();

  const statsResponse = await fetch(statsUrl.toString());
  
  if (!statsResponse.ok) {
    const errorData = await statsResponse.json().catch(() => ({}));
    const reason = (errorData as any)?.error?.errors?.[0]?.reason;
    
    if (reason === 'quotaExceeded' || statsResponse.status === 403) {
      markQuotaExceeded();
      throw new Error('QUOTA_EXCEEDED: YouTube API daily quota limit reached. Resets at midnight Pacific Time.');
    }
    
    throw new Error(`YouTube API error (stats): ${statsResponse.status} - ${JSON.stringify(errorData)}`);
  }

  const statsData = await statsResponse.json();
  
  if (!statsData.items || statsData.items.length === 0) {
    throw new Error(`No statistics found for channel ID: ${channelId}`);
  }

  const channel = statsData.items[0];
  const stats = channel.statistics;
  const snippet = channel.snippet;

  return {
    subscriberCount: parseInt(stats.subscriberCount || '0', 10),
    videoCount: parseInt(stats.videoCount || '0', 10),
    channelTitle: snippet.title,
    channelId: channel.id,
    lastScraped: new Date(),
  };
}

/**
 * Batch fetch channel statistics for multiple instructors
 * Uses YouTube API batch requests to minimize quota usage
 */
export async function batchFetchYouTubeStats(inputs: string[]): Promise<Map<string, YouTubeChannelStats>> {
  const results = new Map<string, YouTubeChannelStats>();
  
  // Process in parallel (YouTube API allows up to 50 channels per request)
  const promises = inputs.map(async (input) => {
    try {
      const stats = await fetchYouTubeChannelStats(input);
      results.set(input, stats);
    } catch (error: any) {
      console.error(`Failed to fetch YouTube stats for "${input}":`, error.message);
      // Don't throw - continue processing other channels
    }
  });

  await Promise.all(promises);
  
  return results;
}
