import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

interface ProblemSolutionMap {
  problems: Array<{
    problem: string;
    solution: string;
    timestamp?: string;
  }>;
}

// Extract problem-solution pairs from video analysis
export async function extractProblemSolution(
  videoTitle: string,
  videoDescription: string,
  keyDetails: string
): Promise<string> {
  const prompt = `Extract specific problem-solution pairs from this BJJ video:

Title: ${videoTitle}
Description: ${videoDescription}
Key Details: ${keyDetails}

Identify SPECIFIC problems the video addresses and their solutions:

Examples of GOOD problem-solution pairs:
✅ Problem: "Opponent keeps escaping armbar by tucking elbow"
   Solution: "Shift hips higher before extending, trap wrist with legs"

❌ Problem: "Need better submissions"
   Solution: "Do submissions better"
(Too vague - reject these)

Return ONLY valid JSON:
{
  "problems": [
    {
      "problem": "Opponent keeps escaping armbar by tucking elbow",
      "solution": "Shift hips higher before extending, trap wrist with legs",
      "timestamp": "2:15"
    }
  ]
}

Only include 2-4 most specific, actionable problem-solution pairs.`;

  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
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
      return JSON.stringify({ problems: [] });
    }

    const data: ProblemSolutionMap = JSON.parse(jsonMatch[0]);
    
    // Validate quality - reject vague problems
    const validProblems = data.problems.filter(p => 
      p.problem.length > 20 && // At least 20 chars
      p.solution.length > 20 && // At least 20 chars
      !p.problem.toLowerCase().includes('better') && // Not "do better"
      !p.solution.toLowerCase().includes('practice more') // Not "practice more"
    );

    return JSON.stringify({ problems: validProblems });
  } catch (error: any) {
    console.error("Error extracting problem-solution:", error.message);
    return JSON.stringify({ problems: [] });
  }
}

// Search problem-solution database for user's specific issue
export async function findSolutionForProblem(
  userProblem: string,
  allVideoAnalyses: any[]
): Promise<any[]> {
  const matches: any[] = [];

  for (const video of allVideoAnalyses) {
    if (!video.problemSolutionMap) continue;

    try {
      const psMap = JSON.parse(video.problemSolutionMap);
      
      for (const ps of psMap.problems || []) {
        // Simple keyword matching (could be enhanced with embeddings)
        const problemLower = ps.problem.toLowerCase();
        const userProblemLower = userProblem.toLowerCase();
        
        const keywords = userProblemLower.split(' ').filter(w => w.length > 3);
        const matchCount = keywords.filter(k => problemLower.includes(k)).length;
        
        if (matchCount >= 2) {
          matches.push({
            video: video,
            problem: ps.problem,
            solution: ps.solution,
            timestamp: ps.timestamp,
            relevance: matchCount / keywords.length
          });
        }
      }
    } catch (e) {
      // Skip malformed JSON
    }
  }

  // Sort by relevance
  return matches.sort((a, b) => b.relevance - a.relevance).slice(0, 5);
}
