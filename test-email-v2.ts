import { sendMorningReport } from './server/admin-email-v2';

async function testEmail() {
  console.log('🧪 Testing Comprehensive Email System V2...\n');
  
  try {
    const result = await sendMorningReport();
    
    if (result.success) {
      console.log('✅ TEST PASSED - Email sent successfully!');
      console.log('📧 Check todd@bjjos.app inbox (and spam folder)');
      console.log('📬 Resend Message ID:', result.id);
    } else {
      console.log('❌ TEST FAILED - Email send error');
      console.log('Error:', result.error);
    }
  } catch (error) {
    console.error('❌ TEST FAILED - Exception:', error);
  }
}

testEmail();
