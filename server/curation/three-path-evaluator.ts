/**
 * 3-Path Video Evaluation System
 * Implements statistically-sound curation with 3 clear acceptance paths
 */

import { evaluateInstructorAuthority, InstructorEvaluation } from './dimension-1-instructor';
import { calculateYouTubeMetrics, YouTubeMetricsAnalysis } from './youtube-metrics-analyzer';
import { analyzeContentQuality, ContentQualityAnalysis } from './content-quality-analyzer';

export interface ThreePathResult {
  decision: 'ACCEPT' | 'REJECT' | 'MANUAL_REVIEW';
  score: number;
  path: 'Elite Instructor' | 'Metrics-Validated' | 'Known Quality + Metrics' | 'Known Quality - Early' | 'None';
  reason: string;
  instructor: InstructorEvaluation;
  youtube: YouTubeMetricsAnalysis;
  content: ContentQualityAnalysis;
}

export interface VideoInput {
  title: string;
  description: string;
  instructorName: string | null;
  channelId: string;
  channelName: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  publishedAt: string;
  channelSubscribers: number;
}

/**
 * Main 3-path evaluation function
 */
export async function evaluateVideoThreePath(video: VideoInput): Promise<ThreePathResult> {
  
  console.log(`\n${'═'.repeat(80)}`);
  console.log(`📹 EVALUATING: "${video.title}"`);
  console.log(`   Channel: ${video.channelName}`);
  console.log(`${'═'.repeat(80)}`);
  
  // Run all analyses in parallel
  const [instructor, youtube, content] = await Promise.all([
    evaluateInstructorAuthority(video.instructorName, video.channelId, video.title),
    calculateYouTubeMetrics(
      video.viewCount,
      video.likeCount,
      video.commentCount,
      video.publishedAt,
      video.channelSubscribers
    ),
    Promise.resolve(analyzeContentQuality(video.title, video.description))
  ]);
  
  console.log(`\n🎓 INSTRUCTOR: ${instructor.tier} (${instructor.credibilityScore}/100)`);
  console.log(`📊 YOUTUBE: ${youtube.score.toFixed(1)}/100 (${youtube.confidence})`);
  console.log(`📝 CONTENT: ${content.score}/100`);
  
  // ═══════════════════════════════════════════════════════════
  // PATH 1: ELITE INSTRUCTOR (TRUST PATH)
  // ═══════════════════════════════════════════════════════════
  
  console.log(`\n🛤️  PATH 1: Elite Instructor Check...`);
  
  if (instructor.tier === 'elite') {
    console.log(`   ✅ Is elite instructor: ${instructor.credibilityScore}/100`);
    
    // Basic sanity check on content (reject obvious spam/vlog content)
    if (content.score >= 60) {
      console.log(`   ✅ Content passes sanity check: ${content.score}/100`);
      console.log(`\n🎯 DECISION: ACCEPT (Elite Instructor Path)`);
      
      return {
        decision: 'ACCEPT',
        score: 90,
        path: 'Elite Instructor',
        reason: `Elite tier instructor - proven track record`,
        instructor,
        youtube,
        content
      };
    } else {
      console.log(`   ⚠️  Content quality suspiciously low: ${content.score}/100`);
      console.log(`   Reasons: ${content.reasonsBad.join(', ')}`);
      console.log(`\n🎯 DECISION: MANUAL_REVIEW (Elite but low content quality)`);
      
      return {
        decision: 'MANUAL_REVIEW',
        score: 65,
        path: 'Elite Instructor',
        reason: 'Elite instructor but content quality below threshold - needs review',
        instructor,
        youtube,
        content
      };
    }
  } else {
    console.log(`   ❌ Not elite instructor (${instructor.tier})`);
  }
  
  // ═══════════════════════════════════════════════════════════
  // PATH 2: METRICS-VALIDATED (DATA PATH)
  // ═══════════════════════════════════════════════════════════
  
  console.log(`\n🛤️  PATH 2: Metrics Validation Check...`);
  
  if (youtube.views >= 10000) {
    console.log(`   ✅ Sufficient data: ${youtube.views} views (${youtube.confidence})`);
    console.log(`   Engagement score: ${youtube.score.toFixed(1)}/100`);
    console.log(`   Content score: ${content.score}/100`);
    
    // Special signals boost acceptance
    const hasSpecialSignal = youtube.signals.isHiddenGem || youtube.signals.isViral || youtube.signals.isEvergreen;
    const metricsThreshold = hasSpecialSignal ? 70 : 75;
    
    if (youtube.score >= metricsThreshold && content.score >= 70) {
      console.log(`   ✅ Exceptional metrics + good content`);
      if (hasSpecialSignal) {
        const signals = [];
        if (youtube.signals.isHiddenGem) signals.push('Hidden Gem');
        if (youtube.signals.isViral) signals.push('Viral');
        if (youtube.signals.isEvergreen) signals.push('Evergreen');
        console.log(`   🔥 Special signals: ${signals.join(', ')}`);
      }
      console.log(`\n🎯 DECISION: ACCEPT (Metrics-Validated Path)`);
      
      return {
        decision: 'ACCEPT',
        score: 85,
        path: 'Metrics-Validated',
        reason: 'Exceptional user engagement validates quality despite unknown instructor',
        instructor,
        youtube,
        content
      };
    } else {
      console.log(`   ❌ Metrics (${youtube.score.toFixed(1)} < ${metricsThreshold}) or content (${content.score} < 70) below threshold`);
    }
  } else {
    console.log(`   ❌ Insufficient data: ${youtube.views} views (need 10K+)`);
  }
  
  // ═══════════════════════════════════════════════════════════
  // PATH 3: KNOWN QUALITY INSTRUCTOR (BALANCED PATH)
  // ═══════════════════════════════════════════════════════════
  
  console.log(`\n🛤️  PATH 3: Known Quality Instructor Check...`);
  
  if (instructor.tier === 'high_quality') {
    console.log(`   ✅ Known quality instructor: ${instructor.credibilityScore}/100`);
    
    const hasMetrics = youtube.views >= 5000;
    let score: number;
    
    if (hasMetrics) {
      // With metrics: balanced scoring (instructor 35%, YouTube 40%, content 25%)
      score = 
        (instructor.credibilityScore * 0.35) +
        (youtube.score * 0.40) +
        (content.score * 0.25);
      
      console.log(`   Scoring (with metrics):`);
      console.log(`     Instructor (35%): ${instructor.credibilityScore} × 0.35 = ${(instructor.credibilityScore * 0.35).toFixed(1)}`);
      console.log(`     YouTube (40%): ${youtube.score.toFixed(1)} × 0.40 = ${(youtube.score * 0.40).toFixed(1)}`);
      console.log(`     Content (25%): ${content.score} × 0.25 = ${(content.score * 0.25).toFixed(1)}`);
      console.log(`     Total: ${score.toFixed(1)}/100`);
      
      if (score >= 72) {
        console.log(`   ✅ Meets threshold (72)`);
        console.log(`\n🎯 DECISION: ACCEPT (Known Quality + Metrics Path)`);
        
        return {
          decision: 'ACCEPT',
          score: score,
          path: 'Known Quality + Metrics',
          reason: 'Known quality instructor with validated metrics',
          instructor,
          youtube,
          content
        };
      } else {
        console.log(`   ❌ Below threshold: ${score.toFixed(1)} < 72`);
      }
    } else {
      // Without metrics: trust instructor more (instructor 60%, content 40%)
      score = 
        (instructor.credibilityScore * 0.60) +
        (content.score * 0.40);
      
      console.log(`   Scoring (without metrics - early video):`);
      console.log(`     Instructor (60%): ${instructor.credibilityScore} × 0.60 = ${(instructor.credibilityScore * 0.60).toFixed(1)}`);
      console.log(`     Content (40%): ${content.score} × 0.40 = ${(content.score * 0.40).toFixed(1)}`);
      console.log(`     Total: ${score.toFixed(1)}/100`);
      
      if (score >= 75) {
        console.log(`   ✅ Meets threshold (75 for early videos)`);
        console.log(`\n🎯 DECISION: ACCEPT (Known Quality - Early Content Path)`);
        
        return {
          decision: 'ACCEPT',
          score: score,
          path: 'Known Quality - Early',
          reason: 'Known quality instructor - early video without metrics yet',
          instructor,
          youtube,
          content
        };
      } else {
        console.log(`   ❌ Below threshold: ${score.toFixed(1)} < 75`);
      }
    }
  } else {
    console.log(`   ❌ Not known quality instructor (${instructor.tier})`);
  }
  
  // ═══════════════════════════════════════════════════════════
  // ALL PATHS FAILED
  // ═══════════════════════════════════════════════════════════
  
  console.log(`\n🎯 DECISION: REJECT (Failed all 3 paths)`);
  console.log(`   Reason: Did not meet Elite, Metrics-Validated, or Known Quality criteria`);
  
  return {
    decision: 'REJECT',
    score: 45,
    path: 'None',
    reason: 'Did not meet acceptance criteria on any path',
    instructor,
    youtube,
    content
  };
}
