console.log('Testing meta-analyzer import...');

async function test() {
  console.log('Step 1: Importing meta-analyzer...');
  const start = Date.now();
  
  try {
    const { metaAnalyzer } = await import('./server/meta-analyzer');
    const elapsed = Date.now() - start;
    console.log(`✅ Import successful in ${elapsed}ms`);
    console.log('metaAnalyzer:', typeof metaAnalyzer);
    
    console.log('\nStep 2: Calling getTopCurationPriorities...');
    const priorities = await metaAnalyzer.getTopCurationPriorities(5);
    console.log(`✅ Got ${priorities.length} priorities`);
    
  } catch (error: any) {
    const elapsed = Date.now() - start;
    console.error(`❌ Failed after ${elapsed}ms:`, error.message);
    console.error(error.stack);
  }
}

test().then(() => {
  console.log('\n✅ Test complete');
  process.exit(0);
}).catch((err) => {
  console.error('\n❌ Test failed:', err);
  process.exit(1);
});
