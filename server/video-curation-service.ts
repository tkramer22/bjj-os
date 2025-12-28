import { db } from './db';
import { aiVideoKnowledge, videoCurationLog, curationRuns, videoScreeningLog } from '@shared/schema';
import { searchBJJVideos, getVideoDetails, type VideoSearchResult } from './youtube-service';
import { analyzeVideo, type VideoAnalysis } from './video-analysis-service';
import { detectVideoLanguage } from './utils/languageDetection';
import { getQuotaUsage } from './youtube-quota-monitor';
import { eq } from 'drizzle-orm';

// Foundation search queries for Week 1
const FOUNDATION_SEARCHES = [
  // Escapes (critical)
  'bjj mount escape tutorial',
  'side control escape fundamentals',
  'back escape bjj',
  'guard retention basics',
  
  // Guard fundamentals
  'closed guard basics bjj',
  'open guard fundamentals',
  'half guard tutorial',
  'butterfly guard basics',
  
  // Passing
  'guard passing fundamentals',
  'pressure passing tutorial',
  'toreando pass bjj',
  'knee slice pass',
  
  // Submissions
  'triangle choke tutorial',
  'armbar from guard',
  'rear naked choke details',
  'kimura tutorial bjj',
  
  // Defense
  'submission defense bjj',
  'mount defense fundamentals',
  'back defense escape',
  
  // Position
  'side control techniques',
  'mount attacks bjj',
  'back control system'
];

// Portuguese (Brazilian) search queries for Brazilian audience
export const PORTUGUESE_SEARCHES = [
  // Escapadas (Escapes)
  'escapar da montada jiu jitsu',
  'escapar da lateral 100 quilos',
  'fuga das costas jiu jitsu',
  'retenção de guarda bjj',
  'saída de montada tutorial',
  'defesa lateral pressão',
  
  // Guarda (Guard)
  'guarda fechada fundamentos',
  'guarda aberta básico',
  'meia guarda jiu jitsu',
  'guarda borboleta tutorial',
  'guarda aranha fundamentos',
  'guarda de la riva básico',
  'lasso guard português',
  'x guard tutorial português',
  
  // Passagem de Guarda (Guard Passing)
  'passagem de guarda fundamentos',
  'passagem de guarda pressão',
  'toreando pass jiu jitsu',
  'knee slice passagem',
  'leg drag tutorial português',
  'passagem stack jiu jitsu',
  
  // Finalizações (Submissions)
  'triângulo jiu jitsu tutorial',
  'chave de braço da guarda',
  'mata leão detalhes',
  'kimura passo a passo',
  'guilhotina tutorial jiu jitsu',
  'armlock montada tutorial',
  'estrangulamento papel português',
  'chave de pé básico',
  
  // Raspagem (Sweeps)
  'raspagem da guarda fechada',
  'raspagem borboleta tutorial',
  'flower sweep passo a passo',
  'raspagem meia guarda',
  'scissor sweep fundamentos',
  
  // Posições (Positions)
  'controle lateral técnicas',
  'montada ataques jiu jitsu',
  'controle das costas sistema',
  'joelho na barriga tutorial',
  'norte sul finalizações',
  
  // Defesa (Defense)
  'defesa de finalização jiu jitsu',
  'defesa de triângulo tutorial',
  'defesa de chave de braço',
  'defesa de guilhotina',
  
  // Técnicas Avançadas (Advanced)
  'berimbolo tutorial português',
  'back take sistema',
  'leg lock defesa segurança',
  'inversão jiu jitsu tutorial',
  'De la riva avançado',
  'spider guard ataques'
];

export async function runAutonomousCuration(searchLimit: number = 10, includePortuguese: boolean = true) {
  const startTime = Date.now();
  let totalFound = 0;
  let totalAnalyzed = 0;
  let totalAdded = 0;
  let totalRejected = 0;
  
  // Capture initial API quota usage
  const initialQuota = getQuotaUsage();
  
  console.log('🎬 Starting autonomous video curation...');
  
  // Combine English and Portuguese searches for multilingual library
  const allSearches = includePortuguese 
    ? [...FOUNDATION_SEARCHES, ...PORTUGUESE_SEARCHES]
    : FOUNDATION_SEARCHES;
  
  // Run searches
  const searches = allSearches.slice(0, searchLimit);
  
  for (const query of searches) {
    console.log(`\n🔍 Searching: "${query}"`);
    
    try {
      // Search YouTube
      const videos = await searchBJJVideos(query, 20);
      totalFound += videos.length;
      console.log(`   Found ${videos.length} videos`);
      
      // Process each video
      for (const video of videos) {
        // Check if already exists
        const existsResult = await db
          .select()
          .from(aiVideoKnowledge)
          .where(eq(aiVideoKnowledge.youtubeId, video.youtube_id))
          .limit(1);
        
        if (existsResult.length > 0) {
          console.log(`   ⏭️  Skipping (already have): ${video.title}`);
          continue;
        }
        
        // Get detailed info
        const details = await getVideoDetails(video.youtube_id);
        if (details) {
          video.duration = details.duration;
          video.view_count = details.view_count;
          video.like_count = details.like_count;
        }
        
        // AI analysis
        console.log(`   🤖 Analyzing: ${video.title.substring(0, 50)}...`);
        const analysis = await analyzeVideo(video);
        totalAnalyzed++;
        
        // Decide: Add or Reject
        const shouldAdd = decideShouldAdd(analysis);
        
        // 🔥 LOG EVERY SINGLE VIDEO SCREENING (Critical for metrics)
        try {
          await db.insert(videoScreeningLog).values({
            youtubeVideoId: video.youtube_id,
            videoTitle: video.title,
            channelName: video.channel_name,
            searchQuery: query,
            qualityScore: analysis.quality_score ? analysis.quality_score.toString() : null,
            instructorCredibility: analysis.instructor_credibility || null,
            accepted: shouldAdd,
            rejectionReason: shouldAdd ? null : analysis.rejection_reason,
          });
          console.log(`   📊 Logged screening: ${video.youtube_id} - Accepted: ${shouldAdd}`);
        } catch (loggingError) {
          console.error('   ⚠️  Failed to log video screening:', loggingError);
          // Don't crash curation if logging fails - it's for metrics only
        }
        
        if (shouldAdd) {
          await addVideoToLibrary(video, analysis);
          totalAdded++;
          console.log(`   ✅ ADDED (Score: ${analysis.quality_score})`);
        } else {
          totalRejected++;
          console.log(`   ❌ REJECTED: ${analysis.rejection_reason}`);
        }
        
        // Rate limit: small delay between analyses
        await sleep(500);
      }
      
    } catch (error) {
      console.error(`   Error processing query "${query}":`, error);
    }
    
    // Delay between searches
    await sleep(1000);
  }
  
  const duration = Math.floor((Date.now() - startTime) / 1000);
  
  // Calculate API efficiency metrics
  const finalQuota = getQuotaUsage();
  const apiUnitsUsed = finalQuota.estimatedUnits - initialQuota.estimatedUnits;
  const acceptanceRate = totalFound > 0 ? ((totalAdded / totalFound) * 100) : 0;
  const costPerAcceptedVideo = totalAdded > 0 ? (apiUnitsUsed / totalAdded) : 0;
  
  // Log to legacy videoCurationLog (for backwards compatibility)
  await db.insert(videoCurationLog).values({
    searchQuery: `Foundation searches (${searchLimit} queries)`,
    videosFound: totalFound,
    videosAnalyzed: totalAnalyzed,
    videosAdded: totalAdded,
    videosRejected: totalRejected,
    durationSeconds: duration
  });
  
  // Log to new curationRuns table with efficiency metrics
  await db.insert(curationRuns).values({
    runType: 'scheduled',
    searchCategory: `Foundation searches (${searchLimit} queries)`,
    searchesPlanned: searchLimit,
    searchesCompleted: searchLimit,
    searchesFailed: 0,
    videosScreened: totalFound,
    videosAnalyzed: totalAnalyzed,
    videosAdded: totalAdded,
    videosRejected: totalRejected,
    acceptanceRate: acceptanceRate.toFixed(2),
    apiUnitsUsed: apiUnitsUsed,
    costPerAcceptedVideo: costPerAcceptedVideo.toFixed(4),
    status: 'completed',
    completedAt: new Date()
  });
  
  console.log('\n📊 CURATION COMPLETE:');
  console.log(`   Videos Screened: ${totalFound}`);
  console.log(`   Videos Analyzed: ${totalAnalyzed}`);
  console.log(`   ✅ Added: ${totalAdded}`);
  console.log(`   ❌ Rejected: ${totalRejected}`);
  console.log(`   📈 Acceptance Rate: ${acceptanceRate.toFixed(1)}%`);
  console.log(`   💰 API Units Used: ${apiUnitsUsed}`);
  console.log(`   💵 Cost Per Video: ${costPerAcceptedVideo.toFixed(2)} units`);
  console.log(`   ⏱️  Duration: ${duration}s`);
  
  return {
    totalFound,
    totalAnalyzed,
    totalAdded,
    totalRejected,
    duration,
    acceptanceRate,
    apiUnitsUsed,
    costPerAcceptedVideo
  };
}

export function decideShouldAdd(analysis: VideoAnalysis): boolean {
  // Must be instructional
  if (!analysis.is_instructional) return false;
  
  // AI says don't add
  if (!analysis.should_add) return false;
  
  // Quality threshold (adjusted for mass curation expansion)
  if (analysis.instructor_credibility === 'high' && analysis.quality_score >= 7.0) {
    return true; // Lower bar for trusted instructors
  }
  
  if (analysis.instructor_credibility === 'medium' && analysis.quality_score >= 7.5) {
    return true; // Lowered from 8.0 to accept more quality content
  }
  
  if (analysis.instructor_credibility === 'low' && analysis.quality_score >= 8.5) {
    return true; // Lowered from 9.0 for expansion
  }
  
  return false;
}

export async function addVideoToLibrary(video: VideoSearchResult, analysis: VideoAnalysis) {
  // Detect video language from title and channel name
  const videoText = `${video.title} ${video.channel_name}`;
  const detectedLanguages = detectVideoLanguage(videoText);
  
  console.log(`   🌍 Detected languages for "${video.title}": ${detectedLanguages.join(', ')}`);
  
  // Insert into ai_video_knowledge
  const [insertedVideo] = await db.insert(aiVideoKnowledge).values({
    youtubeId: video.youtube_id,
    videoUrl: video.youtube_url,
    title: video.title,
    techniqueName: analysis.specific_technique || video.title,
    instructorName: analysis.instructor,
    channelId: video.channel_id,
    channelName: video.channel_name,
    duration: video.duration,
    uploadDate: new Date(video.upload_date),
    viewCount: video.view_count,
    likeCount: video.like_count,
    thumbnailUrl: video.thumbnail_url,
    techniqueType: analysis.technique_type,
    specificTechnique: analysis.specific_technique,
    beltLevel: analysis.belt_level,
    giOrNogi: analysis.gi_preference,
    keyDetails: analysis.key_concepts,
    qualityScore: analysis.quality_score.toString(),
    instructorCredibility: analysis.instructor_credibility.toLowerCase(),
    languages: detectedLanguages,
    status: 'active'
  }).returning();
  
  // AUTO-QUEUE FOR GEMINI PROCESSING
  // Every new video gets queued for knowledge extraction
  if (insertedVideo?.id) {
    const { videoWatchStatus } = await import("@shared/schema");
    await db.insert(videoWatchStatus).values({
      videoId: insertedVideo.id,
      hasTranscript: false,
      processed: false,
      errorMessage: null
    }).onConflictDoNothing();
    console.log(`   🤖 Auto-queued for Gemini knowledge extraction: ID ${insertedVideo.id}`);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
