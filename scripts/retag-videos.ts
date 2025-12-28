import Anthropic from '@anthropic-ai/sdk';
import { db } from '../server/db';
import { aiVideoKnowledge } from '../shared/schema';
import { eq, isNull, or, sql } from 'drizzle-orm';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const TAXONOMY = {
  technique_type: ['attack', 'defense', 'concept'],
  position_category: [
    'closed_guard', 'open_guard', 'half_guard', 'mount', 
    'side_control', 'back', 'standing', 'turtle', 
    'leg_entanglement', 'north_south', 'knee_on_belly', 
    'guard_passing', 'universal'
  ],
  gi_nogi: ['gi', 'nogi', 'both']
};

interface TagResult {
  technique_type: string;
  position_category: string;
  gi_nogi: string;
  tags: string[];
}

async function retagVideo(video: any): Promise<TagResult | null> {
  const prompt = `You are a BJJ expert. Analyze this video and categorize it.

VIDEO TITLE: ${video.title}
INSTRUCTOR: ${video.instructorName || 'Unknown'}
CURRENT TECHNIQUE NAME: ${video.techniqueName || 'none'}

CATEGORIZE WITH THESE EXACT VALUES:

1. technique_type (pick ONE):
   - "attack" = Submissions, sweeps, passes, takedowns, offensive moves
   - "defense" = Escapes, counters, survival, guard retention, defensive moves  
   - "concept" = Principles, theory, strategy, fundamentals, not a specific technique

2. position_category (pick ONE - where does this technique primarily happen):
   - "closed_guard" = Inside or attacking closed guard
   - "open_guard" = Spider, lasso, DLR, butterfly, X-guard, SLX, etc.
   - "half_guard" = Half guard, deep half, Z-guard, knee shield
   - "mount" = Full mount, low mount
   - "side_control" = Side control, cross-side, 100 kilos
   - "back" = Back control, back mount, rear mount
   - "standing" = Takedowns, wrestling, judo, stand-up grappling
   - "turtle" = Turtle position, attacking or defending
   - "leg_entanglement" = 50/50, saddle, ashi garami, leg lock positions
   - "north_south" = North-south position
   - "knee_on_belly" = Knee on belly
   - "guard_passing" = The act of passing guard (not a static position)
   - "universal" = Applies broadly, not position-specific

3. gi_nogi (pick ONE):
   - "gi" = Requires gi grips (collars, sleeves, pants)
   - "nogi" = Specifically no-gi technique
   - "both" = Works in both gi and no-gi

4. tags (array of relevant searchable terms):
   - Include the specific technique name
   - Include variations or alternative names
   - Include key concepts (pressure, frames, underhook, etc.)
   - Include common search terms someone might use
   - 5-15 tags per video

RESPOND IN VALID JSON ONLY:
{
  "technique_type": "attack|defense|concept",
  "position_category": "one of the listed values",
  "gi_nogi": "gi|nogi|both",
  "tags": ["tag1", "tag2", "tag3"]
}`;

  try {
    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found in response');
    
    const result = JSON.parse(jsonMatch[0]);
    
    if (!TAXONOMY.technique_type.includes(result.technique_type)) {
      throw new Error(`Invalid technique_type: ${result.technique_type}`);
    }
    if (!TAXONOMY.position_category.includes(result.position_category)) {
      throw new Error(`Invalid position_category: ${result.position_category}`);
    }
    if (!TAXONOMY.gi_nogi.includes(result.gi_nogi)) {
      throw new Error(`Invalid gi_nogi: ${result.gi_nogi}`);
    }
    if (!Array.isArray(result.tags)) {
      result.tags = [];
    }
    
    return result;
  } catch (error: any) {
    console.error(`Error tagging video ${video.id}:`, error.message);
    return null;
  }
}

async function retagAllVideos(options: { onlyUntagged?: boolean; batchSize?: number; startFrom?: number } = {}) {
  const { onlyUntagged = false, batchSize = 50, startFrom = 0 } = options;
  
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏷️  VIDEO RE-TAGGING SCRIPT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Mode: ${onlyUntagged ? 'Only untagged videos' : 'All videos'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Starting from: ${startFrom}`);
  console.log('');
  
  let videos;
  
  if (onlyUntagged) {
    videos = await db.select()
      .from(aiVideoKnowledge)
      .where(
        or(
          isNull(aiVideoKnowledge.techniqueType),
          sql`${aiVideoKnowledge.techniqueType} = ''`,
          isNull(aiVideoKnowledge.positionCategory),
          sql`${aiVideoKnowledge.positionCategory} = ''`,
          isNull(aiVideoKnowledge.tags),
          sql`array_length(${aiVideoKnowledge.tags}, 1) IS NULL`
        )
      )
      .orderBy(aiVideoKnowledge.id);
  } else {
    videos = await db.select()
      .from(aiVideoKnowledge)
      .orderBy(aiVideoKnowledge.id);
  }
  
  console.log(`📹 Found ${videos.length} videos to process`);
  
  if (startFrom > 0) {
    videos = videos.slice(startFrom);
    console.log(`   Skipping first ${startFrom}, processing ${videos.length} remaining`);
  }
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  const startTime = Date.now();
  
  const stats = {
    technique_type: {} as Record<string, number>,
    position_category: {} as Record<string, number>,
    gi_nogi: {} as Record<string, number>
  };
  
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const progress = `[${i + 1}/${videos.length}]`;
    
    console.log(`${progress} Processing: ${video.title?.substring(0, 60)}...`);
    
    const tags = await retagVideo(video);
    
    if (tags) {
      await db.update(aiVideoKnowledge)
        .set({
          techniqueType: tags.technique_type,
          positionCategory: tags.position_category,
          giOrNogi: tags.gi_nogi,
          tags: tags.tags
        })
        .where(eq(aiVideoKnowledge.id, video.id));
      
      success++;
      
      stats.technique_type[tags.technique_type] = (stats.technique_type[tags.technique_type] || 0) + 1;
      stats.position_category[tags.position_category] = (stats.position_category[tags.position_category] || 0) + 1;
      stats.gi_nogi[tags.gi_nogi] = (stats.gi_nogi[tags.gi_nogi] || 0) + 1;
      
      console.log(`  ✅ ${tags.technique_type} | ${tags.position_category} | ${tags.gi_nogi} | ${tags.tags.length} tags`);
    } else {
      failed++;
      console.log(`  ❌ Failed to tag`);
    }
    
    if ((i + 1) % 10 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      const remaining = videos.length - (i + 1);
      const eta = remaining / rate;
      console.log(`\n📊 Progress: ${success} success, ${failed} failed | Rate: ${rate.toFixed(1)}/sec | ETA: ${Math.ceil(eta / 60)} min\n`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  const totalTime = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 FINAL REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`✅ Success: ${success}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏱️  Total time: ${totalTime} minutes`);
  console.log('');
  console.log('📈 Technique Type Distribution:');
  Object.entries(stats.technique_type).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`   ${k}: ${v} (${((v / success) * 100).toFixed(1)}%)`);
  });
  console.log('');
  console.log('📈 Position Category Distribution:');
  Object.entries(stats.position_category).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`   ${k}: ${v} (${((v / success) * 100).toFixed(1)}%)`);
  });
  console.log('');
  console.log('📈 Gi/NoGi Distribution:');
  Object.entries(stats.gi_nogi).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
    console.log(`   ${k}: ${v} (${((v / success) * 100).toFixed(1)}%)`);
  });
  console.log('═══════════════════════════════════════════════════════════════');
}

const args = process.argv.slice(2);
const onlyUntagged = args.includes('--untagged');
const batchSizeArg = args.find(a => a.startsWith('--batch='));
const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 50;
const startFromArg = args.find(a => a.startsWith('--start='));
const startFrom = startFromArg ? parseInt(startFromArg.split('=')[1]) : 0;

retagAllVideos({ onlyUntagged, batchSize, startFrom })
  .then(() => {
    console.log('\n✅ Re-tagging complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Re-tagging failed:', error);
    process.exit(1);
  });
