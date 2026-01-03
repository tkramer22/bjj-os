import { analyzeAllUnanalyzedVideos, getKnowledgeStatus } from './server/video-knowledge-service';

async function main() {
  console.log('=== STARTING GEMINI ANALYSIS FOR ALL UNANALYZED VIDEOS ===');
  console.log('Time:', new Date().toISOString());
  
  // Get current status first
  const status = await getKnowledgeStatus();
  console.log(`\nCurrent status: ${status.processedCount}/${status.totalCount} analyzed (${status.totalCount - status.processedCount} pending)`);
  
  // Start the analysis
  console.log('\n🚀 Starting batch analysis of all unanalyzed videos...');
  console.log('This runs in parallel with normal curation - both will continue working.\n');
  
  const result = await analyzeAllUnanalyzedVideos((msg) => console.log(msg));
  console.log('\n=== RESULT ===');
  console.log(JSON.stringify(result, null, 2));
}

main().catch(console.error).finally(() => process.exit(0));
