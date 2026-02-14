import { db } from './db';
import { techniqueTaxonomyV2, videoTechniqueTags, aiVideoKnowledge } from '@shared/schema';
import { eq, sql, and, isNotNull, asc } from 'drizzle-orm';

interface TaxonomyNode {
  id: number;
  name: string;
  slug: string;
  level: number;
  parentId: number | null;
}

const TECHNIQUE_TYPE_TO_L1: Record<string, string[]> = {
  'technique': ['fundamentals'],
  'attack': ['submissions', 'guard-play'],
  'submission': ['submissions'],
  'defense': ['escapes'],
  'pass': ['passing'],
  'position': ['top-control'],
  'sweep': ['sweeps'],
  'concept': ['fundamentals'],
  'transition': ['transitions'],
  'escape': ['escapes'],
  'guard': ['guard-play'],
  'takedown': ['takedowns'],
  'drill': ['fundamentals'],
  'control': ['top-control'],
  'guard_pass': ['passing'],
  'guard_retention': ['guard-retention'],
  'back_attack': ['back-attacks'],
  'leg_lock': ['leg-locks'],
  'choke': ['submissions'],
  'armlock': ['submissions'],
  'back': ['back-attacks'],
  'retention': ['guard-retention'],
};

const STOP_WORDS = new Set([
  'from', 'the', 'a', 'an', 'basic', 'advanced', 'in', 'to', 'and',
  'or', 'with', 'for', 'on', 'of', 'vs', 'how', 'setup', 'entry',
  'position', 'technique', 'counter', 'defense', 'overview', 'system',
  'general', 'fundamentals', 'concepts',
]);

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => !STOP_WORDS.has(w) && w.length > 1)
    .join(' ')
    .trim();
}

function fuzzyMatch(videoText: string, nodeName: string): number {
  const normVideo = normalize(videoText);
  const normNode = normalize(nodeName);

  if (!normVideo || !normNode) return 0;

  if (normVideo === normNode) return 1.0;

  if (normVideo.includes(normNode)) return 0.9;
  if (normNode.includes(normVideo)) return 0.85;

  const videoWords = normVideo.split(' ');
  const nodeWords = normNode.split(' ');

  const matchingWords = nodeWords.filter(nw =>
    videoWords.some(vw => vw === nw || vw.includes(nw) || nw.includes(vw))
  );

  if (matchingWords.length === 0) return 0;

  const wordScore = matchingWords.length / nodeWords.length;
  return wordScore * 0.8;
}

function getPositionFromText(text: string): string[] {
  const lower = text.toLowerCase();
  const positions: string[] = [];

  const positionPatterns: [RegExp, string][] = [
    [/closed\s*guard/i, 'closed-guard'],
    [/half\s*guard/i, 'half-guard'],
    [/spider\s*guard/i, 'spider-guard'],
    [/de\s*la\s*riva/i, 'de-la-riva-guard'],
    [/worm\s*guard/i, 'worm-guard'],
    [/squid\s*guard/i, 'squid-guard'],
    [/sit\s*up\s*guard/i, 'sit-up-guard'],
    [/octopus\s*guard/i, 'octopus-guard'],
    [/open\s*guard/i, 'guard-play'],
    [/side\s*control/i, 'side-control'],
    [/mount/i, 'mount'],
    [/back\s*control|back\s*mount|rear\s*naked/i, 'back-attacks'],
    [/turtle/i, 'turtle'],
    [/knee\s*on\s*belly/i, 'knee-on-belly'],
    [/north\s*south/i, 'north-south'],
    [/standing|stand\s*up/i, 'takedowns'],
    [/50\s*50|fifty\s*fifty/i, 'leg-locks'],
    [/ashi\s*garami|saddle/i, 'leg-locks'],
    [/k[\s-]*guard/i, 'guard-play'],
    [/butterfly/i, 'guard-play'],
    [/lasso/i, 'guard-play'],
    [/rubber\s*guard/i, 'guard-play'],
    [/x[\s-]*guard/i, 'guard-play'],
    [/single\s*leg\s*x/i, 'guard-play'],
  ];

  for (const [pattern, slug] of positionPatterns) {
    if (pattern.test(lower)) {
      positions.push(slug);
    }
  }

  return positions;
}

let cachedTaxonomy: TaxonomyNode[] | null = null;
let taxonomyCacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function getTaxonomyNodes(): Promise<TaxonomyNode[]> {
  const now = Date.now();
  if (cachedTaxonomy && now - taxonomyCacheTime < CACHE_TTL) {
    return cachedTaxonomy;
  }

  const nodes = await db.select({
    id: techniqueTaxonomyV2.id,
    name: techniqueTaxonomyV2.name,
    slug: techniqueTaxonomyV2.slug,
    level: techniqueTaxonomyV2.level,
    parentId: techniqueTaxonomyV2.parentId,
  }).from(techniqueTaxonomyV2).orderBy(asc(techniqueTaxonomyV2.level));

  cachedTaxonomy = nodes;
  taxonomyCacheTime = now;
  return nodes;
}

export function invalidateTaxonomyCache() {
  cachedTaxonomy = null;
  taxonomyCacheTime = 0;
}

export async function autoTagVideo(videoId: number): Promise<{ success: boolean; tagsAdded: number; tags: string[] }> {
  try {
    const allNodes = await getTaxonomyNodes();
    if (allNodes.length === 0) {
      return { success: false, tagsAdded: 0, tags: [] };
    }

    const [video] = await db.select({
      id: aiVideoKnowledge.id,
      techniqueName: aiVideoKnowledge.techniqueName,
      techniqueType: aiVideoKnowledge.techniqueType,
      positionCategory: aiVideoKnowledge.positionCategory,
      title: aiVideoKnowledge.title,
      giOrNogi: aiVideoKnowledge.giOrNogi,
    })
    .from(aiVideoKnowledge)
    .where(eq(aiVideoKnowledge.id, videoId))
    .limit(1);

    if (!video) {
      return { success: false, tagsAdded: 0, tags: [] };
    }

    const l1Nodes = allNodes.filter(n => n.level === 1);
    const l2Nodes = allNodes.filter(n => n.level === 2);
    const l3Nodes = allNodes.filter(n => n.level === 3);

    const nodeParentMap = new Map<number, number | null>();
    for (const n of allNodes) {
      nodeParentMap.set(n.id, n.parentId);
    }

    const getL1Parent = (nodeId: number): number | null => {
      let current = nodeId;
      let depth = 0;
      while (depth < 5) {
        const node = allNodes.find(n => n.id === current);
        if (!node) return null;
        if (node.level === 1) return node.id;
        if (node.parentId === null) return node.id;
        current = node.parentId;
        depth++;
      }
      return null;
    };

    const matchedNodeIds = new Set<number>();
    const tagDetails: string[] = [];

    const techniqueTypes = (video.techniqueType || '')
      .split(/[\/,]/)
      .map(t => t.trim().toLowerCase().replace(/\s+/g, '_'))
      .filter(Boolean);

    const l1Slugs = new Set<string>();
    for (const tt of techniqueTypes) {
      const mapped = TECHNIQUE_TYPE_TO_L1[tt];
      if (mapped) {
        for (const slug of mapped) {
          l1Slugs.add(slug);
        }
      }
    }

    const searchText = [
      video.techniqueName || '',
      video.title || '',
      video.positionCategory || '',
    ].join(' ');

    const positionSlugs = getPositionFromText(searchText);
    for (const ps of positionSlugs) {
      const matchedL2 = l2Nodes.find(n => n.slug === ps || n.slug.includes(ps) || ps.includes(n.slug));
      if (matchedL2) {
        matchedNodeIds.add(matchedL2.id);
        tagDetails.push(`L2:${matchedL2.name}(position-detect)`);
        const parent = getL1Parent(matchedL2.id);
        if (parent) {
          matchedNodeIds.add(parent);
        }
      }
    }

    if (video.techniqueName) {
      const bestL3Matches: { node: TaxonomyNode; score: number }[] = [];

      for (const node of l3Nodes) {
        const score = fuzzyMatch(video.techniqueName, node.name);
        if (score >= 0.6) {
          bestL3Matches.push({ node, score });
        }
      }

      bestL3Matches.sort((a, b) => b.score - a.score);

      for (const match of bestL3Matches.slice(0, 3)) {
        matchedNodeIds.add(match.node.id);
        tagDetails.push(`L3:${match.node.name}(score=${match.score.toFixed(2)})`);

        if (match.node.parentId) {
          matchedNodeIds.add(match.node.parentId);
          const parent = getL1Parent(match.node.id);
          if (parent) matchedNodeIds.add(parent);
        }
      }

      if (bestL3Matches.length === 0) {
        for (const node of l2Nodes) {
          const score = fuzzyMatch(video.techniqueName, node.name);
          if (score >= 0.6) {
            matchedNodeIds.add(node.id);
            tagDetails.push(`L2:${node.name}(score=${score.toFixed(2)})`);
            const parent = getL1Parent(node.id);
            if (parent) matchedNodeIds.add(parent);
          }
        }
      }
    }

    for (const slug of Array.from(l1Slugs)) {
      const l1Node = l1Nodes.find(n => n.slug === slug);
      if (l1Node) {
        matchedNodeIds.add(l1Node.id);
        if (!tagDetails.some(t => t.includes(l1Node.name))) {
          tagDetails.push(`L1:${l1Node.name}(type-map)`);
        }
      }
    }

    if (matchedNodeIds.size === 0) {
      const fundamentals = l1Nodes.find(n => n.slug === 'fundamentals');
      if (fundamentals) {
        matchedNodeIds.add(fundamentals.id);
        tagDetails.push(`L1:Fundamentals(fallback)`);
      }
    }

    let tagsAdded = 0;
    for (const taxonomyId of Array.from(matchedNodeIds)) {
      const isL1 = l1Nodes.some(n => n.id === taxonomyId);
      const relevance = isL1 && matchedNodeIds.size > 1 ? 'secondary' : 'primary';

      try {
        await db.insert(videoTechniqueTags).values({
          videoId: videoId,
          taxonomyId: taxonomyId,
          relevance: relevance,
        }).onConflictDoNothing();
        tagsAdded++;
      } catch {
      }
    }

    return { success: true, tagsAdded, tags: tagDetails };
  } catch (error: any) {
    console.error(`[AUTO-TAG] Error tagging video ${videoId}:`, error.message);
    return { success: false, tagsAdded: 0, tags: [] };
  }
}

export async function backfillUntaggedVideos(): Promise<{
  totalUntagged: number;
  processed: number;
  totalTagsAdded: number;
  errors: number;
}> {
  const untaggedResult = await db.execute(sql`
    SELECT v.id FROM ai_video_knowledge v
    WHERE v.status = 'active'
    AND v.technique_name IS NOT NULL
    AND v.technique_name != ''
    AND NOT EXISTS (
      SELECT 1 FROM video_technique_tags vt WHERE vt.video_id = v.id
    )
    ORDER BY v.id
  `);

  const rows: any[] = Array.isArray(untaggedResult) ? untaggedResult : (untaggedResult as any).rows || [];
  const totalUntagged = rows.length;

  console.log(`[AUTO-TAG] Found ${totalUntagged} untagged videos to process`);

  let processed = 0;
  let totalTagsAdded = 0;
  let errors = 0;

  for (const row of rows) {
    const result = await autoTagVideo(row.id);
    if (result.success) {
      totalTagsAdded += result.tagsAdded;
    } else {
      errors++;
    }
    processed++;

    if (processed % 100 === 0) {
      console.log(`[AUTO-TAG] Progress: ${processed}/${totalUntagged} videos, ${totalTagsAdded} tags added`);
    }
  }

  console.log(`[AUTO-TAG] Backfill complete: ${processed} videos, ${totalTagsAdded} tags added, ${errors} errors`);

  return { totalUntagged, processed, totalTagsAdded, errors };
}
