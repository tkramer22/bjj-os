import { db } from './db';
import { userTechniqueRequests } from '@shared/schema';

/**
 * Extract technique mentions from user message and save to database
 * This data feeds the meta analyzer for automated curation prioritization
 */
export async function extractTechniqueRequests(
  userId: string,
  message: string,
  beltLevel?: string | null,
  style?: string | null,
  videoResultData?: { hadVideoResult: boolean; videoCount: number }
): Promise<void> {
  // Common BJJ technique keywords to detect
  const techniquePatterns = [
    // Submissions
    /\b(triangle|kimura|armbar|arm bar|rear naked|rnc|guillotine|darce|anaconda|bow and arrow|americana|omoplata|gogoplata|ezekiel|baseball choke|crucifix|toe hold|heel hook|knee bar|calf slicer|bicep slicer)\b/gi,
    
    // Guards
    /\b(closed guard|open guard|half guard|butterfly guard|de la riva|dlr|spider guard|lasso guard|x guard|single leg x|slx|reverse de la riva|rdlr|50\s?\/?\s?50|z guard|knee shield|lockdown|rubber guard|octopus guard|worm guard|kiss of the dragon)\b/gi,
    
    // Passes
    /\b(toreando|bullfighter pass|knee slice|knee cut|leg drag|over under|smash pass|stack pass|long step|x pass|headquarters|bodylock pass)\b/gi,
    
    // Sweeps
    /\b(scissor sweep|hip bump|flower sweep|pendulum sweep|sit up sweep|butterfly sweep|elevator sweep|hook sweep|sickle sweep|overhead sweep|tripod sweep|balloon sweep|lumberjack sweep)\b/gi,
    
    // Positions
    /\b(mount|side control|north south|back control|knee on belly|kob|turtle|ashi garami|saddle|inside sankaku|outside sankaku|cross ashi)\b/gi,
    
    // Escapes & Defense
    /\b(shrimp|elbow escape|bridge|mount escape|side control escape|back escape|guard retention|frame|posting)\b/gi,
    
    // Takedowns
    /\b(double leg|single leg|ankle pick|body lock|osoto gari|uchi mata|seoi nage|sacrifice throw|guard pull)\b/gi,
  ];
  
  const lowerMessage = message.toLowerCase();
  const extractedTechniques = new Set<string>();
  
  // Extract all technique mentions
  for (const pattern of techniquePatterns) {
    const matches = Array.from(lowerMessage.matchAll(pattern));
    for (const match of matches) {
      if (match[1]) {
        // Normalize technique name
        const technique = match[1].trim().toLowerCase()
          .replace(/\s+/g, ' ') // normalize spaces
          .replace(/\b50\s?\/?\s?50\b/gi, '50/50'); // normalize 50/50
        extractedTechniques.add(technique);
      }
    }
  }
  
  // Detect request type based on keywords
  let requestType: string | undefined;
  if (/\b(how to|teach|show|learn|do)\b/i.test(lowerMessage)) {
    requestType = 'how_to_do';
  } else if (/\b(defend|defense|counter|escape|stop)\b/i.test(lowerMessage)) {
    requestType = 'how_to_defend';
  } else if (/\b(drill|practice|rep|training)\b/i.test(lowerMessage)) {
    requestType = 'drilling';
  } else if (/\b(variation|different|another|alternative)\b/i.test(lowerMessage)) {
    requestType = 'variations';
  }
  
  // Detect gi preference from message
  let giPreference: string | undefined;
  if (/\b(no\s?gi|nogi)\b/i.test(lowerMessage)) {
    giPreference = 'nogi';
  } else if (/\bgi\b/i.test(lowerMessage) && !/\b(no\s?gi|nogi)\b/i.test(lowerMessage)) {
    giPreference = 'gi';
  } else if (style) {
    giPreference = style;
  }
  
  // Save each extracted technique to database
  for (const technique of Array.from(extractedTechniques)) {
    try {
      await db.insert(userTechniqueRequests).values({
        userId,
        techniqueMentioned: technique,
        requestContext: message.substring(0, 500), // Store first 500 chars
        requestType,
        beltLevel: beltLevel || undefined,
        giPreference,
        hadVideoResult: videoResultData?.hadVideoResult,
        videoCountReturned: videoResultData?.videoCount,
      });
      
      console.log(`[META TRACKER] Tracked technique request: "${technique}" from user ${userId}`);
    } catch (err: any) {
      // Ignore duplicate errors or other minor issues
      if (!err.message?.includes('duplicate')) {
        console.error('[META TRACKER] Error saving technique request:', err);
      }
    }
  }
  
  if (extractedTechniques.size > 0) {
    console.log(`[META TRACKER] Extracted ${extractedTechniques.size} techniques: ${Array.from(extractedTechniques).join(', ')}`);
  }
}
