/**
 * Direct JT Torres Curation Runner
 * Run with: npx tsx server/run-jt-torres-curation.ts
 */

import { curateJTTorres } from './targeted-instructor-curation';

async function main() {
  console.log('Starting JT Torres targeted curation...');
  
  try {
    const result = await curateJTTorres();
    
    console.log('\n' + '='.repeat(60));
    console.log('🎯 JT TORRES CURATION COMPLETE');
    console.log('='.repeat(60));
    console.log(`Total before: ${result.totalBefore}`);
    console.log(`Total after: ${result.totalAfter}`);
    console.log(`New videos added: ${result.videosAdded}`);
    console.log(`\nTechniques covered:`);
    result.techniquesCovered.forEach(t => console.log(`  - ${t}`));
    console.log('='.repeat(60));
    
    process.exit(0);
  } catch (error) {
    console.error('Curation failed:', error);
    process.exit(1);
  }
}

main();
