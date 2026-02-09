import { db } from './db';
import { aiVideoKnowledge } from '@shared/schema';
import { sql, ilike, or, and, eq } from 'drizzle-orm';

export interface TestResult {
  id: string;
  category: string;
  name: string;
  question: string;
  passed: boolean;
  expected: string;
  actual: string;
  details?: string;
  duration?: number;
}

export interface TestReport {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  passPercentage: number;
  results: TestResult[];
  warnings: string[];
}

interface VideoCard {
  title: string;
  instructor: string;
  videoId?: string;
  id?: number;
  startTime?: string;
}

function parseVideoTokens(response: string): VideoCard[] {
  const videos: VideoCard[] = [];
  const tokenRegex = /\[VIDEO:\s*([^\]]+)\]/g;
  let match;
  
  while ((match = tokenRegex.exec(response)) !== null) {
    const content = match[1];
    const parts = content.split('|').map(s => s.trim());
    
    if (parts.length >= 5) {
      videos.push({
        title: parts[0],
        instructor: parts[1],
        videoId: parts[3],
        id: parseInt(parts[4], 10),
        startTime: parts[5]
      });
    } else {
      const byMatch = content.match(/^(.+?)\s+by\s+(.+?)(?:\s*\|.*)?$/i);
      if (byMatch) {
        videos.push({
          title: byMatch[1].trim(),
          instructor: byMatch[2].trim()
        });
      } else {
        videos.push({
          title: content.replace(/\|.*$/, '').trim(),
          instructor: ''
        });
      }
    }
  }
  
  return videos;
}

function containsKeywords(text: string, keywords: string[], mode: 'AND' | 'OR' = 'AND'): boolean {
  const lowerText = text.toLowerCase();
  if (mode === 'AND') {
    return keywords.every(kw => lowerText.includes(kw.toLowerCase()));
  }
  return keywords.some(kw => lowerText.includes(kw.toLowerCase()));
}

export const VIDEO_RELEVANCE_TESTS = [
  { id: '1.1', question: 'Show me guillotine videos', keywords: ['guillotine'], mode: 'OR' as const },
  { id: '1.2', question: 'Anaconda choke tips', keywords: ['anaconda', 'front headlock', 'darce', 'd\'arce'], mode: 'OR' as const },
  { id: '1.3', question: 'Half guard sweeps', keywords: ['half guard'], mode: 'AND' as const },
  { id: '1.4', question: 'Armbar from guard', keywords: ['armbar', 'arm bar'], mode: 'OR' as const },
  { id: '1.5', question: 'Mount escapes', keywords: ['mount', 'escape'], mode: 'AND' as const },
  { id: '1.6', question: 'Back takes', keywords: ['back'], mode: 'AND' as const },
  { id: '1.7', question: 'Triangle choke setup', keywords: ['triangle'], mode: 'OR' as const },
  { id: '1.8', question: 'Passing closed guard', keywords: ['closed guard', 'guard pass'], mode: 'OR' as const },
  { id: '1.9', question: 'Leg locks', keywords: ['leg lock', 'heel hook', 'kneebar', 'ashi', 'straight ankle'], mode: 'OR' as const },
  { id: '1.10', question: 'Tom DeBlass half guard', keywords: ['deblass', 'half guard'], mode: 'AND' as const },
];

export const PERSONALITY_TESTS = [
  { id: '3.1', question: 'Who is your favorite instructor?', keywords: ['JT Torres', 'JT', 'Torres'], mode: 'OR' as const },
  { id: '3.2', question: 'What gi should I buy?', keywords: ['Albino', 'Preto', 'A&P', 'A & P'], mode: 'OR' as const },
  { id: '3.3', question: 'Should I train gi or no-gi?', keywords: ['both'], mode: 'OR' as const },
  { id: '3.4', question: 'How often should I train?', keywords: ['recover', '3', '4', '5', '6'], mode: 'OR' as const },
  { id: '3.5', question: 'Should I compete?', keywords: ['at least once', 'do it', 'yes', 'absolutely', 'recommend'], mode: 'OR' as const },
  { id: '3.6', question: 'Should I wash my belt?', keywords: ['yes', 'wash'], mode: 'AND' as const },
  { id: '3.7', question: 'Is it too late to start BJJ at 40?', keywords: ['no', 'never too late', 'not too late'], mode: 'OR' as const },
  { id: '3.8', question: 'What\'s the deal with acai?', keywords: ['rite', 'passage', 'tradition', 'açaí', 'culture', 'brazil'], mode: 'OR' as const },
];

export const COACHING_TESTS = [
  { id: '4.1', question: 'Help me with my guillotine', requiresVideo: true, requiresTips: true },
  { id: '4.2', question: 'I keep getting my guard passed', requiresFollowUp: true },
  { id: '4.3', question: 'Teach me the Marcelo Garcia guillotine', requiresQuote: true },
];

export async function checkVideoExistsInDatabase(keywords: string[], mode: 'AND' | 'OR'): Promise<{ exists: boolean; count: number; samples: string[] }> {
  try {
    const conditions = keywords.map(kw => 
      or(
        ilike(aiVideoKnowledge.title, `%${kw}%`),
        ilike(aiVideoKnowledge.techniqueName, `%${kw}%`),
        sql`COALESCE(${aiVideoKnowledge.tags}, '{}')::text ILIKE ${`%${kw}%`}`
      )
    );
    
    const baseWhereClause = mode === 'AND' ? and(...conditions) : or(...conditions);
    const whereClause = and(baseWhereClause, eq(aiVideoKnowledge.status, 'active'));
    
    const results = await db.select({
      title: aiVideoKnowledge.title,
      instructorName: aiVideoKnowledge.instructorName
    })
    .from(aiVideoKnowledge)
    .where(whereClause!)
    .limit(5);
    
    return {
      exists: results.length > 0,
      count: results.length,
      samples: results.map(r => `${r.title} by ${r.instructorName}`)
    };
  } catch (error) {
    console.error('[TEST] Database check error:', error);
    return { exists: false, count: 0, samples: [] };
  }
}

export async function runVideoRelevanceTest(
  testId: string,
  question: string,
  keywords: string[],
  mode: 'AND' | 'OR',
  sendMessage: (msg: string) => Promise<string>
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const dbCheck = await checkVideoExistsInDatabase(keywords, mode);
    const response = await sendMessage(question);
    const videos = parseVideoTokens(response);
    const duration = Date.now() - startTime;
    
    if (videos.length === 0) {
      if (dbCheck.exists) {
        return {
          id: testId,
          category: 'Video Relevance',
          name: question,
          question,
          passed: false,
          expected: `At least 1 video containing: ${keywords.join(mode === 'AND' ? ' AND ' : ' OR ')}`,
          actual: `No videos returned. DB has ${dbCheck.count} matching videos: ${dbCheck.samples.slice(0, 2).join(', ')}`,
          duration
        };
      } else {
        return {
          id: testId,
          category: 'Video Relevance',
          name: question,
          question,
          passed: true,
          expected: `No videos in DB for: ${keywords.join(', ')}`,
          actual: 'Correctly returned no videos (technique not in library)',
          details: 'SKIP - Technique not in database',
          duration
        };
      }
    }
    
    const relevantVideos = videos.filter(v => {
      const searchText = `${v.title} ${v.instructor}`.toLowerCase();
      return containsKeywords(searchText, keywords, mode);
    });
    
    if (relevantVideos.length > 0) {
      return {
        id: testId,
        category: 'Video Relevance',
        name: question,
        question,
        passed: true,
        expected: `Videos containing: ${keywords.join(mode === 'AND' ? ' AND ' : ' OR ')}`,
        actual: `${relevantVideos.length}/${videos.length} videos matched: ${relevantVideos.slice(0, 2).map(v => v.title).join(', ')}`,
        duration
      };
    } else {
      return {
        id: testId,
        category: 'Video Relevance',
        name: question,
        question,
        passed: false,
        expected: `Videos containing: ${keywords.join(mode === 'AND' ? ' AND ' : ' OR ')}`,
        actual: `0/${videos.length} videos matched. Got: ${videos.slice(0, 2).map(v => `"${v.title}" by ${v.instructor}`).join(', ')}`,
        details: 'UNRELATED VIDEOS RETURNED',
        duration
      };
    }
  } catch (error: any) {
    return {
      id: testId,
      category: 'Video Relevance',
      name: question,
      question,
      passed: false,
      expected: 'Response without error',
      actual: `Error: ${error.message}`,
      duration: Date.now() - startTime
    };
  }
}

export async function runVideoCardDataTest(
  response: string,
  testId: string
): Promise<TestResult[]> {
  const videos = parseVideoTokens(response);
  const results: TestResult[] = [];
  
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const issues: string[] = [];
    
    if (!video.title || video.title.trim() === '') {
      issues.push('Missing title');
    }
    
    if (!video.instructor || video.instructor.trim() === '' || video.instructor === 'BJJ Instructor') {
      issues.push(`Invalid instructor: "${video.instructor || 'NULL'}"`);
    }
    
    if (!video.videoId || video.videoId.trim() === '') {
      issues.push('Missing videoId (no thumbnail)');
    }
    
    const hasSpecificTimestamp = video.startTime && video.startTime !== '00:00' && video.startTime !== 'full';
    
    results.push({
      id: `${testId}.${i + 1}`,
      category: 'Video Card Data',
      name: `Video: ${video.title?.substring(0, 40) || 'Unknown'}`,
      question: 'Data completeness check',
      passed: issues.length === 0,
      expected: 'title, instructor_name, videoId, timestamp',
      actual: issues.length === 0 
        ? `Complete: ${video.title} by ${video.instructor}`
        : `Issues: ${issues.join(', ')}`,
      details: hasSpecificTimestamp ? undefined : 'WARNING: Generic timestamp (00:00)'
    });
  }
  
  return results;
}

export async function runPersonalityTest(
  testId: string,
  question: string,
  keywords: string[],
  sendMessage: (msg: string) => Promise<string>
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const response = await sendMessage(question);
    const duration = Date.now() - startTime;
    
    const hasExpectedContent = containsKeywords(response, keywords, 'OR');
    
    return {
      id: testId,
      category: 'Personality',
      name: question,
      question,
      passed: hasExpectedContent,
      expected: `Contains: ${keywords.slice(0, 3).join(' OR ')}`,
      actual: hasExpectedContent 
        ? 'Personality match found'
        : `Missing expected personality. Response: "${response.substring(0, 150)}..."`,
      duration
    };
  } catch (error: any) {
    return {
      id: testId,
      category: 'Personality',
      name: question,
      question,
      passed: false,
      expected: 'Response without error',
      actual: `Error: ${error.message}`,
      duration: Date.now() - startTime
    };
  }
}

export async function runCoachingTest(
  test: typeof COACHING_TESTS[0],
  sendMessage: (msg: string) => Promise<string>
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    const response = await sendMessage(test.question);
    const duration = Date.now() - startTime;
    const videos = parseVideoTokens(response);
    const issues: string[] = [];
    
    if (test.requiresVideo && videos.length === 0) {
      issues.push('No video recommended');
    }
    
    if (test.requiresTips) {
      const hasTips = /\d\.|•|step|tip|first|then|when|make sure|remember/i.test(response);
      if (!hasTips) {
        issues.push('Missing actionable tips');
      }
    }
    
    if (test.requiresFollowUp) {
      const hasFollowUp = /\?|what|where|which|how|tell me more|could you/i.test(response);
      const hasSpecificAdvice = /keep|try|focus|instead|rather|when they|if they/i.test(response);
      if (!hasFollowUp && !hasSpecificAdvice) {
        issues.push('Missing follow-up question or specific advice');
      }
    }
    
    if (test.requiresQuote) {
      const hasQuote = /says|said|teaches|explains|"[^"]+"|'[^']+'|according to/i.test(response);
      if (!hasQuote) {
        issues.push('Missing instructor quote or specific detail');
      }
    }
    
    return {
      id: test.id,
      category: 'Coaching Quality',
      name: test.question,
      question: test.question,
      passed: issues.length === 0,
      expected: [
        test.requiresVideo ? 'video' : '',
        test.requiresTips ? 'tips' : '',
        test.requiresFollowUp ? 'follow-up/advice' : '',
        test.requiresQuote ? 'quote' : ''
      ].filter(Boolean).join(', '),
      actual: issues.length === 0 
        ? `Quality coaching: ${videos.length} videos, proper structure`
        : `Issues: ${issues.join(', ')}`,
      duration
    };
  } catch (error: any) {
    return {
      id: test.id,
      category: 'Coaching Quality',
      name: test.question,
      question: test.question,
      passed: false,
      expected: 'Response without error',
      actual: `Error: ${error.message}`,
      duration: Date.now() - startTime
    };
  }
}

export function generateReport(results: TestResult[]): TestReport {
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const warnings = results
    .filter(r => r.details?.startsWith('WARNING'))
    .map(r => `${r.id}: ${r.details}`);
  
  return {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed,
    failed,
    passPercentage: Math.round((passed / results.length) * 100),
    results,
    warnings
  };
}
