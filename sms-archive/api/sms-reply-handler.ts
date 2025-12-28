import { eq } from "drizzle-orm";
import { db } from "./db";
import { bjjUsers, userEngagement, sentTechniques } from "@shared/schema";
import { sendSMS } from "./twilio";
import { generateDailyTechnique } from "./ai-agent";
import { trackReferralSignup } from "./referral-tracker";

export async function handleIncomingSMS(from: string, body: string) {
  const message = body.trim().toUpperCase();
  const originalMessage = body.trim();
  let response = '';
  
  // Check if user exists
  const [user] = await db.select().from(bjjUsers).where(eq(bjjUsers.phoneNumber, from));
  
  // 1. NEW USER - Start onboarding
  if (!user) {
    const firstName = "USER";
    const myOwnCode = `${firstName}${Math.floor(1000 + Math.random() * 9000)}`;
    
    // Create the user (referralCode will be set later if they used one)
    const [newUser] = await db.insert(bjjUsers).values({
      phoneNumber: from,
      onboardingStep: 'belt'
    }).returning();
    
    // Create their personal referral code in referral_codes table
    const { referralCodes } = await import('@shared/schema');
    await db.insert(referralCodes).values({
      userId: newUser.id,
      code: myOwnCode,
      codeType: 'user',
      uses: "0",
      freeMonthsEarned: "0",
      isActive: true
    });
    
    response = "🥋 Welcome to BJJ OS!\n\nEvery morning at 8 AM, you'll get ONE carefully curated technique with the key detail that makes it work - timestamped and ready to drill.\n\nStop wasting time searching YouTube for the perfect technique. We've done the research for you.\n\nQuick setup (takes 30 seconds):\n\nWhat belt are you?\nReply: WHITE, BLUE, PURPLE, BROWN, or BLACK";
    return response;
  }
  
  // 2. ONBOARDING - Belt Level
  if (user.onboardingStep === 'belt' && ['WHITE', 'BLUE', 'PURPLE', 'BROWN', 'BLACK'].includes(message)) {
    await db.update(bjjUsers)
      .set({ beltLevel: message.toLowerCase(), onboardingStep: 'preference' })
      .where(eq(bjjUsers.id, user.id));
    
    response = `💪 ${message} belt - nice!\n\nWhat level of content do you prefer?\nReply: FUNDAMENTALS, MIXED, or ADVANCED\n\n• FUNDAMENTALS = Focus on core techniques and basics\n• MIXED = Balance of basics and advanced (recommended)\n• ADVANCED = Complex techniques and competition moves`;
    return response;
  }
  
  // 3. ONBOARDING - Content Preference
  if (user.onboardingStep === 'preference' && ['FUNDAMENTALS', 'MIXED', 'ADVANCED'].includes(message)) {
    await db.update(bjjUsers)
      .set({ contentPreference: message, onboardingStep: 'style' })
      .where(eq(bjjUsers.id, user.id));
    
    response = `📚 ${message} content - perfect!\n\nWhat do you train?\nReply: GI, NOGI, or BOTH`;
    return response;
  }
  
  // 4. ONBOARDING - Style
  if (user.onboardingStep === 'style' && ['GI', 'NOGI', 'BOTH'].includes(message)) {
    await db.update(bjjUsers)
      .set({ style: message.toLowerCase(), onboardingStep: 'focus' })
      .where(eq(bjjUsers.id, user.id));
    
    response = "🎯 Final question - any areas you want to SKIP for now?\n\nGUARD • PASSING • SWEEPS • SUBMISSIONS • ESCAPES • TAKEDOWNS\n\nReply with areas to skip, or reply ALL to learn everything\n\nExample: TAKEDOWNS, ESCAPES";
    return response;
  }
  
  // 4. ONBOARDING - Focus Areas
  if (user.onboardingStep === 'focus') {
    let focusAreas: string[] = [];
    if (message !== 'ALL') {
      const skipAreas = message.toLowerCase().split(',').map(s => s.trim());
      const allAreas = ['guard', 'passing', 'sweeps', 'submissions', 'escapes', 'takedowns'];
      focusAreas = allAreas.filter(area => !skipAreas.some(skip => area.includes(skip) || skip.includes(area)));
    }
    
    await db.update(bjjUsers)
      .set({ focusAreas, onboardingStep: 'referral' })
      .where(eq(bjjUsers.id, user.id));
    
    response = "💡 Last question: Did a friend or instructor refer you?\n\nIf yes, reply with their code (e.g. GORDON1234)\nIf no, reply NONE";
    return response;
  }
  
  // 5. ONBOARDING - Referral Code (Final Step)
  if (user.onboardingStep === 'referral') {
    // Track referral if provided (message is already uppercased)
    if (message !== 'NONE' && message.length > 0) {
      console.log(`Tracking referral signup for user ${user.id} with code: ${message}`);
      const result = await trackReferralSignup(user.id, message);
      if (result.success) {
        console.log(`✓ Referral tracked successfully for ${from}`);
      } else {
        console.log(`✗ Referral tracking failed for ${from}: ${result.message}`);
      }
    } else {
      console.log(`User ${from} skipped referral code`);
    }
    
    // Mark onboarding complete
    await db.update(bjjUsers)
      .set({ onboardingStep: 'complete' })
      .where(eq(bjjUsers.id, user.id));
    
    // Get user's own referral code to show in message
    const { referralCodes } = await import('@shared/schema');
    const [myCode] = await db.select().from(referralCodes)
      .where(eq(referralCodes.userId, user.id));
    
    const myReferralCode = myCode?.code || 'USER0000';
    
    response = `✅ Perfect! First technique drops tomorrow at 8 AM.\n\nPro tips:\n• Reply TIME 7AM to change your schedule\n• Reply PAUSE to skip days\n• Share with training partners: bjjos.app/ref/${myReferralCode}\n\nGet ready to level up 🚀`;
    return response;
  }
  
  // 5. TIME COMMAND
  if (message.startsWith('TIME ')) {
    const timeStr = message.replace('TIME ', '').trim();
    const timeMatch = timeStr.match(/(\d{1,2}):?(\d{2})?\s*(AM|PM)?/);
    
    if (timeMatch) {
      let hour = parseInt(timeMatch[1]);
      const minute = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
      const period = timeMatch[3];
      
      if (period === 'PM' && hour !== 12) hour += 12;
      if (period === 'AM' && hour === 12) hour = 0;
      
      const newTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      
      await db.update(bjjUsers)
        .set({ sendTime: newTime })
        .where(eq(bjjUsers.id, user.id));
      
      response = `✅ Changed! You'll get techniques at ${timeStr} starting tomorrow`;
      return response;
    } else {
      response = "Invalid time format. Try: TIME 7AM or TIME 6:30PM";
      return response;
    }
  }
  
  // 6. PAUSE
  if (message === 'PAUSE') {
    await db.update(bjjUsers)
      .set({ paused: true })
      .where(eq(bjjUsers.id, user.id));
    
    response = "⏸️ Paused. Reply RESUME when ready";
    return response;
  }
  
  // 7. RESUME
  if (message === 'RESUME') {
    await db.update(bjjUsers)
      .set({ paused: false })
      .where(eq(bjjUsers.id, user.id));
    
    const time = user.sendTime || '08:00';
    response = `▶️ Resumed! Next technique coming tomorrow at ${time}`;
    return response;
  }
  
  // 8. RECAP OFF
  if (message === 'RECAP OFF' || message === 'NO RECAP') {
    await db.update(bjjUsers)
      .set({ weeklyRecapEnabled: false })
      .where(eq(bjjUsers.id, user.id));
    
    response = "✅ Weekly recaps turned off. Reply RECAP ON to re-enable";
    return response;
  }
  
  // 9. RECAP ON
  if (message === 'RECAP ON') {
    await db.update(bjjUsers)
      .set({ weeklyRecapEnabled: true })
      .where(eq(bjjUsers.id, user.id));
    
    response = "✅ Weekly recaps turned back on. Next one comes Sunday at 6 PM";
    return response;
  }
  
  // 10. CONTENT PREFERENCE COMMANDS
  if (message === 'FUNDAMENTALS') {
    await db.update(bjjUsers)
      .set({ contentPreference: 'FUNDAMENTALS' })
      .where(eq(bjjUsers.id, user.id));
    
    response = "✅ Switched to FUNDAMENTALS. You'll get core techniques and basics for the next 30 days. Reply MIXED or ADVANCED to change.";
    return response;
  }
  
  if (message === 'SIMPLER') {
    await db.update(bjjUsers)
      .set({ contentPreference: 'FUNDAMENTALS' })
      .where(eq(bjjUsers.id, user.id));
    
    response = "✅ Simplified! You'll get more fundamental content. Reply ADVANCED or MIXED to change.";
    return response;
  }
  
  if (message === 'ADVANCED') {
    await db.update(bjjUsers)
      .set({ contentPreference: 'ADVANCED' })
      .where(eq(bjjUsers.id, user.id));
    
    response = "✅ Switched to ADVANCED. You'll get complex techniques and competition moves. Reply FUNDAMENTALS or MIXED to change.";
    return response;
  }
  
  if (message === 'MIXED') {
    await db.update(bjjUsers)
      .set({ contentPreference: 'MIXED' })
      .where(eq(bjjUsers.id, user.id));
    
    response = "✅ Switched to MIXED. You'll get a balanced mix of basics and advanced content.";
    return response;
  }
  
  // 11. HELP
  if (message === 'HELP') {
    response = "Available commands:\n• TIME 7AM - change delivery time\n• PAUSE/RESUME - pause daily techniques\n• FUNDAMENTALS/MIXED/ADVANCED - adjust content level\n• SIMPLER - get more basic techniques\n• RECAP ON/OFF - toggle weekly recaps\n• COMP [date] - activate competition mode\n• FEEDBACK [message] - send us feedback";
    return response;
  }
  
  // 11. FEEDBACK
  if (message.startsWith('FEEDBACK ')) {
    const feedback = originalMessage.replace(/^FEEDBACK /i, '').trim();
    console.log(`Feedback from ${from}: ${feedback}`);
    response = "Thanks for the feedback! 🙏";
    return response;
  }
  
  // 12. COMPETITION MODE
  if (message.startsWith('COMP ')) {
    const dateStr = message.replace('COMP ', '').trim();
    const compDate = new Date(dateStr);
    
    if (!isNaN(compDate.getTime())) {
      const weeksUntil = Math.ceil((compDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000));
      
      await db.update(bjjUsers)
        .set({ competitionMode: true, compDate })
        .where(eq(bjjUsers.id, user.id));
      
      response = `⏱️ Competition mode activated! ${weeksUntil} weeks to go. You'll get high-percentage competition techniques focused on: back attacks, guard retention, submissions, and escapes. Good luck! 🏆`;
      return response;
    } else {
      response = "Invalid date. Try: COMP MARCH 15 or COMP 3/15/25";
      return response;
    }
  }
  
  // 13. BAD TECHNIQUE BAILOUT
  if (['BAD', 'SKIP', '👎', 'TERRIBLE'].includes(message)) {
    response = "Got it - here's a different one! 👇";
    
    // Generate new technique asynchronously
    (async () => {
      try {
        const technique = await generateDailyTechnique({
          beltLevel: user.beltLevel as any,
          style: user.style as any,
          focusAreas: user.focusAreas || undefined,
          lastTechniqueSent: user.lastTechniqueSent || undefined
        });
        
        const topVideo = technique.videos[0];
        const videoUrl = topVideo ? topVideo.urlWithTimestamp : '';
        const techniqueMessage = `🥋 ${technique.technique} - ${technique.instructor}\n\nKey Detail: ${technique.tip}\n\nWatch: ${videoUrl}`;
        
        const webhookUrl = `${process.env.REPLIT_DOMAINS || 'http://localhost:5000'}/api/webhooks/twilio/status`;
        await sendSMS(from, techniqueMessage, webhookUrl);
        
        // Update last technique sent
        await db.update(bjjUsers)
          .set({ lastTechniqueSent: technique.technique })
          .where(eq(bjjUsers.id, user.id));
      } catch (error) {
        console.error('Error generating replacement technique:', error);
      }
    })();
    
    return response;
  }
  
  // 14. ENTHUSIASTIC REPLIES - Send related techniques
  const enthusiasticKeywords = ['LOVE THIS', 'LOVE IT', 'AMAZING', 'AWESOME', 'YES', 'FIRE'];
  const hasEnthusiasticKeyword = enthusiasticKeywords.some(keyword => message.includes(keyword));
  const hasEnthusiasticEmoji = body.includes('🔥') || body.includes('❤️') || body.includes('👍') || body.includes('💪');
  
  if (message === 'MORE' || hasEnthusiasticKeyword || hasEnthusiasticEmoji) {
    // Check if user wants MORE or is being enthusiastic
    const isMoreCommand = message === 'MORE';
    
    // For MORE command, always generate
    // For enthusiastic replies, check if we already sent related techniques today
    if (isMoreCommand) {
      response = "🔄 Generating your next technique... (this may take 30 seconds)";
      
      (async () => {
        try {
          const technique = await generateDailyTechnique({
            beltLevel: user.beltLevel as any,
            style: user.style as any,
            focusAreas: user.focusAreas || undefined,
            lastTechniqueSent: user.lastTechniqueSent || undefined
          });
          
          const topVideo = technique.videos[0];
          const videoUrl = topVideo ? topVideo.urlWithTimestamp : '';
          const techniqueMessage = `🥋 ${technique.technique} - ${technique.instructor}\n\nKey Detail: ${technique.tip}\n\nWatch: ${videoUrl}`;
          
          const webhookUrl = `${process.env.REPLIT_DOMAINS || 'http://localhost:5000'}/api/webhooks/twilio/status`;
          await sendSMS(from, techniqueMessage, webhookUrl);
          
          await db.update(bjjUsers)
            .set({ lastTechniqueSent: technique.technique })
            .where(eq(bjjUsers.id, user.id));
        } catch (error) {
          console.error('Error generating MORE technique:', error);
        }
      })();
      
      return response;
    } else {
      // Enthusiastic reply - check if we already sent related techniques today
      const [engagement] = await db.select().from(userEngagement)
        .where(eq(userEngagement.userId, user.id));
      
      if (engagement?.relatedTechniquesSentToday) {
        response = "Glad you're loving it! 🥋 More techniques coming tomorrow!";
        return response;
      } else {
        response = "🔥 Glad you loved it! Sending related techniques...";
        
        // Generate related techniques (placeholder for now)
        (async () => {
          try {
            // TODO: Implement proper related techniques logic
            const relatedMessage = "🔥 Here are 2 related techniques:\n\n(Related techniques feature coming soon!)\n\nThis won't affect tomorrow's daily technique - see you at 8 AM! 💪";
            
            await sendSMS(from, relatedMessage);
            
            // Mark that we sent related techniques today
            if (engagement) {
              await db.update(userEngagement)
                .set({ relatedTechniquesSentToday: true })
                .where(eq(userEngagement.userId, user.id));
            } else {
              await db.insert(userEngagement).values({
                userId: user.id,
                relatedTechniquesSentToday: true
              });
            }
          } catch (error) {
            console.error('Error generating related techniques:', error);
          }
        })();
        
        return response;
      }
    }
  }
  
  // 15. DEFAULT/UNKNOWN
  response = "Thanks for your message! Reply HELP to see available commands.";
  return response;
}
