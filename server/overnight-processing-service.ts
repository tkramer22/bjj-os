import { db } from './db';
import { sql, eq, isNull, desc } from 'drizzle-orm';
import { aiVideoKnowledge, videoWatchStatus, videoKnowledge, overnightProgress } from '../shared/schema';
import { processVideoKnowledge } from './video-knowledge-service';
import * as fs from 'fs';

const LOG_FILE = '/home/runner/workspace/overnight_progress.log';

interface OvernightState {
  runId: number | null;
  startedAt: Date | null;
  isRunning: boolean;
  shouldStop: boolean;
}

let overnightState: OvernightState = {
  runId: null,
  startedAt: null,
  isRunning: false,
  shouldStop: false,
};

function logProgress(message: string) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  console.log(`[OVERNIGHT] ${message}`);
  
  try {
    fs.appendFileSync(LOG_FILE, logLine);
  } catch (err) {
    console.error('[OVERNIGHT] Failed to write log:', err);
  }
}

export async function startOvernightProcessing(): Promise<{ success: boolean; runId?: number; message: string }> {
  if (overnightState.isRunning) {
    return { success: false, message: 'Overnight processing already running' };
  }
  
  overnightState.isRunning = true;
  overnightState.shouldStop = false;
  overnightState.startedAt = new Date();
  
  logProgress('═══════════════════════════════════════════════════════════');
  logProgress('🌙 OVERNIGHT PROCESSING STARTED');
  logProgress('═══════════════════════════════════════════════════════════');
  
  try {
    // Create tables if needed
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS overnight_progress (
        id SERIAL PRIMARY KEY,
        started_at TIMESTAMP DEFAULT NOW(),
        videos_processed INTEGER DEFAULT 0,
        videos_remaining INTEGER DEFAULT 0,
        videos_failed INTEGER DEFAULT 0,
        failed_video_ids INTEGER[],
        techniques_extracted INTEGER DEFAULT 0,
        unique_techniques INTEGER DEFAULT 0,
        last_batch_at TIMESTAMP,
        estimated_completion TIMESTAMP,
        status TEXT DEFAULT 'running',
        log_entries JSONB,
        completed_at TIMESTAMP
      )
    `);
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS technique_synthesis (
        id SERIAL PRIMARY KEY,
        technique_name TEXT NOT NULL UNIQUE,
        related_techniques TEXT[],
        all_video_ids INTEGER[],
        all_instructors TEXT[],
        key_principles TEXT[],
        principle_sources JSONB,
        total_videos INTEGER DEFAULT 0,
        total_techniques INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    // Get total count
    const totalResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM ai_video_knowledge WHERE quality_score IS NOT NULL AND status = 'active'
    `);
    const totalVideos = Number(totalResult[0]?.count || 0);
    
    // Get already processed count
    const processedResult = await db.execute(sql`
      SELECT COUNT(*) as count FROM video_watch_status WHERE processed = true
    `);
    const alreadyProcessed = Number(processedResult[0]?.count || 0);
    
    const videosRemaining = totalVideos - alreadyProcessed;
    
    // Create progress record
    const [newRun] = await db.execute(sql`
      INSERT INTO overnight_progress (started_at, videos_remaining, status)
      VALUES (NOW(), ${videosRemaining}, 'running')
      RETURNING id
    `);
    
    overnightState.runId = newRun.id;
    
    logProgress(`Total videos: ${totalVideos}`);
    logProgress(`Already processed: ${alreadyProcessed}`);
    logProgress(`Remaining to process: ${videosRemaining}`);
    logProgress(`Estimated completion: ~${Math.ceil(videosRemaining / 120)} hours (120 videos/hour)`);
    
    // Start processing in background
    processInBackground();
    
    return { success: true, runId: newRun.id, message: `Started processing ${videosRemaining} videos` };
  } catch (error: any) {
    overnightState.isRunning = false;
    logProgress(`❌ FAILED TO START: ${error.message}`);
    return { success: false, message: error.message };
  }
}

async function processInBackground() {
  let batchNumber = 0;
  let totalProcessed = 0;
  let totalFailed = 0;
  let totalTechniques = 0;
  const failedIds: number[] = [];
  const BATCH_SIZE = 10;
  const CHECKPOINT_INTERVAL = 50;
  
  while (!overnightState.shouldStop) {
    batchNumber++;
    
    try {
      // Get unprocessed videos (skip invalid test URLs)
      const unprocessed = await db.execute(sql`
        SELECT v.id, v.title, v.video_url 
        FROM ai_video_knowledge v
        LEFT JOIN video_watch_status s ON v.id = s.video_id
        WHERE v.quality_score IS NOT NULL
        AND v.status = 'active'
        AND (s.processed IS NULL OR s.processed = false)
        AND v.video_url LIKE 'https://www.youtube.com/watch%'
        AND LENGTH(v.video_url) > 30
        ORDER BY v.id
        LIMIT ${BATCH_SIZE}
      `);
      
      if (unprocessed.length === 0) {
        logProgress('✅ ALL VIDEOS PROCESSED!');
        break;
      }
      
      logProgress(`━━━ BATCH ${batchNumber} (${unprocessed.length} videos) ━━━`);
      
      for (let i = 0; i < unprocessed.length; i++) {
        const video = unprocessed[i];
        
        if (overnightState.shouldStop) {
          logProgress('⏸️ Processing stopped by user');
          break;
        }
        
        try {
          const result = await processVideoKnowledge(video.id);
          
          if (result.success) {
            totalProcessed++;
            totalTechniques += result.techniquesAdded || 0;
            logProgress(`  ✅ ${video.id}: ${video.title?.substring(0, 50)}... (${result.techniquesAdded} techniques)`);
          } else {
            totalFailed++;
            failedIds.push(video.id);
            logProgress(`  ❌ ${video.id}: ${result.error?.substring(0, 50)}`);
          }
        } catch (err: any) {
          totalFailed++;
          failedIds.push(video.id);
          logProgress(`  ❌ ${video.id}: Exception - ${err.message?.substring(0, 50)}`);
        }
        
        // Small delay between videos to avoid rate limiting
        await new Promise(r => setTimeout(r, 500));
      }
      
      // Checkpoint every 50 videos
      if (totalProcessed > 0 && totalProcessed % CHECKPOINT_INTERVAL === 0) {
        const remaining = await getRemaining();
        const elapsed = (Date.now() - overnightState.startedAt!.getTime()) / 1000 / 60; // minutes
        const rate = totalProcessed / elapsed; // videos per minute
        const eta = remaining / rate; // minutes
        
        logProgress('');
        logProgress(`📍 CHECKPOINT @ ${totalProcessed} videos processed`);
        logProgress(`   Remaining: ${remaining} | Failed: ${totalFailed}`);
        logProgress(`   Rate: ${rate.toFixed(1)} videos/min | ETA: ${Math.ceil(eta)} min`);
        logProgress('');
        
        // Update database
        await db.execute(sql`
          UPDATE overnight_progress 
          SET videos_processed = ${totalProcessed},
              videos_remaining = ${remaining},
              videos_failed = ${totalFailed},
              failed_video_ids = ${failedIds},
              techniques_extracted = ${totalTechniques},
              last_batch_at = NOW()
          WHERE id = ${overnightState.runId}
        `);
      }
      
      // Small delay between batches
      await new Promise(r => setTimeout(r, 1000));
      
    } catch (err: any) {
      logProgress(`❌ BATCH ERROR: ${err.message}`);
      await new Promise(r => setTimeout(r, 5000)); // Wait 5s on error
    }
  }
  
  // Final update
  const remaining = await getRemaining();
  
  await db.execute(sql`
    UPDATE overnight_progress 
    SET videos_processed = ${totalProcessed},
        videos_remaining = ${remaining},
        videos_failed = ${totalFailed},
        failed_video_ids = ${failedIds},
        techniques_extracted = ${totalTechniques},
        last_batch_at = NOW(),
        status = ${remaining === 0 ? 'completed' : (overnightState.shouldStop ? 'paused' : 'completed')},
        completed_at = NOW()
    WHERE id = ${overnightState.runId}
  `);
  
  logProgress('');
  logProgress('═══════════════════════════════════════════════════════════');
  logProgress(`🏁 OVERNIGHT PROCESSING ${remaining === 0 ? 'COMPLETED' : 'STOPPED'}`);
  logProgress(`   Total processed: ${totalProcessed}`);
  logProgress(`   Total failed: ${totalFailed}`);
  logProgress(`   Techniques extracted: ${totalTechniques}`);
  logProgress('═══════════════════════════════════════════════════════════');
  
  overnightState.isRunning = false;
  
  // After all new videos, reprocess first 33 with old format
  if (remaining === 0 && !overnightState.shouldStop) {
    await reprocessOldVideos();
  }
}

async function getRemaining(): Promise<number> {
  const result = await db.execute(sql`
    SELECT COUNT(*) as count 
    FROM ai_video_knowledge v
    LEFT JOIN video_watch_status s ON v.id = s.video_id
    WHERE v.quality_score IS NOT NULL
    AND v.status = 'active'
    AND (s.processed IS NULL OR s.processed = false)
  `);
  return Number(result[0]?.count || 0);
}

async function reprocessOldVideos() {
  logProgress('');
  logProgress('🔄 REPROCESSING FIRST 33 VIDEOS WITH OLD FORMAT');
  
  // Get first 33 videos that were processed (these have old format)
  const oldVideos = await db.execute(sql`
    SELECT video_id FROM video_watch_status 
    WHERE processed = true 
    ORDER BY id 
    LIMIT 33
  `);
  
  for (const video of oldVideos) {
    try {
      // Clear old data
      await db.execute(sql`DELETE FROM video_knowledge WHERE video_id = ${video.video_id}`);
      await db.execute(sql`UPDATE video_watch_status SET processed = false WHERE video_id = ${video.video_id}`);
      
      const result = await processVideoKnowledge(video.video_id);
      logProgress(`  🔄 Reprocessed ${video.video_id}: ${result.success ? 'OK' : result.error}`);
      
      await new Promise(r => setTimeout(r, 500));
    } catch (err: any) {
      logProgress(`  ❌ Failed to reprocess ${video.video_id}: ${err.message}`);
    }
  }
  
  logProgress('✅ REPROCESSING COMPLETE');
}

export async function stopOvernightProcessing(): Promise<{ success: boolean; message: string }> {
  if (!overnightState.isRunning) {
    return { success: false, message: 'No processing running' };
  }
  
  overnightState.shouldStop = true;
  logProgress('⏹️ Stop requested - will pause after current video');
  
  return { success: true, message: 'Processing will stop after current video' };
}

export async function getOvernightStatus(): Promise<any> {
  // Get current run or latest
  let run;
  if (overnightState.runId) {
    const result = await db.execute(sql`SELECT * FROM overnight_progress WHERE id = ${overnightState.runId}`);
    run = result[0];
  } else {
    const result = await db.execute(sql`SELECT * FROM overnight_progress ORDER BY id DESC LIMIT 1`);
    run = result[0];
  }
  
  // Get current stats
  const totalResult = await db.execute(sql`SELECT COUNT(*) as count FROM ai_video_knowledge WHERE quality_score IS NOT NULL AND status = 'active'`);
  const total = Number(totalResult[0]?.count || 0);
  
  const processedResult = await db.execute(sql`SELECT COUNT(*) as count FROM video_watch_status WHERE processed = true`);
  const processed = Number(processedResult[0]?.count || 0);
  
  const techniquesResult = await db.execute(sql`SELECT COUNT(*) as count FROM video_knowledge`);
  const techniques = Number(techniquesResult[0]?.count || 0);
  
  const uniqueResult = await db.execute(sql`SELECT COUNT(DISTINCT technique_name) as count FROM video_knowledge`);
  const uniqueTechniques = Number(uniqueResult[0]?.count || 0);
  
  // Get top instructors
  const instructorsResult = await db.execute(sql`
    SELECT instructor_name, COUNT(*) as count 
    FROM video_knowledge 
    WHERE instructor_name IS NOT NULL 
    GROUP BY instructor_name 
    ORDER BY count DESC 
    LIMIT 10
  `);
  
  // Get recent extractions
  const recentResult = await db.execute(sql`
    SELECT v.title, COUNT(*) as technique_count
    FROM video_knowledge k
    JOIN ai_video_knowledge v ON k.video_id = v.id
    GROUP BY k.video_id, v.title
    ORDER BY MAX(k.extracted_at) DESC
    LIMIT 5
  `);
  
  // Calculate ETA
  const remaining = total - processed;
  const elapsed = overnightState.startedAt 
    ? (Date.now() - overnightState.startedAt.getTime()) / 1000 / 60 
    : 0;
  const rate = elapsed > 0 ? (run?.videos_processed || processed) / elapsed : 2; // videos per minute
  const etaMinutes = remaining / rate;
  const eta = new Date(Date.now() + etaMinutes * 60 * 1000);
  
  return {
    started_at: run?.started_at || overnightState.startedAt,
    current_time: new Date().toISOString(),
    is_running: overnightState.isRunning,
    videos_total: total,
    videos_processed: processed,
    videos_remaining: remaining,
    videos_failed: run?.videos_failed || 0,
    failed_video_ids: run?.failed_video_ids || [],
    techniques_extracted: techniques,
    unique_techniques: uniqueTechniques,
    top_instructors: instructorsResult.map(r => `${r.instructor_name}: ${r.count} videos`),
    estimated_completion: eta.toISOString(),
    last_batch_completed: run?.last_batch_at,
    sample_recent_extractions: recentResult.map(r => ({
      video: r.title,
      techniques: r.technique_count
    })),
    status: run?.status || (overnightState.isRunning ? 'running' : 'idle')
  };
}

export async function getOvernightLog(): Promise<string> {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return fs.readFileSync(LOG_FILE, 'utf-8');
    }
    return 'No log file found';
  } catch (err) {
    return `Error reading log: ${err}`;
  }
}
