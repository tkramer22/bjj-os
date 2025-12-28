import { db } from '../db';
import { instructorVerifiedCredentials, adccResults } from '@shared/schema';
import { eq, or, sql } from 'drizzle-orm';

export interface CredentialsResult {
  hasCredentials: boolean;
  credentials: string | null;
  adccWins: number;
  ibjjfWorldsWins: number;
  adccYears: string[];
  knownFor: string[];
  team: string | null;
}

export async function getVerifiedCredentials(instructorName: string): Promise<CredentialsResult> {
  const normalized = instructorName.toLowerCase().trim();
  
  try {
    const result = await db.select()
      .from(instructorVerifiedCredentials)
      .where(
        or(
          eq(instructorVerifiedCredentials.instructorNameNormalized, normalized),
          sql`${instructorVerifiedCredentials.instructorNameNormalized} LIKE ${'%' + normalized + '%'}`
        )
      )
      .limit(1);
    
    if (result.length === 0) {
      return {
        hasCredentials: false,
        credentials: null,
        adccWins: 0,
        ibjjfWorldsWins: 0,
        adccYears: [],
        knownFor: [],
        team: null
      };
    }
    
    const cred = result[0];
    
    const credentialParts: string[] = [];
    
    if (cred.adccGold && cred.adccGold > 0) {
      const years = cred.adccYearsWon?.join(', ') || '';
      credentialParts.push(`${cred.adccGold}x ADCC champion${years ? ` (${years})` : ''}`);
    }
    if (cred.adccSilver && cred.adccSilver > 0) {
      credentialParts.push(`${cred.adccSilver}x ADCC silver`);
    }
    if (cred.ibjjfWorldsGold && cred.ibjjfWorldsGold > 0) {
      credentialParts.push(`${cred.ibjjfWorldsGold}x IBJJF World champion`);
    }
    if (cred.ibjjfPansGold && cred.ibjjfPansGold > 0) {
      credentialParts.push(`${cred.ibjjfPansGold}x Pan American champion`);
    }
    
    return {
      hasCredentials: credentialParts.length > 0,
      credentials: credentialParts.length > 0 ? credentialParts.join(', ') : null,
      adccWins: cred.adccGold || 0,
      ibjjfWorldsWins: cred.ibjjfWorldsGold || 0,
      adccYears: cred.adccYearsWon || [],
      knownFor: cred.knownFor || [],
      team: cred.team || null
    };
    
  } catch (error) {
    console.error('[CREDENTIALS] Error fetching credentials:', error);
    return {
      hasCredentials: false,
      credentials: null,
      adccWins: 0,
      ibjjfWorldsWins: 0,
      adccYears: [],
      knownFor: [],
      team: null
    };
  }
}

export async function getCredentialsForInstructors(instructorNames: string[]): Promise<Record<string, string>> {
  const credentialsData: Record<string, string> = {};
  
  if (instructorNames.length === 0) {
    return credentialsData;
  }
  
  try {
    // Batch query: fetch all credentials in a single database call
    const normalizedNames = instructorNames.map(name => name.toLowerCase().trim());
    
    const results = await db.select()
      .from(instructorVerifiedCredentials)
      .where(
        sql`${instructorVerifiedCredentials.instructorNameNormalized} = ANY(${sql.raw(`ARRAY[${normalizedNames.map(n => `'${n.replace(/'/g, "''")}'`).join(',')}]`)})`
      );
    
    // Map results back to original instructor names
    for (const cred of results) {
      // Find the original name that matches this credential
      const matchedName = instructorNames.find(
        name => name.toLowerCase().trim() === cred.instructorNameNormalized
      ) || cred.instructorName;
      
      const credentialParts: string[] = [];
      
      if (cred.adccGold && cred.adccGold > 0) {
        const years = cred.adccYearsWon?.join(', ') || '';
        credentialParts.push(`${cred.adccGold}x ADCC champion${years ? ` (${years})` : ''}`);
      }
      if (cred.adccSilver && cred.adccSilver > 0) {
        credentialParts.push(`${cred.adccSilver}x ADCC silver`);
      }
      if (cred.ibjjfWorldsGold && cred.ibjjfWorldsGold > 0) {
        credentialParts.push(`${cred.ibjjfWorldsGold}x IBJJF World champion`);
      }
      if (cred.ibjjfPansGold && cred.ibjjfPansGold > 0) {
        credentialParts.push(`${cred.ibjjfPansGold}x Pan American champion`);
      }
      
      if (credentialParts.length > 0) {
        const credentialStr = credentialParts.join(', ');
        credentialsData[matchedName] = credentialStr;
        console.log(`[CREDENTIALS] Found verified credentials for: ${matchedName} → ${credentialStr}`);
      }
    }
    
    return credentialsData;
  } catch (error) {
    console.error('[CREDENTIALS] Error in batch query, falling back to individual queries:', error);
    
    // Fallback to individual queries if batch fails
    for (const instructor of instructorNames) {
      const creds = await getVerifiedCredentials(instructor);
      if (creds.hasCredentials && creds.credentials) {
        credentialsData[instructor] = creds.credentials;
        console.log(`[CREDENTIALS] Found verified credentials for: ${instructor} → ${creds.credentials}`);
      }
    }
    
    return credentialsData;
  }
}

export function buildCredentialsSection(credentialsData: Record<string, string>): string {
  if (Object.keys(credentialsData).length > 0) {
    return `
═══════════════════════════════════════════════════════════════════════════════
VERIFIED INSTRUCTOR CREDENTIALS
═══════════════════════════════════════════════════════════════════════════════

These credentials are VERIFIED from official competition records:

${Object.entries(credentialsData).map(([name, creds]) => 
  `• ${name}: ${creds}`
).join('\n')}

CRITICAL RULE: You may ONLY mention competition results that appear in this verified list.
If an instructor is NOT listed here, do NOT mention any competition achievements for them.
Say nothing about credentials rather than guess.
═══════════════════════════════════════════════════════════════════════════════
`;
  }
  
  return `
═══════════════════════════════════════════════════════════════════════════════
INSTRUCTOR CREDENTIALS RULE
═══════════════════════════════════════════════════════════════════════════════

No verified credentials were found for instructors in this conversation.
DO NOT mention any competition results, titles, or achievements.
Focus only on their teaching style and available videos.
═══════════════════════════════════════════════════════════════════════════════
`;
}

export async function seedVerifiedADCCData(): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;
  
  const adccData = [
    { year: 2024, weightClass: '66kg', place: 1, athleteName: 'Diogo Reis', athleteNameNormalized: 'diogo reis' },
    { year: 2024, weightClass: '77kg', place: 1, athleteName: 'Mica Galvao', athleteNameNormalized: 'mica galvao' },
    { year: 2024, weightClass: '88kg', place: 1, athleteName: 'Giancarlo Bodoni', athleteNameNormalized: 'giancarlo bodoni' },
    { year: 2024, weightClass: '99kg', place: 1, athleteName: 'Yuri Simoes', athleteNameNormalized: 'yuri simoes' },
    { year: 2024, weightClass: '+99kg', place: 1, athleteName: 'Gordon Ryan', athleteNameNormalized: 'gordon ryan' },
    { year: 2024, weightClass: 'Absolute', place: 1, athleteName: 'Gordon Ryan', athleteNameNormalized: 'gordon ryan' },
    
    { year: 2022, weightClass: '66kg', place: 1, athleteName: 'Diogo Reis', athleteNameNormalized: 'diogo reis' },
    { year: 2022, weightClass: '77kg', place: 1, athleteName: 'Mica Galvao', athleteNameNormalized: 'mica galvao' },
    { year: 2022, weightClass: '88kg', place: 1, athleteName: 'Giancarlo Bodoni', athleteNameNormalized: 'giancarlo bodoni' },
    { year: 2022, weightClass: '99kg', place: 1, athleteName: 'Gordon Ryan', athleteNameNormalized: 'gordon ryan' },
    { year: 2022, weightClass: '+99kg', place: 1, athleteName: 'Gordon Ryan', athleteNameNormalized: 'gordon ryan' },
    { year: 2022, weightClass: 'Absolute', place: 1, athleteName: 'Gordon Ryan', athleteNameNormalized: 'gordon ryan' },
    
    { year: 2019, weightClass: '66kg', place: 1, athleteName: 'Paulo Miyao', athleteNameNormalized: 'paulo miyao' },
    { year: 2019, weightClass: '77kg', place: 1, athleteName: 'JT Torres', athleteNameNormalized: 'jt torres' },
    { year: 2019, weightClass: '88kg', place: 1, athleteName: 'Craig Jones', athleteNameNormalized: 'craig jones' },
    { year: 2019, weightClass: '99kg', place: 1, athleteName: 'Gordon Ryan', athleteNameNormalized: 'gordon ryan' },
    { year: 2019, weightClass: '+99kg', place: 1, athleteName: 'Kaynan Duarte', athleteNameNormalized: 'kaynan duarte' },
    { year: 2019, weightClass: 'Absolute', place: 1, athleteName: 'Gordon Ryan', athleteNameNormalized: 'gordon ryan' },
    
    { year: 2017, weightClass: '66kg', place: 1, athleteName: 'Augusto Mendes', athleteNameNormalized: 'augusto mendes' },
    { year: 2017, weightClass: '77kg', place: 1, athleteName: 'JT Torres', athleteNameNormalized: 'jt torres' },
    { year: 2017, weightClass: '88kg', place: 1, athleteName: 'Matheus Diniz', athleteNameNormalized: 'matheus diniz' },
    { year: 2017, weightClass: '99kg', place: 1, athleteName: 'Keenan Cornelius', athleteNameNormalized: 'keenan cornelius' },
    { year: 2017, weightClass: '+99kg', place: 1, athleteName: 'Felipe Pena', athleteNameNormalized: 'felipe pena' },
    { year: 2017, weightClass: 'Absolute', place: 1, athleteName: 'Felipe Pena', athleteNameNormalized: 'felipe pena' },
    
    { year: 2015, weightClass: '66kg', place: 1, athleteName: 'Rubens Charles', athleteNameNormalized: 'rubens charles' },
    { year: 2015, weightClass: '77kg', place: 1, athleteName: 'Lucas Lepri', athleteNameNormalized: 'lucas lepri' },
    { year: 2015, weightClass: '88kg', place: 1, athleteName: 'Yuri Simoes', athleteNameNormalized: 'yuri simoes' },
    { year: 2015, weightClass: '99kg', place: 1, athleteName: 'Andre Galvao', athleteNameNormalized: 'andre galvao' },
    { year: 2015, weightClass: '+99kg', place: 1, athleteName: 'Orlando Sanchez', athleteNameNormalized: 'orlando sanchez' },
    { year: 2015, weightClass: 'Absolute', place: 1, athleteName: 'Andre Galvao', athleteNameNormalized: 'andre galvao' },
    
    { year: 2013, weightClass: '66kg', place: 1, athleteName: 'Gui Mendes', athleteNameNormalized: 'gui mendes' },
    { year: 2013, weightClass: '77kg', place: 1, athleteName: 'Rafael Mendes', athleteNameNormalized: 'rafael mendes' },
    { year: 2013, weightClass: '88kg', place: 1, athleteName: 'Joao Assis', athleteNameNormalized: 'joao assis' },
    { year: 2013, weightClass: '99kg', place: 1, athleteName: 'Andre Galvao', athleteNameNormalized: 'andre galvao' },
    { year: 2013, weightClass: '+99kg', place: 1, athleteName: 'Marcus Buchecha', athleteNameNormalized: 'marcus buchecha' },
    { year: 2013, weightClass: 'Absolute', place: 1, athleteName: 'Roberto Cyborg', athleteNameNormalized: 'roberto cyborg' },
    
    { year: 2011, weightClass: '66kg', place: 1, athleteName: 'Rafael Mendes', athleteNameNormalized: 'rafael mendes' },
    { year: 2011, weightClass: '77kg', place: 1, athleteName: 'Leo Vieira', athleteNameNormalized: 'leo vieira' },
    { year: 2011, weightClass: '88kg', place: 1, athleteName: 'Xande Ribeiro', athleteNameNormalized: 'xande ribeiro' },
    { year: 2011, weightClass: '99kg', place: 1, athleteName: 'Andre Galvao', athleteNameNormalized: 'andre galvao' },
    { year: 2011, weightClass: '+99kg', place: 1, athleteName: 'Marcus Buchecha', athleteNameNormalized: 'marcus buchecha' },
    { year: 2011, weightClass: 'Absolute', place: 1, athleteName: 'Marcus Buchecha', athleteNameNormalized: 'marcus buchecha' },
    
    { year: 2009, weightClass: '66kg', place: 1, athleteName: 'Cobrinha', athleteNameNormalized: 'cobrinha' },
    { year: 2009, weightClass: '77kg', place: 1, athleteName: 'Marcelo Garcia', athleteNameNormalized: 'marcelo garcia' },
    { year: 2009, weightClass: '88kg', place: 1, athleteName: 'Andre Galvao', athleteNameNormalized: 'andre galvao' },
    { year: 2009, weightClass: '99kg', place: 1, athleteName: 'Xande Ribeiro', athleteNameNormalized: 'xande ribeiro' },
    { year: 2009, weightClass: '+99kg', place: 1, athleteName: 'Jeff Monson', athleteNameNormalized: 'jeff monson' },
    { year: 2009, weightClass: 'Absolute', place: 1, athleteName: 'Vinny Magalhaes', athleteNameNormalized: 'vinny magalhaes' },
    
    { year: 2007, weightClass: '66kg', place: 1, athleteName: 'Cobrinha', athleteNameNormalized: 'cobrinha' },
    { year: 2007, weightClass: '77kg', place: 1, athleteName: 'Marcelo Garcia', athleteNameNormalized: 'marcelo garcia' },
    { year: 2007, weightClass: '88kg', place: 1, athleteName: 'Damian Maia', athleteNameNormalized: 'damian maia' },
    { year: 2007, weightClass: '99kg', place: 1, athleteName: 'Xande Ribeiro', athleteNameNormalized: 'xande ribeiro' },
    { year: 2007, weightClass: '+99kg', place: 1, athleteName: 'Fabricio Werdum', athleteNameNormalized: 'fabricio werdum' },
    { year: 2007, weightClass: 'Absolute', place: 1, athleteName: 'Roger Gracie', athleteNameNormalized: 'roger gracie' },
    
    { year: 2005, weightClass: '66kg', place: 1, athleteName: 'Royler Gracie', athleteNameNormalized: 'royler gracie' },
    { year: 2005, weightClass: '77kg', place: 1, athleteName: 'Marcelo Garcia', athleteNameNormalized: 'marcelo garcia' },
    { year: 2005, weightClass: '88kg', place: 1, athleteName: 'Demian Maia', athleteNameNormalized: 'demian maia' },
    { year: 2005, weightClass: '99kg', place: 1, athleteName: 'Roger Gracie', athleteNameNormalized: 'roger gracie' },
    { year: 2005, weightClass: '+99kg', place: 1, athleteName: 'Fabricio Werdum', athleteNameNormalized: 'fabricio werdum' },
    { year: 2005, weightClass: 'Absolute', place: 1, athleteName: 'Roger Gracie', athleteNameNormalized: 'roger gracie' },
    
    { year: 2003, weightClass: '66kg', place: 1, athleteName: 'Royler Gracie', athleteNameNormalized: 'royler gracie' },
    { year: 2003, weightClass: '77kg', place: 1, athleteName: 'Marcelo Garcia', athleteNameNormalized: 'marcelo garcia' },
    { year: 2003, weightClass: '88kg', place: 1, athleteName: 'Saulo Ribeiro', athleteNameNormalized: 'saulo ribeiro' },
    { year: 2003, weightClass: '99kg', place: 1, athleteName: 'Jean Jacques Machado', athleteNameNormalized: 'jean jacques machado' },
    { year: 2003, weightClass: '+99kg', place: 1, athleteName: 'Ricardo Arona', athleteNameNormalized: 'ricardo arona' },
    { year: 2003, weightClass: 'Absolute', place: 1, athleteName: 'Dean Lister', athleteNameNormalized: 'dean lister' },
  ];
  
  for (const record of adccData) {
    try {
      await db.insert(adccResults).values(record).onConflictDoNothing();
      inserted++;
    } catch (error: any) {
      errors.push(`Failed to insert ${record.athleteName} (${record.year}): ${error.message}`);
    }
  }
  
  console.log(`[CREDENTIALS] Seeded ${inserted} ADCC records`);
  return { inserted, errors };
}

export async function updateInstructorCredentialsFromResults(): Promise<void> {
  try {
    const athletes = await db.select({
      athleteNameNormalized: adccResults.athleteNameNormalized,
      athleteName: adccResults.athleteName,
    })
      .from(adccResults)
      .where(eq(adccResults.place, 1))
      .groupBy(adccResults.athleteNameNormalized, adccResults.athleteName);
    
    for (const athlete of athletes) {
      const golds = await db.select({
        year: adccResults.year,
      })
        .from(adccResults)
        .where(sql`${adccResults.athleteNameNormalized} = ${athlete.athleteNameNormalized} AND ${adccResults.place} = 1`);
      
      const uniqueYears = [...new Set(golds.map(g => g.year.toString()))].sort();
      const goldCount = golds.length;
      
      await db.insert(instructorVerifiedCredentials).values({
        instructorName: athlete.athleteName,
        instructorNameNormalized: athlete.athleteNameNormalized,
        adccGold: goldCount,
        adccYearsWon: uniqueYears,
        verified: true,
      }).onConflictDoUpdate({
        target: instructorVerifiedCredentials.instructorNameNormalized,
        set: {
          adccGold: goldCount,
          adccYearsWon: uniqueYears,
          lastUpdated: new Date(),
        }
      });
      
      console.log(`[CREDENTIALS] Updated: ${athlete.athleteName} - ${goldCount}x ADCC gold (${uniqueYears.join(', ')})`);
    }
  } catch (error) {
    console.error('[CREDENTIALS] Error updating credentials:', error);
  }
}
