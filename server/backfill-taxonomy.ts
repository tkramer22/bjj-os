import { db } from "./db";
import { aiVideoKnowledge } from "@shared/schema";
import { isNull, or, sql, eq } from "drizzle-orm";

interface TaxonomyData {
  techniqueType: 'attack' | 'defense' | 'concept' | null;
  positionCategory: string | null;
  giOrNogi: 'gi' | 'nogi' | 'both' | null;
  tags: string[];
}

function computeTaxonomy(title: string, techniqueName: string): TaxonomyData {
  const titleLower = title.toLowerCase();
  const techniqueLower = (techniqueName || '').toLowerCase();
  const combined = `${titleLower} ${techniqueLower}`;
  
  let techniqueType: 'attack' | 'defense' | 'concept' | null = null;
  
  const attackKeywords = [
    'submission', 'choke', 'armbar', 'kimura', 'americana', 'triangle', 'guillotine',
    'darce', 'anaconda', 'ezekiel', 'baseball', 'clock choke', 'bow and arrow',
    'cross collar', 'loop choke', 'arm triangle', 'rear naked', 'rnc', 'buggy choke',
    'paper cutter', 'bread cutter', 'head and arm', 'north south choke',
    'heel hook', 'ankle lock', 'knee bar', 'toe hold', 'calf slicer', 'estima lock',
    'aoki lock', 'leg lock', 'inside heel', 'outside heel',
    'attack', 'finish', 'tap', 'submit', 'wrist lock', 'neck crank',
    'pass', 'guard pass', 'knee slice', 'leg drag', 'body lock pass', 'toreando',
    'pressure pass', 'smash pass', 'over under pass', 'stack pass', 'folding pass',
    'float pass', 'long step', 'x pass', 'headquarters',
    'sweep', 'berimbolo', 'scissor sweep', 'hip bump', 'flower sweep', 'pendulum',
    'elevator sweep', 'tripod sweep', 'sickle sweep', 'overhead sweep',
    'takedown', 'throw', 'arm drag', 'snap down', 'ankle pick', 'collar drag',
    'single leg', 'double leg', 'hip throw', 'foot sweep', 'osoto gari',
    'mount attack', 'back attack', 'crucifix', 'twister',
  ];
  
  const defenseKeywords = [
    'escape', 'defense', 'survival', 'recovery', 'retain', 'retention',
    'guard retention', 'prevent', 'counter', 'block', 'posture', 'frame', 'framing',
    'hip escape', 'shrimp', 'bridge', 'elbow escape', 'trap and roll',
    'defend', 'defending', 'stop', 'avoid', 'getting out', 'escaping'
  ];
  
  const conceptKeywords = [
    'concept', 'principle', 'theory', 'fundamentals', 'basics', 'overview', 'explained',
    'understanding', 'philosophy', 'mindset', 'strategy', 'game plan', 'breakdown',
    'analysis', 'system', 'guide', 'complete guide', 'intro', 'introduction',
    'transition', 'connection', 'chain', 'flow', 'drill', 'drilling', 'positional',
    'warmup', 'mobility', 'flexibility', 'conditioning', 'solo drill'
  ];
  
  if (defenseKeywords.some(kw => combined.includes(kw))) {
    techniqueType = 'defense';
  } else if (attackKeywords.some(kw => combined.includes(kw))) {
    techniqueType = 'attack';
  } else if (conceptKeywords.some(kw => combined.includes(kw))) {
    techniqueType = 'concept';
  } else {
    techniqueType = 'attack';
  }
  
  let positionCategory: string | null = null;
  
  const positionMap: { [key: string]: string[] } = {
    'closed_guard': ['closed guard', 'full guard', 'rubber guard'],
    'open_guard': [
      'open guard', 'spider guard', 'lasso', 'de la riva', 'dlr', 'reverse de la riva', 'rdlr',
      'x guard', 'single leg x', 'slx', 'k guard', 'k-guard', 'butterfly guard', 'seated guard',
      'collar sleeve', 'worm guard', 'squid guard', 'lapel guard', 'octopus guard',
      'shin to shin', 'koala guard', 'mantis guard', 'sit up guard', 'seated'
    ],
    'half_guard': ['half guard', 'deep half', 'z guard', 'knee shield', 'lockdown', 'coyote guard', 'quarter guard'],
    'mount': ['mount', 'mounted', 'high mount', 'low mount', 's mount', 'technical mount'],
    'back': ['back control', 'back mount', 'rear mount', 'back take', 'turtle', 'truck', 'twister side'],
    'side_control': ['side control', 'side mount', 'hundred kilos', '100 kilos', 'kesa gatame', 'scarf hold', 'north south', 'crossbody', 'crossface'],
    'standing': ['standing', 'takedown', 'throw', 'judo', 'wrestling', 'clinch', 'collar tie', 'underhook', 'overhook', '2 on 1', 'arm drag'],
    'leg_entanglement': [
      'leg lock', 'heel hook', 'ashi garami', 'saddle', '411', '50/50', 'fifty fifty',
      'outside ashi', 'inside sankaku', 'ankle lock', 'knee bar', 'calf slicer', 'toe hold',
      'leg entanglement', 'irimi ashi', 'honey hole', 'game over', 'reap'
    ],
  };
  
  for (const [category, keywords] of Object.entries(positionMap)) {
    if (keywords.some(kw => combined.includes(kw))) {
      positionCategory = category;
      break;
    }
  }
  
  let giOrNogi: 'gi' | 'nogi' | 'both' | null = null;
  
  const giKeywords = [
    'gi', 'kimono', 'collar', 'lapel', 'sleeve grip', 'belt grip', 'pants grip',
    'ibjjf', 'gi only', 'worm guard', 'lapel guard', 'spider guard', 'lasso',
    'cross collar', 'bow and arrow', 'ezekiel', 'loop choke', 'baseball choke'
  ];
  
  const nogiKeywords = [
    'nogi', 'no-gi', 'no gi', 'submission only', 'sub only', 'adcc', 'submission grappling',
    'rashguard', 'spats', 'gordon ryan', 'danaher', 'craig jones'
  ];
  
  const hasGi = giKeywords.some(kw => combined.includes(kw));
  const hasNogi = nogiKeywords.some(kw => combined.includes(kw));
  
  if (hasGi && hasNogi) {
    giOrNogi = 'both';
  } else if (hasGi) {
    giOrNogi = 'gi';
  } else if (hasNogi) {
    giOrNogi = 'nogi';
  } else {
    giOrNogi = 'both';
  }
  
  const tags: string[] = [];
  
  if (techniqueName) {
    tags.push(techniqueName.toLowerCase());
  }
  
  const commonTags = [
    'triangle', 'armbar', 'kimura', 'americana', 'guillotine', 'darce', 'anaconda',
    'omoplata', 'gogoplata', 'ezekiel', 'rear naked', 'buggy choke', 'paper cutter',
    'pass', 'knee slice', 'leg drag', 'toreando', 'pressure pass', 'smash pass',
    'body lock', 'over under', 'stack pass', 'float pass', 'headquarters',
    'sweep', 'berimbolo', 'scissor sweep', 'hip bump', 'flower sweep', 'pendulum',
    'guard', 'half guard', 'closed guard', 'open guard', 'butterfly', 'de la riva',
    'x guard', 'k guard', 'rubber guard', 'spider guard', 'lasso',
    'mount', 'back', 'side control', 'north south', 'turtle', 'crucifix',
    'heel hook', 'knee bar', 'ankle lock', 'toe hold', 'calf slicer', 'leg lock',
    'escape', 'defense', 'attack', 'takedown', 'throw', 'transition', 'control',
    'retention', 'guard retention',
    'choke', 'submission', 'beginner', 'advanced', 'fundamental', 'modern', 'classic',
    'competition', 'self defense', 'mma', 'nogi', 'gi', 'drill'
  ];
  
  for (const tag of commonTags) {
    if (combined.includes(tag) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  
  if (positionCategory) {
    const positionTag = positionCategory.replace(/_/g, ' ');
    if (!tags.includes(positionTag)) {
      tags.push(positionTag);
    }
  }
  
  return {
    techniqueType,
    positionCategory,
    giOrNogi,
    tags: tags.slice(0, 15)
  };
}

async function backfillTaxonomy() {
  console.log('🔄 Starting FULL taxonomy backfill for all videos...');
  
  const allVideos = await db
    .select({
      id: aiVideoKnowledge.id,
      title: aiVideoKnowledge.title,
      techniqueName: aiVideoKnowledge.techniqueName
    })
    .from(aiVideoKnowledge);
  
  console.log(`📊 Processing ${allVideos.length} total videos`);
  
  let updated = 0;
  let errors = 0;
  
  for (const video of allVideos) {
    try {
      const taxonomy = computeTaxonomy(video.title, video.techniqueName || '');
      
      await db
        .update(aiVideoKnowledge)
        .set({
          techniqueType: taxonomy.techniqueType,
          positionCategory: taxonomy.positionCategory,
          giOrNogi: taxonomy.giOrNogi,
          tags: taxonomy.tags
        })
        .where(eq(aiVideoKnowledge.id, video.id));
      
      updated++;
      
      if (updated % 100 === 0) {
        console.log(`  📈 Updated ${updated}/${allVideos.length} videos...`);
      }
    } catch (error: any) {
      console.error(`  ❌ Error updating video ${video.id}:`, error.message);
      errors++;
    }
  }
  
  console.log(`\n✅ Backfill complete!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Errors: ${errors}`);
  console.log(`   Total: ${allVideos.length}`);
  
  return { updated, errors, total: allVideos.length };
}

backfillTaxonomy()
  .then(result => {
    console.log('\n📊 Final Results:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  });
