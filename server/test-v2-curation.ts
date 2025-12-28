/**
 * Direct V2 Curation Test - Bypasses HTTP layer
 */
import { runCurationV2 } from './intelligent-curator-v2';

async function main() {
  console.log('🧪 DIRECT V2 CURATION TEST');
  console.log('═'.repeat(60));
  
  try {
    const result = await runCurationV2('test-run');
    console.log('\n✅ V2 Curation completed successfully:');
    console.log(JSON.stringify(result, null, 2));
  } catch (error: any) {
    console.error('\n❌ V2 Curation failed:');
    console.error(error.message);
    console.error(error.stack);
  }
  
  process.exit(0);
}

main();
