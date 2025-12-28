#!/usr/bin/env tsx

// Standalone manual curation trigger that doesn't cause server restarts
// This script runs in a completely separate process

import { db } from './db';
import { curationRuns } from '@shared/schema';
import { eq } from 'drizzle-orm';

async function triggerManualCuration() {
  console.log('\n═══════════════════════════════════════════════');
  console.log('🚀 MANUAL MAX CURATION TRIGGER');
  console.log('═══════════════════════════════════════════════\n');

  try {
    // Make HTTP request to the running server
    const response = await fetch('http://localhost:5000/api/admin/auto-curation/run-now', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        maxSearches: 10,
        maxResultsPerSearch: 50,
        targetVideos: 500
      })
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Curation triggered successfully!');
      console.log('   Run ID:', result.runId);
      console.log('   Status:', result.message || result.status);
      console.log('\n📊 Monitor progress in Command Center');
      console.log('   http://localhost:5000/admin/dev-os-2');
    } else {
      console.log('❌ Failed to trigger curation');
      console.log('   Error:', result.error || result.message);
      console.log('   Details:', JSON.stringify(result, null, 2));
    }

  } catch (error: any) {
    console.error('\n❌ ERROR:', error.message);
    console.error('   Make sure the server is running on port 5000\n');
  }
}

triggerManualCuration().then(() => {
  console.log('\n✅ Done\n');
  process.exit(0);
}).catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
