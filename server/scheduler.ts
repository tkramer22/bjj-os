import cron from 'node-cron';
import { storage } from './storage';
import { sendSMS } from './twilio';
import { formatInTimeZone } from 'date-fns-tz';
import { substituteVariables } from './template-utils';
import { generateDailyTechnique } from './ai-agent';
import { db } from './db';
import { bjjUsers, smsHistory } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { checkAndRecoverStuckRuns } from './curation-auto-recovery';

// Circuit breaker to prevent database connection exhaustion
let consecutiveFailures = 0;
const MAX_CONSECUTIVE_FAILURES = 5;
let schedulerDisabled = false;

function recordFailure() {
  consecutiveFailures++;
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && !schedulerDisabled) {
    schedulerDisabled = true;
    console.error('[SCHEDULER] ⚠️  Too many consecutive failures - disabling schedulers temporarily');
    console.error('[SCHEDULER] Server will continue running but scheduled tasks are paused');
    console.error('[SCHEDULER] Fix database connection issues and restart server to re-enable');
  }
}

function recordSuccess() {
  if (consecutiveFailures > 0) {
    console.log('[SCHEDULER] ✅ Recovered from previous failures');
  }
  consecutiveFailures = 0;
  schedulerDisabled = false;
}

export function startScheduler() {
  console.log('[SCHEDULER] Starting schedulers with circuit breaker protection...');
  
  // Job 1: Check for manual SMS schedules (existing functionality)
  cron.schedule('* * * * *', async () => {
    if (schedulerDisabled) {
      return; // Skip execution if circuit breaker is open
    }
    
    try {
      const activeSchedules = await storage.getActiveSmsSchedules();
      recordSuccess();
      
      for (const schedule of activeSchedules) {
        // Get current time in the schedule's timezone
        const now = new Date();
        const scheduleTimeInZone = formatInTimeZone(
          now, 
          schedule.timezone, 
          'HH:mm'
        );
        
        // Check if current time in the schedule's timezone matches the scheduled time
        if (schedule.scheduleTime === scheduleTimeInZone) {
          console.log(`Executing schedule ${schedule.id} at ${scheduleTimeInZone} (${schedule.timezone})`);
          
          // Get all recipients for this schedule
          const recipients = await Promise.all(
            schedule.recipientIds.map(id => storage.getRecipient(id))
          );
          
          // Send SMS to each recipient
          for (const recipient of recipients) {
            if (!recipient) continue;
            
            try {
              // Substitute variables in the message for personalization
              const personalizedMessage = substituteVariables(schedule.message, recipient);

              // Determine status callback URL
              const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPL_SLUG;
              const statusCallbackUrl = domain 
                ? `https://${domain}/api/webhooks/twilio/status`
                : undefined;

              const result = await sendSMS(recipient.phoneNumber, personalizedMessage, statusCallbackUrl);
              
              // Log the result with personalized message
              await storage.createSmsHistory({
                scheduleId: schedule.id,
                recipientId: recipient.id,
                message: personalizedMessage,
                status: result.success ? 'queued' : 'failed',
                twilioSid: result.sid,
                errorMessage: result.error,
              });
              
              if (result.success) {
                console.log(`SMS queued to ${recipient.name} (${recipient.phoneNumber}) - SID: ${result.sid}`);
              } else {
                console.error(`Failed to send SMS to ${recipient.name}: ${result.error}`);
              }
            } catch (error: any) {
              console.error(`Error sending SMS to ${recipient.name}:`, error);
              
              await storage.createSmsHistory({
                scheduleId: schedule.id,
                recipientId: recipient.id,
                message: schedule.message,
                status: 'failed',
                errorMessage: error.message || 'Unknown error',
              });
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[SCHEDULER] SMS schedule error:', error.message || error);
      recordFailure();
    }
  });
  
  // Job 2: Send automated daily BJJ techniques to all users at their scheduled time
  cron.schedule('* * * * *', async () => {
    if (schedulerDisabled) {
      return; // Skip execution if circuit breaker is open
    }
    
    try {
      const { sentTechniques, userEngagement } = await import('@shared/schema');
      const { sql, and, gte } = await import('drizzle-orm');
      recordSuccess();
      
      // Get all active users (trial or active subscription)
      // Use explicit column selection to avoid missing column errors in Supabase
      const userColumns = {
        id: bjjUsers.id,
        email: bjjUsers.email,
        phoneNumber: bjjUsers.phoneNumber,
        name: bjjUsers.name,
        paused: bjjUsers.paused,
        onboardingStep: bjjUsers.onboardingStep,
        timezone: bjjUsers.timezone,
        sendTime: bjjUsers.sendTime,
        subscriptionStatus: bjjUsers.subscriptionStatus,
        beltLevel: bjjUsers.beltLevel,
        style: bjjUsers.style,
        contentPreference: bjjUsers.contentPreference,
        focusAreas: bjjUsers.focusAreas,
        injuries: bjjUsers.injuries,
        competeStatus: bjjUsers.competeStatus,
        trainingGoals: bjjUsers.trainingGoals,
      };
      
      const users = await db.select(userColumns).from(bjjUsers).where(
        eq(bjjUsers.subscriptionStatus, 'active')
      );

      // Also get trial users
      const trialUsers = await db.select(userColumns).from(bjjUsers).where(
        eq(bjjUsers.subscriptionStatus, 'trial')
      );

      const allUsers = [...users, ...trialUsers];

      for (const user of allUsers) {
        // Skip if user is paused
        if (user.paused) {
          continue;
        }
        
        // Skip if user hasn't completed onboarding
        if (user.onboardingStep !== 'complete') {
          continue;
        }
        
        // Get current time in the user's timezone
        const now = new Date();
        const userTimeInZone = formatInTimeZone(
          now, 
          user.timezone || 'America/New_York', 
          'HH:mm'
        );
        
        // Check if current time in the user's timezone matches their send time
        if (user.sendTime === userTimeInZone) {
          console.log(`Sending daily technique to ${user.phoneNumber} at ${userTimeInZone} (${user.timezone})`);
          
          try {
            // ENHANCED DUPLICATE PREVENTION
            // 1. Get techniques sent in last 90 days (technique name tracking)
            const ninetyDaysAgo = new Date();
            ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
            
            const recentTechniques = await db.select().from(sentTechniques)
              .where(and(
                eq(sentTechniques.userId, user.id),
                gte(sentTechniques.sentDate, ninetyDaysAgo)
              ));
            
            // Track excluded video IDs (90-day video duplicate prevention)
            const excludedVideoIds = recentTechniques.map(t => t.videoId);
            
            // Track excluded technique names (90-day technique duplicate prevention)
            const excludedTechniqueNames = recentTechniques.map(t => t.techniqueName.toLowerCase());
            
            // 2. Get instructors from last 30 days (instructor rotation)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const recentInstructors = await db.select().from(sentTechniques)
              .where(and(
                eq(sentTechniques.userId, user.id),
                gte(sentTechniques.sentDate, thirtyDaysAgo)
              ));
            
            const excludedInstructors = recentInstructors.map(t => t.instructor.toLowerCase());
            
            // Prepare technique generation options
            let requestedTechnique = undefined;
            let category: 'guards' | 'submissions' | 'passes' | 'sweeps' | 'positions' | undefined = undefined;
            
            // Competition mode - focus on competition techniques
            if (user.competitionMode && user.compDate) {
              const weeksUntil = Math.ceil((user.compDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
              
              if (weeksUntil > 0) {
                // Still preparing for competition - focus on submissions
                category = 'submissions';
                console.log(`User in competition mode: ${weeksUntil} weeks until comp`);
              } else if (weeksUntil === 0) {
                // Competition week
                category = 'submissions';
                console.log(`User in competition WEEK`);
              } else {
                // Competition passed - turn off competition mode
                await db.update(bjjUsers)
                  .set({ competitionMode: false, compDate: null })
                  .where(eq(bjjUsers.id, user.id));
                
                // Send post-competition message
                if (user.phoneNumber) {
                  await sendSMS(user.phoneNumber, "How'd the comp go? Reply with results! 🥇");
                }
              }
            }
            
            // Adjust for progression level and white belt filtering
            let additionalKeywords = '';
            if (user.beltLevel === 'white' || user.progressionLevel === 'beginner') {
              additionalKeywords = 'fundamentals basics beginner introduction';
            }
            
            // Generate personalized technique with duplicate prevention retry logic
            let attempts = 0;
            const maxAttempts = 3;
            let technique = await generateDailyTechnique({
              beltLevel: user.beltLevel as 'white' | 'blue' | 'purple' | 'brown' | 'black' | undefined,
              style: user.style as 'gi' | 'nogi' | 'both' | undefined,
              focusAreas: user.focusAreas || undefined,
              lastTechniqueSent: user.lastTechniqueSent || undefined,
              category
            });
            
            // ENHANCED DUPLICATE CHECKING with retry logic
            while (attempts < maxAttempts) {
              const topVideo = technique.videos[0];
              
              if (!topVideo) {
                console.warn(`No video found for technique: ${technique.technique}`);
                break;
              }
              
              // Check 1: Video ID duplicate (90 days)
              const isVideoDuplicate = excludedVideoIds.includes(topVideo.videoId);
              
              // Check 2: Technique name duplicate (90 days)
              const isTechniqueDuplicate = excludedTechniqueNames.includes(technique.technique.toLowerCase());
              
              // Check 3: Instructor duplicate (30 days)
              const isInstructorDuplicate = excludedInstructors.includes(technique.instructor.toLowerCase());
              
              // All checks passed - fresh technique!
              if (!isVideoDuplicate && !isTechniqueDuplicate && !isInstructorDuplicate) {
                console.log(`✅ Fresh technique found: ${technique.technique} by ${technique.instructor}`);
                break;
              }
              
              attempts++;
              
              if (isVideoDuplicate) {
                console.log(`⚠️ Duplicate video detected for ${user.phoneNumber} (attempt ${attempts})`);
              }
              if (isTechniqueDuplicate) {
                console.log(`⚠️ Duplicate technique name detected: ${technique.technique} (attempt ${attempts})`);
              }
              if (isInstructorDuplicate) {
                console.log(`⚠️ Instructor ${technique.instructor} taught in last 30 days (attempt ${attempts})`);
              }
              
              if (attempts >= maxAttempts) {
                console.warn(`Could not find unique technique after ${maxAttempts} attempts for ${user.phoneNumber}, sending best available`);
                break;
              }
              
              // Try again with more variety
              technique = await generateDailyTechnique({
                beltLevel: user.beltLevel as 'white' | 'blue' | 'purple' | 'brown' | 'black' | undefined,
                style: user.style as 'gi' | 'nogi' | 'both' | undefined,
                focusAreas: user.focusAreas || undefined,
                category
              });
            }

            // Format SMS message
            const topVideo = technique.videos[0];
            const videoUrl = topVideo ? topVideo.urlWithTimestamp : '';
            
            let message = '';
            
            // Competition mode countdown in message
            if (user.competitionMode && user.compDate) {
              const weeksUntil = Math.ceil((user.compDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000));
              
              if (weeksUntil >= 2) {
                message = `⏱️ ${weeksUntil} weeks to comp - Today's high-percentage move:\n\n`;
              } else if (weeksUntil === 1) {
                message = `⏱️ Final week! Sharpening your A-game:\n\n`;
              }
            }
            
            message += `🥋 ${technique.technique} - ${technique.instructor}\n\nKey Detail: ${technique.tip}\n\nWatch: ${videoUrl}`;

            // Determine status callback URL
            const domain = process.env.REPLIT_DEV_DOMAIN || process.env.REPL_SLUG;
            const statusCallbackUrl = domain 
              ? `https://${domain}/api/webhooks/twilio/status`
              : undefined;

            // Send SMS
            if (!user.phoneNumber) {
              console.warn(`User ${user.id} has no phone number, skipping SMS`);
              continue;
            }
            const result = await sendSMS(user.phoneNumber, message, statusCallbackUrl);
            
            // Log the result (no scheduleId for automated messages)
            await db.insert(smsHistory).values({
              scheduleId: null,
              recipientId: user.id,
              message,
              status: result.success ? 'queued' : 'failed',
              twilioSid: result.sid,
              errorMessage: result.error,
            });

            // Update last technique sent and log to sentTechniques
            if (result.success) {
              await db.update(bjjUsers)
                .set({ lastTechniqueSent: technique.technique })
                .where(eq(bjjUsers.id, user.id));
              
              // Log to sentTechniques table for duplicate prevention
              if (topVideo) {
                await db.insert(sentTechniques).values({
                  userId: user.id,
                  techniqueName: technique.technique,
                  videoUrl: videoUrl,
                  videoId: topVideo.videoId,
                  instructor: technique.instructor,
                  sentDate: new Date(),
                });
              }
              
              console.log(`Daily technique sent to ${user.phoneNumber} - SID: ${result.sid}`);
            } else {
              console.error(`Failed to send daily technique to ${user.phoneNumber}: ${result.error}`);
            }
          } catch (error: any) {
            console.error(`Error sending daily technique to ${user.phoneNumber}:`, error);
            
            await db.insert(smsHistory).values({
              scheduleId: null,
              recipientId: user.id,
              message: `Error: ${error.message}`,
              status: 'failed',
              errorMessage: error.message || 'Unknown error',
            });
          }
        }
      }
    } catch (error: any) {
      console.error('[SCHEDULER] Automated technique error:', error.message || error);
      recordFailure();
    }
  });
  
  // Job 3: Weekly Recap (Sundays at 6 PM)
  cron.schedule('* * * * *', async () => {
    try {
      const { sentTechniques } = await import('@shared/schema');
      const { desc, and, gte } = await import('drizzle-orm');
      
      const now = new Date();
      const dayOfWeek = now.getDay(); // 0 = Sunday
      
      if (dayOfWeek !== 0) {
        return; // Only run on Sundays
      }
      
      // Get all users with weekly recap enabled
      // Use explicit column selection to avoid missing column errors in Supabase
      const recapColumns = {
        id: bjjUsers.id,
        phoneNumber: bjjUsers.phoneNumber,
        name: bjjUsers.name,
        weeklyRecapEnabled: bjjUsers.weeklyRecapEnabled,
        timezone: bjjUsers.timezone,
      };
      const users = await db.select(recapColumns).from(bjjUsers);
      
      for (const user of users) {
        if (!user.weeklyRecapEnabled) {
          continue;
        }
        
        // Get current time in user's timezone
        const userTimeInZone = formatInTimeZone(
          now,
          user.timezone || 'America/New_York',
          'HH:mm'
        );
        
        // Check if it's 6 PM in user's timezone
        if (userTimeInZone === '18:00') {
          console.log(`Sending weekly recap to ${user.phoneNumber}`);
          
          try {
            // Get last 7 techniques sent to this user
            const sevenDaysAgo = new Date();
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
            
            const weekTechniques = await db.select().from(sentTechniques)
              .where(and(
                eq(sentTechniques.userId, user.id),
                gte(sentTechniques.sentDate, sevenDaysAgo)
              ))
              .orderBy(desc(sentTechniques.sentDate))
              .limit(7);
            
            if (weekTechniques.length === 0) {
              continue; // Skip if no techniques sent this week
            }
            
            // Check if this is their first recap
            const totalTechniques = await db.select().from(sentTechniques)
              .where(eq(sentTechniques.userId, user.id));
            
            const isFirstRecap = totalTechniques.length <= 7;
            
            // Build recap message
            let message = '';
            
            if (isFirstRecap) {
              message = '📊 Your first week with BJJ OS!\n\n';
            } else {
              message = '📊 This week\'s arsenal:\n\n';
            }
            
            // Add techniques (in reverse order, oldest to newest)
            const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            weekTechniques.reverse().forEach((tech, index) => {
              const dayIndex = (now.getDay() - 6 + index + 7) % 7;
              message += `${days[dayIndex]}: ${tech.techniqueName}\n`;
            });
            
            message += '\nWhich one will you drill this week? 🥋';
            
            if (isFirstRecap) {
              message += '\n\n(Don\'t want weekly recaps? Reply RECAP OFF)';
            }
            
            // Send recap
            if (!user.phoneNumber) {
              console.warn(`User ${user.id} has no phone number, skipping recap`);
              continue;
            }
            await sendSMS(user.phoneNumber, message);
            console.log(`Weekly recap sent to ${user.phoneNumber}`);
            
          } catch (error: any) {
            console.error(`Error sending weekly recap to ${user.phoneNumber}:`, error);
          }
        }
      }
    } catch (error: any) {
      console.error('[SCHEDULER] Weekly recap error:', error.message || error);
      recordFailure();
    }
  });
  
  // Job 4: Revenue Calculation (runs daily at midnight)
  cron.schedule('0 0 * * *', async () => {
    try {
      const { referralCodes } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      
      console.log('Running daily revenue calculation for influencer codes');
      
      // Get all influencer codes
      const influencerCodes = await db.select().from(referralCodes)
        .where(eq(referralCodes.codeType, 'influencer'));
      
      for (const code of influencerCodes) {
        const activeSubscribers = code.activeSubscribers || 0;
        const monthlyRevenue = activeSubscribers * 3.99;
        const commissionRate = parseFloat(code.commissionRate || "0");
        const commissionOwed = monthlyRevenue * commissionRate;
        
        await db.update(referralCodes)
          .set({
            totalRevenueGenerated: monthlyRevenue.toFixed(2),
            commissionOwed: commissionOwed.toFixed(2)
          })
          .where(eq(referralCodes.id, code.id));
      }
      
      console.log(`Revenue calculation completed for ${influencerCodes.length} influencer codes`);
    } catch (error: any) {
      console.error('[SCHEDULER] Revenue calculation error:', error.message || error);
      recordFailure();
    }
  });
  
  // Job 5: Video Quality Management (runs daily at 3 AM)
  cron.schedule('0 3 * * *', async () => {
    try {
      console.log('Running daily video quality management...');
      const { manageVideoQuality } = await import('./video-quality-manager');
      const result = await manageVideoQuality();
      console.log('Video quality management completed:', result);
    } catch (error: any) {
      console.error('[SCHEDULER] Video quality management error:', error.message || error);
      recordFailure();
    }
  });
  
  // Job 6: User Profile Building (runs daily at 12 PM EST) - moved from 4 AM to avoid overnight congestion
  cron.schedule('0 12 * * *', async () => {
    try {
      console.log('Running daily user profile building...');
      const { updateAllUserProfiles } = await import('./ranking/profile-builder');
      await updateAllUserProfiles();
      console.log('User profile building completed');
    } catch (error: any) {
      console.error('[SCHEDULER] User profile building error:', error.message || error);
      recordFailure();
    }
  }, { timezone: 'America/New_York' });
  
  // Job 7: Meta Analysis (runs daily at 10 AM EST) - moved from 5 AM to avoid overnight congestion
  cron.schedule('0 10 * * *', async () => {
    try {
      console.log('[META ANALYZER] Running daily technique meta analysis...');
      const { metaAnalyzer } = await import('./meta-analyzer');
      await metaAnalyzer.analyzeTechniqueMetaStatus();
      console.log('[META ANALYZER] Daily meta analysis completed');
    } catch (error: any) {
      console.error('[META ANALYZER] Error during meta analysis:', error.message || error);
      recordFailure();
    }
  }, { timezone: 'America/New_York' });
  
  // Job 8: UNIFIED DAILY CURATION (3 AM EST / 8 AM UTC)
  // Uses proven search method: pick 12 instructors with lowest counts, 5 searches each
  cron.schedule('0 8 * * *', async () => {
    if (schedulerDisabled) return;
    
    try {
      console.log('[UNIFIED CURATION] Starting daily curation at 3 AM EST...');
      const { runUnifiedCuration } = await import('./unified-curation');
      
      const result = await runUnifiedCuration(12, 7.0);
      
      // Send email notification
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        
        const stats = result.instructorStats || [];
        const instructorSummary = stats.length > 0
          ? stats.map(s => `  - ${s.instructor}: ${s.beforeCount} → ${s.afterCount} (+${s.videosAdded})`).join('\n')
          : '  (no instructors processed)';
        
        let subject: string;
        let status: string;
        
        if (!result.success) {
          subject = '❌ Daily Curation Failed';
          status = `Failed: ${result.error || 'Unknown error'}`;
        } else if (result.quotaExhausted) {
          subject = '⚠️ Daily Curation Complete (Quota Hit)';
          status = 'Completed with quota exhaustion';
        } else if (result.instructorsCurated === 0) {
          subject = '⚠️ Daily Curation - No Instructors';
          status = 'No instructors processed this run';
        } else {
          subject = '✅ Daily Curation Complete';
          status = 'Success';
        }
        
        await resend.emails.send({
          from: 'BJJ OS <noreply@bjjos.app>',
          to: ['todd@bjjos.app'],
          subject,
          text: `Daily Unified Curation (3 AM EST)

📊 Status: ${status}

📈 Summary:
- Instructors curated: ${result.instructorsCurated || 0}
- Videos added: ${result.totalVideosAdded || 0}
- Duration: ${result.durationMinutes || 0} minutes
- Rotation cycle: ${result.rotationCycle || 1}

📋 Instructor Breakdown:
${instructorSummary}

View library: https://bjjos.app/admin/videos`
        });
        
        console.log('[UNIFIED CURATION] Daily email sent');
      } catch (emailError: any) {
        console.error('[UNIFIED CURATION] Email error:', emailError.message);
      }
      
      recordSuccess();
    } catch (error: any) {
      console.error('[UNIFIED CURATION] Daily curation error:', error.message);
      
      // Send failure email
      try {
        const { Resend } = await import('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'BJJ OS <noreply@bjjos.app>',
          to: ['todd@bjjos.app'],
          subject: '❌ Daily Curation Failed',
          text: `Daily curation failed at 3 AM EST.\n\nError: ${error.message}\n\nCheck logs for details.`
        });
      } catch (e) {}
      
      recordFailure();
    }
  });
  
  // Job 9 (OLD): AUTOMATIC CURATION - DISABLED (Replaced by Job 8)
  // ════════════════════════════════════════════════════════════════════
  // ⛔ DISABLED: Replaced by unified curation system (Job 8) which uses
  // the proven search-based method with instructor rotation tracking.
  // ════════════════════════════════════════════════════════════════════
  
  // DISABLED - All 9 automatic curation cron jobs commented out below:
  
  // const runAggressiveCuration = async (runNumber: number, timeLabel: string) => {
  //   try {
  //     console.log(`🚀 [PERMANENT AGGRESSIVE MODE] Run ${runNumber}/9 (${timeLabel})`);
  //     console.log(`📦 Batch: 500 videos (10 searches × 50 results)`);
  //     
  //     const curationController = await import('./curation-controller');
  //     
  //     // Check if auto-curation is enabled
  //     const enabled = await curationController.getSetting('auto_curation_enabled', false);
  //     
  //     if (!enabled) {
  //       console.log('[AUTO CURATOR] Auto-curation is disabled - skipping run');
  //       return;
  //     }
  //     
  //     // Check if target reached
  //     const { aiVideoKnowledge } = await import('@shared/schema');
  //     const { sql } = await import('drizzle-orm');
  //     const videoCountResult = await db.select({ count: sql<number>`count(*)` })
  //       .from(aiVideoKnowledge);
  //     const currentVideoCount = Number(videoCountResult[0].count);
  //     const targetVideoCount = await curationController.getSetting('target_video_count', 2000);
  //     
  //     if (currentVideoCount >= targetVideoCount) {
  //       console.log(`🎉 TARGET REACHED! ${currentVideoCount} videos (target: ${targetVideoCount})`);
  //       console.log('🔒 Switching to maintenance mode - aggressive curation paused');
  //       return;
  //     }
  //     
  //     const remaining = targetVideoCount - currentVideoCount;
  //     console.log(`📊 Progress: ${currentVideoCount} / ${targetVideoCount} (${remaining} remaining, ${Math.round(currentVideoCount/targetVideoCount*100)}%)`);
  //     
  //     // Run curation with 500 video batch
  //     const result = await curationController.startCurationRun('auto', `aggressive-run-${runNumber}`);
  //     
  //     if (result.success) {
  //       console.log(`✅ Aggressive run ${runNumber}/9 started - Run ID: ${result.runId}`);
  //     } else {
  //       console.log(`⏸️  Aggressive run ${runNumber}/9 skipped: ${result.reason}`);
  //     }
  //   } catch (error: any) {
  //     console.error(`[AGGRESSIVE MODE] Error during run ${runNumber}:`, error.message || error);
  //     recordFailure();
  //   }
  // };
  
  // DISABLED: Run 1/9: 12:00 AM
  // cron.schedule('0 0 * * *', async () => {
  //   console.log('[CRON DEBUG] 12:00 AM cron job FIRED');
  //   await runAggressiveCuration(1, '12:00 AM');
  // });
  
  // DISABLED: Run 2/9: 2:40 AM
  // cron.schedule('40 2 * * *', async () => {
  //   console.log('[CRON DEBUG] 2:40 AM cron job FIRED');
  //   await runAggressiveCuration(2, '2:40 AM');
  // });
  
  // DISABLED: Run 3/9: 5:20 AM (Note: Meta analysis runs at 5 AM, stagger by 20 min)
  // cron.schedule('20 5 * * *', async () => await runAggressiveCuration(3, '5:20 AM'));
  
  // DISABLED: Run 4/9: 8:00 AM
  // cron.schedule('0 8 * * *', async () => await runAggressiveCuration(4, '8:00 AM'));
  
  // DISABLED: Run 5/9: 10:40 AM
  // cron.schedule('40 10 * * *', async () => await runAggressiveCuration(5, '10:40 AM'));
  
  // DISABLED: Run 6/9: 1:20 PM
  // cron.schedule('20 13 * * *', async () => await runAggressiveCuration(6, '1:20 PM'));
  
  // DISABLED: Run 7/9: 4:00 PM
  // cron.schedule('0 16 * * *', async () => await runAggressiveCuration(7, '4:00 PM'));
  
  // DISABLED: Run 8/9: 6:40 PM
  // cron.schedule('40 18 * * *', async () => await runAggressiveCuration(8, '6:40 PM'));
  
  // DISABLED: Run 9/9: 9:20 PM
  // cron.schedule('20 21 * * *', async () => await runAggressiveCuration(9, '9:20 PM'));
  
  // ════════════════════════════════════════════════════════════════════
  // 🚫 CONTENT-FIRST CURATION - DISABLED (Conflicts with Permanent Auto-Curation)
  // REASON: Running multiple curation systems exhausts YouTube API quota by mid-morning
  // SOLUTION: Using only Permanent Auto-Curation in scheduled-tasks.ts (4x daily)
  // ════════════════════════════════════════════════════════════════════
  
  // const runScheduledContentFirstCuration = async (runLabel: string) => {
  //   try {
  //     console.log(`🚀 [SCHEDULED CURATION] ${runLabel} - Starting Content-First curation`);
  //     const { runContentFirstCuration } = await import('./content-first-curation');
  //     const result = await runContentFirstCuration(12, 5);
  //     console.log(`✅ [SCHEDULED CURATION] ${runLabel} - Complete: ${result.videosSaved} videos saved`);
  //   } catch (error: any) {
  //     console.error(`❌ [SCHEDULED CURATION] ${runLabel} - Error:`, error.message || error);
  //   }
  // };
  
  // DISABLED: Runs 1-4 (using Permanent Auto-Curation instead)
  // cron.schedule('0 6 * * *', async () => await runScheduledContentFirstCuration('6:00 AM EST'), { timezone: 'America/New_York' });
  // cron.schedule('0 10 * * *', async () => await runScheduledContentFirstCuration('10:00 AM EST'), { timezone: 'America/New_York' });
  // cron.schedule('0 14 * * *', async () => await runScheduledContentFirstCuration('2:00 PM EST'), { timezone: 'America/New_York' });
  // cron.schedule('0 18 * * *', async () => await runScheduledContentFirstCuration('6:00 PM EST'), { timezone: 'America/New_York' });
  
  console.log('🚫 [SCHEDULED CURATION] Content-First curation DISABLED - Using Permanent Auto-Curation only');
  
  // Job 10: Comprehensive Admin Email Reports - 3x Daily
  // All times in America/New_York timezone
  // Sent to: todd@bjjos.app
  
  // 7:00 AM EST - Morning Report (Overnight Summary)
  cron.schedule('0 7 * * *', async () => {
    try {
      const { sendMorningReport } = await import('./admin-email-v2');
      console.log('[ADMIN EMAIL V2] ⏰ [7:00 AM EST] Sending Morning Report');
      await sendMorningReport();
      console.log('[ADMIN EMAIL V2] ✅ Morning Report sent successfully');
    } catch (error) {
      console.error('[ADMIN EMAIL V2] ❌ Error sending Morning Report:', error);
    }
  }, {
    timezone: 'America/New_York'
  });
  
  // 1:00 PM EST - Midday Report (Real-time Stats)
  cron.schedule('0 13 * * *', async () => {
    try {
      const { sendMiddayReport } = await import('./admin-email-v2');
      console.log('[ADMIN EMAIL V2] ⏰ [1:00 PM EST] Sending Midday Report');
      await sendMiddayReport();
      console.log('[ADMIN EMAIL V2] ✅ Midday Report sent successfully');
    } catch (error) {
      console.error('[ADMIN EMAIL V2] ❌ Error sending Midday Report:', error);
    }
  }, {
    timezone: 'America/New_York'
  });
  
  // 8:00 PM EST - Evening Report (Daily Wrap-Up)
  cron.schedule('0 20 * * *', async () => {
    try {
      const { sendEveningReport } = await import('./admin-email-v2');
      console.log('[ADMIN EMAIL V2] ⏰ [8:00 PM EST] Sending Evening Report');
      await sendEveningReport();
      console.log('[ADMIN EMAIL V2] ✅ Evening Report sent successfully');
    } catch (error) {
      console.error('[ADMIN EMAIL V2] ❌ Error sending Evening Report:', error);
    }
  }, {
    timezone: 'America/New_York'
  });
  
  // Weekly Referral Emails - Monday 8 AM ET
  cron.schedule('0 8 * * 1', async () => {
    try {
      console.log('[REFERRAL] Sending weekly referral emails...');
      const { db } = await import('./db');
      const { bjjUsers, referralCodes } = await import('@shared/schema');
      const { eq } = await import('drizzle-orm');
      const { sendWeeklyReferralEmail } = await import('./referral-email');

      const usersWithCodes = await db
        .select({
          userId: bjjUsers.id,
          email: bjjUsers.email,
        })
        .from(bjjUsers)
        .innerJoin(referralCodes, eq(referralCodes.assignedToUserId, bjjUsers.id))
        .where(eq(referralCodes.isActive, true));

      let sent = 0;
      for (const user of usersWithCodes) {
        if (user.email) {
          const success = await sendWeeklyReferralEmail(user.email, user.userId);
          if (success) sent++;
        }
      }

      console.log(`[REFERRAL] ✅ Sent ${sent} weekly referral emails`);
    } catch (error) {
      console.error('[REFERRAL] Error sending weekly emails:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  // Daily Automated Payouts - 9 AM ET
  cron.schedule('0 9 * * *', async () => {
    try {
      console.log('[REFERRAL] Processing eligible payouts (Net 60)...');
      const { processEligiblePayouts } = await import('./referral-service');
      const results = await processEligiblePayouts();
      
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      const totalAmount = results.reduce((sum, r) => sum + r.amount, 0);

      console.log(`[REFERRAL] ✅ Processed ${successful} payouts ($${totalAmount.toFixed(2)} total)`);
      if (failed > 0) {
        console.log(`[REFERRAL] ⚠️ ${failed} payouts failed - check logs`);
      }
    } catch (error) {
      console.error('[REFERRAL] Error processing payouts:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  console.log('SMS scheduler started - checking every minute with timezone support');
  console.log('Automated BJJ technique scheduler started - sends daily techniques to all users');
  console.log('Weekly recap scheduler started - sends recaps on Sundays at 6 PM');
  console.log('Revenue calculation scheduler started - runs daily at midnight');
  console.log('Video quality management scheduler started - runs daily at 3 AM');
  console.log('User profile building scheduler started - runs daily at 12 PM EST (moved from 4 AM)');
  console.log('[META ANALYZER] Meta analysis scheduler started - runs daily at 10 AM EST (moved from 5 AM)');
  console.log('[AUTO CURATOR] ⛔ AUTOMATIC CURATION DISABLED - Use Command Center for manual triggering');
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📧 COMPREHENSIVE EMAIL SYSTEM INITIALIZED (V2)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('Resend API Key:', process.env.RESEND_API_KEY ? '✅ Set' : '❌ Missing');
  console.log('Admin Email: todd@bjjos.app');
  console.log('Schedule (3 emails daily):');
  console.log('  7:00 AM EST  - ☀️  Morning Report (Overnight Summary)');
  console.log('  1:00 PM EST  - 🌤️  Midday Update (Real-time Stats)');
  console.log('  8:00 PM EST  - 🌙  Evening Wrap-Up (Daily Summary)');
  console.log('');
  console.log('Report Features:');
  console.log('  • User metrics & MRR tracking');
  console.log('  • Curation pipeline results (discovered/analyzed/approved/rejected)');
  console.log('  • Combat sports news scraping verification');
  console.log('  • System health & critical alerts');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  // YouTube Quota Auto-Reset - 3:05 AM ET (force reset quota tracking)
  cron.schedule('5 3 * * *', async () => {
    try {
      const { forceResetQuota } = await import('./youtube-quota-monitor');
      
      console.log('═══════════════════════════════════════════════════════════════════════════════');
      console.log('🔄 [QUOTA RESET] Daily quota reset triggered at 3:05 AM ET');
      console.log('   YouTube API quota resets at midnight Pacific (3 AM Eastern)');
      console.log('   This cron ensures quota tracking is synchronized');
      console.log('═══════════════════════════════════════════════════════════════════════════════');
      
      const result = forceResetQuota('scheduled_daily_reset');
      
      if (result.previousQuotaExceeded) {
        console.log('🎯 [QUOTA RESET] Quota was exhausted yesterday - now FRESH!');
        console.log('   Curation can resume with 10,000 units available');
        console.log('   Next curation runs will automatically start');
      } else {
        console.log('✅ [QUOTA RESET] Routine reset complete');
      }
    } catch (error) {
      console.error('❌ [QUOTA RESET] Error during daily quota reset:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 🚨 AUTO-RECOVERY DISABLED - NOVEMBER 21, 2024
  // ═══════════════════════════════════════════════════════════════════════════════
  // REASON: Recurring "connection failure during authentication" errors
  // DECISION: Manual recovery via Command Center is more reliable
  // STATUS: Use /api/admin/curation/recovery to manually reset stuck runs
  // ═══════════════════════════════════════════════════════════════════════════════
  
  // DISABLED: Auto-Recovery for Stuck Curation Runs
  // cron.schedule('*/30 * * * *', async () => {
  //   try {
  //     console.log('[AUTO-RECOVERY] Running stuck curation check...');
  //     const result = await checkAndRecoverStuckRuns();
  //     
  //     if (!result.success) {
  //       console.error('[AUTO-RECOVERY] Check failed:', result.message);
  //     } else if (result.stuckRuns > 0) {
  //       console.log(`[AUTO-RECOVERY] ✅ Recovered ${result.stuckRuns} stuck run(s)`);
  //     }
  //   } catch (error) {
  //     console.error('[AUTO-RECOVERY] Error:', error);
  //   }
  // }, {
  //   timezone: 'America/New_York'
  // });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 🚫 INTELLIGENT CURATOR V2 - DISABLED (Conflicts with Permanent Auto-Curation)
  // ═══════════════════════════════════════════════════════════════════════════════
  // REASON: Running 6 additional curation runs exhausts YouTube API quota by mid-morning
  // SOLUTION: Using only Permanent Auto-Curation in scheduled-tasks.ts (4x daily)
  // ═══════════════════════════════════════════════════════════════════════════════
  // cron.schedule('0 6,10,14,18,22,2 * * *', async () => {
  //   if (schedulerDisabled) {
  //     console.log('[V2 CURATION] Skipping - scheduler disabled');
  //     return;
  //   }
  //   
  //   const startTime = Date.now();
  //   try {
  //     console.log('🚀 [V2 CURATION] Scheduled Intelligent Curator V2 run starting...');
  //     const { runCurationV2 } = await import('./intelligent-curator-v2');
  //     const result = await runCurationV2('scheduled');
  //     console.log(`[V2 CURATION] Completed: ${result.videosApproved} approved`);
  //     recordSuccess();
  //   } catch (error) {
  //     console.error('[V2 CURATION] Scheduled run error:', error);
  //     recordFailure();
  //   }
  // }, {
  //   timezone: 'America/New_York'
  // });
  
  console.log('🚫 [V2 CURATION] Intelligent Curator V2 DISABLED - Using Permanent Auto-Curation only');
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // 📊 DAILY SUMMARY EMAIL - 9PM EST
  // ═══════════════════════════════════════════════════════════════════════════════
  // Comprehensive platform stats: videos, users, conversations, curation runs
  // ═══════════════════════════════════════════════════════════════════════════════
  cron.schedule('0 21 * * *', async () => {
    try {
      console.log('═══════════════════════════════════════════════════════════════════════════════');
      console.log('📊 [DAILY SUMMARY] Sending 9pm daily summary email...');
      console.log('═══════════════════════════════════════════════════════════════════════════════');
      
      const { sendDailySummaryEmail } = await import('./curation-email-notifications');
      await sendDailySummaryEmail();
      
      console.log('[DAILY SUMMARY] ✅ Email sent successfully');
    } catch (error) {
      console.error('[DAILY SUMMARY] ❌ Email error:', error);
    }
  }, {
    timezone: 'America/New_York'
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // 🚫 DAILY INSTRUCTOR-FOCUSED CURATION - DISABLED (Conflicts with Permanent Auto-Curation)
  // ═══════════════════════════════════════════════════════════════════════════════
  // REASON: This creates an additional curation run that exhausts YouTube API quota
  // SOLUTION: Permanent Auto-Curation in scheduled-tasks.ts already targets underrepresented instructors
  // ═══════════════════════════════════════════════════════════════════════════════
  // cron.schedule('10 3 * * *', async () => {
  //   ... DISABLED - see permanent-auto-curation.ts instead
  // }, { timezone: 'America/New_York' });
  
  console.log('🚫 [INSTRUCTOR CURATION] DISABLED - Using Permanent Auto-Curation only');

  // ═══════════════════════════════════════════════════════════════════════════════
  // 🚫 NIGHTLY TOPIC ROTATION CURATION - DISABLED (Conflicts with Permanent Auto-Curation)
  // ═══════════════════════════════════════════════════════════════════════════════
  // REASON: This creates an additional curation run that exhausts YouTube API quota
  // SOLUTION: Permanent Auto-Curation in scheduled-tasks.ts handles all curation needs
  // ═══════════════════════════════════════════════════════════════════════════════
  // cron.schedule('0 2 * * *', async () => {
  //   ... DISABLED - see permanent-auto-curation.ts instead
  // }, { timezone: 'America/New_York' });
  
  console.log('🚫 [NIGHTLY CURATION] DISABLED - Using Permanent Auto-Curation only');

  console.log('[ADMIN EMAIL V2] Comprehensive admin email reports started - 3x daily (7AM, 1PM, 8PM EST) to todd@bjjos.app');
  console.log('[REFERRAL] Weekly referral emails scheduler started - Mondays at 8 AM ET');
  console.log('[REFERRAL] Daily payout processing scheduler started - 9 AM ET (Net 60 terms)');
  console.log('[QUOTA RESET] Daily YouTube quota reset scheduler started - 3:05 AM ET');
  console.log('🚨 [AUTO-RECOVERY] DISABLED - Use manual recovery via Command Center');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('📺 YOUTUBE API QUOTA OPTIMIZATION (January 2026)');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('  ✅ ACTIVE: Permanent Auto-Curation - 4x daily (3:15am, 9am, 3pm, 9pm EST)');
  console.log('  🚫 DISABLED: Content-First Curation (was 4 runs/day - conflicts)');
  console.log('  🚫 DISABLED: V2 Intelligent Curator (was 6 runs/day - conflicts)');
  console.log('  🚫 DISABLED: Instructor-Focused Curation (redundant)');
  console.log('  🚫 DISABLED: Nightly Topic Rotation (redundant)');
  console.log('  📊 Result: 4 runs/day (down from 14+) = quota lasts all day');
  console.log('═══════════════════════════════════════════════════════════════════════════════');
  console.log('📊 [DAILY SUMMARY] Daily summary email scheduled - 9PM EST to todd@bjjos.app');
}
