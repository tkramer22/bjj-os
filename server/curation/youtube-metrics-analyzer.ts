/**
 * YouTube Metrics Analyzer
 * Analyzes engagement metrics with confidence-adjusted scoring based on sample size
 */

export interface YouTubeMetricsAnalysis {
  score: number; // 0-100, confidence-adjusted
  confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  views: number;
  likes: number;
  comments: number;
  likeRate: number;
  commentRate: number;
  viewToSubRatio: number;
  viewsPerDay: number;
  daysSincePublish: number;
  
  signals: {
    isHiddenGem: boolean;
    isViral: boolean;
    isTrending: boolean;
    isEvergreen: boolean;
  };
  
  breakdown: {
    likeScore: number;
    commentScore: number;
    engagementScore: number;
  };
}

export async function calculateYouTubeMetrics(
  views: number,
  likes: number,
  comments: number,
  publishedAt: string,
  channelSubscribers: number
): Promise<YouTubeMetricsAnalysis> {
  
  console.log(`\n📊 Analyzing YouTube Metrics...`);
  
  const channelSubs = channelSubscribers || 1;
  
  const publishedDate = new Date(publishedAt);
  const daysSincePublish = (Date.now() - publishedDate.getTime()) / 86400000;
  
  // ═══════════════════════════════════════════════════════════
  // CONFIDENCE LEVEL (based on sample size)
  // ═══════════════════════════════════════════════════════════
  
  let confidence: 'LOW' | 'MEDIUM' | 'HIGH';
  let confidenceMultiplier: number;
  
  if (views < 1000) {
    confidence = 'LOW';
    confidenceMultiplier = 0.3;
  } else if (views < 5000) {
    confidence = 'MEDIUM';
    confidenceMultiplier = 0.7;
  } else {
    confidence = 'HIGH';
    confidenceMultiplier = 1.0;
  }
  
  console.log(`   Sample size: ${views} views → Confidence: ${confidence}`);
  
  // ═══════════════════════════════════════════════════════════
  // ENGAGEMENT METRICS
  // ═══════════════════════════════════════════════════════════
  
  const likeRate = views > 0 ? likes / views : 0;
  const commentRate = views > 0 ? comments / views : 0;
  const viewToSubRatio = channelSubs > 0 ? views / channelSubs : 0;
  const viewsPerDay = daysSincePublish > 0 ? views / daysSincePublish : 0;
  
  console.log(`   Like rate: ${(likeRate * 100).toFixed(2)}%`);
  console.log(`   Comment rate: ${(commentRate * 100).toFixed(2)}%`);
  console.log(`   View/Sub ratio: ${viewToSubRatio.toFixed(2)}`);
  console.log(`   Views/day: ${viewsPerDay.toFixed(0)}`);
  
  // ═══════════════════════════════════════════════════════════
  // ENGAGEMENT SCORE (0-100)
  // ═══════════════════════════════════════════════════════════
  
  // Like rate scoring (YouTube educational average is 3-5%)
  let likeScore = 0;
  if (likeRate >= 0.08) likeScore = 100;       // 8%+ = exceptional
  else if (likeRate >= 0.05) likeScore = 80;   // 5%+ = excellent
  else if (likeRate >= 0.03) likeScore = 60;   // 3%+ = good
  else if (likeRate >= 0.02) likeScore = 40;   // 2%+ = average
  else likeScore = 20;                         // <2% = poor
  
  // Comment rate scoring
  let commentScore = 0;
  if (commentRate >= 0.01) commentScore = 100;     // 1%+ = highly engaging
  else if (commentRate >= 0.005) commentScore = 80; // 0.5%+ = good
  else if (commentRate >= 0.002) commentScore = 60; // 0.2%+ = average
  else commentScore = 30;
  
  // Combined engagement score (weighted: likes 60%, comments 40%)
  const engagementScore = (likeScore * 0.6) + (commentScore * 0.4);
  
  // Apply confidence multiplier
  const adjustedScore = engagementScore * confidenceMultiplier;
  
  console.log(`   Engagement score: ${engagementScore.toFixed(1)} → Adjusted: ${adjustedScore.toFixed(1)}`);
  
  // ═══════════════════════════════════════════════════════════
  // SPECIAL SIGNALS
  // ═══════════════════════════════════════════════════════════
  
  // Hidden gem: Small channel going viral
  const isHiddenGem = channelSubs < 10000 && viewToSubRatio > 2.0;
  
  // Viral: Significant reach beyond subscribers
  const isViral = viewToSubRatio > 0.5;
  
  // Trending: New video with high velocity
  const isTrending = daysSincePublish < 7 && viewsPerDay > 1000;
  
  // Evergreen: Old video still getting views
  const isEvergreen = daysSincePublish > 365 && viewsPerDay > 100;
  
  if (isHiddenGem) console.log(`   🔥 HIDDEN GEM detected!`);
  if (isViral) console.log(`   🚀 VIRAL detected!`);
  if (isTrending) console.log(`   📈 TRENDING detected!`);
  if (isEvergreen) console.log(`   ♾️  EVERGREEN detected!`);
  
  // ═══════════════════════════════════════════════════════════
  // RETURN METRICS
  // ═══════════════════════════════════════════════════════════
  
  return {
    score: adjustedScore,
    confidence: confidence,
    views: views,
    likes: likes,
    comments: comments,
    likeRate: likeRate,
    commentRate: commentRate,
    viewToSubRatio: viewToSubRatio,
    viewsPerDay: viewsPerDay,
    daysSincePublish: daysSincePublish,
    
    signals: {
      isHiddenGem: isHiddenGem,
      isViral: isViral,
      isTrending: isTrending,
      isEvergreen: isEvergreen
    },
    
    breakdown: {
      likeScore: likeScore,
      commentScore: commentScore,
      engagementScore: engagementScore
    }
  };
}
