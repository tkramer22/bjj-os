/**
 * DEMAND-DRIVEN CURATION SYSTEM
 * 
 * Weekly curation targeting techniques users are requesting but we don't have videos for.
 * Runs ONLY on Mondays at 3:15 AM EST, replacing the regular instructor-based run.
 * 
 * Algorithm:
 * 1. Query top 10 techniques from unmet requests (hadVideoResult = false)
 * 2. For each technique, search YouTube: "[technique] BJJ tutorial"
 * 3. Apply same quality filters as regular curation
 * 4. Add up to 3 videos per technique (max 30 total)
 * 5. Queue for Gemini processing
 * 6. Send distinct email report
 */

import { db } from './db';
import { aiVideoKnowledge, userTechniqueRequests, videoWatchStatus, systemSettings } from '@shared/schema';
import { sql, eq, and, desc } from 'drizzle-orm';
import { google } from 'googleapis';
import { Resend } from 'resend';

const youtube = google.youtube({
  version: 'v3',
  auth: process.env.YOUTUBE_API_KEY
});

const resend = new Resend(process.env.RESEND_API_KEY);
const ADMIN_EMAIL = 'todd@bjjos.app';

const DEMAND_CURATION_SETTING_KEY = 'demand_curation_enabled';
let demandCurationEnabled = true;

const MIN_DURATION_SECONDS = 120;
const MAX_DURATION_SECONDS = 3600;
const QUALITY_THRESHOLD = 6.5;
const MAX_VIDEOS_PER_TECHNIQUE = 3;
const MAX_TECHNIQUES = 10;
const MAX_TOTAL_VIDEOS = 30;

export async function initializeDemandCurationState(): Promise<void> {
  try {
    const result = await db.select()
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, DEMAND_CURATION_SETTING_KEY))
      .limit(1);
    
    if (result.length > 0) {
      demandCurationEnabled = result[0].settingValue !== 'false';
      console.log(`[DEMAND-CURATION] Loaded state: ${demandCurationEnabled ? 'ENABLED' : 'DISABLED'}`);
    } else {
      await db.insert(systemSettings).values({
        settingKey: DEMAND_CURATION_SETTING_KEY,
        settingValue: 'true',
        updatedBy: 'system'
      });
      console.log(`[DEMAND-CURATION] Initialized: ENABLED (default)`);
    }
  } catch (error) {
    console.error('[DEMAND-CURATION] Error loading state:', error);
    demandCurationEnabled = true;
  }
}

export function isDemandCurationEnabled(): boolean {
  return demandCurationEnabled;
}

export async function setDemandCurationEnabled(enabled: boolean): Promise<{ success: boolean; error?: string }> {
  try {
    const existing = await db.select()
      .from(systemSettings)
      .where(eq(systemSettings.settingKey, DEMAND_CURATION_SETTING_KEY))
      .limit(1);
    
    if (existing.length > 0) {
      await db.update(systemSettings)
        .set({
          settingValue: String(enabled),
          updatedAt: new Date(),
          updatedBy: 'admin'
        })
        .where(eq(systemSettings.settingKey, DEMAND_CURATION_SETTING_KEY));
    } else {
      await db.insert(systemSettings).values({
        settingKey: DEMAND_CURATION_SETTING_KEY,
        settingValue: String(enabled),
        updatedBy: 'admin'
      });
    }
    
    demandCurationEnabled = enabled;
    console.log(`[DEMAND-CURATION] ${enabled ? '✅ ENABLED' : '🚫 DISABLED'} by admin`);
    return { success: true };
  } catch (error: any) {
    console.error('[DEMAND-CURATION] Error persisting state:', error);
    return { success: false, error: error.message || 'Database error' };
  }
}

interface TechniqueRequest {
  technique: string;
  requestCount: number;
}

interface TechniqueResult {
  technique: string;
  requestCount: number;
  videosFound: number;
  videosAdded: number;
  videos: { title: string; instructor: string; url: string }[];
  error?: string;
}

interface DemandCurationResult {
  success: boolean;
  techniquesAnalyzed: number;
  techniquesWithVideos: number;
  techniquesWithNoResults: number;
  totalVideosAdded: number;
  totalGeminiQueued: number;
  techniqueResults: TechniqueResult[];
  stillUnmet: string[];
  quotaExhausted: boolean;
  errors: string[];
}

let lastDemandRunStatus: { at: Date; result: DemandCurationResult } | null = null;

export function getDemandCurationStatus() {
  return {
    enabled: demandCurationEnabled,
    lastRunAt: lastDemandRunStatus?.at || null,
    lastResult: lastDemandRunStatus?.result || null
  };
}

async function getTopUnmetTechniques(): Promise<TechniqueRequest[]> {
  try {
    const result = await db.execute(sql`
      SELECT 
        technique_mentioned as technique,
        COUNT(*)::int as request_count
      FROM user_technique_requests
      WHERE had_video_result = false
        AND technique_mentioned IS NOT NULL
        AND technique_mentioned != ''
      GROUP BY technique_mentioned
      ORDER BY COUNT(*) DESC
      LIMIT ${MAX_TECHNIQUES}
    `);
    
    const rows = Array.isArray(result) ? result : (result?.rows || []);
    
    console.log(`[DEMAND-CURATION] Found ${rows.length} unmet techniques`);
    return rows.map((r: any) => ({
      technique: r.technique,
      requestCount: parseInt(r.request_count || '1')
    }));
  } catch (error) {
    console.error('[DEMAND-CURATION] Error fetching unmet techniques:', error);
    return [];
  }
}

function parseDuration(duration: string): number {
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || '0');
  const minutes = parseInt(match[2] || '0');
  const seconds = parseInt(match[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

function calculateQualityScore(video: any): number {
  const viewCount = parseInt(video.statistics?.viewCount || '0');
  const likeCount = parseInt(video.statistics?.likeCount || '0');
  const duration = parseDuration(video.contentDetails?.duration || 'PT0S');
  
  let score = 5.0;
  
  if (viewCount > 100000) score += 2.0;
  else if (viewCount > 50000) score += 1.5;
  else if (viewCount > 10000) score += 1.0;
  else if (viewCount > 5000) score += 0.5;
  
  if (likeCount > 0 && viewCount > 0) {
    const likeRatio = likeCount / viewCount;
    if (likeRatio > 0.05) score += 1.0;
    else if (likeRatio > 0.03) score += 0.5;
  }
  
  if (duration >= 300 && duration <= 1800) score += 1.0;
  else if (duration >= 180 && duration <= 2400) score += 0.5;
  
  return Math.min(10, Math.max(0, score));
}

function isNonInstructionalContent(title: string): boolean {
  const titleLower = title.toLowerCase();
  const skipPatterns = [
    'podcast', 'interview', 'q&a', 'vlog', 'competition', 
    'match footage', 'full match', 'fight', 'highlights only',
    'compilation', 'promo', 'trailer', 'announcement'
  ];
  return skipPatterns.some(p => titleLower.includes(p));
}

async function videoExists(videoId: string): Promise<boolean> {
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const result = await db.select({ id: aiVideoKnowledge.id })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.videoUrl, videoUrl))
    .limit(1);
  return result.length > 0;
}

async function queueForGeminiProcessing(videoId: number, youtubeUrl: string, youtubeId: string): Promise<void> {
  try {
    await db.insert(videoWatchStatus).values({
      videoId,
      youtubeUrl,
      youtubeId,
      hasTranscript: false,
      processingStatus: 'pending',
      processingAttempts: 0
    }).onConflictDoNothing();
  } catch (error) {
    console.error(`[DEMAND-CURATION] Error queuing for Gemini:`, error);
  }
}

async function searchYouTubeForTechnique(technique: string): Promise<any[]> {
  const query = `${technique} BJJ tutorial`;
  
  try {
    const searchResponse = await youtube.search.list({
      part: ['id'],
      q: query,
      type: ['video'],
      maxResults: 15,
      videoDuration: 'medium',
      order: 'relevance'
    });
    
    if (!searchResponse.data.items?.length) return [];
    
    const videoIds = searchResponse.data.items
      .filter(item => item.id?.videoId)
      .map(item => item.id!.videoId!);
    
    if (!videoIds.length) return [];
    
    const detailsResponse = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: videoIds
    });
    
    return detailsResponse.data.items || [];
  } catch (error: any) {
    if (error.code === 403 || error.message?.includes('quota')) {
      throw new Error('QUOTA_EXHAUSTED');
    }
    console.error(`[DEMAND-CURATION] Search error for "${technique}":`, error.message);
    return [];
  }
}

async function processTechnique(
  technique: TechniqueRequest,
  totalVideosAdded: number
): Promise<{ result: TechniqueResult; videosAdded: number; quotaExhausted: boolean }> {
  const techniqueResult: TechniqueResult = {
    technique: technique.technique,
    requestCount: technique.requestCount,
    videosFound: 0,
    videosAdded: 0,
    videos: []
  };
  
  let addedThisTechnique = 0;
  let quotaExhausted = false;
  
  console.log(`\n   🔍 Searching: "${technique.technique}" (${technique.requestCount} requests)`);
  
  try {
    const videos = await searchYouTubeForTechnique(technique.technique);
    techniqueResult.videosFound = videos.length;
    
    console.log(`      Found ${videos.length} candidate videos`);
    
    for (const video of videos) {
      if (addedThisTechnique >= MAX_VIDEOS_PER_TECHNIQUE) {
        console.log(`      ✓ Hit max ${MAX_VIDEOS_PER_TECHNIQUE} videos for this technique`);
        break;
      }
      
      if (totalVideosAdded + addedThisTechnique >= MAX_TOTAL_VIDEOS) {
        console.log(`      ✓ Hit max ${MAX_TOTAL_VIDEOS} total videos limit`);
        break;
      }
      
      const videoId = video.id;
      const title = video.snippet?.title || '';
      const duration = parseDuration(video.contentDetails?.duration || 'PT0S');
      
      if (duration < MIN_DURATION_SECONDS || duration > MAX_DURATION_SECONDS) {
        continue;
      }
      
      if (await videoExists(videoId)) {
        continue;
      }
      
      if (isNonInstructionalContent(title)) {
        continue;
      }
      
      const qualityScore = calculateQualityScore(video);
      if (qualityScore < QUALITY_THRESHOLD) {
        continue;
      }
      
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const instructor = video.snippet?.channelTitle || 'Unknown';
      
      try {
        const insertResult = await db.insert(aiVideoKnowledge).values({
          videoUrl,
          youtubeId: videoId,
          title,
          techniqueName: technique.technique,
          instructorName: instructor,
          techniqueType: 'technique',
          positionCategory: 'universal',
          giOrNogi: 'both',
          qualityScore: qualityScore.toFixed(1),
          duration,
          channelName: video.snippet?.channelTitle || '',
          thumbnailUrl: video.snippet?.thumbnails?.high?.url || '',
          uploadDate: video.snippet?.publishedAt ? new Date(video.snippet.publishedAt) : new Date(),
          viewCount: parseInt(video.statistics?.viewCount || '0'),
          likeCount: parseInt(video.statistics?.likeCount || '0'),
          source: 'demand_driven_curation',
          curatedAt: new Date()
        }).returning({ id: aiVideoKnowledge.id });
        
        if (insertResult[0]?.id) {
          await queueForGeminiProcessing(insertResult[0].id, videoUrl, videoId);
          addedThisTechnique++;
          techniqueResult.videosAdded++;
          techniqueResult.videos.push({ title, instructor, url: videoUrl });
          console.log(`      ✅ Added: "${title.slice(0, 50)}..." by ${instructor}`);
        }
      } catch (error: any) {
        if (error.code === '23505') {
          continue;
        }
        throw error;
      }
    }
  } catch (error: any) {
    if (error.message === 'QUOTA_EXHAUSTED') {
      quotaExhausted = true;
      techniqueResult.error = 'YouTube quota exhausted';
    } else {
      techniqueResult.error = error.message;
    }
  }
  
  if (techniqueResult.videosAdded === 0 && !techniqueResult.error) {
    console.log(`      ❌ No quality videos found`);
  }
  
  return { result: techniqueResult, videosAdded: addedThisTechnique, quotaExhausted };
}

async function sendDemandCurationEmail(result: DemandCurationResult): Promise<void> {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    timeZone: 'America/New_York'
  });
  
  const techniquesSection = result.techniqueResults.map(t => {
    const status = t.videosAdded > 0 
      ? `✅ Added ${t.videosAdded} video${t.videosAdded > 1 ? 's' : ''}`
      : t.error 
        ? `⚠️ Error: ${t.error}`
        : `❌ No quality videos found`;
    
    return `
    <tr style="border-bottom: 1px solid #333;">
      <td style="padding: 12px; font-weight: bold;">"${t.technique}"</td>
      <td style="padding: 12px; text-align: center;">${t.requestCount}</td>
      <td style="padding: 12px;">${status}</td>
    </tr>`;
  }).join('');
  
  const videosSection = result.techniqueResults
    .filter(t => t.videos.length > 0)
    .flatMap(t => t.videos.map(v => `
    <tr style="border-bottom: 1px solid #333;">
      <td style="padding: 10px;">${v.title.slice(0, 60)}${v.title.length > 60 ? '...' : ''}</td>
      <td style="padding: 10px;">${v.instructor}</td>
      <td style="padding: 10px;">${t.technique}</td>
      <td style="padding: 10px;"><a href="${v.url}" style="color: #8B5CF6;">Watch</a></td>
    </tr>`))
    .join('');
  
  const stillUnmetSection = result.stillUnmet.length > 0
    ? `
    <div style="background: #1a1a2e; padding: 16px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #f59e0b;">
      <h3 style="color: #f59e0b; margin: 0 0 12px 0;">⚠️ STILL UNMET (Action Needed)</h3>
      <p style="color: #ccc; margin: 0 0 8px 0;">No quality videos found for these techniques. Consider manual curation or reaching out to instructors:</p>
      <ul style="color: #fff; margin: 0; padding-left: 20px;">
        ${result.stillUnmet.map(t => `<li style="margin: 4px 0;">"${t}"</li>`).join('')}
      </ul>
    </div>`
    : '';
  
  const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f0f1a; color: #fff; padding: 20px; margin: 0;">
  <div style="max-width: 700px; margin: 0 auto;">
    
    <div style="background: linear-gradient(135deg, #8B5CF6 0%, #6366f1 100%); padding: 24px; border-radius: 12px; text-align: center; margin-bottom: 24px;">
      <h1 style="margin: 0; font-size: 28px;">🎯 DEMAND-DRIVEN CURATION REPORT</h1>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">Monday ${dateStr} at 3:15 AM EST</p>
      <p style="margin: 8px 0 0 0; font-style: italic; opacity: 0.8;">"Filling content gaps based on what users are actually asking for"</p>
    </div>
    
    <div style="background: #1a1a2e; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h2 style="color: #8B5CF6; margin: 0 0 16px 0;">📊 SUMMARY</h2>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px;">
        <div style="background: #252540; padding: 16px; border-radius: 8px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #8B5CF6;">${result.techniquesAnalyzed}</div>
          <div style="color: #888; font-size: 14px;">Techniques Analyzed</div>
        </div>
        <div style="background: #252540; padding: 16px; border-radius: 8px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #22c55e;">${result.techniquesWithVideos}</div>
          <div style="color: #888; font-size: 14px;">With Videos Added</div>
        </div>
        <div style="background: #252540; padding: 16px; border-radius: 8px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #f59e0b;">${result.techniquesWithNoResults}</div>
          <div style="color: #888; font-size: 14px;">No Results Found</div>
        </div>
        <div style="background: #252540; padding: 16px; border-radius: 8px; text-align: center;">
          <div style="font-size: 32px; font-weight: bold; color: #06b6d4;">${result.totalVideosAdded}</div>
          <div style="color: #888; font-size: 14px;">Total Videos Added</div>
        </div>
      </div>
    </div>
    
    <div style="background: #1a1a2e; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h2 style="color: #8B5CF6; margin: 0 0 16px 0;">🎯 TECHNIQUES TARGETED</h2>
      <table style="width: 100%; border-collapse: collapse; color: #fff;">
        <thead>
          <tr style="background: #252540;">
            <th style="padding: 12px; text-align: left;">Technique</th>
            <th style="padding: 12px; text-align: center;">User Requests</th>
            <th style="padding: 12px; text-align: left;">Result</th>
          </tr>
        </thead>
        <tbody>
          ${techniquesSection}
        </tbody>
      </table>
    </div>
    
    ${result.totalVideosAdded > 0 ? `
    <div style="background: #1a1a2e; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h2 style="color: #22c55e; margin: 0 0 16px 0;">📹 VIDEOS ADDED (${result.totalVideosAdded})</h2>
      <table style="width: 100%; border-collapse: collapse; color: #fff; font-size: 14px;">
        <thead>
          <tr style="background: #252540;">
            <th style="padding: 10px; text-align: left;">Title</th>
            <th style="padding: 10px; text-align: left;">Instructor</th>
            <th style="padding: 10px; text-align: left;">Technique</th>
            <th style="padding: 10px; text-align: left;">Link</th>
          </tr>
        </thead>
        <tbody>
          ${videosSection}
        </tbody>
      </table>
    </div>` : ''}
    
    ${stillUnmetSection}
    
    <div style="margin-top: 24px; padding: 16px; background: #252540; border-radius: 8px; font-size: 13px; color: #888;">
      <p style="margin: 0 0 8px 0;"><strong>Schedule:</strong></p>
      <ul style="margin: 0; padding-left: 20px;">
        <li>Monday 3:15 AM EST: Demand-driven curation (this report)</li>
        <li>Tuesday-Sunday 3:15 AM EST: Regular instructor-based curation</li>
      </ul>
      <p style="margin: 16px 0 0 0;">
        <a href="https://bjjos.app/admin/meta" style="color: #8B5CF6;">View Meta Dashboard</a> |
        <a href="https://bjjos.app/admin/videos" style="color: #8B5CF6;">View Video Library</a>
      </p>
    </div>
    
  </div>
</body>
</html>`;
  
  try {
    await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: ADMIN_EMAIL,
      subject: `🎯 Weekly DEMAND-DRIVEN Curation Complete - ${result.totalVideosAdded} videos added`,
      html: emailHtml
    });
    console.log(`[DEMAND-CURATION] Email sent to ${ADMIN_EMAIL}`);
  } catch (error) {
    console.error('[DEMAND-CURATION] Failed to send email:', error);
  }
}

export async function runDemandDrivenCuration(): Promise<DemandCurationResult> {
  if (!demandCurationEnabled) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🚫 DEMAND-DRIVEN CURATION SKIPPED (Disabled by Admin)`);
    console.log(`${'═'.repeat(70)}`);
    return {
      success: false,
      techniquesAnalyzed: 0,
      techniquesWithVideos: 0,
      techniquesWithNoResults: 0,
      totalVideosAdded: 0,
      totalGeminiQueued: 0,
      techniqueResults: [],
      stillUnmet: [],
      quotaExhausted: false,
      errors: ['Demand curation is disabled']
    };
  }
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🎯 DEMAND-DRIVEN CURATION SYSTEM (MONDAY)`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`Started: ${new Date().toISOString()}`);
  console.log(`"Filling content gaps based on what users are actually asking for"`);
  
  const result: DemandCurationResult = {
    success: false,
    techniquesAnalyzed: 0,
    techniquesWithVideos: 0,
    techniquesWithNoResults: 0,
    totalVideosAdded: 0,
    totalGeminiQueued: 0,
    techniqueResults: [],
    stillUnmet: [],
    quotaExhausted: false,
    errors: []
  };
  
  try {
    const unmetTechniques = await getTopUnmetTechniques();
    
    if (unmetTechniques.length === 0) {
      console.log(`\n✅ No unmet technique requests found - all user questions have video coverage!`);
      result.success = true;
      await sendDemandCurationEmail(result);
      lastDemandRunStatus = { at: new Date(), result };
      return result;
    }
    
    console.log(`\n📋 Top ${unmetTechniques.length} Unmet Techniques:`);
    unmetTechniques.forEach((t, i) => {
      console.log(`   ${i + 1}. "${t.technique}" (${t.requestCount} requests)`);
    });
    
    let totalAdded = 0;
    
    for (const technique of unmetTechniques) {
      if (result.quotaExhausted) {
        console.log(`\n⚠️ Quota exhausted, stopping...`);
        result.stillUnmet.push(technique.technique);
        continue;
      }
      
      if (totalAdded >= MAX_TOTAL_VIDEOS) {
        console.log(`\n✓ Hit max ${MAX_TOTAL_VIDEOS} videos limit`);
        result.stillUnmet.push(technique.technique);
        continue;
      }
      
      result.techniquesAnalyzed++;
      
      const { result: techniqueResult, videosAdded, quotaExhausted } = await processTechnique(
        technique, 
        totalAdded
      );
      
      result.techniqueResults.push(techniqueResult);
      totalAdded += videosAdded;
      result.totalVideosAdded += videosAdded;
      result.totalGeminiQueued += videosAdded;
      
      if (videosAdded > 0) {
        result.techniquesWithVideos++;
      } else {
        result.techniquesWithNoResults++;
        result.stillUnmet.push(technique.technique);
      }
      
      if (quotaExhausted) {
        result.quotaExhausted = true;
      }
    }
    
    result.success = true;
    
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🎯 DEMAND-DRIVEN CURATION COMPLETE`);
    console.log(`${'═'.repeat(70)}`);
    console.log(`   Techniques Analyzed: ${result.techniquesAnalyzed}`);
    console.log(`   With Videos Added: ${result.techniquesWithVideos}`);
    console.log(`   No Results Found: ${result.techniquesWithNoResults}`);
    console.log(`   Total Videos Added: ${result.totalVideosAdded}`);
    console.log(`   Still Unmet: ${result.stillUnmet.length}`);
    
    await sendDemandCurationEmail(result);
    lastDemandRunStatus = { at: new Date(), result };
    
    return result;
    
  } catch (error: any) {
    console.error(`[DEMAND-CURATION] Fatal error:`, error);
    result.errors.push(error.message);
    await sendDemandCurationEmail(result);
    lastDemandRunStatus = { at: new Date(), result };
    return result;
  }
}
