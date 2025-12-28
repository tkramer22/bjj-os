/**
 * Fast Video Re-Tagging Script
 * Uses pattern matching instead of AI for speed (no rate limits)
 * Tags all videos with 4-field taxonomy in seconds
 */

import { db } from '../server/db';
import { aiVideoKnowledge } from '../shared/schema';
import { eq } from 'drizzle-orm';

const TECHNIQUE_TYPES = ['attack', 'defense', 'concept'] as const;
const POSITION_CATEGORIES = [
  'closed_guard', 'open_guard', 'half_guard', 'mount', 'side_control', 
  'back', 'standing', 'turtle', 'leg_entanglement', 'north_south', 
  'knee_on_belly', 'guard_passing', 'universal'
] as const;
const GI_NOGI_OPTIONS = ['gi', 'nogi', 'both'] as const;

type TechniqueType = typeof TECHNIQUE_TYPES[number];
type PositionCategory = typeof POSITION_CATEGORIES[number];
type GiNogi = typeof GI_NOGI_OPTIONS[number];

interface TaxonomyResult {
  techniqueType: TechniqueType;
  positionCategory: PositionCategory;
  giOrNogi: GiNogi;
  tags: string[];
}

function determineTaxonomy(
  title: string, 
  techniqueName: string, 
  category?: string
): TaxonomyResult {
  const lowerTitle = (title || '').toLowerCase();
  const lowerTechnique = (techniqueName || '').toLowerCase();
  
  // Determine technique type
  let techniqueType: TechniqueType = 'concept';
  
  const attackIndicators = ['sweep', 'submission', 'choke', 'armbar', 'triangle', 'kimura', 'omoplata', 
    'guillotine', 'finish', 'attack', 'leg lock', 'heel hook', 'kneebar', 'ankle', 'strangle',
    'back take', 'mount', 'pass', 'takedown', 'throw', 'arm lock', 'wristlock', 'neck crank',
    'darce', 'anaconda', 'ezekiel', 'bow and arrow', 'loop choke', 'baseball', 'clock choke'];
  
  const defenseIndicators = ['escape', 'defense', 'defend', 'counter', 'recover', 'retention',
    'prevention', 'block', 'stop', 'survival', 'protect'];
  
  if (attackIndicators.some(ind => lowerTitle.includes(ind) || lowerTechnique.includes(ind))) {
    techniqueType = 'attack';
  } else if (defenseIndicators.some(ind => lowerTitle.includes(ind) || lowerTechnique.includes(ind))) {
    techniqueType = 'defense';
  }
  
  // Determine position category
  let positionCategory: PositionCategory = 'universal';
  
  const positionMap: Record<string, PositionCategory> = {
    'closed guard': 'closed_guard',
    'full guard': 'closed_guard',
    'open guard': 'open_guard',
    'spider': 'open_guard',
    'lasso': 'open_guard',
    'de la riva': 'open_guard',
    'dlr': 'open_guard',
    'rdlr': 'open_guard',
    'x guard': 'open_guard',
    'butterfly': 'open_guard',
    'k guard': 'open_guard',
    'worm': 'open_guard',
    'lapel guard': 'open_guard',
    'half guard': 'half_guard',
    'z guard': 'half_guard',
    'knee shield': 'half_guard',
    'lockdown': 'half_guard',
    'deep half': 'half_guard',
    'mount': 'mount',
    'mounted': 'mount',
    's mount': 'mount',
    'side control': 'side_control',
    'side mount': 'side_control',
    'kesa gatame': 'side_control',
    'scarf hold': 'side_control',
    'back control': 'back',
    'back mount': 'back',
    'rear mount': 'back',
    'rear naked': 'back',
    'back take': 'back',
    'turtle': 'turtle',
    'front headlock': 'turtle',
    'cradle': 'turtle',
    'leg lock': 'leg_entanglement',
    'ashi garami': 'leg_entanglement',
    'ashi': 'leg_entanglement',
    'saddle': 'leg_entanglement',
    '50/50': 'leg_entanglement',
    'inside sankaku': 'leg_entanglement',
    'outside ashi': 'leg_entanglement',
    'straight ashi': 'leg_entanglement',
    'irimi ashi': 'leg_entanglement',
    'heel hook': 'leg_entanglement',
    'honey hole': 'leg_entanglement',
    'north south': 'north_south',
    'knee on belly': 'knee_on_belly',
    'knee ride': 'knee_on_belly',
    'guard pass': 'guard_passing',
    'passing': 'guard_passing',
    'pressure pass': 'guard_passing',
    'toreando': 'guard_passing',
    'standing': 'standing',
    'takedown': 'standing',
    'wrestling': 'standing',
    'judo': 'standing'
  };
  
  for (const [pattern, position] of Object.entries(positionMap)) {
    if (lowerTitle.includes(pattern) || lowerTechnique.includes(pattern)) {
      positionCategory = position;
      break;
    }
  }
  
  // Special case: Check if title mentions "back" by itself (not just "back escape")
  if (positionCategory === 'universal' && /\bback\b/.test(lowerTitle)) {
    positionCategory = 'back';
  }
  
  // Determine gi/nogi
  let giOrNogi: GiNogi = 'both';
  
  if (lowerTitle.includes('no-gi') || lowerTitle.includes('nogi') || lowerTitle.includes('no gi')) {
    giOrNogi = 'nogi';
  } else if (lowerTitle.includes('gi ') || lowerTitle.includes('lapel') || 
             lowerTitle.includes('collar') || lowerTitle.includes(' grip')) {
    giOrNogi = 'gi';
  }
  
  // Extract tags
  const tagPatterns = [
    'armbar', 'triangle', 'kimura', 'omoplata', 'guillotine', 'choke', 'sweep',
    'escape', 'pass', 'takedown', 'throw', 'guard', 'mount', 'back', 'turtle',
    'leg lock', 'heel hook', 'kneebar', 'ankle lock', 'calf slicer',
    'darce', 'anaconda', 'ezekiel', 'bow and arrow', 'loop choke',
    'rnc', 'rear naked', 'arm triangle', 'clock choke', 'baseball bat',
    'underhook', 'overhook', 'whizzer', 'frame', 'hip escape', 'shrimp',
    'bridge', 'granby', 'inversion', 'berimbolo', 'kiss of the dragon',
    'x guard', 'single leg x', 'butterfly', 'spider', 'lasso', 'de la riva',
    'half guard', 'deep half', 'knee shield', 'z guard', 'lockdown',
    'mount', 's mount', 'side control', 'knee on belly', 'north south',
    'closed guard', 'open guard', 'rubber guard', 'worm guard',
    'crucifix', 'truck', 'crab ride', 'honey hole', 'saddle', '50/50',
    'wrestling', 'judo', 'gi', 'no-gi', 'submission', 'defense', 'attack',
    'beginner', 'advanced', 'competition', 'fundamental', 'detail',
    'drill', 'sparring', 'rolling', 'concept', 'principle', 'tips',
    'white belt', 'blue belt', 'purple belt', 'brown belt', 'black belt'
  ];
  
  const tags: string[] = [];
  for (const pattern of tagPatterns) {
    if (lowerTitle.includes(pattern) || lowerTechnique.includes(pattern)) {
      const tag = pattern.replace(/\s+/g, '_');
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
    }
  }
  
  // Add category if available
  if (category && category !== 'uncategorized') {
    const categoryTag = category.toLowerCase().replace(/\s+/g, '_');
    if (!tags.includes(categoryTag)) {
      tags.push(categoryTag);
    }
  }
  
  return {
    techniqueType,
    positionCategory,
    giOrNogi,
    tags: tags.slice(0, 10)
  };
}

async function retagAllVideos() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🏷️  FAST VIDEO RE-TAGGING SCRIPT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Mode: Pattern matching (no AI calls)');
  console.log('');
  
  const startTime = Date.now();
  
  // Get all videos
  const videos = await db.select({
    id: aiVideoKnowledge.id,
    title: aiVideoKnowledge.title,
    techniqueName: aiVideoKnowledge.techniqueName,
    positionCategory: aiVideoKnowledge.positionCategory
  }).from(aiVideoKnowledge);
  
  console.log(`📹 Found ${videos.length} videos to process\n`);
  
  let success = 0;
  let failed = 0;
  const stats = {
    techniqueType: { attack: 0, defense: 0, concept: 0 },
    positionCategory: {} as Record<string, number>,
    giNogi: { gi: 0, nogi: 0, both: 0 }
  };
  
  for (const video of videos) {
    try {
      const title = video.title || '';
      const techniqueName = video.techniqueName || '';
      const existingCategory = video.positionCategory || '';
      
      const taxonomy = determineTaxonomy(title, techniqueName, existingCategory);
      
      await db.update(aiVideoKnowledge)
        .set({
          techniqueType: taxonomy.techniqueType,
          positionCategory: taxonomy.positionCategory,
          giOrNogi: taxonomy.giOrNogi,
          tags: taxonomy.tags
        })
        .where(eq(aiVideoKnowledge.id, video.id));
      
      success++;
      
      // Track stats
      stats.techniqueType[taxonomy.techniqueType]++;
      stats.positionCategory[taxonomy.positionCategory] = (stats.positionCategory[taxonomy.positionCategory] || 0) + 1;
      stats.giNogi[taxonomy.giOrNogi]++;
      
      if (success % 100 === 0) {
        console.log(`✅ Processed ${success}/${videos.length} videos...`);
      }
    } catch (error) {
      failed++;
      console.error(`❌ Failed to tag video ${video.id}:`, error);
    }
  }
  
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 FINAL REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total videos: ${videos.length}`);
  console.log(`Successfully tagged: ${success}`);
  console.log(`Failed: ${failed}`);
  console.log(`Time taken: ${totalTime} seconds`);
  console.log('');
  console.log('📈 Technique Type Distribution:');
  console.log(`   Attack: ${stats.techniqueType.attack} (${((stats.techniqueType.attack / success) * 100).toFixed(1)}%)`);
  console.log(`   Defense: ${stats.techniqueType.defense} (${((stats.techniqueType.defense / success) * 100).toFixed(1)}%)`);
  console.log(`   Concept: ${stats.techniqueType.concept} (${((stats.techniqueType.concept / success) * 100).toFixed(1)}%)`);
  console.log('');
  console.log('📍 Position Distribution:');
  const sortedPositions = Object.entries(stats.positionCategory).sort((a, b) => b[1] - a[1]);
  for (const [position, count] of sortedPositions) {
    console.log(`   ${position}: ${count} (${((count / success) * 100).toFixed(1)}%)`);
  }
  console.log('');
  console.log('🥋 Gi/NoGi Distribution:');
  console.log(`   Gi: ${stats.giNogi.gi} (${((stats.giNogi.gi / success) * 100).toFixed(1)}%)`);
  console.log(`   NoGi: ${stats.giNogi.nogi} (${((stats.giNogi.nogi / success) * 100).toFixed(1)}%)`);
  console.log(`   Both: ${stats.giNogi.both} (${((stats.giNogi.both / success) * 100).toFixed(1)}%)`);
  console.log('═══════════════════════════════════════════════════════════════');
}

retagAllVideos().then(() => {
  console.log('\n✅ Re-tagging complete!');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
