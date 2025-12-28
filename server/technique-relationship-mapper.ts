import Anthropic from "@anthropic-ai/sdk";
import { db } from "./db";
import { techniqueRelationships } from "@shared/schema";
import { sql, eq } from "drizzle-orm";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

interface RelationshipData {
  relationships: Array<{
    techniqueBId: string;
    relationshipType: string;
    confidence: 'high' | 'medium' | 'low';
    explanation: string;
    direction: 'A_to_B' | 'B_to_A' | 'bidirectional';
  }>;
}

// Analyze technique relationships using Claude
export async function mapTechniqueRelationships(
  techniqueAId: string,
  techniqueAName: string,
  videoContext: string
): Promise<void> {
  const prompt = `Analyze this BJJ technique and identify its relationships to other techniques:

Technique: ${techniqueAName}
Context: ${videoContext}

Identify relationships (3-5 most important):

Types: VARIATION, PROGRESSION, COUNTER, PREREQUISITE, CHAIN_ATTACK

Return ONLY valid JSON:
{
  "relationships": [
    {
      "techniqueBId": "armbar_from_mount",
      "relationshipType": "PROGRESSION",
      "confidence": "high",
      "explanation": "Natural follow-up when opponent defends triangle",
      "direction": "A_to_B"
    }
  ]
}`;

  try{
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: prompt
      }]
    });

    const content = message.content[0];
    const responseText = content.type === 'text' ? content.text : '{}';
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error("Failed to parse relationship JSON");
      return;
    }

    const data: RelationshipData = JSON.parse(jsonMatch[0]);

    // Save relationships to database
    for (const rel of data.relationships) {
      await db.insert(techniqueRelationships).values({
        techniqueAId: techniqueAId,
        techniqueBId: rel.techniqueBId,
        relationshipType: rel.relationshipType,
        confidence: rel.confidence,
        explanation: rel.explanation,
        direction: rel.direction,
      }).onConflictDoNothing();
    }

    console.log(`✅ Mapped ${data.relationships.length} relationships for ${techniqueAName}`);
  } catch (error: any) {
    console.error("Error mapping relationships:", error.message);
  }
}

// Query relationships for recommendation enhancement
export async function getTechniqueRelationships(techniqueId: string) {
  const relationships = await db
    .select()
    .from(techniqueRelationships)
    .where(eq(techniqueRelationships.techniqueAId, techniqueId))
    .execute();

  return relationships;
}

// Get prerequisite chain (what user should learn first)
export async function getPrerequisiteChain(techniqueId: string): Promise<string[]> {
  const prerequisites = await db
    .select()
    .from(techniqueRelationships)
    .where(
      sql`${techniqueRelationships.techniqueAId} = ${techniqueId} 
          AND ${techniqueRelationships.relationshipType} = 'PREREQUISITE'`
    )
    .execute();

  return prerequisites.map((p: any) => p.techniqueBId);
}

// Get natural follow-ups (what to learn next)
export async function getChainTechniques(techniqueId: string): Promise<string[]> {
  const chains = await db
    .select()
    .from(techniqueRelationships)
    .where(
      sql`${techniqueRelationships.techniqueAId} = ${techniqueId} 
          AND ${techniqueRelationships.relationshipType} = 'PROGRESSION'`
    )
    .execute();

  return chains.map((c: any) => c.techniqueBId);
}
