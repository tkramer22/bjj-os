import { Resend } from 'resend';
import { db } from './db';
import { emailLogs } from '../shared/schema';

const resend = new Resend(process.env.RESEND_API_KEY);
const isDevelopment = process.env.NODE_ENV === 'development';

// Helper to log email to database
async function logEmail(params: {
  recipientEmail: string;
  emailType: string;
  subject?: string;
  resendId?: string;
  status: 'sent' | 'failed' | 'delivered' | 'bounced' | 'opened' | 'clicked';
  errorMessage?: string;
  metadata?: Record<string, any>;
}) {
  try {
    await db.insert(emailLogs).values({
      recipientEmail: params.recipientEmail,
      emailType: params.emailType,
      subject: params.subject,
      resendId: params.resendId,
      status: params.status,
      errorMessage: params.errorMessage,
      metadata: params.metadata,
    });
  } catch (error) {
    console.error('Failed to log email:', error);
  }
}

export const sendVerificationEmail = async (email: string, code: string) => {
  // ALWAYS send verification emails (even in dev mode) - users need these to login
  console.log('📧 [VERIFICATION EMAIL] Sending passcode to:', email);
  console.log('🔐 [VERIFICATION EMAIL] Code:', code);
  
  try {
    const { data, error } = await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: [email],
      subject: 'Your BJJ OS Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
              }
              .email-container {
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              }
              .header {
                background: #000;
                color: white;
                text-align: center;
                padding: 40px 20px;
              }
              .header h1 {
                margin: 0;
                font-size: 36px;
                font-weight: bold;
              }
              .header p {
                margin: 8px 0 0 0;
                opacity: 0.9;
                font-size: 14px;
              }
              .content {
                padding: 40px 30px;
              }
              .content h2 {
                margin-top: 0;
                color: #000;
                font-size: 24px;
              }
              .code-container {
                background: #f8f8f8;
                border: 3px solid #000;
                border-radius: 12px;
                padding: 30px;
                text-align: center;
                margin: 30px 0;
              }
              .code {
                font-size: 48px;
                font-weight: bold;
                letter-spacing: 12px;
                color: #000;
                font-family: 'Courier New', monospace;
              }
              .info {
                margin-top: 20px;
                padding: 15px;
                background: #fff8e1;
                border-left: 4px solid #ffc107;
                border-radius: 4px;
              }
              .info strong {
                color: #f57c00;
              }
              .footer {
                background: #f8f8f8;
                text-align: center;
                padding: 20px;
                font-size: 12px;
                color: #666;
                border-top: 1px solid #e0e0e0;
              }
              .footer a {
                color: #000;
                text-decoration: none;
                font-weight: bold;
              }
            </style>
          </head>
          <body>
            <div class="email-container">
              <div class="header">
                <h1>🥋 BJJ OS</h1>
                <p>The World's Smartest BJJ Coach</p>
              </div>
              
              <div class="content">
                <h2>Your Verification Code</h2>
                <p>Enter this code to sign in to BJJ OS:</p>
                
                <div class="code-container">
                  <div class="code">${code}</div>
                </div>
                
                <div class="info">
                  <p><strong>⏱️ This code expires in 10 minutes.</strong></p>
                  <p style="margin: 8px 0 0 0; font-size: 14px;">If you didn't request this code, you can safely ignore this email.</p>
                </div>
              </div>
              
              <div class="footer">
                <p><strong>BJJ OS</strong></p>
                <p><a href="https://bjjos.app">bjjos.app</a></p>
                <p style="margin-top: 10px;">This is an automated message. Please do not reply.</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('═══════════════════════════════════════════');
      console.error('❌ RESEND API ERROR - VERIFICATION EMAIL');
      console.error('═══════════════════════════════════════════');
      console.error('Email:', email);
      console.error('Error type:', error.constructor?.name || 'Unknown');
      console.error('Error message:', error.message || error);
      console.error('Full error:', JSON.stringify(error, null, 2));
      console.error('═══════════════════════════════════════════\n');
      await logEmail({
        recipientEmail: email,
        emailType: 'verification',
        subject: 'Your BJJ OS Verification Code',
        status: 'failed',
        errorMessage: error.message || JSON.stringify(error),
      });
      return { success: false, error };
    }

    console.log('✅ Verification email sent successfully!');
    console.log(`   To: ${email}`);
    console.log(`   Message ID: ${data.id}`);
    console.log(`   Timestamp: ${new Date().toISOString()}\n`);
    await logEmail({
      recipientEmail: email,
      emailType: 'verification',
      subject: 'Your BJJ OS Verification Code',
      resendId: data.id,
      status: 'sent',
    });
    return { success: true, data };
    
  } catch (error: any) {
    console.error('═══════════════════════════════════════════');
    console.error('❌ EXCEPTION SENDING VERIFICATION EMAIL');
    console.error('═══════════════════════════════════════════');
    console.error('Email:', email);
    console.error('Error type:', error.constructor?.name || 'Unknown');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('═══════════════════════════════════════════\n');
    await logEmail({
      recipientEmail: email,
      emailType: 'verification',
      subject: 'Your BJJ OS Verification Code',
      status: 'failed',
      errorMessage: error.message,
    });
    return { success: false, error: error.message };
  }
};

export const sendLifetimeAccessEmail = async (email: string, customSubject?: string, customBody?: string) => {
  const signupLink = `https://bjjos.app/signup?email=${encodeURIComponent(email)}`;
  
  // ALWAYS send lifetime access emails (even in dev mode) - these are real invitations
  console.log('📧 [LIFETIME ACCESS] Sending email to:', email);
  console.log('🔗 [LIFETIME ACCESS] Signup Link:', signupLink);
  
  // Default subject and body
  const defaultSubject = 'BJJ OS lifetime access for free';
  const defaultBody = `Hey [Name],

I've been working on this for a while and I'm really excited to finally share it with you. 

It's called BJJ OS - and I'm giving you lifetime access, no charge, ever. I'm genuinely grateful you're willing to try it.

Here's what it actually is:

At the core is Professor OS - an AI system I built specifically for BJJ. It's not just a chatbot that spits out generic answers. 

It learns your game. Tracks what you're working on, what's clicking, what you're struggling with. It autonomously analyzes thousands of videos daily - curating, saving, and categorizing them after passing numerous algorithm tests for quality. The goal is to build a library of thousands of videos over time, with only elite instruction making the cut.

Ask it technique questions and it gives you real answers, not surface-level stuff. It recommends specific videos based on YOUR game, YOUR body type, YOUR goals. The more you use it, the better it gets at coaching you.

I'm seriously shocked by how smart it is and it's constantly learning.

This is something I believe can actually help people improve. Not just track sessions or show random videos - but genuinely accelerate your learning.

That said, I'm still building and refining it. I want to know what's bad and what could be better. Please help me bang out the kinks. Criticism only helps and it's appreciated.

👉 Click here to get started: https://bjjos.app/signup?email=[EMAIL]

Email me at Todd@bjjos.app or text/call me at 1.914.837.3750 anytime. I would love to hear from you.

Os!
- Todd`;

  // Use custom or default subject and body
  const subject = customSubject || defaultSubject;
  let bodyText = customBody || defaultBody;
  
  // Replace placeholders
  bodyText = bodyText.replace(/\[EMAIL\]/g, email);
  bodyText = bodyText.replace(/\[Name\]/g, "there");
  
  // Convert plain text to HTML paragraphs
  const messageHTML = bodyText
    .split('\n\n')
    .map(paragraph => {
      const trimmed = paragraph.trim();
      if (!trimmed) return '';
      // Check if it's the signup link paragraph
      if (trimmed.includes('👉') && trimmed.includes('Click here to get started')) {
        return ''; // We'll add the button separately
      }
      // Regular paragraph
      return `    <p style="margin-bottom: 16px; color: #333; line-height: 1.6;">${trimmed}</p>`;
    })
    .filter(p => p !== '')
    .join('\n');
  
  try {
    const { data, error} = await resend.emails.send({
      from: 'Todd from BJJ OS <todd@bjjos.app>',
      to: [email],
      subject: subject,
      replyTo: 'todd@bjjos.app',
      headers: {
        'List-Unsubscribe': '<mailto:unsubscribe@bjjos.app?subject=Unsubscribe>',
      },
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9f9f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9f9f9; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; border: 1px solid #e0e0e0;">
          <tr>
            <td style="padding: 40px;">
              
              ${messageHTML}
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center" style="background: #8B5CF6; border-radius: 6px; padding: 16px;">
                    <a href="${signupLink}" style="display: block; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">👉 Click here to get started</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin-top: 30px; margin-bottom: 16px; color: #333; line-height: 1.6;">Email me at <a href="mailto:todd@bjjos.app" style="color: #8B5CF6;">Todd@bjjos.app</a> or text/call me at <strong>1.914.837.3750</strong> anytime. I would love to hear from you.</p>
              
              <p style="margin-bottom: 8px; color: #333; line-height: 1.6;">Os!</p>
              <p style="margin-bottom: 0; color: #333; line-height: 1.6;">- Todd</p>
              
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background: #f5f5f5; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #666;">
                BJJ OS | <a href="https://bjjos.app" style="color: #666;">bjjos.app</a><br>
                <a href="mailto:unsubscribe@bjjos.app?subject=Unsubscribe&body=Please%20unsubscribe%20${encodeURIComponent(email)}" style="color: #666; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });

    if (error) {
      console.error('❌ Lifetime access email error:', error);
      await logEmail({
        recipientEmail: email,
        emailType: 'lifetime_access',
        subject: subject,
        status: 'failed',
        errorMessage: error.message || JSON.stringify(error),
      });
      return { success: false, error };
    }

    console.log('✅ Lifetime access email sent to:', email);
    console.log('   Resend ID:', data.id);
    await logEmail({
      recipientEmail: email,
      emailType: 'lifetime_access',
      subject: subject,
      resendId: data.id,
      status: 'sent',
    });
    return { success: true, data };
    
  } catch (error: any) {
    console.error('❌ Error sending lifetime access email:', error);
    await logEmail({
      recipientEmail: email,
      emailType: 'lifetime_access',
      subject: subject,
      status: 'failed',
      errorMessage: error.message,
    });
    return { success: false, error: error.message };
  }
};

export const sendLifetimeInvitationEmail = async (email: string, inviteToken: string, personalMessage?: string) => {
  const magicLink = `${process.env.REPLIT_DEPLOYMENT_URL || 'https://bjjos.app'}/lifetime-signup?token=${inviteToken}`;
  
  // Development mode: log invite link to console
  if (isDevelopment) {
    console.log('🎟️ [DEV MODE] Lifetime Invitation for', email);
    console.log('🔗 [DEV MODE] Magic Link:', magicLink);
    console.log('💬 [DEV MODE] Personal Message:', personalMessage || '(using default)');
    return { 
      success: true, 
      data: { id: 'dev-mode-invite-' + Date.now() },
      devMode: true 
    };
  }
  
  // Use provided message or default
  const message = personalMessage || `You have lifetime access to BJJ OS. Forever. No charge.

I'm genuinely grateful you're here early.

Prof. OS is your training companion that never forgets. After each session, tell it what you worked on - it remembers everything, spots patterns in your game, and tells you what to work on next.

The more you use it, the smarter it gets about YOUR game.

It also scans YouTube daily for new instructionals from elite grapplers, curates a video library, and recommends techniques specific to what you're struggling with.

Here's my only ask: Talk to it like a coach or friend and journal your training after every session for a week. Let's see what happens.

Reach out by text anytime with criticisms. The bad and what can be better only helps. Your feedback shapes what this becomes.

Thanks for using this and helping me build. It means the world.

Oss!

-Todd
Todd@bjjos.app
914.837.3750
Text me anytime with ANY input`;

  // Convert line breaks to paragraphs for HTML
  const messageHTML = message.split('\n\n').map(para => 
    `<p style="margin-bottom: 16px; color: #333; line-height: 1.6;">${para.replace(/\n/g, '<br>')}</p>`
  ).join('');
  
  try {
    const { data, error} = await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: [email],
      subject: 'Your BJJ OS lifetime access',
      replyTo: 'todd@bjjos.app',
      headers: {
        'List-Unsubscribe': '<mailto:unsubscribe@bjjos.app?subject=Unsubscribe>',
      },
      html: `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9f9f9;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background: #f9f9f9; padding: 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 8px; border: 1px solid #e0e0e0;">
          <tr>
            <td style="padding: 40px;">
              
              <h1 style="color: #000; margin: 0 0 30px 0; font-size: 24px; font-weight: 600;">BJJ OS</h1>
              
              ${messageHTML}
              
              <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                <tr>
                  <td align="center" style="background: #000; border-radius: 6px; padding: 16px;">
                    <a href="${magicLink}" style="display: block; color: #ffffff; text-decoration: none; font-weight: 600; font-size: 16px;">Create your account</a>
                  </td>
                </tr>
              </table>
              
              <p style="margin-top: 20px; color: #666; font-size: 14px; text-align: center;">
                Or copy this link: <a href="${magicLink}" style="color: #000; word-break: break-all;">${magicLink}</a>
              </p>
              
            </td>
          </tr>
          <tr>
            <td style="padding: 20px 40px; background: #f5f5f5; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #666;">
                BJJ OS | <a href="https://bjjos.app" style="color: #666;">bjjos.app</a><br>
                <a href="mailto:unsubscribe@bjjos.app?subject=Unsubscribe" style="color: #666; text-decoration: underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    });

    if (error) {
      console.error('❌ Lifetime invitation email error:', error);
      await logEmail({
        recipientEmail: email,
        emailType: 'lifetime_invite',
        subject: 'Your BJJ OS lifetime access',
        status: 'failed',
        errorMessage: error.message || JSON.stringify(error),
        metadata: { inviteToken },
      });
      return { success: false, error };
    }

    console.log('✅ Lifetime invitation sent to:', email);
    console.log('   Resend ID:', data.id);
    await logEmail({
      recipientEmail: email,
      emailType: 'lifetime_invite',
      subject: 'Your BJJ OS lifetime access',
      resendId: data.id,
      status: 'sent',
      metadata: { inviteToken },
    });
    return { success: true, data };
    
  } catch (error: any) {
    console.error('❌ Error sending lifetime invitation email:', error);
    await logEmail({
      recipientEmail: email,
      emailType: 'lifetime_invite',
      subject: 'Your BJJ OS lifetime access',
      status: 'failed',
      errorMessage: error.message,
      metadata: { inviteToken },
    });
    return { success: false, error: error.message };
  }
};

export const sendPasswordResetEmail = async (email: string, code: string) => {
  console.log('📧 [PASSWORD RESET EMAIL] Sending reset code to:', email);
  
  try {
    const { data, error } = await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: [email],
      subject: 'Reset Your BJJ OS Password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
              }
              .email-container {
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              }
              .header {
                background: #000;
                color: white;
                text-align: center;
                padding: 40px 20px;
              }
              .header h1 {
                margin: 0;
                font-size: 36px;
                font-weight: bold;
              }
              .content {
                padding: 40px 30px;
              }
              .content h2 {
                margin-top: 0;
                color: #000;
                font-size: 24px;
              }
              .code-container {
                background: #f8f8f8;
                border: 3px solid #8B5CF6;
                border-radius: 12px;
                padding: 30px;
                text-align: center;
                margin: 30px 0;
              }
              .code {
                font-size: 48px;
                font-weight: bold;
                letter-spacing: 12px;
                color: #8B5CF6;
                font-family: 'Courier New', monospace;
              }
              .info {
                margin-top: 20px;
                padding: 15px;
                background: #fef2f2;
                border-left: 4px solid #ef4444;
                border-radius: 4px;
              }
              .footer {
                background: #f8f8f8;
                text-align: center;
                padding: 20px;
                font-size: 12px;
                color: #666;
                border-top: 1px solid #e0e0e0;
              }
            </style>
          </head>
          <body>
            <div class="email-container">
              <div class="header">
                <h1>BJJ OS</h1>
              </div>
              <div class="content">
                <h2>Password Reset Request</h2>
                <p>We received a request to reset your password. Use this code to set a new password:</p>
                <div class="code-container">
                  <div class="code">${code}</div>
                </div>
                <p>Enter this code in the app to reset your password.</p>
                <div class="info">
                  <strong>Security notice:</strong> This code expires in 10 minutes. If you didn't request this reset, you can safely ignore this email.
                </div>
              </div>
              <div class="footer">
                <p>&copy; ${new Date().getFullYear()} BJJ OS - Your AI Training Partner</p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('❌ [PASSWORD RESET EMAIL] Error:', error);
      await logEmail({
        recipientEmail: email,
        emailType: 'password_reset',
        subject: 'Reset Your BJJ OS Password',
        status: 'failed',
        errorMessage: error.message,
      });
      return { success: false, error: error.message };
    }

    console.log('✅ [PASSWORD RESET EMAIL] Sent successfully:', data?.id);
    await logEmail({
      recipientEmail: email,
      emailType: 'password_reset',
      subject: 'Reset Your BJJ OS Password',
      resendId: data?.id,
      status: 'sent',
    });
    return { success: true, id: data?.id };

  } catch (error: any) {
    console.error('❌ [PASSWORD RESET EMAIL] Exception:', error);
    await logEmail({
      recipientEmail: email,
      emailType: 'password_reset',
      subject: 'Reset Your BJJ OS Password',
      status: 'failed',
      errorMessage: error.message,
    });
    return { success: false, error: error.message };
  }
};

export const sendWelcomeEmail = async (email: string, username?: string) => {
  // Development mode: skip sending welcome email
  if (isDevelopment) {
    console.log('👋 [DEV MODE] Welcome email skipped for', email);
    return { 
      success: true, 
      data: { id: 'dev-mode-welcome-' + Date.now() },
      devMode: true 
    };
  }
  
  try {
    const { data, error } = await resend.emails.send({
      from: 'BJJ OS <noreply@bjjos.app>',
      to: [email],
      subject: 'Welcome to BJJ OS - Your AI BJJ Coach',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                line-height: 1.6;
                color: #333;
                max-width: 600px;
                margin: 0 auto;
                padding: 20px;
                background-color: #f5f5f5;
              }
              .email-container {
                background: white;
                border-radius: 12px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0,0,0,0.1);
              }
              .header {
                background: #000;
                color: white;
                text-align: center;
                padding: 40px 20px;
              }
              .content {
                padding: 40px 30px;
              }
              .feature {
                margin: 20px 0;
                padding: 20px;
                background: #f8f8f8;
                border-radius: 8px;
                border-left: 4px solid #000;
              }
              .feature strong {
                display: block;
                font-size: 16px;
                margin-bottom: 8px;
                color: #000;
              }
              .cta {
                text-align: center;
                margin: 30px 0;
              }
              .cta-button {
                display: inline-block;
                background: #000;
                color: white;
                padding: 15px 40px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 16px;
              }
              .footer {
                background: #f8f8f8;
                text-align: center;
                padding: 20px;
                font-size: 12px;
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="email-container">
              <div class="header">
                <h1 style="margin: 0; font-size: 36px;">🥋 Welcome to BJJ OS</h1>
              </div>
              
              <div class="content">
                <h2 style="margin-top: 0;">You're In, ${username || 'there'}!</h2>
                <p>Welcome to the world's most intelligent BJJ coaching system. You now have access to <strong>Professor OS</strong>—an AI coach trained on knowledge from 50+ world champions including Roger Gracie, Marcelo Garcia, Gordon Ryan, JT Torres, and Lucas Leite.</p>
                
                <div class="feature">
                  <strong>📊 Post-Session Analysis</strong>
                  <p>Tell me what you worked on today and I'll provide personalized feedback and suggest techniques to complement your training.</p>
                </div>
                
                <div class="feature">
                  <strong>🎯 Personalized Video Library</strong>
                  <p>Discover curated techniques based on your belt level, style, and goals. Every video is vetted for quality and effectiveness.</p>
                </div>
                
                <div class="feature">
                  <strong>🧠 Intelligent Coaching</strong>
                  <p>Ask me anything about BJJ techniques, strategies, or concepts. I'll provide insights drawn from world-class practitioners.</p>
                </div>
                
                <div class="cta">
                  <a href="https://bjjos.app" class="cta-button">Start Training Now</a>
                </div>
                
                <p style="margin-top: 30px; padding-top: 30px; border-top: 1px solid #e0e0e0;">
                  <strong>Your login:</strong> ${email}<br>
                  <small style="color: #666;">You're logged in for 90 days. We'll never spam you.</small>
                </p>
              </div>
              
              <div class="footer">
                <p><strong>BJJ OS</strong> - The World's Smartest BJJ Coach</p>
                <p><a href="https://bjjos.app">bjjos.app</a></p>
              </div>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('❌ Welcome email error:', error);
      await logEmail({
        recipientEmail: email,
        emailType: 'welcome',
        subject: 'Welcome to BJJ OS - Your AI BJJ Coach',
        status: 'failed',
        errorMessage: error.message || JSON.stringify(error),
        metadata: { username },
      });
      return { success: false, error };
    }

    console.log('✅ Welcome email sent to:', email);
    await logEmail({
      recipientEmail: email,
      emailType: 'welcome',
      subject: 'Welcome to BJJ OS - Your AI BJJ Coach',
      resendId: data.id,
      status: 'sent',
      metadata: { username },
    });
    return { success: true, data };
    
  } catch (error: any) {
    console.error('❌ Error sending welcome email:', error);
    await logEmail({
      recipientEmail: email,
      emailType: 'welcome',
      subject: 'Welcome to BJJ OS - Your AI BJJ Coach',
      status: 'failed',
      errorMessage: error.message,
      metadata: { username },
    });
    return { success: false, error: error.message };
  }
};
