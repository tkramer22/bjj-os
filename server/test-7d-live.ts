import { db, pool } from './db';
import { searchYouTubeVideosExtended } from './intelligent-curator';
import { runMultiStageAnalysis } from './multi-stage-analyzer';
import { videos, coverageStatus } from '@shared/schema';
import { sql } from 'drizzle-orm';

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

interface DimensionResult {
  name: string;
  score: number;
  details: any;
  boosts: number;
  reasoning: string;
}

interface VideoTestResult {
  videoNumber: number;
  videoId: string;
  title: string;
  channel: string;
  duration: string;
  dimensions: DimensionResult[];
  finalScore: number;
  decision: 'ACCEPT' | 'REJECT';
  reasoning: string;
  metadata: any;
}

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('🧪 7-DIMENSIONAL ALGORITHM - LIVE TEST (20 VIDEOS)');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  const allResults: VideoTestResult[] = [];
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
        const searchResults = await searchYouTubeVideosExtended(
          testQuery.query,
          undefined,
          testQuery.count
        );

        console.log(`   ✅ Found ${searchResults.length} videos`);
        
        if (searchResults.length > 0) {
          console.log(`   Videos:`);
          searchResults.forEach((video, idx) => {
            console.log(`     ${idx + 1}. "${video.title}" by ${video.channelName}`);
          });
        }

        // STEP 2: RUN EACH VIDEO THROUGH 7D ALGORITHM
        for (const video of searchResults) {
          videoCounter++;
          
          console.log('\n═══════════════════════════════════════════════════════════════════════════════');
          console.log(`📹 VIDEO #${videoCounter}: "${video.title}"`);
          console.log(`   Channel: ${video.channelName}`);
          console.log(`   Video ID: ${video.videoId}`);
          console.log(`   Duration: ${Math.floor(video.durationSeconds / 60)}:${(video.durationSeconds % 60).toString().padStart(2, '0')}`);
          console.log('═══════════════════════════════════════════════════════════════════════════════\n');

          try {
            // Run multi-stage analysis which includes 7D evaluation
            const analysis = await runMultiStageAnalysis(video);

            // Extract 7D results from metadata
            const metadata = analysis.metadata || {};
            const dimensionScores = metadata.dimensionScores || {};

            // Display each dimension
            console.log('🎓 DIMENSION 1: INSTRUCTOR AUTHORITY');
            console.log(`   Tier: ${metadata.tier || 'unknown'}`);
            console.log(`   Credibility Score: ${dimensionScores.instructorAuthority || 0}/100`);
            console.log(`   Instructor: ${video.channelName}`);
            if (metadata.goodBecause && metadata.goodBecause.length > 0) {
              console.log(`   ✅ Strengths: ${metadata.goodBecause.filter((r: string) => r.includes('Instructor') || r.includes('Elite')).join(', ')}`);
            }
            console.log('');

            console.log('📚 DIMENSION 2: TAXONOMY MAPPING');
            console.log(`   Taxonomy Score: ${dimensionScores.taxonomyMapping || 0}/100`);
            console.log(`   Technique Identified: ${video.techniqueName || 'Not specified'}`);
            console.log('');

            console.log('💎 DIMENSION 3: COVERAGE BALANCE');
            console.log(`   Coverage Score: ${dimensionScores.coverageBalance || 0}/100`);
            console.log(`   Technique: ${video.techniqueName || 'Not specified'}`);
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
            console.log(`   Difficulty: ${video.difficultyScore || 'Unknown'}/10`);
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

            console.log(`FINAL SCORE: ${analysis.finalScore}/100`);
            console.log(`THRESHOLD: 71/100`);
            console.log(`DECISION: ${analysis.decision === 'ACCEPT' ? '✅ ACCEPT' : '❌ REJECT'}`);
            console.log(`\nREASONING: ${analysis.acceptanceReason}\n`);

            if (metadata.badBecause && metadata.badBecause.length > 0) {
              console.log('Issues Identified:');
              metadata.badBecause.forEach((reason: string) => {
                console.log(`   ❌ ${reason}`);
              });
              console.log('');
            }

            // Store result
            allResults.push({
              videoNumber: videoCounter,
              videoId: video.videoId,
              title: video.title,
              channel: video.channelName,
              duration: `${Math.floor(video.durationSeconds / 60)}:${(video.durationSeconds % 60).toString().padStart(2, '0')}`,
              dimensions: [],
              finalScore: analysis.finalScore,
              decision: analysis.decision,
              reasoning: analysis.acceptanceReason,
              metadata: analysis.metadata
            });

            // STEP 3: SAVE ACCEPTED VIDEOS
            if (analysis.decision === 'ACCEPT') {
              console.log('💾 Saving to database...');
              
              try {
                await db.insert(videos).values({
                  videoId: video.videoId,
                  title: video.title,
                  channelName: video.channelName,
                  thumbnailUrl: video.thumbnailUrl,
                  durationSeconds: video.durationSeconds,
                  publishedAt: new Date(video.publishedAt),
                  techniqueName: video.techniqueName || 'Unknown',
                  difficultyScore: video.difficultyScore || 5,
                  qualityScore: analysis.finalScore,
                  decision: 'ACCEPT',
                  metadata: analysis.metadata || {}
                }).onConflictDoNothing();
                
                console.log('   ✅ Video saved to database\n');
              } catch (dbError) {
                console.log(`   ⚠️  Database save skipped (may already exist)\n`);
              }
            }

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

    if (accepted.length > 0) {
      console.log('TOP ACCEPTED VIDEOS:');
      accepted
        .sort((a, b) => b.finalScore - a.finalScore)
        .slice(0, 5)
        .forEach((result, idx) => {
          console.log(`${idx + 1}. "${result.title}" - ${result.finalScore}/100`);
          console.log(`   Channel: ${result.channel}`);
          console.log(`   Reason: ${result.reasoning}`);
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

    // STEP 5: VALIDATION CHECKS
    console.log('═══════════════════════════════════════════════════════════════════════════════');
    console.log('🔍 STEP 5: DATA VALIDATION');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

    const recentVideos = await db.execute(sql`
      SELECT COUNT(*) as count 
      FROM videos 
      WHERE added_at > NOW() - INTERVAL '10 minutes'
    `);
    console.log(`1. Videos added in last 10 minutes: ${recentVideos.rows[0]?.count || 0}`);

    const sampleMetadata = await db.execute(sql`
      SELECT video_id, title, quality_score, decision
      FROM videos 
      WHERE added_at > NOW() - INTERVAL '10 minutes' 
      AND decision = 'ACCEPT'
      LIMIT 3
    `);
    
    if (sampleMetadata.rows.length > 0) {
      console.log('\n2. Sample accepted videos:');
      sampleMetadata.rows.forEach((row: any) => {
        console.log(`   • "${row.title}" (Score: ${row.quality_score})`);
      });
    }

    console.log('\n═══════════════════════════════════════════════════════════════════════════════');
    console.log('✅ TEST COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('📊 Closing database pool...');
    await pool.end();
    console.log('✅ Database pool closed\n');
  }
}

main().catch(console.error);
