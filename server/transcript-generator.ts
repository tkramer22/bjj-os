/**
 * Hybrid Transcript Generation System
 * 
 * 1. Try YouTube captions first (free via youtube-transcript package)
 * 2. Fall back to OpenAI Whisper API (accurate but costs $0.006/min)
 * 3. Cache all transcripts in database to avoid re-processing
 */

import { YoutubeTranscript } from 'youtube-transcript';
import OpenAI from 'openai';
import { db } from './db';
import { videoTranscripts } from '../shared/schema';
import { eq } from 'drizzle-orm';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface TranscriptResult {
  text: string;
  source: 'youtube' | 'whisper' | 'cache';
  cost: number;
  segments?: number;
}

/**
 * Get transcript for a YouTube video (cached, YouTube captions, or Whisper API)
 */
export async function getVideoTranscript(
  videoId: string, 
  durationSeconds: number = 600
): Promise<TranscriptResult | null> {
  
  // Step 1: Check cache first
  try {
    const cached = await db.select()
      .from(videoTranscripts)
      .where(eq(videoTranscripts.videoId, videoId))
      .limit(1);
    
    if (cached.length > 0) {
      console.log(`  💾 Using cached transcript (${cached[0].source})`);
      return {
        text: cached[0].transcript,
        source: 'cache',
        cost: 0,
        segments: cached[0].segments || 0
      };
    }
  } catch (error) {
    console.warn('Cache check failed:', error);
  }

  // Step 2: Try YouTube captions (free)
  try {
    const transcriptData = await YoutubeTranscript.fetchTranscript(videoId);
    
    if (transcriptData && transcriptData.length > 0) {
      const text = transcriptData.map((entry: any) => entry.text).join(' ');
      
      if (text.length > 100) { // Minimum viable transcript
        console.log(`  🎬 YouTube captions: ${transcriptData.length} segments, ${text.length} chars`);
        
        // Cache for future use
        await cacheTranscript(videoId, text, 'youtube', 0, transcriptData.length);
        
        return {
          text,
          source: 'youtube',
          cost: 0,
          segments: transcriptData.length
        };
      }
    }
  } catch (error: any) {
    // Expected - most videos don't have captions
    console.log(`  ℹ️  YouTube captions unavailable: ${error.message?.substring(0, 50) || 'Unknown'}`);
  }

  // Step 3: Fall back to OpenAI Whisper API
  console.log(`  🎙️  Generating transcript with Whisper API...`);
  
  try {
    const durationMinutes = durationSeconds / 60;
    const estimatedCost = durationMinutes * 0.006; // $0.006 per minute
    
    console.log(`  💰 Estimated Whisper cost: $${estimatedCost.toFixed(3)} (${durationMinutes.toFixed(1)} min)`);
    
    // Download audio from YouTube
    const audioPath = await downloadAudio(videoId);
    
    // Send to Whisper API
    const fs = await import('fs');
    const transcript = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      language: "en", // Can add "pt" for Portuguese BJJ instructors
      response_format: "text"
    });
    
    // Clean up audio file
    fs.unlinkSync(audioPath);
    
    console.log(`  ✅ Whisper transcript: ${transcript.length} chars, cost: $${estimatedCost.toFixed(3)}`);
    
    // Cache for future use
    await cacheTranscript(videoId, transcript, 'whisper', estimatedCost, 0);
    
    return {
      text: transcript,
      source: 'whisper',
      cost: estimatedCost
    };
    
  } catch (error: any) {
    console.error(`  ❌ Whisper failed:`, error.message);
    return null;
  }
}

/**
 * Download audio from YouTube video using yt-dlp (via youtube-dl-exec)
 * This is more reliable than ytdl-core for bypassing YouTube bot detection
 */
async function downloadAudio(videoId: string): Promise<string> {
  const youtubedl = (await import('youtube-dl-exec')).default;
  const fs = await import('fs');
  
  const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const audioPath = `/tmp/${videoId}.mp3`;
  
  try {
    // Try without cookies first (works in most cases)
    await youtubedl(videoUrl, {
      extractAudio: true,
      audioFormat: 'mp3',
      audioQuality: 9, // Lowest quality (smallest file for Whisper)
      output: audioPath,
      noWarnings: true,
      noCheckCertificates: true,
      preferFreeFormats: true,
      referer: 'https://www.youtube.com/',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      // Note: Removed cookiesFromBrowser - not needed in Replit environment
    });
    
    console.log(`  📥 Downloaded audio: ${audioPath}`);
    return audioPath;
  } catch (error: any) {
    // Clean up partial file on error
    try { fs.unlinkSync(audioPath); } catch {}
    throw new Error(`yt-dlp download failed: ${error.message}`);
  }
}

/**
 * Cache transcript in database to avoid re-processing
 * Uses upsert to handle duplicate videoId gracefully
 */
async function cacheTranscript(
  videoId: string,
  transcript: string,
  source: 'youtube' | 'whisper',
  cost: number,
  segments: number
): Promise<void> {
  try {
    await db.insert(videoTranscripts)
      .values({
        videoId,
        transcript,
        source,
        cost,
        segments,
        createdAt: new Date()
      })
      .onConflictDoUpdate({
        target: videoTranscripts.videoId,
        set: {
          transcript,
          source,
          cost,
          segments,
          createdAt: new Date()
        }
      });
    console.log(`  💾 Cached ${source} transcript (${transcript.length} chars)`);
  } catch (error) {
    console.warn('Failed to cache transcript:', error);
  }
}
