import Anthropic from "@anthropic-ai/sdk";
import { getCuratedVideos } from "./intelligent-curator";
import { storage } from "./storage";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// Top BJJ instructors to search for
const TOP_INSTRUCTORS = [
  "John Danaher", "Gordon Ryan", "Lachlan Giles", "Craig Jones",
  "Bernardo Faria", "Marcelo Garcia", "Roger Gracie", "Demian Maia",
  "Keenan Cornelius", "Ryan Hall", "Garry Tonon", "Eddie Bravo"
];

// BJJ techniques organized by category and belt level
const TECHNIQUES_BY_CATEGORY = {
  guards: {
    fundamental: ["closed guard retention", "open guard basics", "basic guard recovery"],
    intermediate: ["spider guard", "de la riva", "butterfly guard", "half guard"],
    advanced: ["lasso guard", "reverse de la riva", "k-guard", "worm guard"]
  },
  submissions: {
    fundamental: ["armbar from mount", "rear naked choke", "triangle from guard", "americana"],
    intermediate: ["kimura", "guillotine variations", "armbar from guard", "bow and arrow choke"],
    advanced: ["heel hook", "straight ankle lock", "calf slicer", "bicep slicer"]
  },
  passes: {
    fundamental: ["knee slice pass", "double under pass", "basic pressure passing"],
    intermediate: ["toreando pass", "leg drag", "x-pass", "over under pass"],
    advanced: ["long step pass", "floating pass", "headquarters pass", "cartwheel pass"]
  },
  sweeps: {
    fundamental: ["scissor sweep", "hip bump sweep", "flower sweep"],
    intermediate: ["butterfly sweep", "pendulum sweep", "tomoe nage", "sit-up sweep"],
    advanced: ["berimbolo", "reverse de la riva sweep", "x-guard sweep", "kiss of the dragon"]
  },
  positions: {
    fundamental: ["mount escapes", "side control escapes", "back escape basics"],
    intermediate: ["mount attacks", "side control variations", "back control", "knee on belly"],
    advanced: ["truck position", "body triangle", "reverse triangle", "crucifix"]
  }
};

interface TechniqueRequest {
  recipientId?: string;
  requestedTechnique?: string;
  beltLevel?: string;
  style?: 'gi' | 'nogi' | 'both';
  category?: keyof typeof TECHNIQUES_BY_CATEGORY;
  focusAreas?: string[];
  lastTechniqueSent?: string;
}

export async function generateDailyTechnique(request: TechniqueRequest = {}) {
  try {
    // Use requested technique if provided, otherwise select based on belt level
    let technique: string;
    let category: keyof typeof TECHNIQUES_BY_CATEGORY;
    
    if (request.requestedTechnique) {
      // Use the requested technique directly
      technique = request.requestedTechnique;
      
      // Try to find the category for the requested technique
      const categories = Object.keys(TECHNIQUES_BY_CATEGORY) as Array<keyof typeof TECHNIQUES_BY_CATEGORY>;
      const foundCategory = categories.find(cat => {
        const categoryTechniques = TECHNIQUES_BY_CATEGORY[cat];
        const allTechniques = [
          ...categoryTechniques.fundamental,
          ...categoryTechniques.intermediate,
          ...categoryTechniques.advanced
        ];
        return allTechniques.some(tech => 
          tech.toLowerCase().includes(technique.toLowerCase()) || 
          technique.toLowerCase().includes(tech.toLowerCase())
        );
      });
      category = foundCategory || 'submissions'; // Default to submissions if not found
    } else {
      // Select technique based on belt level
      const categories = Object.keys(TECHNIQUES_BY_CATEGORY) as Array<keyof typeof TECHNIQUES_BY_CATEGORY>;
      category = request.category || categories[Math.floor(Math.random() * categories.length)];
      
      // Determine skill level based on belt
      let skillLevel: 'fundamental' | 'intermediate' | 'advanced' = 'fundamental';
      if (request.beltLevel === 'white') {
        skillLevel = 'fundamental';
      } else if (request.beltLevel === 'blue' || request.beltLevel === 'purple') {
        skillLevel = 'intermediate';
      } else if (request.beltLevel === 'brown' || request.beltLevel === 'black') {
        skillLevel = 'advanced';
      }
      
      const techniques = TECHNIQUES_BY_CATEGORY[category][skillLevel];
      technique = techniques[Math.floor(Math.random() * techniques.length)];
    }

    // Generate the technique detail using Claude
    const prompt = `You are a BJJ black belt instructor. Generate a concise, actionable tip for: ${technique}

Belt level: ${request.beltLevel || 'all levels'}
Style: ${request.style || 'both gi and no-gi'}

Provide ONE key detail that makes this technique more effective. CRITICAL: Keep it under 120 characters total (including emoji) since this will be sent via SMS.

Format: Start with an emoji, then the tip. No preamble, no labels, just the actionable detail.

Example: "🔺 Cut the angle by pulling their arm across while scooting hips out."`;


    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 200,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const content = message.content[0];
    const tip = content.type === 'text' ? content.text : '';

    // Fetch user preferences and recommendation history if recipientId is provided
    let userPreferences;
    let previouslyRecommended: string[] = [];
    let userPhone: string | undefined;
    
    if (request.recipientId) {
      userPreferences = await storage.getUserPreferences(request.recipientId);
      const history = await storage.getRecommendationHistory(request.recipientId, 20);
      previouslyRecommended = history.map(h => h.videoId);
      
      // Get user phone for multi-stage analysis and prerequisite checks
      const recipient = await storage.getRecipient(request.recipientId);
      userPhone = recipient?.phoneNumber;
    }

    // Use intelligent curator to get the best video recommendation
    // Don't pass an instructor - let the curator find the best videos for the technique
    const curatedVideos = await getCuratedVideos(
      technique,
      undefined, // No instructor filter - find best videos regardless of who teaches them
      userPreferences ? {
        beltLevel: userPreferences.beltLevel || undefined,
        preferredStyle: userPreferences.preferredStyle || undefined,
        trainingGoals: userPreferences.trainingGoals || undefined,
        favoriteInstructors: userPreferences.favoriteInstructors || undefined,
        contentPreference: userPreferences.contentPreference || undefined,
      } : undefined,
      previouslyRecommended,
      1, // Only get the TOP 1 video for SMS
      userPhone
    );
    
    // Use the instructor from the top-rated video (the one actually teaching)
    const instructor = curatedVideos.length > 0 ? curatedVideos[0].instructorName : 'Unknown Instructor';

    // Save recommendations to history if recipientId is provided
    if (request.recipientId && curatedVideos.length > 0) {
      for (const video of curatedVideos) {
        await storage.createRecommendationHistory({
          recipientId: request.recipientId,
          videoId: video.videoId,
          technique,
          wasClicked: false,
          wasHelpful: undefined,
        });
      }
    }

    // Map to simpler format for SMS with timestamps
    const videos = curatedVideos.map((v, index) => {
      // Add timestamp to video URL (start at 30 seconds to skip intros)
      const timestamp = 30;
      const urlWithTimestamp = `${v.url}&t=${timestamp}s`;
      
      return {
        title: v.title,
        channel: v.channelTitle,
        videoId: v.videoId,
        thumbnail: v.thumbnailUrl,
        url: v.url,
        urlWithTimestamp,
        timestamp,
        score: v.finalScore,
        summary: v.summary,
        // Format: "Watch: [Video Title] by [Instructor] - https://youtube.com/watch?v=VIDEO_ID&t=XXs"
        watchLink: `Watch: ${v.title} by ${v.channelTitle} - ${urlWithTimestamp}`
      };
    });

    return {
      technique,
      category,
      tip: tip.trim(),
      instructor,
      videos
    };

  } catch (error: any) {
    console.error('AI Agent error:', error.message);
    throw error;
  }
}