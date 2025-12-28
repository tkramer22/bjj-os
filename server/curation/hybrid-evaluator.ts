/**
 * HYBRID 3-PATH + 8-DIMENSIONAL EVALUATION SYSTEM
 * Runs ALL 8 dimensions comprehensively, then routes through 3 clear acceptance paths
 * Generates rich metadata for Professor OS recommendations
 */

import { evaluateInstructorAuthority, InstructorEvaluation } from './dimension-1-instructor';
import { mapToTaxonomy, TaxonomyMapping } from './dimension-2-taxonomy';
import { analyzeCoverageGap, CoverageAnalysis } from './dimension-3-coverage';
import { assessUniqueValue, UniquenessAnalysis } from './dimension-4-uniqueness';
import { analyzeUserValue, UserValueAnalysis } from './dimension-5-uservalue';
import { analyzeBeltLevelFit, BeltLevelAnalysis } from './dimension-6-beltlevel';
import { detectEmergingTechnique, EmergingAnalysis } from './dimension-7-emerging';
import { calculateYouTubeMetrics, YouTubeMetricsAnalysis } from './youtube-metrics-analyzer';
import { analyzeContentQuality, ContentQualityAnalysis } from './content-quality-analyzer';

export interface HybridEvaluationInput {
  youtubeId: string;
  title: string;
  description: string;
  channelName: string;
  channelId: string;
  instructorName: string | null;
  techniqueName: string;
  category: string | null;
  giOrNogi: string | null;
  difficultyScore: number;
  keyDetails: string[];
  
  // YouTube stats
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  channelSubscribers: number;
}

export interface HybridEvaluationResult {
  decision: 'ACCEPT' | 'REJECT' | 'MANUAL_REVIEW';
  finalScore: number;
  acceptancePath: string;
  acceptanceReason: string;
  
  // All dimension results
  dimensions: {
    instructor: InstructorEvaluation;
    taxonomy: TaxonomyMapping;
    coverage: CoverageAnalysis;
    uniqueness: UniquenessAnalysis;
    userValue: UserValueAnalysis;
    beltLevel: BeltLevelAnalysis;
    emerging: EmergingAnalysis;
    youtube: YouTubeMetricsAnalysis;
    content: ContentQualityAnalysis;
  };
  
  // Rich metadata for Professor OS
  metadata: {
    primaryTechnique: string;
    skillLevel: string;
    uniqueValue: string | null;
    instructorName: string;
    instructorTier: string;
    youtubeSignals: string[];
    goodBecause: string[];
    allScores: {
      instructor: number;
      taxonomy: number;
      coverage: number;
      uniqueness: number;
      userValue: number;
      beltLevel: number;
      emerging: number;
      youtube: number;
      content: number;
    };
  };
}

/**
 * Main Hybrid Evaluation Function
 * Runs ALL 8 dimensions, then routes through 3 acceptance paths
 */
export async function evaluateVideoHybrid(
  video: HybridEvaluationInput,
  existingVideoId?: number
): Promise<HybridEvaluationResult> {
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📹 HYBRID EVALUATION: "${video.title}"`);
  console.log(`   Channel: ${video.channelName}`);
  console.log(`${'═'.repeat(80)}`);
  
  // ═══════════════════════════════════════════════════════════
  // RUN ALL 8 DIMENSIONS (Comprehensive Analysis)
  // ═══════════════════════════════════════════════════════════
  
  console.log(`\n🔬 Running comprehensive analysis (8 dimensions)...`);
  
  // Dimension 1: Instructor Authority
  const dim1 = await evaluateInstructorAuthority(
    video.instructorName,
    video.channelId,
    video.title
  );
  
  // Dimension 2: Taxonomy Mapping
  const dim2 = await mapToTaxonomy(
    video.techniqueName,
    video.category || undefined,
    video.giOrNogi || undefined
  );
  
  // Dimension 3: Coverage Balance
  const dim3 = await analyzeCoverageGap(
    video.techniqueName,
    getDifficultyLevel(video.difficultyScore)
  );
  
  // Dimension 4: Unique Value (BLOCKING - must pass)
  const dim4 = await assessUniqueValue(
    video.youtubeId,
    video.techniqueName,
    video.title,
    video.keyDetails,
    video.instructorName || undefined
  );
  
  // Dimension 5: User Feedback
  const dim5 = await analyzeUserValue(existingVideoId || 0);
  
  // Dimension 6: Belt Level Appropriateness  
  const dim6 = analyzeBeltLevelFit(
    video.difficultyScore,
    null, // Belt levels will be inferred from difficulty score
    video.keyDetails
  );
  
  // Dimension 7: Emerging Technique
  const dim7 = await detectEmergingTechnique(
    video.techniqueName,
    video.instructorName,
    new Date(video.publishedAt)
  );
  
  // Dimension 8: YouTube Engagement Metrics
  const dim8 = await calculateYouTubeMetrics(
    video.viewCount,
    video.likeCount,
    video.commentCount,
    video.publishedAt,
    video.channelSubscribers
  );
  
  // Content Quality Analysis (pass instructor tier for tier-aware analysis)
  const contentQuality = analyzeContentQuality(video.title, video.description, dim1.tier);
  
  console.log(`\n📊 DIMENSION SCORES:`);
  console.log(`   D1 - Instructor: ${dim1.credibilityScore}/100 (${dim1.tier})`);
  console.log(`   D2 - Taxonomy: ${dim2.taxonomyScore}/100`);
  console.log(`   D3 - Coverage: ${dim3.currentCount}/${dim3.targetCount} (+${dim3.gapBoost} boost)`);
  console.log(`   D4 - Uniqueness: ${dim4.shouldAdd ? 'PASS' : 'FAIL'} (${dim4.uniqueScore}/100)`);
  console.log(`   D5 - User Value: ${dim5.feedbackScore}/100 ${dim5.hasPerformanceData ? '' : '(new)'}`);
  console.log(`   D6 - Belt Level: ${dim6.appropriatenessScore}/100`);
  console.log(`   D7 - Emerging: ${dim7.isEmergingTechnique ? 'YES' : 'NO'} (+${dim7.emergingBoost} boost)`);
  console.log(`   D8 - YouTube: ${dim8.score.toFixed(1)}/100 (${dim8.confidence}, ${dim8.views} views)`);
  console.log(`   Content Quality: ${contentQuality.score}/100`);
  
  // ═══════════════════════════════════════════════════════════
  // CHECK UNIQUE VALUE FIRST (Blocking Requirement)
  // ═══════════════════════════════════════════════════════════
  
  if (!dim4.shouldAdd) {
    console.log(`\n❌ REJECT: ${dim4.reasonsBad[0] || 'Does not add unique value'}`);
    
    return {
      decision: 'REJECT',
      finalScore: dim4.uniqueScore,
      acceptancePath: 'None - Failed Uniqueness',
      acceptanceReason: dim4.reasonsBad[0] || 'Does not add unique value',
      dimensions: {
        instructor: dim1,
        taxonomy: dim2,
        coverage: dim3,
        uniqueness: dim4,
        userValue: dim5,
        beltLevel: dim6,
        emerging: dim7,
        youtube: dim8,
        content: contentQuality
      },
      metadata: buildMetadata(video, { dim1, dim2, dim3, dim4, dim5, dim6, dim7, dim8, contentQuality })
    };
  }
  
  // ═══════════════════════════════════════════════════════════
  // PATH 1: ELITE INSTRUCTOR (Trust Path)
  // ═══════════════════════════════════════════════════════════
  
  console.log(`\n🛤️  PATH 1: Elite Instructor Check...`);
  
  if (dim1.tier === 'elite') {
    console.log(`   ✅ Elite instructor: ${dim1.credibilityScore}/100`);
    console.log(`   Content type: ${contentQuality.contentType}`);
    console.log(`   Is instructional: ${contentQuality.isInstructional ? 'YES' : 'NO'}`);
    
    // Check if content is actually instructional
    if (!contentQuality.isInstructional) {
      console.log(`   ❌ NOT instructional content`);
      console.log(`   Issues: ${contentQuality.reasonsBad.join(', ')}`);
      console.log(`\n🎯 DECISION: REJECT (Elite instructor but non-instructional content)`);
      
      return {
        decision: 'REJECT',
        finalScore: contentQuality.score,
        acceptancePath: 'None - Not Instructional',
        acceptanceReason: `Elite instructor but ${contentQuality.contentType} content (not instructional)`,
        dimensions: {
          instructor: dim1,
          taxonomy: dim2,
          coverage: dim3,
          uniqueness: dim4,
          userValue: dim5,
          beltLevel: dim6,
          emerging: dim7,
          youtube: dim8,
          content: contentQuality
        },
        metadata: buildMetadata(video, { dim1, dim2, dim3, dim4, dim5, dim6, dim7, dim8, contentQuality })
      };
    }
    
    // Auto-accept elite instructors with instructional content
    console.log(`   ✅ Instructional content from elite instructor`);
    console.log(`\n🎯 DECISION: ACCEPT (Elite Instructor Path)`);
    
    const reasons = [
      `Elite instructor: ${dim1.reasonsGood.join(', ')}`,
      `Unique value: ${dim4.uniqueValueReason || 'Adds unique perspective'}`,
      ...contentQuality.reasonsGood
    ];
    
    return {
      decision: 'ACCEPT',
      finalScore: 90,
      acceptancePath: 'Elite Instructor',
      acceptanceReason: 'Elite tier instructor with instructional content',
      dimensions: {
        instructor: dim1,
        taxonomy: dim2,
        coverage: dim3,
        uniqueness: dim4,
        userValue: dim5,
        beltLevel: dim6,
        emerging: dim7,
        youtube: dim8,
        content: contentQuality
      },
      metadata: buildMetadata(video, { dim1, dim2, dim3, dim4, dim5, dim6, dim7, dim8, contentQuality })
    };
  } else {
    console.log(`   ❌ Not elite (${dim1.tier})`);
  }
  
  // ═══════════════════════════════════════════════════════════
  // PATH 2: METRICS-VALIDATED (Data Path)
  // ═══════════════════════════════════════════════════════════
  
  console.log(`\n🛤️  PATH 2: Metrics-Validated Check...`);
  
  if (dim8.views >= 10000) {
    console.log(`   ✅ Sufficient data: ${dim8.views} views (${dim8.confidence})`);
    console.log(`   YouTube score: ${dim8.score.toFixed(1)}/100`);
    console.log(`   Content score: ${contentQuality.score}/100`);
    
    // Special signals lower threshold
    const hasSpecialSignal = dim8.signals.isHiddenGem || dim8.signals.isViral || dim8.signals.isEvergreen;
    const metricsThreshold = hasSpecialSignal ? 70 : 75;
    
    if (dim8.score >= metricsThreshold && contentQuality.score >= 70) {
      console.log(`   ✅ Exceptional metrics + good content`);
      
      if (hasSpecialSignal) {
        const signals = [];
        if (dim8.signals.isHiddenGem) signals.push('Hidden Gem');
        if (dim8.signals.isViral) signals.push('Viral');
        if (dim8.signals.isEvergreen) signals.push('Evergreen');
        console.log(`   🔥 Special signals: ${signals.join(', ')}`);
      }
      
      console.log(`\n🎯 DECISION: ACCEPT (Metrics-Validated Path)`);
      
      return {
        decision: 'ACCEPT',
        finalScore: 85,
        acceptancePath: 'Metrics-Validated',
        acceptanceReason: 'Exceptional user engagement validates quality despite unknown instructor',
        dimensions: {
          instructor: dim1,
          taxonomy: dim2,
          coverage: dim3,
          uniqueness: dim4,
          userValue: dim5,
          beltLevel: dim6,
          emerging: dim7,
          youtube: dim8,
          content: contentQuality
        },
        metadata: buildMetadata(video, { dim1, dim2, dim3, dim4, dim5, dim6, dim7, dim8, contentQuality })
      };
    } else {
      console.log(`   ❌ Metrics (${dim8.score.toFixed(1)} < ${metricsThreshold}) or content (${contentQuality.score} < 70) below threshold`);
    }
  } else {
    console.log(`   ❌ Insufficient data: ${dim8.views} views (need 10K+)`);
  }
  
  // ═══════════════════════════════════════════════════════════
  // PATH 3: KNOWN QUALITY INSTRUCTOR (Balanced Path)
  // ═══════════════════════════════════════════════════════════
  
  console.log(`\n🛤️  PATH 3: Known Quality Instructor Check...`);
  
  if (dim1.tier === 'high_quality') {
    console.log(`   ✅ Known quality instructor: ${dim1.credibilityScore}/100`);
    
    const hasMetrics = dim8.views >= 5000;
    let score: number;
    
    if (hasMetrics) {
      // With metrics: balanced (instructor 35%, YouTube 40%, content 25%)
      score = 
        (dim1.credibilityScore * 0.35) +
        (dim8.score * 0.40) +
        (contentQuality.score * 0.25);
      
      console.log(`   Scoring (with metrics):`);
      console.log(`     Instructor (35%): ${dim1.credibilityScore} × 0.35 = ${(dim1.credibilityScore * 0.35).toFixed(1)}`);
      console.log(`     YouTube (40%): ${dim8.score.toFixed(1)} × 0.40 = ${(dim8.score * 0.40).toFixed(1)}`);
      console.log(`     Content (25%): ${contentQuality.score} × 0.25 = ${(contentQuality.score * 0.25).toFixed(1)}`);
      console.log(`     Total: ${score.toFixed(1)}/100 (threshold: 72)`);
      
      if (score >= 72) {
        console.log(`\n🎯 DECISION: ACCEPT (Known Quality + Metrics Path)`);
        
        return {
          decision: 'ACCEPT',
          finalScore: score,
          acceptancePath: 'Known Quality + Metrics',
          acceptanceReason: 'Known quality instructor with validated metrics',
          dimensions: {
            instructor: dim1,
            taxonomy: dim2,
            coverage: dim3,
            uniqueness: dim4,
            userValue: dim5,
            beltLevel: dim6,
            emerging: dim7,
            youtube: dim8,
            content: contentQuality
          },
          metadata: buildMetadata(video, { dim1, dim2, dim3, dim4, dim5, dim6, dim7, dim8, contentQuality })
        };
      } else {
        console.log(`   ❌ Below threshold: ${score.toFixed(1)} < 72`);
      }
    } else {
      // Without metrics: trust instructor more (instructor 60%, content 40%)
      score = 
        (dim1.credibilityScore * 0.60) +
        (contentQuality.score * 0.40);
      
      console.log(`   Scoring (without metrics - early video):`);
      console.log(`     Instructor (60%): ${dim1.credibilityScore} × 0.60 = ${(dim1.credibilityScore * 0.60).toFixed(1)}`);
      console.log(`     Content (40%): ${contentQuality.score} × 0.40 = ${(contentQuality.score * 0.40).toFixed(1)}`);
      console.log(`     Total: ${score.toFixed(1)}/100 (threshold: 75 for early)`);
      
      if (score >= 75) {
        console.log(`\n🎯 DECISION: ACCEPT (Known Quality - Early Content Path)`);
        
        return {
          decision: 'ACCEPT',
          finalScore: score,
          acceptancePath: 'Known Quality - Early',
          acceptanceReason: 'Known quality instructor - early video without metrics yet',
          dimensions: {
            instructor: dim1,
            taxonomy: dim2,
            coverage: dim3,
            uniqueness: dim4,
            userValue: dim5,
            beltLevel: dim6,
            emerging: dim7,
            youtube: dim8,
            content: contentQuality
          },
          metadata: buildMetadata(video, { dim1, dim2, dim3, dim4, dim5, dim6, dim7, dim8, contentQuality })
        };
      } else {
        console.log(`   ❌ Below threshold: ${score.toFixed(1)} < 75`);
      }
    }
  } else {
    console.log(`   ❌ Not known quality (${dim1.tier})`);
  }
  
  // ═══════════════════════════════════════════════════════════
  // ALL PATHS FAILED
  // ═══════════════════════════════════════════════════════════
  
  console.log(`\n🎯 DECISION: REJECT (Failed all 3 paths)`);
  
  return {
    decision: 'REJECT',
    finalScore: 50,
    acceptancePath: 'None',
    acceptanceReason: 'Did not meet acceptance criteria on any path',
    dimensions: {
      instructor: dim1,
      taxonomy: dim2,
      coverage: dim3,
      uniqueness: dim4,
      userValue: dim5,
      beltLevel: dim6,
      emerging: dim7,
      youtube: dim8,
      content: contentQuality
    },
    metadata: buildMetadata(video, { dim1, dim2, dim3, dim4, dim5, dim6, dim7, dim8, contentQuality })
  };
}

// Helper function
function getDifficultyLevel(score: number): 'beginner' | 'intermediate' | 'advanced' {
  if (score <= 3) return 'beginner';
  if (score <= 7) return 'intermediate';
  return 'advanced';
}

// Build rich metadata for Professor OS
function buildMetadata(video: HybridEvaluationInput, dimensions: any) {
  const { dim1, dim2, dim3, dim4, dim5, dim6, dim7, dim8, contentQuality } = dimensions;
  
  const youtubeSignals: string[] = [];
  if (dim8.signals.isHiddenGem) youtubeSignals.push('Hidden Gem');
  if (dim8.signals.isViral) youtubeSignals.push('Viral');
  if (dim8.signals.isTrending) youtubeSignals.push('Trending');
  if (dim8.signals.isEvergreen) youtubeSignals.push('Evergreen');
  
  const goodBecause: string[] = [
    ...dim1.reasonsGood,
    ...dim3.reasonsGood,
    ...dim4.reasonsGood,
    ...dim5.reasonsGood,
    ...dim6.reasonsGood,
    ...dim7.reasonsGood,
    ...contentQuality.reasonsGood
  ];
  
  return {
    primaryTechnique: video.techniqueName,
    skillLevel: contentQuality.techniqueDepth,
    uniqueValue: dim4.uniqueValueReason,
    instructorName: dim1.tier === 'unknown' ? video.channelName : (video.instructorName || video.channelName),
    instructorTier: dim1.tier,
    youtubeSignals,
    goodBecause,
    allScores: {
      instructor: dim1.credibilityScore,
      taxonomy: dim2.taxonomyScore,
      coverage: dim3.currentCount,
      uniqueness: dim4.uniqueScore,
      userValue: dim5.feedbackScore,
      beltLevel: dim6.appropriatenessScore,
      emerging: dim7.emergingBoost,
      youtube: Math.round(dim8.score),
      content: contentQuality.score
    }
  };
}
