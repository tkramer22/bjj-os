/**
 * Curation Worker - Runs in separate process to avoid event loop starvation
 * 
 * This worker executes the curation pipeline independently of the main Express server,
 * preventing CPU-heavy curation work from blocking the event loop.
 */

// Helper to send progress to parent process via IPC
function sendProgress(runId: string, message: string, icon: string = '•', data?: string, type: 'info' | 'success' | 'error' = 'info') {
  if (process.send) {
    process.send({
      type: 'progress',
      runId,
      update: {
        time: new Date().toLocaleTimeString('en-US', { 
          hour12: true,
          hour: 'numeric',
          minute: '2-digit',
          second: '2-digit'
        }),
        icon,
        message,
        data,
        type
      }
    });
  }
  console.log(`[WORKER PROGRESS] ${runId.substring(0, 8)}: ${icon} ${message}${data ? ` (${data})` : ''}`);
}

async function runCurationWorker(runId: string) {
  console.log(`[WORKER] Starting curation for run ${runId}`);
  
  try {
    // Send initial progress
    sendProgress(runId, 'Starting curation pipeline', '🚀');
    
    // Import curation controller - this contains the full pipeline
    const { canRunCuration } = await import('./curation-controller');
    
    sendProgress(runId, 'Initializing curation system', '🔧');
    
    // Get batch size from curation check
    const check = await canRunCuration();
    const batchSize = check.batchSize || 20;
    
    // Dynamically import to avoid loading all modules at startup
    const curationModule = await import('./curation-controller');
    
    sendProgress(runId, 'Loading AI analysis modules', '🤖');
    
    // The executeCurationPipeline function is not exported, so we need to access it
    // We'll use a simpler approach: just import the modules and run the pipeline manually
    console.log(`[WORKER] Importing meta-analyzer and auto-curator...`);
    const { metaAnalyzer } = await import('./meta-analyzer');
    const { curateVideosFromPriorities } = await import('./auto-curator');
    const { completeCurationRun } = await import('./curation-controller');
    
    sendProgress(runId, 'Connected to YouTube API', '✅', undefined, 'success');
    
    // Get priorities
    const techniqueLimit = Math.ceil(batchSize / 10);
    console.log(`[WORKER] Fetching top ${techniqueLimit} curation priorities...`);
    sendProgress(runId, 'Analyzing technique priorities', '📊');
    
    const priorities = await metaAnalyzer.getTopCurationPriorities(techniqueLimit);
    console.log(`[WORKER] Got ${priorities.length} priorities`);
    
    sendProgress(runId, `Found ${priorities.length} priority techniques`, '📋', `${priorities.length} techniques`);
    
    if (priorities.length === 0) {
      console.log(`[WORKER] No techniques need curation`);
      sendProgress(runId, 'No new techniques to curate', '⏸️', undefined, 'info');
      await completeCurationRun(runId, 0, 0, 0, null);
      
      // Send completion via IPC
      if (process.send) {
        process.send({
          type: 'complete',
          runId,
          summary: { analyzed: 0, approved: 0, rejected: 0, quotaUsed: 0 }
        });
      }
      
      await sendCompletionEmail(runId, { videosAnalyzed: 0, videosAdded: 0, videosRejected: 0 });
      process.exit(0);
      return;
    }
    
    // Execute curation
    console.log(`[WORKER] Running curation with ${priorities.length} priorities...`);
    sendProgress(runId, `Starting video search for ${priorities.length} techniques`, '🔍');
    sendProgress(runId, 'Searching YouTube for BJJ instructionals', '🎥');
    
    const result = await curateVideosFromPriorities(priorities, runId);
    
    const videosAnalyzed = result.videosScreened;
    const videosAdded = result.videosAdded;
    const videosRejected = videosAnalyzed - videosAdded;
    const quotaUsed = result.quotaUsed;
    
    console.log(`[WORKER] Curation completed:`, {
      videosAnalyzed,
      videosAdded,
      quotaUsed
    });
    
    sendProgress(runId, 'Finalizing curation run', '🏁');
    sendProgress(runId, 'Updating library statistics', '📈');
    
    // Mark as complete
    await completeCurationRun(runId, videosAnalyzed, videosAdded, quotaUsed, null);
    
    // Send completion via IPC
    sendProgress(runId, '✨ Curation complete!', '🎉', `${videosAdded} videos added, ${videosRejected} rejected`, 'success');
    
    if (process.send) {
      process.send({
        type: 'complete',
        runId,
        summary: {
          analyzed: videosAnalyzed,
          approved: videosAdded,
          rejected: videosRejected,
          quotaUsed
        }
      });
    }
    
    // Send success email
    await sendCompletionEmail(runId, {
      videosAnalyzed,
      videosAdded,
      videosRejected
    });
    
    process.exit(0);
  } catch (error: any) {
    console.error(`[WORKER] Curation failed for run ${runId}:`, error);
    
    // Send failure via IPC
    sendProgress(runId, `Error: ${error.message}`, '❌', undefined, 'error');
    
    if (process.send) {
      process.send({
        type: 'failed',
        runId,
        error: error.message
      });
    }
    
    // Mark as failed
    try {
      const { completeCurationRun } = await import('./curation-controller');
      await completeCurationRun(runId, 0, 0, 0, error.message);
    } catch (completeError) {
      console.error(`[WORKER] Failed to mark run as failed:`, completeError);
    }
    
    // Send failure email
    await sendFailureEmail(runId, error);
    
    process.exit(1);
  }
}

async function sendCompletionEmail(runId: string, result: any) {
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    const emailContent = `
Manual Curation Complete!

✅ Status: Success
📊 Results:
- Videos analyzed: ${result.videosAnalyzed || 0}
- Videos approved: ${result.videosAdded || 0}
- Videos rejected: ${result.videosRejected || 0}
- Approval rate: ${result.videosAnalyzed ? Math.round((result.videosAdded || 0) / result.videosAnalyzed * 100) : 0}%

View library: https://bjjos.app/admin/videos
Run another: https://bjjos.app/admin/command-center
    `;
    
    await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: ['todd@bjjos.app'],
      subject: '✅ BJJ OS Manual Curation Complete',
      text: emailContent
    });
    
    console.log(`[WORKER] Completion email sent for run ${runId}`);
  } catch (error) {
    console.error(`[WORKER] Failed to send completion email:`, error);
  }
}

async function sendFailureEmail(runId: string, error: any) {
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    
    await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: ['todd@bjjos.app'],
      subject: '❌ BJJ OS Manual Curation Failed',
      text: `Manual curation run ${runId} failed:\n\n${error.message}\n\nPlease check Command Center for details.`
    });
    
    console.log(`[WORKER] Failure email sent for run ${runId}`);
  } catch (emailError) {
    console.error(`[WORKER] Failed to send failure email:`, emailError);
  }
}

// Get run ID from command line argument
const runId = process.argv[2];

if (!runId) {
  console.error('[WORKER] Error: No run ID provided');
  process.exit(1);
}

// Run the worker
runCurationWorker(runId);
