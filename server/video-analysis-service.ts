import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';
import { instructorCredibility } from '@shared/schema';
import { eq, sql } from 'drizzle-orm';
import type { VideoSearchResult } from './youtube-service';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export interface VideoAnalysis {
  is_instructional: boolean;
  technique_type: string;
  specific_technique: string;
  instructor: string;
  instructor_credibility: string;
  belt_level: string[];
  gi_preference: string;
  key_concepts: string[];
  quality_score: number;
  should_add: boolean;
  rejection_reason?: string;
  auto_approve?: boolean;
}

export async function analyzeVideo(videoData: VideoSearchResult): Promise<VideoAnalysis> {
  const prompt = `Analyze this BJJ instructional video and extract metadata:

Title: ${videoData.title}
Channel: ${videoData.channel_name}
Views: ${videoData.view_count || 'unknown'}
Duration: ${videoData.duration ? Math.floor(videoData.duration / 60) + ' minutes' : 'unknown'}

Task: Determine if this is a quality BJJ instructional video and extract details.

Return ONLY valid JSON (no markdown, no explanations):
{
  "is_instructional": true/false,
  "technique_type": "guard/pass/submission/escape/transition/takedown/defense/concept",
  "specific_technique": "specific name like 'triangle from closed guard'",
  "instructor": "instructor name if mentioned",
  "instructor_credibility": "high/medium/low",
  "belt_level": ["white", "blue", "purple", "brown", "black"],
  "gi_preference": "gi_only/nogi_only/both",
  "key_concepts": ["concept1", "concept2"],
  "quality_score": 1-10,
  "should_add": true/false,
  "rejection_reason": "if should_add is false, why?"
}

Quality indicators (high score):
- Clear instruction
- Proper demonstration
- Good production quality
- Reputable instructor
- Appropriate pacing
- No dangerous advice

Reject if:
- Not instructional (sparring footage, vlogs)
- Poor quality (can't see technique)
- Dangerous techniques
- Spam/clickbait
- Too short (<2 min) or too long (>30 min)`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: prompt
      }]
    });
    
    let analysisText = response.content[0].type === 'text' ? response.content[0].text : '';
    
    // Strip markdown code blocks if present (AI sometimes wraps JSON in ```json...```)
    analysisText = analysisText.trim();
    if (analysisText.startsWith('```')) {
      // Remove opening ```json or ``` and closing ```
      analysisText = analysisText.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    
    const analysis: VideoAnalysis = JSON.parse(analysisText);
    
    // Check instructor credibility from database (case-insensitive)
    if (analysis.instructor) {
      const credResult = await db
        .select()
        .from(instructorCredibility)
        .where(sql`LOWER(${instructorCredibility.name}) = LOWER(${analysis.instructor})`)
        .limit(1);
      
      if (credResult.length > 0) {
        // Normalize to lowercase for consistent comparison
        analysis.instructor_credibility = (credResult[0].credibilityLevel || 'low').toLowerCase();
        analysis.auto_approve = credResult[0].autoApprove || false;
      } else {
        // Ensure credibility is lowercase for threshold checks
        analysis.instructor_credibility = analysis.instructor_credibility.toLowerCase();
      }
    }
    
    return analysis;
  } catch (error) {
    console.error('Video analysis error:', error);
    return {
      is_instructional: false,
      technique_type: '',
      specific_technique: '',
      instructor: '',
      instructor_credibility: 'low',
      belt_level: [],
      gi_preference: 'both',
      key_concepts: [],
      quality_score: 0,
      should_add: false,
      rejection_reason: 'Analysis failed'
    };
  }
}
