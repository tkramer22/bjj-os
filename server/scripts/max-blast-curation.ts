/**
 * MAXIMUM BLAST CURATION - Fill the library fast
 * Runs parallel searches for elite instructors and techniques
 */

import { db } from '../db';
import { aiVideoKnowledge, instructorCredibility, videoWatchStatus } from '@shared/schema';
import { sql, eq } from 'drizzle-orm';
import { runContentFirstCuration, TECHNIQUE_SEARCHES } from '../content-first-curator';

const ELITE_INSTRUCTORS = [
  "John Danaher", "Gordon Ryan", "Lachlan Giles", "Craig Jones", "Mikey Musumeci",
  "Keenan Cornelius", "Andre Galvao", "Marcelo Garcia", "Bernardo Faria", "Roger Gracie",
  "Xande Ribeiro", "Rafael Mendes", "Gui Mendes", "Cobrinha", "Leandro Lo",
  "Rodolfo Vieira", "Lucas Lepri", "Nicholas Meregali", "Kaynan Duarte", "Felipe Pena",
  "Buchecha", "Ffion Davies", "Mica Galvao", "Tainan Dalpra", "Tommy Langaker",
  "Levi Jones-Leary", "Giancarlo Bodoni", "Nicky Rod", "JT Torres", "Dante Leon"
];

const PRIORITY_TECHNIQUES = [
  "triangle choke setup", "armbar from guard", "armbar from mount", "kimura trap system",
  "omoplata attacks", "guillotine choke", "darce choke", "anaconda choke", "north south choke",
  "arm triangle", "ezekiel choke", "loop choke", "baseball bat choke", "bow and arrow choke",
  "clock choke", "knee cut pass", "torreando pass", "leg drag pass", "body lock pass",
  "over under pass", "stack pass", "x pass", "smash pass", "long step pass",
  "scissor sweep", "hip bump sweep", "flower sweep", "pendulum sweep", "tripod sweep",
  "berimbolo", "kiss of the dragon", "crab ride", "truck position", "back take BJJ",
  "rear naked choke", "heel hook defense", "heel hook attack", "inside sankaku", "saddle position",
  "ashi garami", "k guard", "reverse de la riva", "de la riva guard", "spider guard",
  "lasso guard", "x guard", "single leg X", "butterfly guard", "half guard sweeps",
  "deep half guard", "closed guard attacks", "mount escapes", "side control escapes",
  "back escapes", "guard retention", "wrestling for BJJ", "arm drag BJJ"
];

async function directYouTubeSearch(query: string, maxResults: number = 10): Promise<any[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not configured');

  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.append('part', 'snippet');
  url.searchParams.append('q', query);
  url.searchParams.append('type', 'video');
  url.searchParams.append('maxResults', maxResults.toString());
  url.searchParams.append('order', 'relevance');
  url.searchParams.append('key', apiKey);

  const response = await fetch(url.toString());
  
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    if (errorData?.error?.errors?.[0]?.reason === 'quotaExceeded') {
      throw new Error('QUOTA_EXCEEDED');
    }
    throw new Error(`YouTube API error: ${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
}

async function runMaxBlastCuration() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🚀 MAXIMUM BLAST CURATION - STARTING');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const startCount = await db.select({ count: sql<number>`count(*)::int` }).from(aiVideoKnowledge);
  console.log(`📊 Starting library count: ${startCount[0]?.count || 0}`);

  let videosFound = 0;
  let videosAdded = 0;
  let quotaExhausted = false;
  let batchCount = 0;

  // Run content-first curation with maximum settings
  console.log('\n🎯 PHASE 1: Running content-first curation (100 techniques, 10 videos each)...\n');
  
  try {
    const result = await runContentFirstCuration(100, 10, (progress) => {
      if (progress.videosSaved > 0 && progress.videosSaved % 10 === 0) {
        console.log(`\n📊 PROGRESS UPDATE:`);
        console.log(`   Techniques searched: ${progress.techniquesProcessed}`);
        console.log(`   Videos analyzed: ${progress.videosAnalyzed}`);
        console.log(`   Videos added: ${progress.videosSaved}`);
        console.log(`   New instructors: ${progress.newInstructorsDiscovered}\n`);
      }
    });

    videosAdded += result.videosSaved;
    videosFound += result.videosAnalyzed;
    
    console.log(`\n✅ Phase 1 Complete:`);
    console.log(`   Techniques: ${result.techniquesSearched}`);
    console.log(`   Analyzed: ${result.videosAnalyzed}`);
    console.log(`   Added: ${result.videosSaved}`);

  } catch (error: any) {
    if (error.message === 'QUOTA_EXCEEDED') {
      quotaExhausted = true;
      console.log('\n🚫 YouTube API quota exhausted during Phase 1');
    } else {
      console.error('Phase 1 error:', error.message);
    }
  }

  // Phase 2: Elite instructor searches
  if (!quotaExhausted) {
    console.log('\n🎯 PHASE 2: Elite instructor deep dives...\n');
    
    for (const instructor of ELITE_INSTRUCTORS) {
      if (quotaExhausted) break;
      
      try {
        console.log(`🔍 Searching: ${instructor} BJJ technique...`);
        const results = await directYouTubeSearch(`${instructor} BJJ technique tutorial`, 10);
        videosFound += results.length;
        batchCount++;
        
        if (batchCount % 10 === 0) {
          console.log(`   Batch ${batchCount}: ${videosFound} videos found total`);
        }
        
        // Small delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 100));
        
      } catch (error: any) {
        if (error.message === 'QUOTA_EXCEEDED') {
          quotaExhausted = true;
          console.log('\n🚫 YouTube API quota exhausted');
          break;
        }
      }
    }
  }

  // Final count
  const endCount = await db.select({ count: sql<number>`count(*)::int` }).from(aiVideoKnowledge);
  const queuedForGemini = await db.select({ count: sql<number>`count(*)::int` })
    .from(videoWatchStatus)
    .where(eq(videoWatchStatus.status, 'pending'));

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('📊 CURATION COMPLETE - FINAL REPORT');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`   Videos found: ${videosFound}`);
  console.log(`   Videos added: ${videosAdded}`);
  console.log(`   Library total: ${endCount[0]?.count || 0}`);
  console.log(`   Queued for Gemini: ${queuedForGemini[0]?.count || 0}`);
  console.log(`   Quota status: ${quotaExhausted ? '❌ EXHAUSTED' : '✅ Available'}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  return {
    videosFound,
    videosAdded,
    libraryTotal: endCount[0]?.count || 0,
    quotaExhausted
  };
}

// Run if called directly
runMaxBlastCuration()
  .then(result => {
    console.log('Curation finished:', result);
    process.exit(0);
  })
  .catch(error => {
    console.error('Curation failed:', error);
    process.exit(1);
  });
