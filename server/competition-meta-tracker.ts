import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { competitionMeta } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

interface CompetitionMetaData {
  trending_techniques: Array<{
    technique: string;
    trend: 'rising' | 'stable' | 'declining';
    competition_context: string;
    reasoning: string;
  }>;
}

// Monthly competition meta analysis
export async function analyzeCompetitionMeta() {
  console.log("🏆 Starting competition meta analysis...");

  const prompt = `Analyze current BJJ competition meta (${new Date().toLocaleDateString()}):

Based on recent major competitions (IBJJF, ADCC, etc.), identify:

HOT (trending UP): Techniques getting more finishes/success NOW
COLD (trending DOWN): Techniques being countered/abandoned

Return ONLY valid JSON:
{
  "hot": ["heel_hook_outside_ashi", "darce_from_front_headlock", "knee_slice_pass"],
  "cold": ["ezekiel_from_closed_guard", "basic_guillotine"],
  "summary": "Leg locks dominating; traditional collar chokes declining as athletes improve guard retention"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const content = message.content[0];
    const responseText = content.type === 'text' ? content.text : '{}';
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Failed to parse competition meta JSON");
      return;
    }

    const data: any = JSON.parse(jsonMatch[0]);

    // Save to database
    await db.insert(competitionMeta).values({
      hotTechniques: JSON.stringify(data.hot || []),
      coldTechniques: JSON.stringify(data.cold || []),
      metaSummary: data.summary || "No summary",
      sourceVideosAnalyzed: ["analysis_based_on_current_meta"],
    });

    console.log(`✅ Competition meta analysis complete`);
  } catch (error: any) {
    console.error("Error analyzing competition meta:", error.message);
  }
}

// Get competition meta score for video scoring
export async function getCompetitionMetaScore(technique: string): Promise<number> {
  const techniqueId = technique.toLowerCase().replace(/\s+/g, '_');
  
  const latestMeta = await db
    .select()
    .from(competitionMeta)
    .orderBy(sql`${competitionMeta.createdAt} DESC`)
    .limit(1)
    .execute();

  if (latestMeta.length === 0) return 0;

  try {
    const hot: string[] = JSON.parse(latestMeta[0].hotTechniques);
    const cold: string[] = JSON.parse(latestMeta[0].coldTechniques);
    
    if (hot.some(t => techniqueId.includes(t) || t.includes(techniqueId))) return 10;
    if (cold.some(t => techniqueId.includes(t) || t.includes(techniqueId))) return -5;
    
    return 0;
  } catch (e) {
    return 0;
  }
}

// Check if technique is currently trending
export async function isTechniqueHot(technique: string): Promise<boolean> {
  const score = await getCompetitionMetaScore(technique);
  return score >= 10;
}
