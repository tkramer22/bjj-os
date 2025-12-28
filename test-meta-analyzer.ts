import { db } from './server/db';
import { eq, desc } from 'drizzle-orm';
import { techniqueMetaStatus } from './shared/schema';

async function testMetaAnalyzer() {
  console.log('🧪 Testing metaAnalyzer.getTopCurationPriorities()...\n');
  
  // Test the exact query from metaAnalyzer
  const priorities = await db
    .select()
    .from(techniqueMetaStatus)
    .where(eq(techniqueMetaStatus.needsCuration, true))
    .orderBy(desc(techniqueMetaStatus.curationPriority), desc(techniqueMetaStatus.overallMetaScore))
    .limit(10);
  
  console.log(`✅ Query returned ${priorities.length} priorities`);
  
  if (priorities.length > 0) {
    console.log('\n📋 Sample priorities:');
    priorities.slice(0, 3).forEach((p: any) => {
      console.log(`  • ${p.techniqueName} (priority: ${p.curationPriority}, searches: ${p.suggestedSearches?.length || 0})`);
    });
  } else {
    console.log('❌ NO PRIORITIES RETURNED - This is the bug!');
  }
  
  process.exit(0);
}

testMetaAnalyzer();
