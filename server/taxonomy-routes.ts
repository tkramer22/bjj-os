import express from 'express';
import jwt from 'jsonwebtoken';
import Anthropic from '@anthropic-ai/sdk';
import { db } from "./db";
import { techniqueTaxonomyV2, videoTechniqueTags, aiVideoKnowledge } from "@shared/schema";
import { eq, desc, sql, and, isNotNull, inArray, ilike, or, asc, isNull } from "drizzle-orm";

const router = express.Router();

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const JWT_SECRET = process.env.SESSION_SECRET || process.env.JWT_SECRET;
  const adminSession = req.cookies?.admin_session;
  const authHeader = req.headers.authorization;
  const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const token = adminSession || headerToken;

  if (!token) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET!) as any;
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: "Forbidden" });
    }
    (req as any).adminUser = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Invalid session" });
  }
}

router.post('/migrate', requireAdmin, async (_req, res) => {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS technique_taxonomy_v2 (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        slug VARCHAR(100) NOT NULL UNIQUE,
        parent_id INTEGER,
        level INTEGER NOT NULL,
        display_order INTEGER DEFAULT 0,
        description TEXT,
        icon VARCHAR(50),
        video_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS video_technique_tags (
        id SERIAL PRIMARY KEY,
        video_id INTEGER NOT NULL,
        taxonomy_id INTEGER NOT NULL REFERENCES technique_taxonomy_v2(id) ON DELETE CASCADE,
        relevance VARCHAR(20) DEFAULT 'primary',
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        UNIQUE(video_id, taxonomy_id)
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_taxonomy_v2_parent ON technique_taxonomy_v2(parent_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_taxonomy_v2_slug ON technique_taxonomy_v2(slug)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_taxonomy_v2_level ON technique_taxonomy_v2(level)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_taxonomy_v2_level_order ON technique_taxonomy_v2(level, display_order)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_video_tags_video ON video_technique_tags(video_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_video_tags_taxonomy ON video_technique_tags(taxonomy_id)`);
    res.json({ success: true, message: 'Taxonomy tables created successfully' });
  } catch (error: any) {
    console.error('[TAXONOMY MIGRATE] Error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), ms))
  ]);
}

router.get('/extract-labels', requireAdmin, async (_req, res) => {
  try {
    const [techniqueNames, techniqueTypes, positions, totalCount] = await Promise.all([
      withTimeout(db.execute(sql`
        SELECT technique_name, COUNT(*) as video_count
        FROM ai_video_knowledge
        WHERE technique_name IS NOT NULL AND technique_name != '' AND status = 'active'
        GROUP BY technique_name
        ORDER BY video_count DESC
      `), 30000),
      withTimeout(db.execute(sql`
        SELECT DISTINCT technique_type FROM ai_video_knowledge 
        WHERE technique_type IS NOT NULL AND technique_type != '' AND status = 'active'
        ORDER BY technique_type
      `), 15000),
      withTimeout(db.execute(sql`
        SELECT DISTINCT position_category FROM ai_video_knowledge 
        WHERE position_category IS NOT NULL AND position_category != '' AND status = 'active'
        ORDER BY position_category
      `), 15000),
      withTimeout(db.execute(sql`
        SELECT COUNT(DISTINCT technique_name) as unique_labels 
        FROM ai_video_knowledge 
        WHERE technique_name IS NOT NULL AND technique_name != ''
      `), 15000),
    ]);

    const parseRows = (result: any) => Array.isArray(result) ? result : (result.rows || []);

    res.json({
      techniqueNames: parseRows(techniqueNames),
      techniqueTypes: parseRows(techniqueTypes).map((r: any) => r.technique_type),
      positions: parseRows(positions).map((r: any) => r.position_category),
      totalUniqueLabels: parseRows(totalCount)[0]?.unique_labels || 0,
    });
  } catch (error: any) {
    console.error('[TAXONOMY] Error extracting labels:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/generate', requireAdmin, async (req, res) => {
  try {
    const { labels } = req.body;

    if (!labels || !Array.isArray(labels) || labels.length === 0) {
      return res.status(400).json({ error: "Labels array required. Run /extract-labels first." });
    }

    const labelText = labels.map((l: any) => `${l.technique_name} (${l.video_count} videos)`).join('\n');

    console.log(`[TAXONOMY] Generating taxonomy from ${labels.length} labels using Claude...`);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 8000,
      messages: [{
        role: "user",
        content: `You are an expert BJJ black belt instructor building a technique library for a BJJ coaching app. Below is a list of every technique label currently in our database with video counts.

Your job: Create a complete hierarchical taxonomy that organizes ALL of these into a clean structure.

Rules:
1. Level 1: 12-15 broad categories (Guard Play, Passing, Submissions, Escapes, Takedowns, Sweeps, Back Attacks, Transitions, Guard Retention, Top Control, Leg Locks, Fundamentals, Competition, Drills & Movement)
2. Level 2: Positions within each category (Closed Guard, Half Guard, Mount, Side Control, etc.)
3. Level 3: Specific techniques (Armbar, Triangle, Kimura, etc.)
4. Every current label must map to at least one Level 2 or Level 3 node
5. Merge duplicates: "Armbar from Mount" and "armbar from mount" are the same
6. Merge near-duplicates: "Armbar from Mount Position" = "Armbar from Mount"
7. A technique can appear under multiple positions (Armbar exists under Closed Guard, Mount, and Side Control)
8. Use standard BJJ terminology that any blue belt would recognize
9. Include gi-specific and no-gi-specific subcategories where relevant

Return ONLY a JSON array (no markdown, no explanation):
[
  {
    "name": "Guard Play",
    "slug": "guard-play",
    "level": 1,
    "display_order": 1,
    "description": "Techniques from bottom guard positions",
    "children": [
      {
        "name": "Closed Guard",
        "slug": "closed-guard",
        "level": 2,
        "display_order": 1,
        "description": "Attacks and sweeps from closed guard",
        "children": [
          {
            "name": "Triangle Choke",
            "slug": "triangle-choke-closed-guard",
            "level": 3,
            "display_order": 1
          }
        ]
      }
    ]
  }
]

Here are all current technique labels:
${labelText}`
      }]
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return res.status(500).json({ error: "No text response from Claude" });
    }

    let taxonomy;
    try {
      let jsonStr = textContent.text.trim();
      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
      }
      taxonomy = JSON.parse(jsonStr);
    } catch (parseError: any) {
      console.error('[TAXONOMY] Failed to parse Claude response:', parseError.message);
      return res.status(500).json({ 
        error: "Failed to parse taxonomy JSON",
        rawResponse: textContent.text.substring(0, 500)
      });
    }

    await db.delete(videoTechniqueTags);
    await db.delete(techniqueTaxonomyV2);

    let insertedCount = 0;

    async function insertNode(node: any, parentId: number | null) {
      const [inserted] = await db.insert(techniqueTaxonomyV2).values({
        name: node.name,
        slug: node.slug,
        parentId: parentId,
        level: node.level,
        displayOrder: node.display_order || 0,
        description: node.description || null,
        icon: node.icon || null,
      }).returning();

      insertedCount++;

      if (node.children && Array.isArray(node.children)) {
        for (const child of node.children) {
          await insertNode(child, inserted.id);
        }
      }
    }

    for (const category of taxonomy) {
      await insertNode(category, null);
    }

    const levelCounts = await db.execute(sql`
      SELECT level, COUNT(*) as count FROM technique_taxonomy_v2 GROUP BY level ORDER BY level
    `);
    const parsedLevelCounts = Array.isArray(levelCounts) ? levelCounts : (levelCounts.rows || []);

    console.log(`[TAXONOMY] Generated ${insertedCount} taxonomy nodes`);

    res.json({
      success: true,
      totalNodes: insertedCount,
      levelCounts: parsedLevelCounts,
      taxonomy: taxonomy,
    });
  } catch (error: any) {
    console.error('[TAXONOMY] Error generating taxonomy:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/map-videos', requireAdmin, async (req, res) => {
  try {
    const { batchSize = 50, offset = 0 } = req.body;

    const allTaxonomyNodes = await db.select({
      id: techniqueTaxonomyV2.id,
      slug: techniqueTaxonomyV2.slug,
      name: techniqueTaxonomyV2.name,
      level: techniqueTaxonomyV2.level,
      parentId: techniqueTaxonomyV2.parentId,
    }).from(techniqueTaxonomyV2).orderBy(asc(techniqueTaxonomyV2.level));

    if (allTaxonomyNodes.length === 0) {
      return res.status(400).json({ error: "No taxonomy nodes found. Run /generate first." });
    }

    const videos = await db.select({
      id: aiVideoKnowledge.id,
      techniqueName: aiVideoKnowledge.techniqueName,
      techniqueType: aiVideoKnowledge.techniqueType,
      positionCategory: aiVideoKnowledge.positionCategory,
      title: aiVideoKnowledge.title,
      giOrNogi: aiVideoKnowledge.giOrNogi,
    })
    .from(aiVideoKnowledge)
    .where(and(
      eq(aiVideoKnowledge.status, 'active'),
      isNotNull(aiVideoKnowledge.techniqueName),
      sql`${aiVideoKnowledge.techniqueName} != ''`
    ))
    .orderBy(asc(aiVideoKnowledge.id))
    .limit(batchSize)
    .offset(offset);

    if (videos.length === 0) {
      const totalMapped = await db.execute(sql`SELECT COUNT(*) as count FROM video_technique_tags`);
      const mappedRows = Array.isArray(totalMapped) ? totalMapped : (totalMapped.rows || []);
      return res.json({ 
        success: true, 
        message: "No more videos to map",
        totalMapped: mappedRows[0]?.count || 0,
        done: true 
      });
    }

    const slugList = allTaxonomyNodes.map(n => `${n.slug} (${n.name}, level ${n.level})`).join('\n');
    const videoList = videos.map(v => JSON.stringify({
      id: v.id,
      technique: v.techniqueName,
      type: v.techniqueType,
      position: v.positionCategory,
      title: v.title,
      gi: v.giOrNogi,
    })).join('\n');

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5-20250929",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: `You are mapping BJJ videos to a technique taxonomy. For each video below, determine which taxonomy nodes (by slug) it should be tagged with.

Rules:
1. Every video gets at least one primary tag
2. Videos covering multiple techniques get multiple tags
3. Use 'primary' for the main technique and 'secondary' for related ones
4. Match based on the video's technique name, position, and analysis
5. Prefer level 2 and level 3 nodes for tagging (positions and specific techniques)
6. Also include the parent level 1 category as a secondary tag

Taxonomy nodes available:
${slugList}

Videos to map:
${videoList}

Return ONLY a JSON array (no markdown, no explanation):
[
  {"video_id": 123, "tags": [
    {"slug": "armbar-closed-guard", "relevance": "primary"},
    {"slug": "guard-play", "relevance": "secondary"}
  ]}
]`
      }]
    });

    const textContent = response.content.find((c: any) => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return res.status(500).json({ error: "No text response from Claude" });
    }

    let mappings;
    try {
      let jsonStr = textContent.text.trim();
      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (jsonMatch) jsonStr = jsonMatch[0];
      mappings = JSON.parse(jsonStr);
    } catch (parseError: any) {
      return res.status(500).json({ error: "Failed to parse mapping JSON", raw: textContent.text.substring(0, 500) });
    }

    const slugToId = new Map(allTaxonomyNodes.map(n => [n.slug, n.id]));
    let tagsInserted = 0;
    let skipped = 0;

    for (const mapping of mappings) {
      if (!mapping.video_id || !mapping.tags) continue;

      for (const tag of mapping.tags) {
        const taxonomyId = slugToId.get(tag.slug);
        if (!taxonomyId) {
          skipped++;
          continue;
        }

        try {
          await db.insert(videoTechniqueTags).values({
            videoId: mapping.video_id,
            taxonomyId: taxonomyId,
            relevance: tag.relevance || 'primary',
          }).onConflictDoNothing();
          tagsInserted++;
        } catch (e: any) {
          skipped++;
        }
      }
    }

    console.log(`[TAXONOMY] Mapped batch at offset ${offset}: ${videos.length} videos, ${tagsInserted} tags inserted, ${skipped} skipped`);

    res.json({
      success: true,
      batchSize: videos.length,
      offset,
      nextOffset: offset + batchSize,
      tagsInserted,
      skipped,
      done: videos.length < batchSize,
    });
  } catch (error: any) {
    console.error('[TAXONOMY] Error mapping videos:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.post('/map-all-videos', requireAdmin, async (req, res) => {
  try {
    const batchSize = 50;
    let offset = 0;
    let totalTagsInserted = 0;
    let totalVideos = 0;
    let batchNum = 0;

    const allTaxonomyNodes = await db.select({
      id: techniqueTaxonomyV2.id,
      slug: techniqueTaxonomyV2.slug,
      name: techniqueTaxonomyV2.name,
      level: techniqueTaxonomyV2.level,
    }).from(techniqueTaxonomyV2).orderBy(asc(techniqueTaxonomyV2.level));

    if (allTaxonomyNodes.length === 0) {
      return res.status(400).json({ error: "No taxonomy nodes. Run /generate first." });
    }

    const slugToId = new Map(allTaxonomyNodes.map(n => [n.slug, n.id]));
    const slugList = allTaxonomyNodes.map(n => `${n.slug} (${n.name}, level ${n.level})`).join('\n');

    while (true) {
      const videos = await db.select({
        id: aiVideoKnowledge.id,
        techniqueName: aiVideoKnowledge.techniqueName,
        techniqueType: aiVideoKnowledge.techniqueType,
        positionCategory: aiVideoKnowledge.positionCategory,
        title: aiVideoKnowledge.title,
        giOrNogi: aiVideoKnowledge.giOrNogi,
      })
      .from(aiVideoKnowledge)
      .where(and(
        eq(aiVideoKnowledge.status, 'active'),
        isNotNull(aiVideoKnowledge.techniqueName),
        sql`${aiVideoKnowledge.techniqueName} != ''`
      ))
      .orderBy(asc(aiVideoKnowledge.id))
      .limit(batchSize)
      .offset(offset);

      if (videos.length === 0) break;
      batchNum++;
      totalVideos += videos.length;

      const videoList = videos.map(v => JSON.stringify({
        id: v.id,
        technique: v.techniqueName,
        type: v.techniqueType,
        position: v.positionCategory,
        title: v.title,
        gi: v.giOrNogi,
      })).join('\n');

      try {
        const response = await anthropic.messages.create({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4000,
          messages: [{
            role: "user",
            content: `Map these BJJ videos to taxonomy nodes. Every video gets at least one primary tag. Use 'primary' for main technique, 'secondary' for related. Prefer level 2/3 nodes.

Taxonomy nodes:
${slugList}

Videos:
${videoList}

Return ONLY JSON array:
[{"video_id": 123, "tags": [{"slug": "armbar-closed-guard", "relevance": "primary"}]}]`
          }]
        });

        const textContent = response.content.find((c: any) => c.type === 'text');
        if (textContent && textContent.type === 'text') {
          let jsonStr = textContent.text.trim();
          const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
          if (jsonMatch) jsonStr = jsonMatch[0];
          const mappings = JSON.parse(jsonStr);

          for (const mapping of mappings) {
            if (!mapping.video_id || !mapping.tags) continue;
            for (const tag of mapping.tags) {
              const taxonomyId = slugToId.get(tag.slug);
              if (!taxonomyId) continue;
              try {
                await db.insert(videoTechniqueTags).values({
                  videoId: mapping.video_id,
                  taxonomyId,
                  relevance: tag.relevance || 'primary',
                }).onConflictDoNothing();
                totalTagsInserted++;
              } catch {}
            }
          }
        }
      } catch (e: any) {
        console.error(`[TAXONOMY] Batch ${batchNum} failed:`, e.message);
      }

      console.log(`[TAXONOMY] Mapped batch ${batchNum}: ${videos.length} videos (total: ${totalVideos})`);
      offset += batchSize;
    }

    await updateVideoCounts();

    res.json({
      success: true,
      totalVideos,
      totalTagsInserted,
      batchesProcessed: batchNum,
    });
  } catch (error: any) {
    console.error('[TAXONOMY] Error in map-all-videos:', error.message);
    res.status(500).json({ error: error.message });
  }
});

async function updateVideoCounts() {
  try {
    await db.execute(sql`
      UPDATE technique_taxonomy_v2 t
      SET video_count = COALESCE((
        SELECT COUNT(DISTINCT vt.video_id)
        FROM video_technique_tags vt
        WHERE vt.taxonomy_id = t.id
      ), 0)
    `);

    await db.execute(sql`
      UPDATE technique_taxonomy_v2 parent
      SET video_count = COALESCE((
        SELECT COUNT(DISTINCT vt.video_id)
        FROM video_technique_tags vt
        JOIN technique_taxonomy_v2 child ON vt.taxonomy_id = child.id
        WHERE child.parent_id = parent.id OR child.id = parent.id
      ), 0)
      WHERE parent.level <= 2
    `);

    console.log('[TAXONOMY] Updated video counts');
  } catch (e: any) {
    console.error('[TAXONOMY] Error updating counts:', e.message);
  }
}

router.post('/update-counts', requireAdmin, async (_req, res) => {
  try {
    await updateVideoCounts();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tree', async (_req, res) => {
  try {
    const nodes = await withTimeout(
      db.select().from(techniqueTaxonomyV2).orderBy(asc(techniqueTaxonomyV2.level), asc(techniqueTaxonomyV2.displayOrder)),
      10000
    );

    const nodeMap = new Map<number, any>();
    const roots: any[] = [];

    for (const node of nodes) {
      nodeMap.set(node.id, { ...node, children: [] });
    }

    for (const node of nodes) {
      const mapped = nodeMap.get(node.id)!;
      if (node.parentId && nodeMap.has(node.parentId)) {
        nodeMap.get(node.parentId)!.children.push(mapped);
      } else {
        roots.push(mapped);
      }
    }

    res.json({ taxonomy: roots, totalNodes: nodes.length });
  } catch (error: any) {
    console.error('[TAXONOMY] Error fetching tree:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/categories', async (_req, res) => {
  try {
    const categories = await withTimeout(
      db.select()
        .from(techniqueTaxonomyV2)
        .where(eq(techniqueTaxonomyV2.level, 1))
        .orderBy(asc(techniqueTaxonomyV2.displayOrder)),
      10000
    );

    res.json({ categories });
  } catch (error: any) {
    console.error('[TAXONOMY] Error fetching categories:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/children/:parentId', async (req, res) => {
  try {
    const parentId = parseInt(req.params.parentId);
    if (isNaN(parentId)) return res.status(400).json({ error: "Invalid parent ID" });

    const [parent, children] = await Promise.all([
      db.select().from(techniqueTaxonomyV2).where(eq(techniqueTaxonomyV2.id, parentId)).limit(1),
      db.select()
        .from(techniqueTaxonomyV2)
        .where(eq(techniqueTaxonomyV2.parentId, parentId))
        .orderBy(asc(techniqueTaxonomyV2.displayOrder)),
    ]);

    res.json({ parent: parent[0] || null, children });
  } catch (error: any) {
    console.error('[TAXONOMY] Error fetching children:', error.message);
    res.status(500).json({ error: error.message });
  }
});

function extractYouTubeId(url: string | null): string | null {
  if (!url) return null;
  const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

function formatDuration(seconds: number | null): string | null {
  if (!seconds) return null;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

router.get('/videos/:taxonomyId', async (req, res) => {
  try {
    const taxonomyId = parseInt(req.params.taxonomyId);
    if (isNaN(taxonomyId)) return res.status(400).json({ error: "Invalid taxonomy ID" });

    const includeChildren = req.query.includeChildren === 'true';

    let taxonomyIds = [taxonomyId];

    if (includeChildren) {
      const childNodes = await db.select({ id: techniqueTaxonomyV2.id })
        .from(techniqueTaxonomyV2)
        .where(eq(techniqueTaxonomyV2.parentId, taxonomyId));
      
      const childIds = childNodes.map(n => n.id);
      taxonomyIds = [...taxonomyIds, ...childIds];

      if (childIds.length > 0) {
        const grandChildren = await db.select({ id: techniqueTaxonomyV2.id })
          .from(techniqueTaxonomyV2)
          .where(inArray(techniqueTaxonomyV2.parentId, childIds));
        taxonomyIds = [...taxonomyIds, ...grandChildren.map(n => n.id)];
      }
    }

    const taggedVideoIds = await db.selectDistinct({ videoId: videoTechniqueTags.videoId })
      .from(videoTechniqueTags)
      .where(inArray(videoTechniqueTags.taxonomyId, taxonomyIds));

    if (taggedVideoIds.length === 0) {
      return res.json({ videos: [], count: 0 });
    }

    const videoIds = taggedVideoIds.map(t => t.videoId);

    const videos = await db.select({
      id: aiVideoKnowledge.id,
      youtubeId: aiVideoKnowledge.youtubeId,
      videoUrl: aiVideoKnowledge.videoUrl,
      thumbnailUrl: aiVideoKnowledge.thumbnailUrl,
      title: aiVideoKnowledge.title,
      techniqueName: aiVideoKnowledge.techniqueName,
      instructorName: aiVideoKnowledge.instructorName,
      techniqueType: aiVideoKnowledge.techniqueType,
      positionCategory: aiVideoKnowledge.positionCategory,
      beltLevel: aiVideoKnowledge.beltLevel,
      giOrNogi: aiVideoKnowledge.giOrNogi,
      qualityScore: aiVideoKnowledge.qualityScore,
      viewCount: aiVideoKnowledge.viewCount,
      duration: aiVideoKnowledge.duration,
      createdAt: aiVideoKnowledge.createdAt,
      hasAnalysis: sql<boolean>`EXISTS (SELECT 1 FROM video_knowledge WHERE video_knowledge.video_id = ${aiVideoKnowledge.id} AND technique_name IS NOT NULL AND technique_name != '' AND (key_concepts IS NOT NULL OR full_summary IS NOT NULL))`,
    })
    .from(aiVideoKnowledge)
    .where(and(
      inArray(aiVideoKnowledge.id, videoIds),
      eq(aiVideoKnowledge.status, 'active')
    ))
    .orderBy(desc(aiVideoKnowledge.qualityScore));

    const transformedVideos = videos.map(video => ({
      id: video.id,
      videoId: video.youtubeId || extractYouTubeId(video.videoUrl),
      thumbnailUrl: video.thumbnailUrl,
      title: video.title || video.techniqueName,
      techniqueName: video.techniqueName,
      instructorName: video.instructorName || 'Unknown Instructor',
      techniqueType: video.techniqueType || 'Technique',
      positionCategory: video.positionCategory || null,
      beltLevel: Array.isArray(video.beltLevel) && video.beltLevel.length > 0
        ? video.beltLevel[0]
        : 'all',
      giOrNogi: video.giOrNogi || 'both',
      qualityScore: video.qualityScore ? parseFloat(video.qualityScore.toString()) : 0,
      viewCount: Number(video.viewCount ?? 0),
      duration: formatDuration(video.duration),
      createdAt: video.createdAt,
      hasAnalysis: !!video.hasAnalysis,
    }));

    res.json({ videos: transformedVideos, count: transformedVideos.length });
  } catch (error: any) {
    console.error('[TAXONOMY] Error fetching videos:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/search', async (req, res) => {
  try {
    const query = (req.query.q as string || '').trim();
    if (!query || query.length < 2) {
      return res.json({ taxonomyResults: [], videoResults: [] });
    }

    const searchPattern = `%${query}%`;

    const [taxonomyResults, videoResults] = await Promise.all([
      db.select()
        .from(techniqueTaxonomyV2)
        .where(or(
          ilike(techniqueTaxonomyV2.name, searchPattern),
          ilike(techniqueTaxonomyV2.slug, searchPattern),
          ilike(techniqueTaxonomyV2.description, searchPattern)
        ))
        .orderBy(asc(techniqueTaxonomyV2.level), desc(techniqueTaxonomyV2.videoCount))
        .limit(20),

      db.select({
        id: aiVideoKnowledge.id,
        youtubeId: aiVideoKnowledge.youtubeId,
        videoUrl: aiVideoKnowledge.videoUrl,
        thumbnailUrl: aiVideoKnowledge.thumbnailUrl,
        title: aiVideoKnowledge.title,
        techniqueName: aiVideoKnowledge.techniqueName,
        instructorName: aiVideoKnowledge.instructorName,
        techniqueType: aiVideoKnowledge.techniqueType,
        giOrNogi: aiVideoKnowledge.giOrNogi,
        qualityScore: aiVideoKnowledge.qualityScore,
        viewCount: aiVideoKnowledge.viewCount,
        duration: aiVideoKnowledge.duration,
        createdAt: aiVideoKnowledge.createdAt,
      })
      .from(aiVideoKnowledge)
      .where(and(
        eq(aiVideoKnowledge.status, 'active'),
        isNotNull(aiVideoKnowledge.thumbnailUrl),
        sql`${aiVideoKnowledge.thumbnailUrl} != ''`,
        or(
          ilike(aiVideoKnowledge.title, searchPattern),
          ilike(aiVideoKnowledge.techniqueName, searchPattern),
          ilike(aiVideoKnowledge.instructorName, searchPattern)
        )
      ))
      .orderBy(desc(aiVideoKnowledge.qualityScore))
      .limit(30),
    ]);

    const transformedVideos = videoResults.map(video => ({
      id: video.id,
      videoId: video.youtubeId || extractYouTubeId(video.videoUrl),
      thumbnailUrl: video.thumbnailUrl,
      title: video.title || video.techniqueName,
      techniqueName: video.techniqueName,
      instructorName: video.instructorName || 'Unknown Instructor',
      giOrNogi: video.giOrNogi || 'both',
      qualityScore: video.qualityScore ? parseFloat(video.qualityScore.toString()) : 0,
      viewCount: Number(video.viewCount ?? 0),
      duration: formatDuration(video.duration),
      createdAt: video.createdAt,
    }));

    res.json({ taxonomyResults, videoResults: transformedVideos });
  } catch (error: any) {
    console.error('[TAXONOMY] Error searching:', error.message);
    res.status(500).json({ error: error.message });
  }
});

router.get('/stats', requireAdmin, async (_req, res) => {
  try {
    const [nodeCounts, tagStats, topNodes, unmapped] = await Promise.all([
      db.execute(sql`SELECT level, COUNT(*) as count FROM technique_taxonomy_v2 GROUP BY level ORDER BY level`),
      db.execute(sql`
        SELECT COUNT(*) as total_tags, 
               COUNT(DISTINCT video_id) as mapped_videos,
               ROUND(COUNT(*)::numeric / NULLIF(COUNT(DISTINCT video_id), 0), 1) as avg_tags_per_video
        FROM video_technique_tags
      `),
      db.execute(sql`
        SELECT t.name, t.level, t.video_count, t.slug
        FROM technique_taxonomy_v2 t
        WHERE t.level >= 2
        ORDER BY t.video_count DESC
        LIMIT 10
      `),
      db.execute(sql`
        SELECT COUNT(*) as count FROM ai_video_knowledge v
        WHERE v.status = 'active'
          AND v.technique_name IS NOT NULL AND v.technique_name != ''
          AND NOT EXISTS (SELECT 1 FROM video_technique_tags vt WHERE vt.video_id = v.id)
      `),
    ]);

    const parseRows = (r: any) => Array.isArray(r) ? r : (r.rows || []);

    res.json({
      nodeCounts: parseRows(nodeCounts),
      tagStats: parseRows(tagStats)[0] || {},
      topNodes: parseRows(topNodes),
      unmappedVideos: parseRows(unmapped)[0]?.count || 0,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
