import { db, pool } from './db';
import { evaluate7Dimensions } from './curation/final-evaluator';
import type { VideoAnalysisResult } from './video-analyzer';

interface TestQuery {
  query: string;
  count: number;
  description: string;
}

const TEST_QUERIES: TestQuery[] = [
  { query: "lachlan giles heel hooks", count: 5, description: "Elite instructor (Lachlan Giles) - leg locks" },
  { query: "bjj armbar tutorial", count: 5, description: "Common technique - coverage balancing test" },
  { query: "gordon ryan passing", count: 5, description: "Elite instructor (Gordon Ryan) - passing" },
  { query: "bjj guard sweeps beginner", count: 5, description: "Skill level detection - beginner content" }
];

async function searchYouTube(query: string, maxResults: number = 5) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not found');

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('q', query);
  url.searchParams.append('type', 'video');
  url.searchParams.append('maxResults', maxResults.toString());
  url.searchParams.append('order', 'relevance');
  url.searchParams.append('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`YouTube API error: ${response.status}`);

  const data: any = await response.json();
  return data.items || [];
}

async function getVideoDetails(videoId: string) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not found');

  const url = new URL('https://www.googleapis.com/youtube/v3/videos');
  url.searchParams.append('part', 'contentDetails,snippet,statistics');
  url.searchParams.append('id', videoId);
  url.searchParams.append('key', apiKey);

  const response = await fetch(url.toString());
  if (!response.ok) throw new Error(`YouTube API error: ${response.status}`);

  const data: any = await response.json();
  return data.items?.[0];
}

function parseDurationToSeconds(duration: string): number {
  if (!duration) return 600;
  const matches = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!matches) return 600;
  const hours = parseInt(matches[1] || '0');
  const minutes = parseInt(matches[2] || '0');
  const seconds = parseInt(matches[3] || '0');
  return hours * 3600 + minutes * 60 + seconds;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('🧪 7-DIMENSIONAL ALGORITHM - LIVE TEST (20 VIDEOS)');
  console.log('⚠️  BYPASS MODE: Testing 7D algorithm without transcript requirement');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const allResults: any[] = [];
  let videoCounter = 0;
  const startTime = Date.now();

  try {
    // STEP 1: SEARCH YOUTUBE FOR EACH QUERY
    console.log('📺 STEP 1: SEARCHING YOUTUBE\n');
    
    for (const testQuery of TEST_QUERIES) {
      console.log(`\n🔍 Query: "${testQuery.query}"`);
      console.log(`   Description: ${testQuery.description}`);
      console.log(`   Fetching ${testQuery.count} videos...`);

      try {
        const searchResults = await searchYouTube(testQuery.query, testQuery.count);
        console.log(`   ✅ Found ${searchResults.length} videos`);
        
        if (searchResults.length > 0) {
          console.log(`   Videos:`);
          searchResults.forEach((item: any, idx: number) => {
            console.log(`     ${idx + 1}. "${item.snippet.title}" by ${item.snippet.channelTitle}`);
          });
        }

        // STEP 2: RUN EACH VIDEO THROUGH 7D ALGORITHM
        for (const item of searchResults) {
          videoCounter++;
          
          const videoId = item.id.videoId;
          const title = item.snippet.title;
          const channelName = item.snippet.channelTitle;

          // Get detailed video info
          const details = await getVideoDetails(videoId);
          if (!details) {
            console.log(`   ⚠️  Could not fetch details for ${videoId}, skipping...`);
            continue;
          }

          const durationSeconds = parseDurationToSeconds(details.contentDetails.duration);
          
          console.log('\n═══════════════════════════════════════════════════════════════════════════════');
          console.log(`📹 VIDEO #${videoCounter}: "${title}"`);
          console.log(`   Channel: ${channelName}`);
          console.log(`   Video ID: ${videoId}`);
          console.log(`   Duration: ${Math.floor(durationSeconds / 60)}:${(durationSeconds % 60).toString().padStart(2, '0')}`);
          console.log('═══════════════════════════════════════════════════════════════════════════════\n');

          // Create mock video object for 7D evaluation
          const mockVideo: VideoAnalysisResult = {
            videoId,
            title,
            channelName,
            thumbnailUrl: item.snippet.thumbnails.high?.url || '',
            durationSeconds,
            publishedAt: item.snippet.publishedAt,
            techniqueName: extractTechnique(title),
            difficultyScore: estimateDifficulty(title),
            decision: 'PENDING' as any,
            reason: '',
            analysisMetadata: {
              stage1: { passed: true, score: 75, reason: 'Quick filter passed' },
              stage2: { passed: true, score: 65, reason: 'Bypass mode - no transcript check' }
            }
          };

          try {
            // Run 7D evaluation
            const result = await evaluate7Dimensions(mockVideo, undefined);

            // Display results
            const metadata = result.metadata || {};
            const dimensionScores = result.dimensionScores || {};

            console.log('🎓 DIMENSION 1: INSTRUCTOR AUTHORITY');
            console.log(`   Tier: ${metadata.tier || 'unknown'}`);
            console.log(`   Credibility Score: ${dimensionScores.instructorAuthority || 0}/100`);
            console.log(`   Instructor: ${channelName}`);
            if (metadata.goodBecause && metadata.goodBecause.length > 0) {
              const instructorReasons = metadata.goodBecause.filter((r: string) => 
                r.includes('Instructor') || r.includes('Elite') || r.includes('credibility')
              );
              if (instructorReasons.length > 0) {
                console.log(`   ✅ ${instructorReasons.join(', ')}`);
              }
            }
            console.log('');

            console.log('📚 DIMENSION 2: TAXONOMY MAPPING');
            console.log(`   Taxonomy Score: ${dimensionScores.taxonomyMapping || 0}/100`);
            console.log(`   Technique Identified: ${mockVideo.techniqueName || 'Not specified'}`);
            console.log('');

            console.log('💎 DIMENSION 3: COVERAGE BALANCE');
            console.log(`   Coverage Score: ${dimensionScores.coverageBalance || 0}/100`);
            console.log(`   Technique: ${mockVideo.techniqueName || 'Not specified'}`);
            if (metadata.goodBecause) {
              const coverageReasons = metadata.goodBecause.filter((r: string) => r.includes('Coverage') || r.includes('gap'));
              if (coverageReasons.length > 0) {
                console.log(`   ✅ ${coverageReasons.join(', ')}`);
              }
            }
            console.log('');

            console.log('🔥 DIMENSION 4: UNIQUE VALUE');
            console.log(`   Uniqueness Score: ${dimensionScores.uniqueValue || 0}/100`);
            if (metadata.uniqueValueReason) {
              console.log(`   Unique Value: ${metadata.uniqueValueReason}`);
            }
            console.log('');

            console.log('⭐ DIMENSION 5: USER FEEDBACK');
            console.log(`   Feedback Score: ${dimensionScores.userFeedback || 0}/100`);
            console.log(`   Status: New video - no historical data`);
            console.log('');

            console.log('📖 DIMENSION 6: BELT-LEVEL APPROPRIATENESS');
            console.log(`   Belt Level Score: ${dimensionScores.beltLevelFit || 0}/100`);
            console.log(`   Difficulty: ${mockVideo.difficultyScore || 'Unknown'}/10`);
            console.log('');

            console.log('🌟 DIMENSION 7: EMERGING TECHNIQUE DETECTION');
            console.log(`   Emerging Score: ${dimensionScores.emergingDetection || 0}/100`);
            if (metadata.goodBecause) {
              const emergingReasons = metadata.goodBecause.filter((r: string) => r.includes('Emerging'));
              if (emergingReasons.length > 0) {
                console.log(`   ✅ ${emergingReasons.join(', ')}`);
              }
            }
            console.log('');

            console.log('─────────────────────────────────────────────────────────────────────────────');
            console.log('🎯 FINAL AGGREGATE SCORING\n');
            
            if (metadata.boostsApplied && metadata.boostsApplied.length > 0) {
              console.log('Boosts Applied:');
              metadata.boostsApplied.forEach((boost: string) => {
                console.log(`   • ${boost}`);
              });
              console.log('');
            }

            console.log(`FINAL SCORE: ${result.finalScore}/100`);
            console.log(`THRESHOLD: 71/100`);
            console.log(`DECISION: ${result.decision === 'ACCEPT' ? '✅ ACCEPT' : '❌ REJECT'}`);
            console.log(`\nREASONING: ${result.acceptanceReason}\n`);

            if (metadata.badBecause && metadata.badBecause.length > 0) {
              console.log('Issues Identified:');
              metadata.badBecause.forEach((reason: string) => {
                console.log(`   ❌ ${reason}`);
              });
              console.log('');
            }

            allResults.push({
              videoNumber: videoCounter,
              videoId,
              title,
              channel: channelName,
              finalScore: result.finalScore,
              decision: result.decision,
              reasoning: result.acceptanceReason,
              metadata: result.metadata
            });

          } catch (analysisError) {
            console.error(`   ❌ ERROR analyzing video: ${analysisError}`);
            console.log('');
          }
        }

      } catch (searchError) {
        console.error(`   ❌ Search failed: ${searchError}`);
      }
    }

    // STEP 4: SUMMARY STATISTICS
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(1);

    console.log('\n═══════════════════════════════════════════════════════════════════════════════');
    console.log('📊 TEST RUN SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    const accepted = allResults.filter(r => r.decision === 'ACCEPT');
    const rejected = allResults.filter(r => r.decision === 'REJECT');

    console.log('OVERALL RESULTS:');
    console.log(`• Total Videos Analyzed: ${allResults.length}`);
    console.log(`• ✅ Accepted: ${accepted.length} (${((accepted.length / allResults.length) * 100).toFixed(1)}%)`);
    console.log(`• ❌ Rejected: ${rejected.length} (${((rejected.length / allResults.length) * 100).toFixed(1)}%)`);
    console.log(`• ⏱️  Processing Time: ${duration} seconds`);
    console.log('');

    // Group by instructor tier
    const byTier: Record<string, number> = {};
    allResults.forEach(r => {
      const tier = r.metadata?.tier || 'unknown';
      byTier[tier] = (byTier[tier] || 0) + 1;
    });

    console.log('INSTRUCTOR BREAKDOWN:');
    Object.entries(byTier).forEach(([tier, count]) => {
      console.log(`• ${tier}: ${count} videos`);
    });
    console.log('');

    if (accepted.length > 0) {
      console.log('TOP ACCEPTED VIDEOS:');
      accepted
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 5)
        .forEach((result, idx) => {
          console.log(`${idx + 1}. "${result.title}" - ${result.finalScore}/100`);
          console.log(`   Channel: ${result.channel}`);
          console.log(`   Tier: ${result.metadata?.tier || 'unknown'}`);
          console.log('');
        });
    }

    if (rejected.length > 0) {
      console.log('REJECTED EXAMPLES:');
      rejected.slice(0, 3).forEach((result, idx) => {
        console.log(`${idx + 1}. "${result.title}" - ${result.finalScore}/100`);
        console.log(`   Channel: ${result.channel}`);
        console.log(`   Reason: ${result.reasoning}`);
        console.log('');
      });
    }

    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('✅ TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('📊 Closing database pool...');
    await pool.end();
    console.log('✅ Database pool closed\n');
    process.exit(0);
  }
}

// Helper functions
function extractTechnique(title: string): string {
  const lower = title.toLowerCase();
  
  // Common techniques
  if (lower.includes('heel hook')) return 'Heel Hook';
  if (lower.includes('armbar') || lower.includes('arm bar')) return 'Armbar';
  if (lower.includes('triangle')) return 'Triangle Choke';
  if (lower.includes('sweep')) return 'Guard Sweep';
  if (lower.includes('passing') || lower.includes('pass')) return 'Guard Pass';
  if (lower.includes('rear naked') || lower.includes('rnc')) return 'Rear Naked Choke';
  if (lower.includes('kimura')) return 'Kimura';
  if (lower.includes('guillotine')) return 'Guillotine';
  if (lower.includes('berimbolo')) return 'Berimbolo';
  
  return 'General Technique';
}

function estimateDifficulty(title: string): number {
  const lower = title.toLowerCase();
  
  if (lower.includes('beginner') || lower.includes('basic') || lower.includes('fundamental')) return 3;
  if (lower.includes('advanced') || lower.includes('expert')) return 8;
  if (lower.includes('intermediate')) return 5;
  if (lower.includes('competition') || lower.includes('adcc') || lower.includes('worlds')) return 7;
  
  return 5; // default middle difficulty
}

main().catch(console.error);
