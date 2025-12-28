import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { emergingInstructors } from "@shared/schema";
import { eq } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

interface InstructorAnalysis {
  is_quality_instructor: boolean;
  credibility_score: number;
  specialty: string;
  teaching_style: {
    verbosity: string;
    approach: string;
  };
  should_monitor: boolean;
  reasoning: string;
}

interface YouTubeSearchResponse {
  items: Array<{
    id: { videoId: string };
    snippet: {
      title: string;
      channelTitle: string;
      channelId: string;
    };
  }>;
}

interface ChannelInfo {
  channelId: string;
  channelTitle: string;
  videos: Array<{ title: string; videoId: string }>;
}

// Weekly instructor discovery function
export async function discoverNewInstructors() {
  console.log("🔍 Starting instructor discovery...");
  
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('YOUTUBE_API_KEY not found');
    return;
  }
  
  const searchQueries = [
    "BJJ technique 2025",
    "jiu jitsu instructional",
    "grappling details",
    "brazilian jiu jitsu breakdown"
  ];
  
  const candidateChannels: ChannelInfo[] = [];
  
  try {
    // Step 1: Search YouTube for new channels
    for (const query of searchQueries) {
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.searchParams.append('part', 'snippet');
      url.searchParams.append('q', query);
      url.searchParams.append('type', 'video');
      url.searchParams.append('maxResults', '10');
      url.searchParams.append('order', 'relevance');
      url.searchParams.append('key', apiKey);

      const response = await fetch(url.toString());
      if (!response.ok) continue;

      const data: YouTubeSearchResponse = await response.json();
      
      // Extract unique channels with real channel IDs
      for (const item of data.items) {
        const existing = candidateChannels.find(c => c.channelId === item.snippet.channelId);
        if (existing) {
          existing.videos.push({ title: item.snippet.title, videoId: item.id.videoId });
        } else {
          candidateChannels.push({
            channelId: item.snippet.channelId,
            channelTitle: item.snippet.channelTitle,
            videos: [{ title: item.snippet.title, videoId: item.id.videoId }]
          });
        }
      }
    }
    
    console.log(`Found ${candidateChannels.length} candidate channels`);
    
    // Step 2: Analyze each new channel with Claude and save to database
    for (const channel of candidateChannels.slice(0, 5)) { // Limit to 5 for cost control
      // Check if already exists
      const existing = await db
        .select()
        .from(emergingInstructors)
        .where(eq(emergingInstructors.channelId, channel.channelId))
        .limit(1)
        .execute();
      
      if (existing.length > 0) {
        console.log(`⏭️  Skipping ${channel.channelTitle} (already in database)`);
        continue;
      }
      
      const sampleVideos = channel.videos.slice(0, 3);
      const analysis = await analyzeInstructor(channel, sampleVideos);
      
      if (analysis.should_monitor && analysis.credibility_score >= 18) {
        // Actually save to database
        await db.insert(emergingInstructors).values({
          instructorName: channel.channelTitle,
          channelId: channel.channelId,
          credibilityScore: analysis.credibility_score,
          specialty: analysis.specialty,
          teachingStyle: JSON.stringify(analysis.teaching_style),
          approvalStatus: 'pending',
          videosAnalyzed: sampleVideos.length,
        });
        
        console.log(`✅ Added ${channel.channelTitle} to emerging instructors (score: ${analysis.credibility_score})`);
      } else {
        console.log(`❌ Rejected ${channel.channelTitle}: ${analysis.reasoning}`);
      }
    }
    
    console.log("✅ Instructor discovery complete");
  } catch (error: any) {
    console.error("Error in instructor discovery:", error.message);
  }
}

// Analyze instructor with Claude
async function analyzeInstructor(channel: any, sampleVideos: any[]): Promise<InstructorAnalysis> {
  const prompt = `Evaluate this BJJ instructor for inclusion in our elite database:

Channel name: ${channel.channelTitle}
Sample videos: ${sampleVideos.map(v => v.title).join(', ')}

Assessment criteria:
1. Technical knowledge - Are details specific and accurate?
2. Teaching clarity - Can students understand and apply?
3. Credibility indicators - Competition record, lineage, student success?
4. Content consistency - Multiple quality videos?
5. Legitimacy - Real instruction vs clickbait?

RED FLAGS (auto-reject):
❌ Generic advice only ("stay tight", "be heavy")
❌ Dangerous techniques without safety emphasis
❌ Clickbait titles with no substance
❌ Promotes products over teaching
❌ Inconsistent quality across videos

Return ONLY valid JSON:
{
  "is_quality_instructor": true/false,
  "credibility_score": 0-30,
  "specialty": "guard/passing/submissions/leglocks/fundamentals",
  "teaching_style": {
    "verbosity": "verbose/medium/concise",
    "approach": "theoretical/balanced/practical"
  },
  "should_monitor": true/false,
  "reasoning": "2-3 sentence explanation"
}

Minimum for inclusion: credibility_score >= 18, is_quality_instructor = true`;

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
  
  // Parse JSON response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return JSON.parse(jsonMatch[0]);
  }
  
  // Default fallback
  return {
    is_quality_instructor: false,
    credibility_score: 0,
    specialty: "unknown",
    teaching_style: { verbosity: "unknown", approach: "unknown" },
    should_monitor: false,
    reasoning: "Failed to parse response"
  };
}
