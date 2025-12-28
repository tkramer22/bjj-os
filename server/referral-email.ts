import { Resend } from 'resend';
import { getWeeklyEmailData } from './referral-service';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendWeeklyReferralEmail(userEmail: string, userId: string) {
  try {
    const data = await getWeeklyEmailData(userId);

    const html = generateWeeklyEmailHTML(data);

    await resend.emails.send({
      from: 'Prof. OS <noreply@bjjos.com>',
      to: userEmail,
      subject: `📊 Your Weekly Referral Report - ${data.code}`,
      html,
    });

    console.log(`✅ Sent weekly referral email to ${userEmail}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to send weekly referral email to ${userEmail}:`, error.message);
    return false;
  }
}

function generateWeeklyEmailHTML(data: any): string {
  const milestoneHTML = data.newMilestones.length > 0
    ? `
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 24px; border-radius: 8px; margin: 24px 0; text-align: center;">
        <h2 style="color: white; margin: 0 0 16px 0; font-size: 24px;">🎉 New Milestones Achieved!</h2>
        ${data.newMilestones.map((m: any) => `
          <div style="background: rgba(255,255,255,0.1); padding: 12px; border-radius: 6px; margin: 8px 0; color: white;">
            <strong>${formatMilestoneType(m.milestoneType)}: ${m.milestoneValue}</strong>
          </div>
        `).join('')}
      </div>
    `
    : '';

  const expiringTrialsHTML = data.expiringTrials.length > 0
    ? `
      <div style="background: #FEF3C7; border-left: 4px solid #F59E0B; padding: 16px; margin: 24px 0; border-radius: 6px;">
        <h3 style="color: #92400E; margin: 0 0 12px 0;">⚠️ Trials Expiring Soon (Next 30 Days)</h3>
        <p style="color: #78350F; margin: 0 0 12px 0;">These users are nearing the end of their free trial. Consider reaching out!</p>
        <ul style="color: #78350F; margin: 0; padding-left: 20px;">
          ${data.expiringTrials.map((trial: any) => `
            <li><strong>${trial.username}</strong> - Expires ${new Date(trial.subscriptionEndDate).toLocaleDateString()}</li>
          `).join('')}
        </ul>
      </div>
    `
    : '';

  const activeSubsHTML = data.activeSubscribers.length > 0
    ? `
      <div style="background: #F3F4F6; padding: 16px; border-radius: 6px; margin: 24px 0;">
        <h3 style="color: #1F2937; margin: 0 0 12px 0;">💎 Active Paid Subscribers (${data.activeSubscribers.length})</h3>
        <ul style="color: #4B5563; margin: 0; padding-left: 20px;">
          ${data.activeSubscribers.slice(0, 10).map((sub: any) => `
            <li><strong>${sub.username}</strong> (${sub.beltLevel || 'No belt'})</li>
          `).join('')}
          ${data.activeSubscribers.length > 10 ? `<li style="color: #9CA3AF;">...and ${data.activeSubscribers.length - 10} more</li>` : ''}
        </ul>
      </div>
    `
    : '<p style="color: #6B7280; margin: 24px 0;">No active paid subscribers yet. Keep sharing your code!</p>';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Referral Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%); padding: 32px; border-radius: 12px; text-align: center; color: white;">
    <h1 style="margin: 0 0 8px 0; font-size: 28px;">📊 Weekly Referral Report</h1>
    <p style="margin: 0; opacity: 0.9; font-size: 16px;">Your referral code: <strong>${data.code}</strong></p>
  </div>

  ${milestoneHTML}

  <div style="background: white; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px; margin: 24px 0;">
    <h2 style="color: #1F2937; margin: 0 0 20px 0; font-size: 20px;">This Week's Performance</h2>
    
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
      <div style="text-align: center; padding: 16px; background: #F9FAFB; border-radius: 6px;">
        <div style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin-bottom: 4px;">New Signups</div>
        <div style="color: #1F2937; font-size: 32px; font-weight: bold;">${data.weeklySignups}</div>
      </div>
      <div style="text-align: center; padding: 16px; background: #F9FAFB; border-radius: 6px;">
        <div style="color: #6B7280; font-size: 12px; text-transform: uppercase; margin-bottom: 4px;">Earnings</div>
        <div style="color: #10B981; font-size: 32px; font-weight: bold;">$${data.weeklyEarnings}</div>
      </div>
    </div>
  </div>

  <div style="background: white; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px; margin: 24px 0;">
    <h2 style="color: #1F2937; margin: 0 0 20px 0; font-size: 20px;">All-Time Stats</h2>
    
    <div style="border-bottom: 1px solid #E5E7EB; padding: 12px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #6B7280;">Total Signups</span>
        <span style="color: #1F2937; font-weight: bold; font-size: 18px;">${data.stats.totalSignups}</span>
      </div>
    </div>
    
    <div style="border-bottom: 1px solid #E5E7EB; padding: 12px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #6B7280;">Active Subscribers</span>
        <span style="color: #1F2937; font-weight: bold; font-size: 18px;">${data.stats.activeSubscribers}</span>
      </div>
    </div>
    
    <div style="border-bottom: 1px solid #E5E7EB; padding: 12px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #6B7280;">Total Earnings</span>
        <span style="color: #10B981; font-weight: bold; font-size: 18px;">$${data.stats.totalEarnings}</span>
      </div>
    </div>
    
    <div style="border-bottom: 1px solid #E5E7EB; padding: 12px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #6B7280;">Pending Payout (Net 60)</span>
        <span style="color: #F59E0B; font-weight: bold; font-size: 18px;">$${data.stats.pendingPayout}</span>
      </div>
    </div>
    
    <div style="padding: 12px 0;">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <span style="color: #6B7280;">Eligible for Payout</span>
        <span style="color: #10B981; font-weight: bold; font-size: 18px;">$${data.stats.eligibleForPayout}</span>
      </div>
    </div>
  </div>

  ${expiringTrialsHTML}

  ${activeSubsHTML}

  <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 24px 0; text-align: center;">
    <p style="color: #6B7280; margin: 0 0 12px 0; font-size: 14px;">
      💡 <strong>Tip:</strong> Share your code on social media to reach more people!
    </p>
    <p style="color: #6B7280; margin: 0; font-size: 14px;">
      Your unique referral URL: <strong>bjjos.com/ref/${data.code}</strong>
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9CA3AF; font-size: 12px;">
    <p style="margin: 0;">BJJ OS - AI-Powered BJJ Training Platform</p>
    <p style="margin: 4px 0 0 0;">Questions? Reply to this email anytime.</p>
  </div>

</body>
</html>
  `;
}

function formatMilestoneType(type: string): string {
  switch (type) {
    case 'signups':
      return 'Total Signups';
    case 'paid_subscribers':
      return 'Paid Subscribers';
    case 'earnings':
      return 'Total Earnings';
    default:
      return type;
  }
}

export interface NewSignupData {
  newUserEmail: string;
  newUserUsername?: string;
  referralCode: string;
  influencerName?: string;
  discountGiven?: string;
  totalSignups: number;
}

export async function sendNewReferralSignupEmail(influencerEmail: string, data: NewSignupData) {
  try {
    const html = generateNewSignupEmailHTML(data);

    await resend.emails.send({
      from: 'Prof. OS <noreply@bjjos.com>',
      to: influencerEmail,
      subject: `🎉 New Signup with Code ${data.referralCode}!`,
      html,
    });

    console.log(`✅ Sent new referral signup notification to ${influencerEmail}`);
    return true;
  } catch (error: any) {
    console.error(`❌ Failed to send new signup notification to ${influencerEmail}:`, error.message);
    return false;
  }
}

function generateNewSignupEmailHTML(data: NewSignupData): string {
  const discountLine = data.discountGiven 
    ? `<p style="color: #6B7280; margin: 0 0 8px 0;">Discount applied: <strong>${data.discountGiven}</strong></p>`
    : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Referral Signup</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: linear-gradient(135deg, #10B981 0%, #059669 100%); padding: 32px; border-radius: 12px; text-align: center; color: white;">
    <h1 style="margin: 0 0 8px 0; font-size: 28px;">🎉 New Signup!</h1>
    <p style="margin: 0; opacity: 0.9; font-size: 16px;">Someone just signed up with your code <strong>${data.referralCode}</strong></p>
  </div>

  <div style="background: white; border: 1px solid #E5E7EB; border-radius: 8px; padding: 24px; margin: 24px 0;">
    <h2 style="color: #1F2937; margin: 0 0 16px 0; font-size: 20px;">New User Details</h2>
    
    <div style="background: #F9FAFB; border-radius: 6px; padding: 16px; margin-bottom: 16px;">
      <p style="color: #1F2937; margin: 0 0 8px 0;">
        <strong style="font-size: 18px;">${data.newUserUsername || 'New User'}</strong>
      </p>
      <p style="color: #6B7280; margin: 0 0 8px 0;">${data.newUserEmail}</p>
      ${discountLine}
    </div>

    <div style="background: #EEF2FF; border-radius: 6px; padding: 16px; text-align: center;">
      <p style="color: #4F46E5; margin: 0; font-weight: 600;">
        Total signups with your code: <strong style="font-size: 24px;">${data.totalSignups}</strong>
      </p>
    </div>
  </div>

  <div style="background: #F3F4F6; padding: 20px; border-radius: 8px; margin: 24px 0; text-align: center;">
    <p style="color: #6B7280; margin: 0 0 12px 0; font-size: 14px;">
      💰 <strong>Keep sharing your code!</strong> You'll earn commission when they subscribe.
    </p>
    <p style="color: #6B7280; margin: 0; font-size: 14px;">
      Your referral URL: <strong>bjjos.com/ref/${data.referralCode}</strong>
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #9CA3AF; font-size: 12px;">
    <p style="margin: 0;">BJJ OS - AI-Powered BJJ Training Platform</p>
  </div>

</body>
</html>
  `;
}
