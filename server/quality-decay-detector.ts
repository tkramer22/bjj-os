import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { techniqueQualityReviews, videoAnalyses } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

interface QualityReview {
  still_relevant: boolean;
  quality_score: number;
  decay_factors: string[];
  recommendation: 'keep' | 'archive' | 'replace';
  reasoning: string;
}

// Quarterly quality review of old videos
export async function reviewVideoQuality(videoId: string, videoAnalysis: any) {
  const videoAge = Date.now() - new Date(videoAnalysis.createdAt).getTime();
  const ageInMonths = videoAge / (1000 * 60 * 60 * 24 * 30);

  // Only review videos older than 6 months
  if (ageInMonths < 6) return;

  const prompt = `Review this BJJ instructional video for quality decay:

Video: ${videoAnalysis.videoUrl}
Original Score: ${videoAnalysis.totalScore}
Age: ${ageInMonths.toFixed(0)} months old
Key Detail: ${videoAnalysis.keyDetail}

DECAY FACTORS to check:
1. Technique outdated? (Meta changed, better counters exist)
2. Teaching methods obsolete? (New coaching approaches available)
3. Information superseded? (Better videos exist on same topic)
4. Rule changes? (Competition rules changed)

Return ONLY valid JSON:
{
  "still_relevant": true/false,
  "quality_score": 0-100,
  "decay_factors": ["meta_changed", "better_version_exists"],
  "recommendation": "keep/archive/replace",
  "reasoning": "2-3 sentence explanation"
}

"archive" = Stop sending but keep in database
"replace" = Actively find replacement video
"keep" = Still high quality`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const content = message.content[0];
    const responseText = content.type === 'text' ? content.text : '{}';
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return;

    const review: QualityReview = JSON.parse(jsonMatch[0]);

    // Save review to database
    await db.insert(techniqueQualityReviews).values({
      videoId: videoId,
      originalScore: parseInt(videoAnalysis.qualityScore) || 0,
      adjustedScore: review.quality_score,
      stillRelevant: review.still_relevant,
      actionTaken: review.recommendation,
      reason: review.reasoning,
    });

    // Archive video if recommended
    if (review.recommendation === 'archive') {
      await db
        .update(videoAnalyses)
        .set({ archived: true })
        .where(eq(videoAnalyses.id, videoId))
        .execute();

      console.log(`📦 Archived video: ${videoId}`);
    }

    console.log(`✅ Reviewed video ${videoId}: ${review.recommendation}`);
  } catch (error: any) {
    console.error("Error reviewing video quality:", error.message);
  }
}

// Batch review of old videos
export async function batchQualityReview() {
  console.log("🔍 Starting quarterly quality review...");

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  // Get videos older than 6 months that haven't been reviewed recently
  const oldVideos = await db
    .select()
    .from(videoAnalyses)
    .where(
      sql`${videoAnalyses.analyzedAt} < ${sixMonthsAgo.toISOString()} 
          AND ${videoAnalyses.archived} = false`
    )
    .limit(20) // Review 20 videos per run
    .execute();

  for (const video of oldVideos) {
    await reviewVideoQuality(video.id, video);
  }

  console.log(`✅ Reviewed ${oldVideos.length} videos`);
}

// Get active (non-archived) videos only
export async function getActiveVideos() {
  return await db
    .select()
    .from(videoAnalyses)
    .where(eq(videoAnalyses.archived, false))
    .execute();
}
