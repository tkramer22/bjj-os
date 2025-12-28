import { runMultiStageAnalysis } from "./multi-stage-analyzer";
import { checkPrerequisites, checkSafety, checkWeeklyDiversity } from "./technique-prerequisites";
import { calculateFreshnessBonus } from "./content-freshness";
import type { VideoAnalysisResult } from "./video-analyzer";
import { db } from "./db";
import { instructorCredibility } from "@shared/schema";
import { ilike, or } from "drizzle-orm";
import { trackSearchCall, trackVideoDetailCall, markQuotaExceeded, isQuotaLikelyExceeded, smartQuotaCheck } from "./youtube-quota-monitor";
import { YoutubeTranscript } from "youtube-transcript";

/**
 * Parse YouTube ISO 8601 duration (PT10M30S) to seconds
 */
function parseDurationToSeconds(duration: string): number {
  if (!duration) return 600; // Default 10 minutes
  
  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return 600;
  
  const hours = parseInt(matches[1] || '0');
  const minutes = parseInt(matches[2] || '0');
  const seconds = parseInt(matches[3] || '0');
  
  return hours * 3600 + minutes * 60 + seconds;
}

// Cache instructor credibility lookups to avoid repeated DB queries
const instructorCredibilityCache = new Map<string, { tier: number; qualityThreshold: number; isUserInstructor: boolean } | null>();

// Clear cache every hour to keep data fresh
setInterval(() => {
  instructorCredibilityCache.clear();
  console.log('[INSTRUCTOR CACHE] Cleared instructor credibility cache');
}, 60 * 60 * 1000);

interface YouTubeSearchResponse {
  items: Array<{
    id: {
      videoId: string;
    };
    snippet: {
      title: string;
      channelTitle: string;
      description: string;
      publishedAt: string;
      thumbnails: {
        high: {
          url: string;
        };
      };
    };
  }>;
}

interface UserPreferences {
  beltLevel?: string;
  preferredStyle?: string; // gi, nogi, both
  trainingGoals?: string[];
  favoriteInstructors?: string[];
  contentPreference?: string; // FUNDAMENTALS, MIXED, ADVANCED
}

interface ScoredVideo extends VideoAnalysisResult {
  finalScore: number;
  scoreBreakdown: {
    baseScore: number;
    instructorBonus: number;
    styleMatch: number;
    skillLevelMatch: number;
    recencyBonus: number;
    contentPreferenceBonus: number;
  };
}

export async function searchYouTubeVideosExtended(
  technique: string,
  instructor?: string,
  maxResults: number = 15,
  userPhone?: string,
  runId?: string
): Promise<VideoAnalysisResult[]> {
  
  const apiKey = process.env.YOUTUBE_API_KEY;
  
  if (!apiKey) {
    console.error('YOUTUBE_API_KEY not found');
    return [];
  }

  // Smart quota check with auto-recovery from stale quota data
  const quotaStatus = await smartQuotaCheck();
  
  if (!quotaStatus.available) {
    console.warn('YouTube API quota exceeded - skipping search');
    // Increment quota skip counter if runId provided
    if (runId) {
      const { incrementSkipCounter } = await import('./curation-controller');
      await incrementSkipCounter(runId, 'quota');
    }
    throw new Error('QUOTA_EXCEEDED');
  }
  
  if (quotaStatus.autoFixed) {
    console.log('✅ [AUTO-RECOVERY] Stale quota data detected and fixed - curation resuming');
  }

  try {
    let searchQuery = technique;
    if (instructor) {
      searchQuery = `${technique} ${instructor}`;
    }

    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.append('part', 'snippet');
    url.searchParams.append('q', searchQuery);
    url.searchParams.append('type', 'video');
    url.searchParams.append('maxResults', maxResults.toString());
    url.searchParams.append('order', 'relevance');
    url.searchParams.append('key', apiKey);

    // Track quota usage
    trackSearchCall();

    const response = await fetch(url.toString());
    
    if (!response.ok) {
      const errorBody = await response.text();
      let errorDetails = '';
      let quotaExceeded = false;
      
      try {
        const errorJson = JSON.parse(errorBody);
        errorDetails = errorJson.error?.message || errorBody;
        const reason = errorJson.error?.errors?.[0]?.reason;
        
        // Log detailed error for debugging
        console.error('YouTube API Error:', {
          status: response.status,
          statusText: response.statusText,
          message: errorDetails,
          reason: reason,
          query: searchQuery
        });
        
        // Check for quota exceeded
        if (reason === 'quotaExceeded') {
          quotaExceeded = true;
          markQuotaExceeded(); // Track quota exceeded in monitor
          console.error('🚫 YouTube API quota exceeded (10,000 units/day)');
          console.error('   Quota resets at midnight Pacific Time');
          console.error('   Curation will resume after quota reset');
          
          // Increment quota skip counter if runId provided
          if (runId) {
            const { incrementSkipCounter } = await import('./curation-controller');
            await incrementSkipCounter(runId, 'quota');
          }
        } else if (reason === 'keyInvalid' || errorDetails.includes('API key not valid')) {
          console.error('🚫 YouTube API key invalid. Check Google Cloud Console configuration.');
        } else if (reason === 'accessNotConfigured') {
          console.error('🚫 YouTube Data API v3 not enabled. Enable it in Google Cloud Console.');
        }
      } catch (e) {
        console.error('YouTube API error:', errorBody);
      }
      
      // Don't spam logs if quota exceeded - throw to propagate up
      if (quotaExceeded) {
        throw new Error('QUOTA_EXCEEDED');
      }
      
      return [];
    }

    const data: YouTubeSearchResponse = await response.json();

    // Build user profile from database if phone is provided
    let userProfile: any = {};
    if (userPhone) {
      const { db } = await import("./db");
      const { bjjUsers } = await import("@shared/schema");
      const { eq } = await import("drizzle-orm");
      
      const user = await db.select({
        beltLevel: bjjUsers.beltLevel,
        style: bjjUsers.style,
        focusAreas: bjjUsers.focusAreas,
        contentPreference: bjjUsers.contentPreference
      }).from(bjjUsers).where(eq(bjjUsers.phoneNumber, userPhone)).limit(1);
      
      if (user[0]) {
        userProfile.beltLevel = user[0].beltLevel || undefined;
        userProfile.style = user[0].style || undefined;
        userProfile.focusAreas = user[0].focusAreas || [];
        userProfile.contentPreference = user[0].contentPreference || undefined;
      }
    }

    // Analyze each video using 6-stage multi-stage analysis
    const analyzedVideos: VideoAnalysisResult[] = [];
    
    for (const item of data.items) {
      // Fetch video details to get duration (not included in search API)
      let duration = 'PT0S'; // Default fallback
      try {
        const detailsUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
        detailsUrl.searchParams.append('part', 'contentDetails');
        detailsUrl.searchParams.append('id', item.id.videoId);
        detailsUrl.searchParams.append('key', apiKey);
        
        // Track quota usage
        trackVideoDetailCall();
        
        const detailsResponse = await fetch(detailsUrl.toString());
        if (detailsResponse.ok) {
          const detailsData = await detailsResponse.json();
          if (detailsData.items && detailsData.items.length > 0) {
            duration = detailsData.items[0].contentDetails.duration;
            console.log(`📹 ${item.snippet.title}: duration=${duration}`);
          }
        } else if (detailsResponse.status === 403) {
          // Quota might be exceeded on video details call
          const errorBody = await detailsResponse.text();
          try {
            const errorJson = JSON.parse(errorBody);
            if (errorJson.error?.errors?.[0]?.reason === 'quotaExceeded') {
              markQuotaExceeded();
              // Increment quota skip counter if runId provided
              if (runId) {
                const { incrementSkipCounter } = await import('./curation-controller');
                await incrementSkipCounter(runId, 'quota');
              }
              throw new Error('QUOTA_EXCEEDED');
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
      } catch (err: any) {
        if (err.message === 'QUOTA_EXCEEDED') {
          throw err; // Propagate quota errors
        }
        console.warn(`⚠️ Failed to fetch duration for ${item.id.videoId}:`, err);
      }
      
      // DURATION FILTER: Skip videos shorter than 70 seconds
      const durationSeconds = parseDurationToSeconds(duration);
      if (durationSeconds < 70) {
        console.log(`⏭️  Skipping ${item.snippet.title}: too short (${durationSeconds}s < 70s minimum)`);
        // Increment duration skip counter if runId provided
        if (runId) {
          const { incrementSkipCounter } = await import('./curation-controller');
          await incrementSkipCounter(runId, 'duration');
        }
        continue; // Skip to next video
      }
      
      // DUPLICATE CHECK: Skip if video already in library
      const { aiVideoKnowledge } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      const existingVideo = await db.select()
        .from(aiVideoKnowledge)
        .where(eq(aiVideoKnowledge.youtubeId, item.id.videoId))
        .limit(1);
      
      if (existingVideo.length > 0) {
        console.log(`⏭️  Skipping ${item.snippet.title}: already in library`);
        // Increment duplicates skip counter if runId provided
        if (runId) {
          const { incrementSkipCounter } = await import('./curation-controller');
          await incrementSkipCounter(runId, 'duplicates');
        }
        continue; // Skip to next video
      }
      
      // Fetch transcript using hybrid system (YouTube captions or Whisper API)
      let transcript = '';
      try {
        const { getVideoTranscript } = await import('./transcript-generator');
        const durationSeconds = parseDurationToSeconds(duration);
        const transcriptResult = await getVideoTranscript(item.id.videoId, durationSeconds);
        
        if (transcriptResult && transcriptResult.text.length > 100) {
          transcript = transcriptResult.text;
          console.log(`📝 Transcript: ${transcriptResult.source} source, ${transcript.length} chars`);
          if (transcriptResult.cost > 0) {
            console.log(`💰 Whisper cost: $${transcriptResult.cost.toFixed(3)}`);
          }
        } else {
          console.log(`⚠️  No viable transcript available for ${item.id.videoId}`);
        }
      } catch (transcriptError: any) {
        console.log(`ℹ️  Transcript generation failed: ${transcriptError.message || 'Unknown error'}`);
        transcript = '';
      }
      
      const videoCandidate = {
        videoId: item.id.videoId,
        title: item.snippet.title,
        channelTitle: item.snippet.channelTitle,
        description: item.snippet.description,
        publishedAt: item.snippet.publishedAt,
        duration: duration, // YouTube ISO 8601 format (PT10M30S)
        transcript: transcript, // CRITICAL: Required for multi-stage analysis Stage 1
      };

      // Run multi-stage analysis
      const result = await runMultiStageAnalysis(videoCandidate, userProfile);
      
      // Only include videos that passed all stages
      if (result.passed && result.stage2 && result.stage3) {
        // CRITICAL FIX: Save video to database immediately after approval
        try {
          const { aiVideoKnowledge } = await import('@shared/schema');
          const durationSeconds = parseDurationToSeconds(duration);
          
          // Extract taxonomy fields from result
          const taxonomy = result.taxonomy;
          
          await db.insert(aiVideoKnowledge).values({
            youtubeId: videoCandidate.videoId,
            videoUrl: `https://www.youtube.com/watch?v=${videoCandidate.videoId}`,
            title: videoCandidate.title,
            techniqueName: result.stage2.techniqueName || 'BJJ Technique',
            instructorName: result.stage3.instructorName || 'Unknown',
            channelName: videoCandidate.channelTitle,
            duration: durationSeconds,
            uploadDate: new Date(videoCandidate.publishedAt),
            viewCount: 0, // Not available from search API
            thumbnailUrl: item.snippet.thumbnails.high.url,
            beltLevel: ['all'], // FIXED: Must be array, not string
            qualityScore: ((result.finalScore || 0) / 10).toString(), // FIXED: Convert 0-100 scale to 0-10 scale (98.5 → 9.85)
            keyDetails: {
              keyDetail: result.stage2.keyDetail || '',
              techniqueName: result.stage2.techniqueName || ''
            },
            status: 'active',
            autoPublished: true,
            tier: 'tier_2',
            // NEW: Taxonomy fields for intelligent video search
            techniqueType: taxonomy?.techniqueType || null,
            positionCategory: taxonomy?.positionCategory || null,
            giOrNogi: taxonomy?.giOrNogi || null,
            tags: taxonomy?.tags || []
          });
          
          console.log(`✅ Video saved to database: ${videoCandidate.title}`);
          
        } catch (dbError: any) {
          console.error(`❌ Database error saving video ${videoCandidate.videoId}:`, dbError.message);
          // Continue anyway - don't fail the whole pipeline for one video
        }
        
        analyzedVideos.push({
          videoId: videoCandidate.videoId,
          title: videoCandidate.title,
          channelTitle: videoCandidate.channelTitle,
          description: videoCandidate.description,
          thumbnailUrl: item.snippet.thumbnails.high.url,
          url: `https://www.youtube.com/watch?v=${videoCandidate.videoId}`,
          publishedAt: videoCandidate.publishedAt,
          
          // From Stage 2
          techniqueName: result.stage2.techniqueName,
          techniqueVariation: result.stage2.techniqueName, // Use same as technique
          keyDetailQualityScore: result.stage2.qualityScore,
          
          // From Stage 3
          instructorName: result.stage3.instructorName,
          instructorCredibility: result.stage3.isElite ? 'elite' : 'credible',
          instructorCredibilityScore: result.stage3.credibilityScore,
          
          // From Stage 4 (teaching clarity - estimated at 15/20)
          teachingStyle: 'clear',
          teachingClarityScore: 15,
          
          // From Stage 5 (personalization)
          skillLevel: result.stage5?.beltAppropriate ? 'appropriate' : 'all-levels',
          giApplicability: result.stage5?.styleMatch ? userProfile.style || 'both' : 'both',
          
          // Production quality (estimated at 8/10)
          productionQualityScore: 8,
          productionQuality: 'good',
          
          // Additional required fields
          coversMistakes: false,
          includesDrilling: false,
          showsLiveApplication: false,
          summary: result.stage2.keyDetail,
          
          // Total score
          totalScore: result.finalScore || 0,
          hasRedFlags: false,
          
          // Additional metadata
          keyDetails: result.stage2.keyDetail,
        });
      } else {
        console.log(`❌ Video rejected: ${videoCandidate.title} (${result.rejectReason})`);
      }
    }
    
    return analyzedVideos;
  } catch (error: any) {
    // Propagate quota exceeded errors to stop curation
    if (error.message === 'QUOTA_EXCEEDED') {
      throw error;
    }
    console.error('Error in YouTube search:', error.message);
    return [];
  }
}

/**
 * Get instructor credibility tier and quality threshold with caching
 * Returns null if instructor is not in the credibility database
 * STRICT MATCHING: Only returns result if there's a confident match
 */
async function getInstructorCredibility(
  instructorName: string,
  channelTitle: string,
  videoTitle: string
): Promise<{ tier: number; qualityThreshold: number; isUserInstructor: boolean } | null> {
  // Guard: Skip lookup if instructor name is empty, too short, or placeholder
  const cleanInstructorName = instructorName?.trim() || '';
  const cleanChannelTitle = channelTitle?.trim() || '';
  
  // Placeholder/invalid patterns to reject
  const placeholderPatterns = /^(unknown|n\/a|na|tbd|none|placeholder|\?+|\-+|\_+|\s+)$/i;
  
  // Check if instructor name is a placeholder or invalid
  const isInstructorNameValid = cleanInstructorName.length >= 3 && 
    !placeholderPatterns.test(cleanInstructorName) &&
    /[a-zA-Z]{2,}/.test(cleanInstructorName); // Must have at least 2 letters
  
  // Check if channel title is valid
  const isChannelTitleValid = cleanChannelTitle.length >= 3 && 
    !placeholderPatterns.test(cleanChannelTitle) &&
    /[a-zA-Z]{2,}/.test(cleanChannelTitle);
  
  // Skip lookup if both inputs are invalid
  if (!isInstructorNameValid && !isChannelTitleValid) {
    return null;
  }
  
  // Create cache key from all input parameters
  const cacheKey = `${cleanInstructorName}|${cleanChannelTitle}|${videoTitle}`.toLowerCase();
  
  // Check cache first
  if (instructorCredibilityCache.has(cacheKey)) {
    return instructorCredibilityCache.get(cacheKey)!;
  }

  try {
    // Build query conditions based on valid inputs only
    const queryConditions = [];
    
    if (isInstructorNameValid) {
      queryConditions.push(ilike(instructorCredibility.name, `%${cleanInstructorName}%`));
    }
    
    if (isChannelTitleValid) {
      queryConditions.push(ilike(instructorCredibility.name, `%${cleanChannelTitle}%`));
    }
    
    // Should never happen due to earlier guard, but be defensive
    if (queryConditions.length === 0) {
      instructorCredibilityCache.set(cacheKey, null);
      return null;
    }
    
    // Search for instructor using only valid inputs
    const instructors = await db
      .select()
      .from(instructorCredibility)
      .where(or(...queryConditions))
      .limit(10); // Get more potential matches for better accuracy

    // STRICT MATCHING: Require at least one of these conditions:
    // 1. Instructor name appears in video title (both must be substantial strings)
    // 2. Instructor name exactly matches (case-insensitive, min 3 chars)
    // 3. Instructor name is a substantial part of channel title (≥70% word match)
    
    for (const instructor of instructors) {
      const instructorNameLower = instructor.name.toLowerCase().trim();
      const videoTitleLower = videoTitle.toLowerCase();
      const channelTitleLower = channelTitle.toLowerCase();
      const instructorNameWords = instructorNameLower.split(' ').filter(w => w.length > 2);
      
      // Skip if instructor name is too short
      if (instructorNameLower.length < 3) {
        continue;
      }
      
      // Condition 1: Instructor name appears in video title (both must be substantial)
      if (instructorNameLower.length >= 3 && videoTitleLower.includes(instructorNameLower)) {
        const result = {
          tier: instructor.tier,
          qualityThreshold: parseFloat(instructor.qualityThreshold),
          isUserInstructor: instructor.isUserInstructor || false,
        };
        instructorCredibilityCache.set(cacheKey, result);
        return result;
      }
      
      // Condition 2: Exact match on instructor name (min 3 chars)
      if (cleanInstructorName.length >= 3 && cleanInstructorName.toLowerCase() === instructorNameLower) {
        const result = {
          tier: instructor.tier,
          qualityThreshold: parseFloat(instructor.qualityThreshold),
          isUserInstructor: instructor.isUserInstructor || false,
        };
        instructorCredibilityCache.set(cacheKey, result);
        return result;
      }
      
      // Condition 3: Instructor name words substantially match channel title
      if (instructorNameWords.length > 0) {
        const matchedWords = instructorNameWords.filter(word => 
          word.length > 2 && channelTitleLower.includes(word)
        );
        if (matchedWords.length >= instructorNameWords.length * 0.7 && matchedWords.length >= 2) {
          const result = {
            tier: instructor.tier,
            qualityThreshold: parseFloat(instructor.qualityThreshold),
            isUserInstructor: instructor.isUserInstructor || false,
          };
          instructorCredibilityCache.set(cacheKey, result);
          return result;
        }
      }
    }

    // No confident match found - cache the null result to avoid repeated queries
    instructorCredibilityCache.set(cacheKey, null);
    return null;
  } catch (error) {
    console.error('[INSTRUCTOR CREDIBILITY] Error fetching instructor:', error);
    // Don't cache errors
    return null;
  }
}

async function scoreVideo(
  video: VideoAnalysisResult,
  preferences?: UserPreferences,
  previouslyRecommended: string[] = []
): Promise<ScoredVideo> {
  
  // Start with Claude's enhanced 100-point score
  let finalScore = video.totalScore;
  
  const scoreBreakdown = {
    baseScore: video.totalScore,
    instructorBonus: 0,
    styleMatch: 0,
    skillLevelMatch: 0,
    recencyBonus: 0,
    contentPreferenceBonus: 0,
    teachingStyleBonus: 0,
    competitionMetaBonus: 0,
  };

  // ENHANCED: Instructor credibility bonus (tier-based)
  const credibility = await getInstructorCredibility(
    video.instructorName,
    video.channelTitle,
    video.title
  );
  
  if (credibility) {
    // Tier-based bonuses for verified instructors:
    // Tier 1 (Legends): +15 points
    // Tier 2 (Quality): +10 points
    // Tier 3 (Verified): +5 points
    const tierBonus = credibility.tier === 1 ? 15 : credibility.tier === 2 ? 10 : 5;
    scoreBreakdown.instructorBonus += tierBonus;
    finalScore += tierBonus;
    
    // Additional +10 bonus if this is the user's instructor
    if (credibility.isUserInstructor) {
      scoreBreakdown.instructorBonus += 10;
      finalScore += 10;
    }
    
    console.log(`[INSTRUCTOR BOOST] ${video.instructorName} (Tier ${credibility.tier}): +${scoreBreakdown.instructorBonus} points`);
  }
  
  // Additional bonus for user's favorite instructors (stacks with tier bonus)
  if (preferences?.favoriteInstructors?.some(fav => 
    video.instructorName.toLowerCase().includes(fav.toLowerCase()) ||
    video.channelTitle.toLowerCase().includes(fav.toLowerCase()) ||
    video.title.toLowerCase().includes(fav.toLowerCase())
  )) {
    scoreBreakdown.instructorBonus += 5;
    finalScore += 5;
  }

  // Style match bonus (+3 points for perfect match)
  if (preferences?.preferredStyle && preferences.preferredStyle !== 'both') {
    if (video.giApplicability === preferences.preferredStyle) {
      scoreBreakdown.styleMatch = 3;
      finalScore += 3;
    } else if (video.giApplicability === 'both') {
      scoreBreakdown.styleMatch = 1;
      finalScore += 1;
    }
  }

  // Skill level match bonus (+3 points for perfect match)
  if (preferences?.beltLevel) {
    const beltLevels = ['white', 'blue', 'purple', 'brown', 'black'];
    const userLevel = beltLevels.indexOf(preferences.beltLevel.toLowerCase());
    
    if (video.skillLevel === 'all-levels') {
      scoreBreakdown.skillLevelMatch = 1;
      finalScore += 1;
    } else if (video.skillLevel.includes(preferences.beltLevel.toLowerCase())) {
      scoreBreakdown.skillLevelMatch = 3;
      finalScore += 3;
    }
  }

  // Recency bonus (videos from last 6 months get +2 points)
  const publishDate = new Date(video.publishedAt);
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  if (publishDate > sixMonthsAgo) {
    scoreBreakdown.recencyBonus = 2;
    finalScore += 2;
  }

  // Content preference boost - "Guide, don't gate" philosophy
  // Give +15 points for videos matching user's content preference
  if (preferences?.contentPreference) {
    const videoLevel = video.skillLevel?.toLowerCase() || '';
    const preference = preferences.contentPreference.toUpperCase();
    
    if (preference === 'FUNDAMENTALS') {
      // Boost beginner-friendly content
      if (videoLevel.includes('white') || videoLevel.includes('blue') || videoLevel === 'all-levels') {
        scoreBreakdown.contentPreferenceBonus = 15;
        finalScore += 15;
      }
    } else if (preference === 'ADVANCED') {
      // Boost advanced content
      if (videoLevel.includes('purple') || videoLevel.includes('brown') || videoLevel.includes('black')) {
        scoreBreakdown.contentPreferenceBonus = 15;
        finalScore += 15;
      }
    } else if (preference === 'MIXED') {
      // Moderate boost for all content
      scoreBreakdown.contentPreferenceBonus = 5;
      finalScore += 5;
    }
  }

  // Teaching style match bonus (up to +20 points for perfect match)
  // Note: This would require teaching style data from user learning profile
  // Placeholder for future implementation when teaching style is stored
  
  // Competition meta bonus (+10 for hot techniques, -5 for cold)
  // Note: This would query competition_meta table
  // Placeholder for future implementation when competition meta is populated

  // Penalty for previously recommended videos (-10 points)
  if (previouslyRecommended.includes(video.videoId)) {
    finalScore -= 10;
  }

  return {
    ...video,
    finalScore,
    scoreBreakdown,
  };
}

export async function getCuratedVideos(
  technique: string,
  instructor?: string,
  preferences?: UserPreferences,
  previouslyRecommended: string[] = [],
  topN: number = 3,
  userPhone?: string
): Promise<ScoredVideo[]> {
  
  // Step 1: Search YouTube and run 6-stage multi-stage analysis
  const candidateVideos = await searchYouTubeVideosExtended(technique, instructor, 15, userPhone);
  
  if (candidateVideos.length === 0) {
    return [];
  }

  // Step 2: Apply freshness weighting to each video
  const videosWithFreshness = candidateVideos.map(video => {
    const freshnessResult = calculateFreshnessBonus(video.publishedAt, video.instructorName);
    return {
      ...video,
      totalScore: video.totalScore + freshnessResult.bonusPoints,
      freshnessBonus: freshnessResult.bonusPoints
    };
  });

  // Step 3: Score each video based on quality, preferences, and context  
  const scoredVideos = await Promise.all(
    videosWithFreshness.map(video => 
      scoreVideo(video, preferences, previouslyRecommended)
    )
  );

  // Step 4: ENFORCE 70-POINT THRESHOLD - Filter out low-quality videos
  const worldClassVideos = scoredVideos.filter(video => {
    // Reject videos with red flags
    if (video.hasRedFlags) {
      console.log(`❌ Rejected: ${video.title} (red flags detected)`);
      return false;
    }
    
    // Reject videos below 70-point threshold
    if (video.totalScore < 70) {
      console.log(`❌ Rejected: ${video.title} (score: ${video.totalScore}/100, threshold: 70)`);
      return false;
    }
    
    // Auto-reject if key detail quality is too low (< 15 points, even if total >= 70)
    if (video.keyDetailQualityScore < 15) {
      console.log(`❌ Rejected: ${video.title} (key detail quality: ${video.keyDetailQualityScore}/40, minimum: 15)`);
      return false;
    }
    
    return true;
  });

  // Step 5: Sort by final score (highest first)
  worldClassVideos.sort((a, b) => b.finalScore - a.finalScore);

  // Step 6: Return top N world-class recommendations
  return worldClassVideos.slice(0, topN);
}
