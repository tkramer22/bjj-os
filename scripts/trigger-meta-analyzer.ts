#!/usr/bin/env tsx
/**
 * Manually trigger meta analyzer to re-evaluate all techniques
 * for aggressive growth mode (target: 3,000 videos)
 */

import { metaAnalyzer } from '../server/meta-analyzer';

async function main() {
  console.log('🚀 Starting meta analyzer re-evaluation...');
  console.log('📊 Target: 3,000 total videos (~130 per technique)');
  console.log('🎯 Coverage threshold: 100+ videos per technique');
  console.log('');
  
  try {
    await metaAnalyzer.analyzeTechniqueMetaStatus();
    console.log('');
    console.log('✅ Meta analyzer completed successfully!');
    console.log('');
    console.log('Next steps:');
    console.log('1. Check database for updated needs_curation flags');
    console.log('2. Verify curation priorities are set');
    console.log('3. Wait for next scheduled curation run or trigger manually');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error running meta analyzer:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
