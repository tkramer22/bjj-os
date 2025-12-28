// Professor OS Feedback Response System
// Varied, natural responses to avoid robotic feel

export interface FeedbackResponse {
  message: string;
  showAppreciation?: boolean;
  appreciationMessage?: string;
}

export function getProfessorOSFeedbackResponse(
  helpful: boolean,
  feedbackCategory?: string,
  totalFeedback?: number
): string {
  if (helpful) {
    // POSITIVE FEEDBACK RESPONSES (rotate randomly)
    const positiveResponses = [
      "Awesome! Glad that helped. 🙏\n\nYour feedback makes Professor OS smarter for everyone in the BJJ OS community.",
      
      "Perfect! That's what I wanted to hear. 🙏\n\nYour input helps hundreds of other practitioners get better recommendations.",
      
      "Great! Happy that video worked for you. 🙏\n\nEvery 👍 you give helps me learn what works for people like you.",
      
      "Nice! Glad I could help. 🙏\n\nYour feedback improves the experience for everyone training with BJJ OS.",
      
      "Excellent! That's the kind of technique that sticks. 🙏\n\nThanks for letting me know - it helps me recommend better videos."
    ];
    
    return positiveResponses[Math.floor(Math.random() * positiveResponses.length)];
  }
  
  // NEGATIVE FEEDBACK RESPONSES (by category)
  
  if (feedbackCategory === 'video_quality_poor') {
    const responses = [
      "Thanks for catching that. I'll review this video and likely remove it from the library.\n\nYour feedback helps keep the quality high for everyone. 🙏\n\nLet me find you a better video on the same topic:",
      
      "Good eye - I'll flag that video for review. If others report the same, it'll be removed.\n\nAppreciate you helping maintain quality. 🙏\n\nHere's a clearer video on that technique:",
      
      "Got it. That video shouldn't be in the library if the quality is poor.\n\nThanks for the feedback. 🙏\n\nLet me show you a better option:"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  if (feedbackCategory === 'wrong_recommendation') {
    const responses = [
      "Got it - I misunderstood what you needed. My bad.\n\nWhat were you actually looking for?\n\nYour feedback helps me understand you better. 🙏",
      
      "Ah, I missed the mark on that one. Sorry about that.\n\nTell me what you're looking for and I'll find it.\n\nThanks for the patience. 🙏",
      
      "My mistake - that wasn't what you were asking for.\n\nLet's try again. What do you need help with?\n\nYour feedback makes me better at understanding. 🙏"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  if (feedbackCategory === 'too_advanced') {
    const responses = [
      "Thanks for telling me. I jumped ahead - you're not ready for that yet.\n\nLet me show you the foundation technique first. 🙏\n\nWe'll get to the advanced stuff when you're ready.",
      
      "Good catch - that video was too complex for where you are right now.\n\nLet's start with the basics and build up. 🙏\n\nHere's the right level for you:",
      
      "You're right, I got ahead of myself. Let's take a step back.\n\nThis progression makes more sense for your level. 🙏\n\nHere's where to start:"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  if (feedbackCategory === 'too_basic') {
    const responses = [
      "Got it - you're past that. Thanks for letting me know your level.\n\nLet me show you the more advanced variation. 🙏\n\nYour feedback helps me understand where you are in your BJJ journey.",
      
      "Fair enough - that was too simple for you.\n\nHere's the intermediate/advanced version. 🙏\n\nThanks for helping me gauge your skill level better.",
      
      "You're right, you're beyond the basics on this one.\n\nLet's look at the advanced concepts. 🙏\n\nYour feedback helps me match your level better."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  if (feedbackCategory === 'wrong_style') {
    const responses = [
      "Ah, my mistake - I showed you gi and you train no-gi. I'll remember that.\n\nHere's the no-gi version. 🙏\n\nThanks for the feedback - it helps me match your training style better.",
      
      "Good point - wrong style. Let me find the right version for your training.\n\nHere you go. 🙏\n\nYour feedback helps me learn your preferences.",
      
      "You're right, I didn't match your training style. My bad.\n\nHere's the correct version. 🙏\n\nThanks for keeping me on track."
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Default negative feedback
  return "Got it - thanks for letting me know. This helps me get better at recommending videos.\n\nLet me find something more relevant for you. 🙏";
}

// APPRECIATION MESSAGE (every 10th feedback)
export function getAppreciationMessage(totalFeedback: number): string {
  const messages = [
    `By the way - you've given feedback on ${totalFeedback} videos now. 🙏\n\nYour input has helped improve recommendations for hundreds of other practitioners in the BJJ OS community.\n\nEvery 👍 or 👎 you give makes me smarter for everyone. Thanks for contributing.`,
    
    `Quick note: You've rated ${totalFeedback} videos! 🙏\n\nThat feedback has directly improved the experience for everyone using BJJ OS. You're helping build a better training tool for the whole community.\n\nAppreciate you.`,
    
    `Just realized - you've given ${totalFeedback} ratings now. 🙏\n\nYour feedback has helped remove bad videos, improve recommendations, and make BJJ OS better for everyone.\n\nThanks for being an active part of the community.`
  ];
  
  return messages[Math.floor(Math.random() * messages.length)];
}

export function shouldShowAppreciation(
  totalFeedback: number,
  lastAppreciationShownAt: Date | null
): boolean {
  // Show every 10th feedback
  if (totalFeedback % 10 !== 0) {
    return false;
  }
  
  // But not more often than once per 24 hours
  if (lastAppreciationShownAt) {
    const hoursSince = (Date.now() - lastAppreciationShownAt.getTime()) / (1000 * 60 * 60);
    if (hoursSince < 24) {
      return false;
    }
  }
  
  return true;
}
