import { google } from 'googleapis';
import { trackSearchCall, trackVideoDetailCall, markQuotaExceeded, isQuotaLikelyExceeded } from './youtube-quota-monitor';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

export interface VideoSearchResult {
  youtube_id: string;
  youtube_url: string;
  title: string;
  channel_name: string;
  channel_id: string;
  thumbnail_url: string;
  upload_date: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
}

// Search for BJJ videos
export async function searchBJJVideos(query: string, maxResults: number = 20): Promise<VideoSearchResult[]> {
  // Check quota before making call
  if (isQuotaLikelyExceeded()) {
    console.warn('YouTube API quota likely exceeded - skipping search');
    throw new Error('QUOTA_EXCEEDED');
  }

  try {
    // Track quota usage
    trackSearchCall();
    
    const response = await youtube.search.list({
      part: ['snippet'],
      q: query,
      type: ['video'],
      maxResults: maxResults,
      videoDuration: 'medium', // 4-20 minutes
      relevanceLanguage: 'en',
      safeSearch: 'strict'
    });
    
    if (!response.data.items) {
      return [];
    }
    
    return response.data.items.map(item => ({
      youtube_id: item.id?.videoId || '',
      youtube_url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      title: item.snippet?.title || '',
      channel_name: item.snippet?.channelTitle || '',
      channel_id: item.snippet?.channelId || '',
      thumbnail_url: item.snippet?.thumbnails?.medium?.url || '',
      upload_date: item.snippet?.publishedAt || ''
    }));
  } catch (error: any) {
    // Check for quota exceeded error or if already marked
    if (error.message?.includes('QUOTA_EXCEEDED')) {
      throw error; // Propagate existing quota error
    } else if (error.message?.includes('quota') || error.code === 403) {
      markQuotaExceeded();
      console.error('🚫 YouTube API quota exceeded - curation paused until midnight PT');
      throw new Error('QUOTA_EXCEEDED');
    }
    console.error('YouTube search error:', error.message || error);
    return [];
  }
}

// Get detailed video info
export async function getVideoDetails(videoId: string) {
  try {
    // Track quota usage
    trackVideoDetailCall();
    
    const response = await youtube.videos.list({
      part: ['contentDetails', 'statistics', 'snippet'],
      id: [videoId]
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      return null;
    }
    
    const video = response.data.items[0];
    const duration = parseDuration(video.contentDetails?.duration || '');
    
    return {
      duration: duration,
      view_count: parseInt(video.statistics?.viewCount || '0'),
      like_count: parseInt(video.statistics?.likeCount || '0'),
      comment_count: parseInt(video.statistics?.commentCount || '0'),
      published_at: video.snippet?.publishedAt || ''
    };
  } catch (error: any) {
    // Check for quota exceeded error or if already marked
    if (error.message?.includes('QUOTA_EXCEEDED')) {
      throw error; // Propagate existing quota error
    } else if (error.message?.includes('quota') || error.code === 403) {
      markQuotaExceeded();
      console.error('🚫 YouTube API quota exceeded - curation paused');
      throw new Error('QUOTA_EXCEEDED');
    }
    console.error('Video details error:', error.message || error);
    return null;
  }
}

// Get recent videos from a channel
export async function getChannelVideos(channelId: string, maxResults: number = 30): Promise<VideoSearchResult[]> {
  if (isQuotaLikelyExceeded()) {
    console.warn('YouTube API quota likely exceeded - skipping channel fetch');
    throw new Error('QUOTA_EXCEEDED');
  }

  try {
    trackSearchCall();
    
    const response = await youtube.search.list({
      part: ['snippet'],
      channelId: channelId,
      type: ['video'],
      order: 'date',
      maxResults: maxResults,
      safeSearch: 'strict'
    });
    
    if (!response.data.items) {
      return [];
    }
    
    return response.data.items.map(item => ({
      youtube_id: item.id?.videoId || '',
      youtube_url: `https://www.youtube.com/watch?v=${item.id?.videoId}`,
      title: item.snippet?.title || '',
      channel_name: item.snippet?.channelTitle || '',
      channel_id: item.snippet?.channelId || '',
      thumbnail_url: item.snippet?.thumbnails?.medium?.url || '',
      upload_date: item.snippet?.publishedAt || ''
    }));
  } catch (error: any) {
    if (error.message?.includes('QUOTA_EXCEEDED')) {
      throw error;
    } else if (error.message?.includes('quota') || error.code === 403) {
      markQuotaExceeded();
      console.error('🚫 YouTube API quota exceeded - curation paused');
      throw new Error('QUOTA_EXCEEDED');
    }
    console.error('Channel videos error:', error.message || error);
    return [];
  }
}

// Get channel statistics
export async function getChannelStatistics(channelId: string) {
  try {
    const response = await youtube.channels.list({
      part: ['statistics'],
      id: [channelId]
    });
    
    if (!response.data.items || response.data.items.length === 0) {
      return null;
    }
    
    const channel = response.data.items[0];
    
    return {
      subscriber_count: parseInt(channel.statistics?.subscriberCount || '0'),
      view_count: parseInt(channel.statistics?.viewCount || '0'),
      video_count: parseInt(channel.statistics?.videoCount || '0')
    };
  } catch (error: any) {
    console.error('Channel statistics error:', error.message || error);
    return null;
  }
}

// Parse ISO 8601 duration to seconds
function parseDuration(duration: string): number {
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!match) return 0;
  
  const hours = parseInt((match[1] || '').replace('H', '') || '0');
  const minutes = parseInt((match[2] || '').replace('M', '') || '0');
  const seconds = parseInt((match[3] || '').replace('S', '') || '0');
  return hours * 3600 + minutes * 60 + seconds;
}
