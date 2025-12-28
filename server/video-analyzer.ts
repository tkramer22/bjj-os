import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

interface YouTubeVideo {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  thumbnailUrl: string;
  publishedAt: string;
  viewCount?: string;
}

export interface VideoAnalysisResult {
  videoId: string;
  title: string;
  channelTitle: string;
  description: string;
  thumbnailUrl: string;
  url: string;
  
  // Claude analysis
  techniqueName: string;
  techniqueVariation: string;
  instructorName: string;
  instructorCredibility: string;
  teachingStyle: string;
  skillLevel: string;
  giApplicability: string;
  
  // Enhanced scoring (100-point system) - KEY DETAIL QUALITY IS MOST IMPORTANT
  keyDetailQualityScore: number; // 0-40 points (MOST IMPORTANT)
  instructorCredibilityScore: number; // 0-30 points
  teachingClarityScore: number; // 0-20 points
  productionQualityScore: number; // 0-10 points
  totalScore: number; // Sum of above (0-100)
  
  // Quality metrics
  productionQuality: string;
  coversMistakes: boolean;
  includesDrilling: boolean;
  showsLiveApplication: boolean;
  hasRedFlags: boolean; // Generic/vague advice
  
  // Key details
  keyDetails: string;
  summary: string;
  
  publishedAt: string;
  viewCount?: string;
}

export async function analyzeVideo(
  video: YouTubeVideo,
  targetTechnique: string,
  userBeltLevel?: string
): Promise<VideoAnalysisResult> {
  
  const prompt = `You are an elite BJJ black belt instructor evaluating videos for a premium technique curation service. Analyze this video metadata using a strict 100-point scoring system.

**Video Metadata:**
Title: ${video.title}
Channel: ${video.channelTitle}
Description: ${video.description}
Views: ${video.viewCount || 'N/A'}
Published: ${video.publishedAt}

**Priority Instructors (auto 28-30 points):**
John Danaher, Gordon Ryan, Lachlan Giles, Bernardo Faria, JT Torres, Craig Jones, Marcelo Garcia, Mikey Musumeci, Keenan Cornelius, Roger Gracie, Andre Galvao, Rafael Lovato Jr, Giancarlo Bodoni

**SCORING SYSTEM (100 points total):**

1. **Key Detail Quality Score (0-40 points) - MOST IMPORTANT:**
   - Has SPECIFIC micro-adjustment (exact angle, timing, pressure direction, precise grip): 35-40 points
   - Has actionable detail with some specifics: 20-30 points
   - General tip without specifics: 5-15 points
   - No clear detail OR generic advice: 0 points
   
   EXCELLENT EXAMPLES (35-40 points):
   ✅ "Angle your wrist 15° inward at initial contact to prevent the frame"
   ✅ "Keep your shin bone angled DOWN into their bottom leg—not flat. This pins their knee"
   ✅ "Grip their collar with your thumb INSIDE, not outside"
   
   RED FLAGS (hasRedFlags=true, auto 0 points):
   ❌ "Just keep your elbows tight" / "Simply stay tight"
   ❌ "Stay heavy on top"
   ❌ "Control the position"
   ❌ "Maintain pressure"
   ❌ Generic advice without specifics

2. **Instructor Credibility Score (0-30 points):**
   - Priority instructor from list above: 28-30 points
   - World champion competitor: 25-30 points
   - Black belt with major wins: 18-24 points
   - Respected coach/instructor: 12-18 points
   - Known competitor: 8-12 points
   - Other: 0-8 points

3. **Teaching Clarity Score (0-20 points):**
   - Clear demonstration + verbal explanation: 18-20 points
   - Good demo but unclear explanation: 10-12 points
   - Concept explained but poor demo: 8-10 points
   - Unclear: 0 points

4. **Production Quality Score (0-10 points):**
   - Clear audio + good camera angles: 8-10 points
   - Decent quality: 5-7 points
   - Poor quality: 0-3 points

Return ONLY valid JSON (no other text):

{
  "techniqueName": "specific technique (e.g., 'triangle choke')",
  "techniqueVariation": "variation (e.g., 'from closed guard')",
  "instructorName": "actual instructor name",
  "instructorCredibility": "credentials",
  "teachingStyle": "step-by-step|demonstration|conceptual|competition-focused",
  "skillLevel": "beginner|intermediate|advanced|all-levels",
  "giApplicability": "gi-only|nogi-only|both",
  "keyDetailQualityScore": 0-40,
  "instructorCredibilityScore": 0-30,
  "teachingClarityScore": 0-20,
  "productionQualityScore": 0-10,
  "totalScore": sum of above scores,
  "productionQuality": "brief assessment",
  "coversMistakes": true|false,
  "includesDrilling": true|false,
  "showsLiveApplication": true|false,
  "hasRedFlags": true|false,
  "keyDetails": "specific technical details",
  "summary": "why this video is good/bad for ${targetTechnique}"
}

**Be STRICT:** Only videos with totalScore ≥ 70 are world-class. Most should score 40-70. Key Detail Quality is weighted 40% because it's our core value.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const content = message.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response format from Claude');
    }

    // Extract JSON from Claude's response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('No JSON found in Claude response:', content.text);
      throw new Error('Failed to parse Claude analysis');
    }

    const analysis = JSON.parse(jsonMatch[0]);

    return {
      videoId: video.videoId,
      title: video.title,
      channelTitle: video.channelTitle,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      url: `https://youtube.com/watch?v=${video.videoId}`,
      
      techniqueName: analysis.techniqueName || targetTechnique,
      techniqueVariation: analysis.techniqueVariation || '',
      instructorName: analysis.instructorName || video.channelTitle,
      instructorCredibility: analysis.instructorCredibility || 'Unknown',
      teachingStyle: analysis.teachingStyle || 'demonstration',
      skillLevel: analysis.skillLevel || 'all-levels',
      giApplicability: analysis.giApplicability || 'both',
      
      // Enhanced scoring
      instructorCredibilityScore: analysis.instructorCredibilityScore || 10,
      keyDetailQualityScore: analysis.keyDetailQualityScore || 10,
      teachingClarityScore: analysis.teachingClarityScore || 10,
      productionQualityScore: analysis.productionQualityScore || 5,
      totalScore: analysis.totalScore || 35,
      
      productionQuality: analysis.productionQuality || 'Standard quality',
      coversMistakes: analysis.coversMistakes || false,
      includesDrilling: analysis.includesDrilling || false,
      showsLiveApplication: analysis.showsLiveApplication || false,
      hasRedFlags: analysis.hasRedFlags || false,
      
      keyDetails: analysis.keyDetails || '',
      summary: analysis.summary || 'No analysis available',
      
      publishedAt: video.publishedAt,
      viewCount: video.viewCount,
    };

  } catch (error: any) {
    console.error('Error analyzing video:', error.message);
    
    // Return a basic analysis if Claude fails
    return {
      videoId: video.videoId,
      title: video.title,
      channelTitle: video.channelTitle,
      description: video.description,
      thumbnailUrl: video.thumbnailUrl,
      url: `https://youtube.com/watch?v=${video.videoId}`,
      
      techniqueName: targetTechnique,
      techniqueVariation: '',
      instructorName: video.channelTitle,
      instructorCredibility: 'Unknown',
      teachingStyle: 'demonstration',
      skillLevel: 'all-levels',
      giApplicability: 'both',
      
      // Low scores for failed analysis
      instructorCredibilityScore: 10,
      keyDetailQualityScore: 10,
      teachingClarityScore: 10,
      productionQualityScore: 5,
      totalScore: 35,
      
      productionQuality: 'Unknown',
      coversMistakes: false,
      includesDrilling: false,
      showsLiveApplication: false,
      hasRedFlags: false,
      
      keyDetails: '',
      summary: 'Analysis unavailable',
      
      publishedAt: video.publishedAt,
      viewCount: video.viewCount,
    };
  }
}

export async function analyzeVideosInParallel(
  videos: YouTubeVideo[],
  targetTechnique: string,
  userBeltLevel?: string,
  batchSize: number = 3
): Promise<VideoAnalysisResult[]> {
  const results: VideoAnalysisResult[] = [];
  
  // Process videos in batches to avoid rate limits
  for (let i = 0; i < videos.length; i += batchSize) {
    const batch = videos.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(video => analyzeVideo(video, targetTechnique, userBeltLevel))
    );
    results.push(...batchResults);
  }
  
  return results;
}
