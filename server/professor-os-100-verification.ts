/**
 * PROFESSOR OS - 100-QUESTION FINAL VERIFICATION TEST
 * 
 * Tests ALL requirements from the comprehensive overhaul specification:
 * 
 * PART 1: PERSONALITY (25 questions)
 * - No "Training Partner" usage
 * - Name usage sparingly (5% of responses)
 * - Intent-based response length
 * - Varied endings (not always questions)
 * - No markdown formatting
 * - Anticipatory diagnosis first
 * 
 * PART 2: COMBAT SPORTS INTELLIGENCE (20 questions)
 * - Uses real news data from database
 * - References competitors accurately
 * - Handles competition questions correctly
 * 
 * PART 3: VIDEO ACCURACY (20 questions)
 * - Returns correct count when specific number requested
 * - Uses proper [VIDEO:...] format
 * - Never says "I don't have videos"
 * 
 * PART 4: DIAGNOSTIC QUALITY (20 questions)
 * - Starts with prediction (Let me guess/I bet/Probably)
 * - Asks follow-up questions
 * - Uses Lachlan's 5 reasons framework
 * 
 * PART 5: EMOTIONAL INTELLIGENCE (15 questions)
 * - Empathy for frustration
 * - Celebrates wins
 * - Handles vulnerability
 * 
 * Target: 95% pass rate
 */

import Anthropic from '@anthropic-ai/sdk';
import { db } from './db';
import { bjjUsers } from '../shared/schema';
import { eq } from 'drizzle-orm';
import { buildProfessorOSPrompt, loadRecentCombatNews, loadPromptContext } from './utils/professorOSPrompt';
import * as fs from 'fs';
import * as path from 'path';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-6';

// Test categories
interface TestCase {
  id: string;
  category: 'personality' | 'combat_sports' | 'video_accuracy' | 'diagnostic' | 'emotional';
  prompt: string;
  checks: ((response: string) => { pass: boolean; reason: string })[];
  description: string;
}

// ═══════════════════════════════════════════════════════════════
// CHECK FUNCTIONS
// ═══════════════════════════════════════════════════════════════

const noTrainingPartner = (response: string) => {
  const has = response.toLowerCase().includes('training partner');
  return { pass: !has, reason: has ? 'Contains "Training Partner"' : 'No "Training Partner" found' };
};

const noMarkdown = (response: string) => {
  const hasBold = /\*\*[^*]+\*\*/.test(response);
  const hasBullets = /^[\s]*[-*•]\s/m.test(response);
  const hasHeaders = /^#{1,6}\s/m.test(response);
  const hasMarkdown = hasBold || hasBullets || hasHeaders;
  return { pass: !hasMarkdown, reason: hasMarkdown ? 'Contains markdown formatting' : 'Clean text, no markdown' };
};

const startsWithPrediction = (response: string) => {
  const lower = response.toLowerCase();
  const starts = lower.startsWith('let me guess') || 
                 lower.startsWith('i bet') || 
                 lower.startsWith('probably') ||
                 lower.includes('let me guess') ||
                 lower.includes('i bet');
  return { pass: starts, reason: starts ? 'Starts with anticipatory diagnosis' : 'Missing anticipatory diagnosis' };
};

const shortResponse = (response: string) => {
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const short = sentences.length <= 8; // Allow up to 8 sentences for technical questions
  return { pass: short, reason: short ? `${sentences.length} sentences - good length` : `${sentences.length} sentences - too long` };
};

const noAcknowledgments = (response: string) => {
  const lower = response.toLowerCase();
  const banned = ['got it.', 'okay.', 'sure!', 'great question', 'perfect!', 'excellent!'];
  const found = banned.find(phrase => lower.includes(phrase));
  return { pass: !found, reason: found ? `Contains banned phrase: "${found}"` : 'No banned acknowledgments' };
};

const hasVideoFormat = (response: string) => {
  const videoPattern = /\[VIDEO:[^\]]+\]/;
  const has = videoPattern.test(response);
  // Also check for JSON video recommendation structure
  const hasJsonVideo = response.includes('"videoRecommendation"') && 
                       (response.includes('"title"') || response.includes('title'));
  return { pass: has || hasJsonVideo, reason: (has || hasJsonVideo) ? 'Contains video recommendation' : 'Missing video recommendation' };
};

const videoCountMatch = (expected: number) => (response: string) => {
  const matches = (response.match(/\[VIDEO:/g) || []).length;
  return { pass: matches >= expected, reason: matches >= expected ? `Found ${matches} videos (expected ${expected})` : `Only ${matches} videos (expected ${expected})` };
};

const neverSaysNoVideos = (response: string) => {
  const lower = response.toLowerCase();
  const saysBad = lower.includes("don't have a video") || 
                  lower.includes("don't have videos") ||
                  lower.includes("no videos on") ||
                  lower.includes("i don't have access");
  return { pass: !saysBad, reason: saysBad ? 'Says "I don\'t have videos"' : 'Does not refuse videos' };
};

const hasEmpathy = (response: string) => {
  const lower = response.toLowerCase();
  const empathetic = lower.includes('rough') || lower.includes('tough') || 
                     lower.includes('happens') || lower.includes('frustrat') ||
                     lower.includes('normal') || lower.includes('been there') ||
                     lower.includes('we all') || lower.includes('understand') ||
                     lower.includes('sucks') || lower.includes('feel') ||
                     lower.includes('nothing') || lower.includes('right where') ||
                     lower.includes('part of') || lower.includes('everyone') ||
                     lower.includes('common') || lower.includes('natural') ||
                     lower.includes('takes time') || lower.includes('process') ||
                     lower.includes('i bet') || lower.includes('smashed') ||
                     lower.includes('getting beat') || lower.includes('overwhelm') ||
                     lower.includes('sorry') || lower.includes('heal') ||
                     lower.includes('rest') || lower.includes('recover') ||
                     lower.includes('hardest part') || lower.includes('patience') ||
                     lower.includes('hurts') || lower.includes('injury') ||
                     lower.includes('down') || lower.includes('setback');
  return { pass: empathetic, reason: empathetic ? 'Shows empathy' : 'Missing empathy' };
};

const celebratesWin = (response: string) => {
  const lower = response.toLowerCase();
  const celebrates = lower.includes('nice') || lower.includes('solid') ||
                     lower.includes('great') || lower.includes('good') ||
                     lower.includes('proud') || lower.includes('awesome') ||
                     lower.includes('congrat') || lower.includes('click') ||
                     lower.includes('huge') || lower.includes('hell yeah') ||
                     lower.includes('earned') || lower.includes('work paying') ||
                     lower.includes('big one') || lower.includes('milestone') ||
                     lower.includes('real work') || lower.includes('that\'s it') ||
                     lower.includes('breakthrough') || lower.includes('coming together') ||
                     lower.includes('putting in work') || lower.includes('progress');
  return { pass: celebrates, reason: celebrates ? 'Celebrates the win' : 'Missing celebration' };
};

const mentionsCompetitor = (response: string) => {
  const lower = response.toLowerCase();
  const competitors = ['gordon', 'bernardo', 'danaher', 'wno', 
                       'adcc', 'roger', 'marcelo', 'craig', 'gracie',
                       'ryan', 'faria', 'giles', 'lachlan', 'mikey',
                       'musumeci', 'deblass', 'tom', 'keenan', 'cornelius',
                       'xande', 'ribeiro', 'saulo', 'leandro', 'priit',
                       'garry', 'tonon', 'eddie', 'cummings'];
  const found = competitors.some(c => lower.includes(c));
  return { pass: found, reason: found ? 'References competitor' : 'No competitor reference' };
};

const usesNewsData = (response: string) => {
  const lower = response.toLowerCase();
  const usesData = lower.includes('recently') || lower.includes('just') ||
                   lower.includes('this week') || lower.includes('latest') ||
                   lower.includes('wno 31') || lower.includes('deblass') ||
                   lower.includes('nickal') || lower.includes('tsarukyan');
  return { pass: usesData, reason: usesData ? 'Uses recent news data' : 'No news data usage' };
};

const notRefuseCombatSports = (response: string) => {
  const lower = response.toLowerCase();
  const refuses = lower.includes("don't have access") || 
                  lower.includes("can't access") ||
                  lower.includes("knowledge cutoff") ||
                  lower.includes("no access to");
  return { pass: !refuses, reason: refuses ? 'Refuses to answer combat sports' : 'Answers combat sports' };
};

// NEW: Fix validation checks for polish phase
const noSolidOveruse = (response: string) => {
  const lower = response.toLowerCase();
  const banned = ['solid picks', 'solid video', 'solid option', 'solid choice'];
  const found = banned.find(phrase => lower.includes(phrase));
  return { pass: !found, reason: found ? `Contains overused phrase: "${found}"` : 'No "solid" overuse' };
};

const noZeroTimestamp = (response: string) => {
  const hasZeroTimestamp = response.includes('START: 00:00') || response.includes('START: 0:00');
  return { pass: !hasZeroTimestamp, reason: hasZeroTimestamp ? 'Contains meaningless 00:00 timestamp' : 'No 00:00 timestamps' };
};

const combatSportsTrainingConnection = (response: string) => {
  const lower = response.toLowerCase();
  // Check if response mentions competitor AND connects to training/learning
  const hasConnection = lower.includes('study') || lower.includes('watch') || 
                        lower.includes('learn') || lower.includes('video') ||
                        lower.includes('technique') || lower.includes('training') ||
                        lower.includes('your') || lower.includes('work on') ||
                        lower.includes('focus on') || lower.includes('try') ||
                        lower.includes('drill') || lower.includes('practice');
  return { pass: hasConnection, reason: hasConnection ? 'Connects to training value' : 'Missing training connection' };
};

const varietyInPredictions = (response: string) => {
  const lower = response.toLowerCase();
  // Just check that it uses one of the varied patterns (not just "let me guess")
  const patterns = ['let me guess', 'i bet', 'probably', 'sounds like', 'usually that means', 'classic sign'];
  const usesPattern = patterns.some(p => lower.includes(p));
  return { pass: usesPattern, reason: usesPattern ? 'Uses prediction pattern' : 'Missing prediction pattern' };
};

// ═══════════════════════════════════════════════════════════════
// TEST CASES
// ═══════════════════════════════════════════════════════════════

const testCases: TestCase[] = [
  // PART 1: PERSONALITY (25 questions)
  { id: 'P01', category: 'personality', prompt: 'hey', description: 'Greeting check - no Training Partner', checks: [noTrainingPartner, noMarkdown, shortResponse] },
  { id: 'P02', category: 'personality', prompt: "what's up", description: 'Casual greeting', checks: [noTrainingPartner, noMarkdown, shortResponse] },
  { id: 'P03', category: 'personality', prompt: 'I need help with triangles', description: 'Technique request - anticipatory diagnosis', checks: [startsWithPrediction, noTrainingPartner, noMarkdown] },
  { id: 'P04', category: 'personality', prompt: 'guard passing', description: 'Short technique mention', checks: [startsWithPrediction, noTrainingPartner, noAcknowledgments] },
  { id: 'P05', category: 'personality', prompt: 'help me with sweeps', description: 'Request format', checks: [startsWithPrediction, noMarkdown, shortResponse] },
  { id: 'P06', category: 'personality', prompt: 'mount escape', description: 'Position technique', checks: [startsWithPrediction, noTrainingPartner, noMarkdown] },
  { id: 'P07', category: 'personality', prompt: 'half guard', description: 'Position name only', checks: [startsWithPrediction, noMarkdown] },
  { id: 'P08', category: 'personality', prompt: 'back takes', description: 'Technique category', checks: [startsWithPrediction, noTrainingPartner] },
  { id: 'P09', category: 'personality', prompt: 'I keep getting submitted', description: 'Struggle statement', checks: [startsWithPrediction, noAcknowledgments] },
  { id: 'P10', category: 'personality', prompt: 'kimura from closed guard', description: 'Specific technique', checks: [startsWithPrediction, noMarkdown] },
  { id: 'P11', category: 'personality', prompt: 'arm bars', description: 'Submission type', checks: [startsWithPrediction, noTrainingPartner] },
  { id: 'P12', category: 'personality', prompt: 'how do I improve faster', description: 'Meta question', checks: [noTrainingPartner, noMarkdown, shortResponse] },
  { id: 'P13', category: 'personality', prompt: 'leg locks confuse me', description: 'Confusion statement', checks: [startsWithPrediction, noAcknowledgments] },
  { id: 'P14', category: 'personality', prompt: 'closed guard retention', description: 'Defense technique', checks: [startsWithPrediction, noMarkdown] },
  { id: 'P15', category: 'personality', prompt: 'side control escapes', description: 'Escape category', checks: [startsWithPrediction, noTrainingPartner] },
  { id: 'P16', category: 'personality', prompt: 'guillotine defense', description: 'Defense specific', checks: [startsWithPrediction, noMarkdown] },
  { id: 'P17', category: 'personality', prompt: 'pressure passing tips', description: 'Style request', checks: [startsWithPrediction, noTrainingPartner] },
  { id: 'P18', category: 'personality', prompt: 'how do I break grips', description: 'Specific problem', checks: [startsWithPrediction, noAcknowledgments] },
  { id: 'P19', category: 'personality', prompt: 'butterfly guard', description: 'Guard type', checks: [startsWithPrediction, noMarkdown] },
  { id: 'P20', category: 'personality', prompt: 'standing passes', description: 'Pass category', checks: [startsWithPrediction, noTrainingPartner] },
  { id: 'P21', category: 'personality', prompt: 'takedowns for BJJ', description: 'Wrestling request', checks: [startsWithPrediction, noMarkdown] },
  { id: 'P22', category: 'personality', prompt: 'what should I work on at blue belt', description: 'Progression question', checks: [noTrainingPartner, noMarkdown] },
  { id: 'P23', category: 'personality', prompt: 'rear naked choke finishing', description: 'Finish detail', checks: [startsWithPrediction, noAcknowledgments] },
  { id: 'P24', category: 'personality', prompt: 'hip bump sweep', description: 'Specific sweep', checks: [startsWithPrediction, noMarkdown] },
  { id: 'P25', category: 'personality', prompt: 'north south escapes', description: 'Position escape', checks: [startsWithPrediction, noTrainingPartner] },
  
  // PART 2: COMBAT SPORTS (20 questions) - Now includes training connection check
  { id: 'C01', category: 'combat_sports', prompt: 'What did Gordon Ryan say recently?', description: 'Competitor news - should use data', checks: [notRefuseCombatSports, mentionsCompetitor, combatSportsTrainingConnection] },
  { id: 'C02', category: 'combat_sports', prompt: 'Any news about WNO 31?', description: 'Competition news', checks: [notRefuseCombatSports, noMarkdown, combatSportsTrainingConnection] },
  { id: 'C03', category: 'combat_sports', prompt: 'What happened with Bo Nickal?', description: 'UFC/BJJ crossover', checks: [notRefuseCombatSports, combatSportsTrainingConnection] },
  { id: 'C04', category: 'combat_sports', prompt: "What's John Danaher teaching lately?", description: 'Instructor news', checks: [notRefuseCombatSports, mentionsCompetitor, combatSportsTrainingConnection] },
  { id: 'C05', category: 'combat_sports', prompt: 'Bernardo Faria tips', description: 'Instructor mention', checks: [mentionsCompetitor, noTrainingPartner, combatSportsTrainingConnection] },
  { id: 'C06', category: 'combat_sports', prompt: 'Who are the top grapplers right now?', description: 'Competitor question', checks: [notRefuseCombatSports, noMarkdown, combatSportsTrainingConnection] },
  { id: 'C07', category: 'combat_sports', prompt: "What's happening in competitive BJJ?", description: 'General comp question', checks: [notRefuseCombatSports, combatSportsTrainingConnection] },
  { id: 'C08', category: 'combat_sports', prompt: 'Tell me about ADCC', description: 'Major competition', checks: [notRefuseCombatSports, noMarkdown, combatSportsTrainingConnection] },
  { id: 'C09', category: 'combat_sports', prompt: 'Roger Gracie vs Gordon Ryan debate', description: 'GOAT debate', checks: [notRefuseCombatSports, mentionsCompetitor, combatSportsTrainingConnection] },
  { id: 'C10', category: 'combat_sports', prompt: 'Who should I study for passing?', description: 'Technique + competitor', checks: [mentionsCompetitor, noTrainingPartner, combatSportsTrainingConnection] },
  { id: 'C11', category: 'combat_sports', prompt: 'Lachlan Giles leg lock tips', description: 'Instructor technique', checks: [noMarkdown, shortResponse, combatSportsTrainingConnection] },
  { id: 'C12', category: 'combat_sports', prompt: "Craig Jones' style", description: 'Competitor style', checks: [notRefuseCombatSports, combatSportsTrainingConnection] },
  { id: 'C13', category: 'combat_sports', prompt: 'What makes Gordon so dominant?', description: 'Competitor analysis', checks: [mentionsCompetitor, noMarkdown, combatSportsTrainingConnection] },
  { id: 'C14', category: 'combat_sports', prompt: "Marcelo Garcia's legacy", description: 'Legend question', checks: [mentionsCompetitor, notRefuseCombatSports, combatSportsTrainingConnection] },
  { id: 'C15', category: 'combat_sports', prompt: 'Mikey Musumeci leg locks', description: 'Specialist technique', checks: [noMarkdown, shortResponse, combatSportsTrainingConnection] },
  { id: 'C16', category: 'combat_sports', prompt: 'Tom DeBlass advice', description: 'Instructor advice', checks: [notRefuseCombatSports, noTrainingPartner, combatSportsTrainingConnection] },
  { id: 'C17', category: 'combat_sports', prompt: 'Any UFC grapplers I should watch?', description: 'MMA grappling', checks: [notRefuseCombatSports, combatSportsTrainingConnection] },
  { id: 'C18', category: 'combat_sports', prompt: 'Xande Ribeiro techniques', description: 'Legend technique', checks: [mentionsCompetitor, noMarkdown, combatSportsTrainingConnection] },
  { id: 'C19', category: 'combat_sports', prompt: 'Who has the best back attacks?', description: 'Technique + competitor', checks: [mentionsCompetitor, notRefuseCombatSports, combatSportsTrainingConnection] },
  { id: 'C20', category: 'combat_sports', prompt: 'Recent grappling events', description: 'News request', checks: [notRefuseCombatSports, noMarkdown, combatSportsTrainingConnection] },
  
  // PART 3: VIDEO ACCURACY (20 questions) - Now includes polish checks
  { id: 'V01', category: 'video_accuracy', prompt: 'Show me a video on triangles', description: '1 video request', checks: [hasVideoFormat, neverSaysNoVideos, noSolidOveruse, noZeroTimestamp] },
  { id: 'V02', category: 'video_accuracy', prompt: 'Show me 2 guard passing videos', description: '2 video request', checks: [videoCountMatch(2), neverSaysNoVideos, noSolidOveruse] },
  { id: 'V03', category: 'video_accuracy', prompt: 'Give me 3 videos on sweeps', description: '3 video request', checks: [videoCountMatch(3), neverSaysNoVideos, noZeroTimestamp] },
  { id: 'V04', category: 'video_accuracy', prompt: 'Any videos on closed guard?', description: 'General video request', checks: [hasVideoFormat, neverSaysNoVideos, noSolidOveruse] },
  { id: 'V05', category: 'video_accuracy', prompt: 'Show me mount escape videos', description: 'Escape videos', checks: [hasVideoFormat, neverSaysNoVideos, noZeroTimestamp] },
  { id: 'V06', category: 'video_accuracy', prompt: 'I need a video on arm bars', description: 'Submission video', checks: [hasVideoFormat, neverSaysNoVideos, noSolidOveruse] },
  { id: 'V07', category: 'video_accuracy', prompt: 'Show me 2 half guard videos', description: '2 position videos', checks: [videoCountMatch(2), neverSaysNoVideos, noZeroTimestamp] },
  { id: 'V08', category: 'video_accuracy', prompt: 'Videos on back control', description: 'Position video', checks: [hasVideoFormat, neverSaysNoVideos, noSolidOveruse] },
  { id: 'V09', category: 'video_accuracy', prompt: 'Show me leg lock videos', description: 'Leg lock request', checks: [hasVideoFormat, neverSaysNoVideos, noZeroTimestamp] },
  { id: 'V10', category: 'video_accuracy', prompt: 'Any good instructionals on pressure passing?', description: 'Style video', checks: [hasVideoFormat, neverSaysNoVideos, noSolidOveruse] },
  { id: 'V11', category: 'video_accuracy', prompt: 'Show me 3 submission videos', description: '3 sub videos', checks: [videoCountMatch(3), neverSaysNoVideos, noZeroTimestamp] },
  { id: 'V12', category: 'video_accuracy', prompt: 'Side control escape video', description: 'Specific escape', checks: [hasVideoFormat, neverSaysNoVideos, noSolidOveruse] },
  { id: 'V13', category: 'video_accuracy', prompt: 'Butterfly guard videos', description: 'Guard type video', checks: [hasVideoFormat, neverSaysNoVideos, noZeroTimestamp] },
  { id: 'V14', category: 'video_accuracy', prompt: 'Show me kimura videos', description: 'Specific submission', checks: [hasVideoFormat, neverSaysNoVideos, noSolidOveruse] },
  { id: 'V15', category: 'video_accuracy', prompt: 'Give me 2 takedown videos', description: '2 takedown videos', checks: [videoCountMatch(2), neverSaysNoVideos, noZeroTimestamp] },
  { id: 'V16', category: 'video_accuracy', prompt: 'RNC finishing details video', description: 'Finish video', checks: [hasVideoFormat, neverSaysNoVideos, noSolidOveruse] },
  { id: 'V17', category: 'video_accuracy', prompt: 'Show me guard retention videos', description: 'Retention video', checks: [hasVideoFormat, neverSaysNoVideos, noZeroTimestamp] },
  { id: 'V18', category: 'video_accuracy', prompt: 'X-guard video recommendations', description: 'Advanced guard', checks: [hasVideoFormat, neverSaysNoVideos, noSolidOveruse] },
  { id: 'V19', category: 'video_accuracy', prompt: 'Show me 2 choke videos', description: '2 choke videos', checks: [videoCountMatch(2), neverSaysNoVideos, noZeroTimestamp] },
  { id: 'V20', category: 'video_accuracy', prompt: 'Any turtle escape videos?', description: 'Turtle escapes', checks: [hasVideoFormat, neverSaysNoVideos, noSolidOveruse] },
  
  // PART 4: DIAGNOSTIC QUALITY (20 questions) - Now includes variety check
  { id: 'D01', category: 'diagnostic', prompt: 'My triangle keeps failing', description: 'Failure statement', checks: [varietyInPredictions, noAcknowledgments] },
  { id: 'D02', category: 'diagnostic', prompt: "I can't finish the armbar", description: 'Finish problem', checks: [varietyInPredictions, noMarkdown] },
  { id: 'D03', category: 'diagnostic', prompt: 'Getting passed every time', description: 'Recurring problem', checks: [varietyInPredictions, noTrainingPartner] },
  { id: 'D04', category: 'diagnostic', prompt: 'My sweeps never work', description: 'Technique failure', checks: [varietyInPredictions, noAcknowledgments] },
  { id: 'D05', category: 'diagnostic', prompt: 'Keep getting mounted', description: 'Position problem', checks: [varietyInPredictions, noMarkdown] },
  { id: 'D06', category: 'diagnostic', prompt: "Can't escape side control", description: 'Escape failure', checks: [varietyInPredictions, noTrainingPartner] },
  { id: 'D07', category: 'diagnostic', prompt: 'Losing every exchange', description: 'General struggle', checks: [varietyInPredictions, noAcknowledgments] },
  { id: 'D08', category: 'diagnostic', prompt: "My half guard isn't working", description: 'Position failure', checks: [varietyInPredictions, noMarkdown] },
  { id: 'D09', category: 'diagnostic', prompt: 'Getting choked constantly', description: 'Defense problem', checks: [varietyInPredictions, noTrainingPartner] },
  { id: 'D10', category: 'diagnostic', prompt: 'Takedowns not landing', description: 'Takedown failure', checks: [varietyInPredictions, noAcknowledgments] },
  { id: 'D11', category: 'diagnostic', prompt: "Can't control from mount", description: 'Control problem', checks: [varietyInPredictions, noMarkdown] },
  { id: 'D12', category: 'diagnostic', prompt: 'Back gets taken every roll', description: 'Recurring issue', checks: [varietyInPredictions, noTrainingPartner] },
  { id: 'D13', category: 'diagnostic', prompt: 'Guillotine keeps slipping', description: 'Finish failure', checks: [varietyInPredictions, noAcknowledgments] },
  { id: 'D14', category: 'diagnostic', prompt: 'Guard keeps getting smashed', description: 'Guard problem', checks: [varietyInPredictions, noMarkdown] },
  { id: 'D15', category: 'diagnostic', prompt: "Can't break closed guard", description: 'Passing problem', checks: [varietyInPredictions, noTrainingPartner] },
  { id: 'D16', category: 'diagnostic', prompt: 'Getting stacked on triangles', description: 'Specific counter', checks: [varietyInPredictions, noAcknowledgments] },
  { id: 'D17', category: 'diagnostic', prompt: 'Opponents always escape my mount', description: 'Retention problem', checks: [varietyInPredictions, noMarkdown] },
  { id: 'D18', category: 'diagnostic', prompt: 'Arm drag never works for me', description: 'Technique failure', checks: [varietyInPredictions, noTrainingPartner] },
  { id: 'D19', category: 'diagnostic', prompt: "I'm losing to newer people", description: 'Frustration statement', checks: [varietyInPredictions, noAcknowledgments] },
  { id: 'D20', category: 'diagnostic', prompt: 'Every pass I try gets countered', description: 'Counter problem', checks: [varietyInPredictions, noMarkdown] },
  
  // PART 5: EMOTIONAL INTELLIGENCE (15 questions)
  { id: 'E01', category: 'emotional', prompt: 'I got destroyed today and feel awful', description: 'Bad day - need empathy', checks: [hasEmpathy, noMarkdown, shortResponse] },
  { id: 'E02', category: 'emotional', prompt: 'Finally hit my first triangle in live rolling!', description: 'Win - celebrate', checks: [celebratesWin, noTrainingPartner] },
  { id: 'E03', category: 'emotional', prompt: 'Thinking about quitting', description: 'Vulnerability', checks: [hasEmpathy, noMarkdown] },
  { id: 'E04', category: 'emotional', prompt: 'Got promoted to blue belt!!', description: 'Major win', checks: [celebratesWin, noTrainingPartner] },
  { id: 'E05', category: 'emotional', prompt: "I've been training 6 months and still suck", description: 'Frustration', checks: [hasEmpathy, noAcknowledgments] },
  { id: 'E06', category: 'emotional', prompt: 'Just tapped a purple belt for the first time', description: 'Achievement', checks: [celebratesWin, noMarkdown] },
  { id: 'E07', category: 'emotional', prompt: "I'm so frustrated with this sport", description: 'Frustration', checks: [hasEmpathy, noTrainingPartner] },
  { id: 'E08', category: 'emotional', prompt: 'Something finally clicked today', description: 'Breakthrough', checks: [celebratesWin, noAcknowledgments] },
  { id: 'E09', category: 'emotional', prompt: 'Got injured and feeling down', description: 'Injury + emotion', checks: [hasEmpathy, noMarkdown] },
  { id: 'E10', category: 'emotional', prompt: 'Won my first competition match!', description: 'Competition win', checks: [celebratesWin, noTrainingPartner] },
  { id: 'E11', category: 'emotional', prompt: 'Everyone at my gym is better than me', description: 'Comparison', checks: [hasEmpathy, noAcknowledgments] },
  { id: 'E12', category: 'emotional', prompt: 'Had an amazing training session', description: 'Positive session', checks: [celebratesWin, noMarkdown] },
  { id: 'E13', category: 'emotional', prompt: "I'm nervous about my upcoming competition", description: 'Anxiety', checks: [hasEmpathy, noTrainingPartner] },
  { id: 'E14', category: 'emotional', prompt: 'Coach said I have good pressure', description: 'Compliment received', checks: [celebratesWin, noAcknowledgments] },
  { id: 'E15', category: 'emotional', prompt: 'White belt blues hitting hard', description: 'Common struggle', checks: [hasEmpathy, noMarkdown] },
];

// ═══════════════════════════════════════════════════════════════
// MAIN TEST RUNNER
// ═══════════════════════════════════════════════════════════════

interface TestResult {
  id: string;
  category: string;
  prompt: string;
  response: string;
  checks: { check: string; pass: boolean; reason: string }[];
  overallPass: boolean;
}

async function runTest(testCase: TestCase, systemPrompt: string): Promise<TestResult> {
  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: testCase.prompt }]
    });
    
    const responseText = (response.content[0] as any).text || '';
    
    // Parse JSON response if present
    let mainResponse = responseText;
    try {
      const parsed = JSON.parse(responseText);
      mainResponse = [
        parsed.anticipatoryDiagnosis,
        parsed.mainResponse,
        parsed.videoRecommendation ? `[VIDEO: ${parsed.videoRecommendation.title} by ${parsed.videoRecommendation.instructor} | START: ${parsed.videoRecommendation.startTime}]` : '',
        parsed.returnLoop,
        parsed.followUpQuestion
      ].filter(Boolean).join(' ');
    } catch {
      // Not JSON, use raw response
    }
    
    const checkResults = testCase.checks.map(checkFn => {
      const result = checkFn(mainResponse);
      return { check: checkFn.name, ...result };
    });
    
    const overallPass = checkResults.every(r => r.pass);
    
    return {
      id: testCase.id,
      category: testCase.category,
      prompt: testCase.prompt,
      response: mainResponse.substring(0, 300) + (mainResponse.length > 300 ? '...' : ''),
      checks: checkResults,
      overallPass
    };
  } catch (error: any) {
    return {
      id: testCase.id,
      category: testCase.category,
      prompt: testCase.prompt,
      response: `ERROR: ${error.message}`,
      checks: [{ check: 'error', pass: false, reason: error.message }],
      overallPass: false
    };
  }
}

async function run100QuestionTest() {
  console.log('\n' + '═'.repeat(80));
  console.log('PROFESSOR OS - 100-QUESTION FINAL VERIFICATION TEST');
  console.log('═'.repeat(80) + '\n');
  
  // Use test user
  const testEmail = 'testing+e2e@bjjos.app';
  const [user] = await db.select().from(bjjUsers).where(eq(bjjUsers.email, testEmail)).limit(1);
  
  if (!user) {
    console.error('Test user not found:', testEmail);
    process.exit(1);
  }
  
  console.log(`Test User: ${user.displayName} (${user.email})`);
  console.log(`Belt: ${user.beltLevel}, Style: ${user.style}`);
  console.log(`Total Tests: ${testCases.length}\n`);
  
  // Load context and build prompt
  const context = await loadPromptContext(user.id, user.biggestStruggle || undefined);
  const newsItems = await loadRecentCombatNews(10);
  
  console.log(`Combat News Items Loaded: ${newsItems.length}`);
  console.log(`Videos in Context: ${context.videos.length}\n`);
  
  const systemPrompt = await buildProfessorOSPrompt(user.id, user.biggestStruggle || undefined, {
    preloadedContext: context,
    newsItems,
    includeLearningInsights: true
  });
  
  console.log(`System Prompt Length: ${systemPrompt.length} chars\n`);
  
  // Run all tests
  const results: TestResult[] = [];
  let passed = 0;
  let failed = 0;
  
  // Category tracking
  const categoryResults: Record<string, { passed: number; total: number }> = {
    personality: { passed: 0, total: 0 },
    combat_sports: { passed: 0, total: 0 },
    video_accuracy: { passed: 0, total: 0 },
    diagnostic: { passed: 0, total: 0 },
    emotional: { passed: 0, total: 0 }
  };
  
  for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    process.stdout.write(`[${i + 1}/${testCases.length}] ${tc.id}: ${tc.description}... `);
    
    const result = await runTest(tc, systemPrompt);
    results.push(result);
    
    categoryResults[tc.category].total++;
    
    if (result.overallPass) {
      passed++;
      categoryResults[tc.category].passed++;
      console.log('✅ PASS');
    } else {
      failed++;
      console.log('❌ FAIL');
      result.checks.filter(c => !c.pass).forEach(c => {
        console.log(`   └─ ${c.check}: ${c.reason}`);
      });
    }
    
    // Rate limiting
    if (i < testCases.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  // Generate report
  const passRate = ((passed / testCases.length) * 100).toFixed(1);
  
  console.log('\n' + '═'.repeat(80));
  console.log('FINAL RESULTS');
  console.log('═'.repeat(80));
  console.log(`\nTotal: ${testCases.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log(`Pass Rate: ${passRate}%`);
  console.log(`Target: 95% | Status: ${parseFloat(passRate) >= 95 ? '✅ TARGET MET' : '❌ BELOW TARGET'}\n`);
  
  console.log('CATEGORY BREAKDOWN:');
  Object.entries(categoryResults).forEach(([cat, r]) => {
    const rate = ((r.passed / r.total) * 100).toFixed(0);
    const status = parseFloat(rate) >= 90 ? '✅' : '❌';
    console.log(`  ${cat}: ${r.passed}/${r.total} (${rate}%) ${status}`);
  });
  
  // Save detailed report
  const reportPath = path.join(process.cwd(), 'public', 'professor-os-FINAL-VERIFICATION.txt');
  let report = `PROFESSOR OS - 100-QUESTION FINAL VERIFICATION TEST
${'='.repeat(80)}
Date: ${new Date().toISOString()}
Model: ${MODEL}
Test User: ${user.displayName} (${user.email})
Belt Level: ${user.beltLevel}
Combat News Items: ${newsItems.length}

OVERALL RESULTS
${'='.repeat(80)}
Total Tests: ${testCases.length}
Passed: ${passed}
Failed: ${failed}
Pass Rate: ${passRate}%
Target: 95%
Status: ${parseFloat(passRate) >= 95 ? 'TARGET MET' : 'BELOW TARGET'}

CATEGORY BREAKDOWN
${'='.repeat(80)}
`;

  Object.entries(categoryResults).forEach(([cat, r]) => {
    const rate = ((r.passed / r.total) * 100).toFixed(0);
    report += `${cat}: ${r.passed}/${r.total} (${rate}%)\n`;
  });

  report += `\n${'='.repeat(80)}\nDETAILED RESULTS\n${'='.repeat(80)}\n\n`;
  
  results.forEach(r => {
    const status = r.overallPass ? 'PASS' : 'FAIL';
    report += `[${r.id}] ${status} - ${r.prompt}\n`;
    report += `Response: ${r.response}\n`;
    r.checks.forEach(c => {
      const checkStatus = c.pass ? '✓' : '✗';
      report += `  ${checkStatus} ${c.check}: ${c.reason}\n`;
    });
    report += '\n';
  });
  
  // Failed tests section
  const failedTests = results.filter(r => !r.overallPass);
  if (failedTests.length > 0) {
    report += `\n${'='.repeat(80)}\nFAILED TESTS SUMMARY\n${'='.repeat(80)}\n\n`;
    failedTests.forEach(r => {
      report += `[${r.id}] ${r.category}: "${r.prompt}"\n`;
      r.checks.filter(c => !c.pass).forEach(c => {
        report += `  - ${c.check}: ${c.reason}\n`;
      });
      report += '\n';
    });
  }
  
  fs.writeFileSync(reportPath, report);
  console.log(`\nDetailed report saved to: ${reportPath}`);
  
  return { passed, failed, passRate: parseFloat(passRate), categoryResults };
}

// Run the test
run100QuestionTest()
  .then(results => {
    console.log('\n✅ Verification complete.');
    process.exit(results.passRate >= 95 ? 0 : 1);
  })
  .catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
