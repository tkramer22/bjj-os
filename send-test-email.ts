import { sendMiddayReport } from './server/admin-email-v2';

async function test() {
  console.log('📧 Sending midday test email with FIXED data...\n');
  
  await sendMiddayReport();
  
  console.log('\n✅ Email sent!');
  console.log('📬 Check todd@bjjos.app inbox (and spam folder)');
  console.log('\n📊 Expected to show:');
  console.log('   • Videos Added Today: 5');
  console.log('   • Combat Sports Today: 48');
  console.log('   • Top Instructors: Jon Thomas (2), Lucas Lepri (1)');
  
  process.exit(0);
}

test();
