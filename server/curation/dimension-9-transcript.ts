/**
 * Dimension 9: Transcript Quality
 * Analyzes video transcript for technical depth and teaching quality
 * +5 boost for excellent transcripts, -3 penalty for poor quality
 */

import OpenAI from 'openai';
import axios from 'axios';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface TranscriptAnalysis {
  hasTranscript: boolean;
  qualityScore: number; // 0-100
  boost: number; // -3, 0, +3, or +5
  technicalDepth: number; // 0-10
  teachingStructure: number; // 0-10
  keyDetails: string[];
  reason: string;
}

/**
 * Analyze transcript quality using GPT-4
 */
export async function analyzeTranscriptQuality(
  youtubeId: string
): Promise<TranscriptAnalysis> {
  
  console.log(`\n📝 [D9] Analyzing transcript quality...`);
  
  try {
    // Step 1: Check if video has captions via YouTube API
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) {
      console.log(`   ⚠️  No YouTube API key - skipping transcript`);
      return createNoTranscriptResult();
    }
    
    const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos`;
    const response = await axios.get(videoDetailsUrl, {
      params: {
        part: 'contentDetails',
        id: youtubeId,
        key: apiKey
      },
      timeout: 10000
    });
    
    const hasCaption = response.data.items?.[0]?.contentDetails?.caption === 'true';
    
    if (!hasCaption) {
      console.log(`   ℹ️  No captions available`);
      return createNoTranscriptResult();
    }
    
    console.log(`   ✅ Has captions - fetching transcript...`);
    
    // Step 2: Fetch transcript using youtube-transcript
    const { YoutubeTranscript } = await import('youtube-transcript');
    const transcriptData = await YoutubeTranscript.fetchTranscript(youtubeId);
    
    if (!transcriptData || transcriptData.length === 0) {
      console.log(`   ⚠️  Transcript fetch failed`);
      return createNoTranscriptResult();
    }
    
    const transcript = transcriptData.map((item: any) => item.text).join(' ');
    
    if (transcript.length < 200) {
      console.log(`   ⚠️  Transcript too short (${transcript.length} chars)`);
      return {
        hasTranscript: true,
        qualityScore: 30,
        boost: -3,
        technicalDepth: 2,
        teachingStructure: 2,
        keyDetails: [],
        reason: 'Transcript too short - likely poor content'
      };
    }
    
    console.log(`   Analyzing ${transcript.length} characters with GPT-4...`);
    
    // Step 3: Analyze with GPT-4
    const analysisPrompt = `Analyze this BJJ instructional video transcript for teaching quality and technical depth.

HIGH QUALITY INDICATORS (85-100):
- Specific technical details (hand positions, angles, pressure points, grips)
- Step-by-step breakdown with clear sequence
- Common mistakes addressed ("don't do X because...")
- Conditional scenarios ("if opponent does X, then Y...")
- Proper BJJ terminology (underhook, overhook, frames, etc.)
- Troubleshooting tips
- Setup and finishing details

MEDIUM QUALITY (50-84):
- Some technical details but lacking depth
- Basic step-by-step but not comprehensive
- Some terminology but inconsistent
- Missing troubleshooting or alternatives

LOW QUALITY (0-49):
- Vague instructions ("just do it like this")
- Mostly filler words ("um", "uh", "you know", "like")
- No specific technical details
- Poor structure or rambling
- Music/sound effects without instruction

Return JSON with:
{
  "quality_score": 0-100,
  "technical_depth": 0-10,
  "teaching_structure": 0-10,
  "key_details": ["specific detail 1", "specific detail 2"],
  "reason": "brief explanation of score"
}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: analysisPrompt },
        { role: 'user', content: `Analyze this BJJ transcript:\n\n${transcript.slice(0, 4000)}` }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3
    });
    
    const result = JSON.parse(completion.choices[0].message.content || '{}');
    
    // Determine boost/penalty based on quality
    let boost = 0;
    if (result.quality_score >= 85) {
      boost = 5;
      console.log(`   ✅ EXCELLENT transcript: +5 boost (${result.quality_score}/100)`);
    } else if (result.quality_score >= 70) {
      boost = 3;
      console.log(`   ✅ Good transcript: +3 boost (${result.quality_score}/100)`);
    } else if (result.quality_score < 50) {
      boost = -3;
      console.log(`   ❌ Poor transcript: -3 penalty (${result.quality_score}/100)`);
    } else {
      boost = 0;
      console.log(`   → Average transcript: no change (${result.quality_score}/100)`);
    }
    
    return {
      hasTranscript: true,
      qualityScore: result.quality_score || 50,
      boost,
      technicalDepth: result.technical_depth || 5,
      teachingStructure: result.teaching_structure || 5,
      keyDetails: result.key_details || [],
      reason: result.reason || 'Transcript analyzed'
    };
    
  } catch (error: any) {
    // Check for quota exceeded
    if (error.message?.includes('QUOTA') || error.response?.status === 403) {
      console.log(`   ⚠️  YouTube API quota exceeded - skipping transcript`);
      throw error; // Propagate quota errors
    }
    
    console.log(`   ⚠️  Error analyzing transcript: ${error.message}`);
    return createNoTranscriptResult();
  }
}

/**
 * Create default "no transcript" result
 */
function createNoTranscriptResult(): TranscriptAnalysis {
  return {
    hasTranscript: false,
    qualityScore: 0,
    boost: 0,
    technicalDepth: 0,
    teachingStructure: 0,
    keyDetails: [],
    reason: 'No transcript available'
  };
}
