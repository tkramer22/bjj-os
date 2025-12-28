export interface ProfessorOSResponse {
  anticipatoryDiagnosis?: string;
  mainResponse: string;
  videoRecommendation?: {
    title: string;
    instructor: string;
    startTime: string;
    reason: string;
  };
  returnLoop: string;
  followUpQuestion?: string;
  trialUrgency?: string;
  patternObservation?: string;
}

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    anticipatoryDiagnosis: {
      type: "string",
      description: "Predictive diagnosis that anticipates their exact problem. Examples: 'Let me guess - you're losing them to the stack?', 'I bet opponents are smashing you flat', 'Probably losing it to the cross face?'. Use conversational, confident tone. ALWAYS include unless user is asking a simple factual question (what/when/where/who/how old)."
    },
    mainResponse: {
      type: "string",
      description: "Core coaching advice. Be specific, actionable, and reference their profile data naturally. Include video recommendations in [VIDEO: Title by Instructor | START: MM:SS] format if applicable."
    },
    videoRecommendation: {
      type: "object",
      properties: {
        title: { type: "string", description: "Full video title" },
        instructor: { type: "string", description: "Instructor name" },
        startTime: { type: "string", description: "Timestamp in MM:SS format" },
        reason: { type: "string", description: "Why THIS video solves THEIR specific problem" }
      },
      required: ["title", "instructor", "startTime", "reason"],
      additionalProperties: false,
      description: "Video recommendation details if suggesting a video"
    },
    returnLoop: {
      type: "string",
      description: "Create anticipation for next interaction. Examples: 'Try this tonight and text me how it feels', 'Come back after class with your results', 'Let me know tomorrow if the angle clicks'. REQUIRED field - always include."
    },
    followUpQuestion: {
      type: "string",
      description: "Open-ended question to continue conversation. Examples: 'What's harder for you - entry or finish?', 'Are you shooting from guard or scrambles?'"
    },
    trialUrgency: {
      type: "string",
      description: "If user has < 7 days in trial, mention days remaining and create subtle FOMO. Examples: '5 days left - let's nail this', '3 days to master your guard game'. Keep it motivating, not pushy."
    },
    patternObservation: {
      type: "string",
      description: "If user has pattern in conversation history, call it out. Examples: 'Triangle last week, now half guard - you're building bottom game', 'That's the 3rd time you've mentioned guard retention'"
    }
  },
  required: ["mainResponse", "returnLoop"],
  additionalProperties: false
} as const;
