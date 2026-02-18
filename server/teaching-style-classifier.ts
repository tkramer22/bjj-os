import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export interface TeachingStyleProfile {
  verbosity: 'verbose' | 'medium' | 'concise';
  approach: 'theoretical' | 'balanced' | 'practical';
  pacing: 'slow' | 'medium' | 'fast';
  detail_level: 'high' | 'medium' | 'low';
}

// Classify teaching style from video analysis
export async function classifyTeachingStyle(
  videoTitle: string,
  keyDetails: string,
  videoDuration?: number
): Promise<string> {
  const prompt = `Analyze the teaching style of this BJJ instructional:

Title: ${videoTitle}
Key Details: ${keyDetails}
${videoDuration ? `Duration: ${Math.floor(videoDuration / 60)} minutes` : ''}

Classify the teaching style:

VERBOSITY:
- verbose: Lots of explanation, multiple perspectives, extended discussion
- medium: Balanced explanation with key points
- concise: Direct, minimal talking, quick demos

APPROACH:
- theoretical: Concepts, principles, why it works
- balanced: Mix of concepts and drilling
- practical: Show and drill, minimal theory

PACING:
- slow: Step-by-step, lots of repetition
- medium: Standard instructional pace
- fast: Quick overview, assumes knowledge

DETAIL_LEVEL:
- high: Micro-adjustments, subtle points
- medium: Key points covered
- low: Basic overview only

Return ONLY valid JSON:
{
  "verbosity": "medium",
  "approach": "practical",
  "pacing": "medium",
  "detail_level": "high"
}`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const content = message.content[0];
    const responseText = content.type === 'text' ? content.text : '{}';
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return JSON.stringify({
        verbosity: "medium",
        approach: "balanced",
        pacing: "medium",
        detail_level: "medium"
      });
    }

    return jsonMatch[0];
  } catch (error: any) {
    console.error("Error classifying teaching style:", error.message);
    return JSON.stringify({
      verbosity: "medium",
      approach: "balanced",
      pacing: "medium",
      detail_level: "medium"
    });
  }
}

// Match user preference with teaching style
export function matchTeachingStyle(
  userPreferredStyle: TeachingStyleProfile | null,
  videoStyle: TeachingStyleProfile
): number {
  if (!userPreferredStyle) return 0;

  let matchScore = 0;

  // Exact matches get 5 points each, max 20 bonus
  if (userPreferredStyle.verbosity === videoStyle.verbosity) matchScore += 5;
  if (userPreferredStyle.approach === videoStyle.approach) matchScore += 5;
  if (userPreferredStyle.pacing === videoStyle.pacing) matchScore += 5;
  if (userPreferredStyle.detail_level === videoStyle.detail_level) matchScore += 5;

  return matchScore;
}
