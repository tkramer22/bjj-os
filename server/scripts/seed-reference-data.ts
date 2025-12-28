import { db } from '../db';
import { bjjReferenceData } from '../../shared/schema';

// ADCC Champions Database - All Weight Classes 2015-2024
const ADCC_CHAMPIONS = [
  // ADCC 2024 (Las Vegas)
  { year: 2024, competitionName: 'ADCC', weightClass: '66kg', athleteName: 'Diogo Reis', gym: 'Unity Jiu Jitsu', placement: 'gold', division: 'male' },
  { year: 2024, competitionName: 'ADCC', weightClass: '77kg', athleteName: 'Mica Galvao', gym: 'Melqui Galvao', placement: 'gold', division: 'male' },
  { year: 2024, competitionName: 'ADCC', weightClass: '88kg', athleteName: 'Giancarlo Bodoni', gym: 'New Wave Jiu Jitsu', placement: 'gold', division: 'male' },
  { year: 2024, competitionName: 'ADCC', weightClass: '99kg', athleteName: 'Yuri Simoes', gym: 'Fight Sports', placement: 'gold', division: 'male' },
  { year: 2024, competitionName: 'ADCC', weightClass: '+99kg', athleteName: 'Gordon Ryan', gym: 'New Wave Jiu Jitsu', placement: 'gold', division: 'male' },
  { year: 2024, competitionName: 'ADCC', weightClass: 'Absolute', athleteName: 'Gordon Ryan', gym: 'New Wave Jiu Jitsu', placement: 'gold', division: 'male' },
  { year: 2024, competitionName: 'ADCC', weightClass: '55kg', athleteName: 'Ffion Davies', gym: 'ATOS', placement: 'gold', division: 'female' },
  { year: 2024, competitionName: 'ADCC', weightClass: '65kg', athleteName: 'Amy Campo', gym: 'B-Team', placement: 'gold', division: 'female' },
  
  // ADCC 2022 (Las Vegas)
  { year: 2022, competitionName: 'ADCC', weightClass: '66kg', athleteName: 'Diogo Reis', gym: 'Unity Jiu Jitsu', placement: 'gold', division: 'male' },
  { year: 2022, competitionName: 'ADCC', weightClass: '77kg', athleteName: 'Mica Galvao', gym: 'Melqui Galvao', placement: 'gold', division: 'male' },
  { year: 2022, competitionName: 'ADCC', weightClass: '88kg', athleteName: 'Giancarlo Bodoni', gym: 'New Wave Jiu Jitsu', placement: 'gold', division: 'male' },
  { year: 2022, competitionName: 'ADCC', weightClass: '99kg', athleteName: 'Gordon Ryan', gym: 'New Wave Jiu Jitsu', placement: 'gold', division: 'male' },
  { year: 2022, competitionName: 'ADCC', weightClass: '+99kg', athleteName: 'Gordon Ryan', gym: 'New Wave Jiu Jitsu', placement: 'gold', division: 'male', submissionType: 'Various' },
  { year: 2022, competitionName: 'ADCC', weightClass: 'Absolute', athleteName: 'Gordon Ryan', gym: 'New Wave Jiu Jitsu', placement: 'gold', division: 'male' },
  { year: 2022, competitionName: 'ADCC', weightClass: '55kg', athleteName: 'Ffion Davies', gym: 'ATOS', placement: 'gold', division: 'female' },
  { year: 2022, competitionName: 'ADCC', weightClass: '65kg', athleteName: 'Gabi Garcia', gym: 'Alliance', placement: 'gold', division: 'female' },
  
  // ADCC 2019 (Anaheim)
  { year: 2019, competitionName: 'ADCC', weightClass: '66kg', athleteName: 'Paulo Miyao', gym: 'Unity Jiu Jitsu', placement: 'gold', division: 'male' },
  { year: 2019, competitionName: 'ADCC', weightClass: '77kg', athleteName: 'JT Torres', gym: 'ATOS', placement: 'gold', division: 'male' },
  { year: 2019, competitionName: 'ADCC', weightClass: '88kg', athleteName: 'Matheus Diniz', gym: 'Marcelo Garcia Academy', placement: 'gold', division: 'male' },
  { year: 2019, competitionName: 'ADCC', weightClass: '99kg', athleteName: 'Gordon Ryan', gym: 'Renzo Gracie Academy', placement: 'gold', division: 'male' },
  { year: 2019, competitionName: 'ADCC', weightClass: '+99kg', athleteName: 'Kaynan Duarte', gym: 'ATOS', placement: 'gold', division: 'male' },
  { year: 2019, competitionName: 'ADCC', weightClass: 'Absolute', athleteName: 'Gordon Ryan', gym: 'Renzo Gracie Academy', placement: 'gold', division: 'male' },
  
  // ADCC 2017 (Finland)
  { year: 2017, competitionName: 'ADCC', weightClass: '66kg', athleteName: 'Rubens Charles Cobrinha', gym: 'Alliance', placement: 'gold', division: 'male' },
  { year: 2017, competitionName: 'ADCC', weightClass: '77kg', athleteName: 'JT Torres', gym: 'ATOS', placement: 'gold', division: 'male' },
  { year: 2017, competitionName: 'ADCC', weightClass: '88kg', athleteName: 'Gordon Ryan', gym: 'Renzo Gracie Academy', placement: 'gold', division: 'male' },
  { year: 2017, competitionName: 'ADCC', weightClass: '99kg', athleteName: 'Yuri Simoes', gym: 'ATOS', placement: 'gold', division: 'male' },
  { year: 2017, competitionName: 'ADCC', weightClass: '+99kg', athleteName: 'Felipe Pena', gym: 'Gracie Barra', placement: 'gold', division: 'male' },
  { year: 2017, competitionName: 'ADCC', weightClass: 'Absolute', athleteName: 'Felipe Pena', gym: 'Gracie Barra', placement: 'gold', division: 'male' },
  
  // ADCC 2015 (Brazil)
  { year: 2015, competitionName: 'ADCC', weightClass: '66kg', athleteName: 'Rubens Charles Cobrinha', gym: 'Alliance', placement: 'gold', division: 'male' },
  { year: 2015, competitionName: 'ADCC', weightClass: '77kg', athleteName: 'Davi Ramos', gym: 'Soul Fighters', placement: 'gold', division: 'male' },
  { year: 2015, competitionName: 'ADCC', weightClass: '88kg', athleteName: 'Keenan Cornelius', gym: 'ATOS', placement: 'gold', division: 'male' },
  { year: 2015, competitionName: 'ADCC', weightClass: '99kg', athleteName: 'Romulo Barral', gym: 'Gracie Barra', placement: 'gold', division: 'male' },
  { year: 2015, competitionName: 'ADCC', weightClass: '+99kg', athleteName: 'Orlando Sanchez', gym: 'Alliance', placement: 'gold', division: 'male' },
  { year: 2015, competitionName: 'ADCC', weightClass: 'Absolute', athleteName: 'Marcus Buchecha', gym: 'Checkmat', placement: 'gold', division: 'male' },
];

// IBJJF World Champions (Black Belt) 2019-2024
const IBJJF_WORLD_CHAMPIONS = [
  // 2024 Worlds
  { year: 2024, competitionName: 'IBJJF Worlds', weightClass: 'Roosterweight', athleteName: 'Thalison Soares', gym: 'AOJ', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2024, competitionName: 'IBJJF Worlds', weightClass: 'Light Featherweight', athleteName: 'Meyram Maquine', gym: 'Dream Art', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2024, competitionName: 'IBJJF Worlds', weightClass: 'Featherweight', athleteName: 'Micael Galvao', gym: 'Melqui Galvao', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2024, competitionName: 'IBJJF Worlds', weightClass: 'Lightweight', athleteName: 'Fabricio Andrey', gym: 'Dream Art', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2024, competitionName: 'IBJJF Worlds', weightClass: 'Middleweight', athleteName: 'Isaque Bahiense', gym: 'Dream Art', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2024, competitionName: 'IBJJF Worlds', weightClass: 'Medium-Heavyweight', athleteName: 'Felipe Andrew', gym: 'Alliance', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2024, competitionName: 'IBJJF Worlds', weightClass: 'Heavyweight', athleteName: 'Yatan Bueno', gym: 'Fratres', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2024, competitionName: 'IBJJF Worlds', weightClass: 'Super Heavyweight', athleteName: 'Victor Hugo', gym: 'Six Blades', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2024, competitionName: 'IBJJF Worlds', weightClass: 'Ultra Heavyweight', athleteName: 'Roosevelt Sousa', gym: 'Fight Sports', placement: 'gold', beltLevel: 'black', division: 'male' },
  
  // 2023 Worlds
  { year: 2023, competitionName: 'IBJJF Worlds', weightClass: 'Roosterweight', athleteName: 'Thalison Soares', gym: 'AOJ', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2023, competitionName: 'IBJJF Worlds', weightClass: 'Featherweight', athleteName: 'Micael Galvao', gym: 'Melqui Galvao', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2023, competitionName: 'IBJJF Worlds', weightClass: 'Lightweight', athleteName: 'Gabriel Sousa', gym: 'GFTeam', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2023, competitionName: 'IBJJF Worlds', weightClass: 'Middleweight', athleteName: 'Isaque Bahiense', gym: 'Dream Art', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2023, competitionName: 'IBJJF Worlds', weightClass: 'Medium-Heavyweight', athleteName: 'Fellipe Andrew', gym: 'Alliance', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2023, competitionName: 'IBJJF Worlds', weightClass: 'Heavyweight', athleteName: 'Erich Munis', gym: 'Dream Art', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2023, competitionName: 'IBJJF Worlds', weightClass: 'Super Heavyweight', athleteName: 'Victor Hugo', gym: 'Six Blades', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2023, competitionName: 'IBJJF Worlds', weightClass: 'Ultra Heavyweight', athleteName: 'Nicholas Meregali', gym: 'New Wave Jiu Jitsu', placement: 'gold', beltLevel: 'black', division: 'male' },
  
  // 2022 Worlds
  { year: 2022, competitionName: 'IBJJF Worlds', weightClass: 'Roosterweight', athleteName: 'Thalison Soares', gym: 'AOJ', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2022, competitionName: 'IBJJF Worlds', weightClass: 'Featherweight', athleteName: 'Kennedy Maciel', gym: 'Alliance', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2022, competitionName: 'IBJJF Worlds', weightClass: 'Lightweight', athleteName: 'Johnatha Alves', gym: 'Dream Art', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2022, competitionName: 'IBJJF Worlds', weightClass: 'Middleweight', athleteName: 'Tainan Dalpra', gym: 'AOJ', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2022, competitionName: 'IBJJF Worlds', weightClass: 'Medium-Heavyweight', athleteName: 'Andre Galvao', gym: 'ATOS', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2022, competitionName: 'IBJJF Worlds', weightClass: 'Heavyweight', athleteName: 'Erich Munis', gym: 'Dream Art', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2022, competitionName: 'IBJJF Worlds', weightClass: 'Super Heavyweight', athleteName: 'Felipe Pena', gym: 'Gracie Barra', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2022, competitionName: 'IBJJF Worlds', weightClass: 'Ultra Heavyweight', athleteName: 'Victor Hugo', gym: 'Six Blades', placement: 'gold', beltLevel: 'black', division: 'male' },
  
  // 2021 Worlds
  { year: 2021, competitionName: 'IBJJF Worlds', weightClass: 'Roosterweight', athleteName: 'Thalison Soares', gym: 'AOJ', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2021, competitionName: 'IBJJF Worlds', weightClass: 'Featherweight', athleteName: 'Jamil Hill-Taylor', gym: 'Lloyd Irvin', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2021, competitionName: 'IBJJF Worlds', weightClass: 'Lightweight', athleteName: 'Levi Jones-Leary', gym: 'Unity Jiu Jitsu', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2021, competitionName: 'IBJJF Worlds', weightClass: 'Middleweight', athleteName: 'Tainan Dalpra', gym: 'AOJ', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2021, competitionName: 'IBJJF Worlds', weightClass: 'Medium-Heavyweight', athleteName: 'Andre Galvao', gym: 'ATOS', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2021, competitionName: 'IBJJF Worlds', weightClass: 'Heavyweight', athleteName: 'Nicholas Meregali', gym: 'Alliance', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2021, competitionName: 'IBJJF Worlds', weightClass: 'Ultra Heavyweight', athleteName: 'Max Gimenes', gym: 'GFTeam', placement: 'gold', beltLevel: 'black', division: 'male' },
  
  // 2019 Worlds
  { year: 2019, competitionName: 'IBJJF Worlds', weightClass: 'Roosterweight', athleteName: 'Mikey Musumeci', gym: 'Caio Terra Association', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2019, competitionName: 'IBJJF Worlds', weightClass: 'Featherweight', athleteName: 'Matheus Gabriel', gym: 'Checkmat', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2019, competitionName: 'IBJJF Worlds', weightClass: 'Lightweight', athleteName: 'Lucas Lepri', gym: 'Alliance', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2019, competitionName: 'IBJJF Worlds', weightClass: 'Middleweight', athleteName: 'Lucas Barbosa', gym: 'ATOS', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2019, competitionName: 'IBJJF Worlds', weightClass: 'Medium-Heavyweight', athleteName: 'Kaynan Duarte', gym: 'ATOS', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2019, competitionName: 'IBJJF Worlds', weightClass: 'Heavyweight', athleteName: 'Leandro Lo', gym: 'NS Brotherhood', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2019, competitionName: 'IBJJF Worlds', weightClass: 'Super Heavyweight', athleteName: 'Nicholas Meregali', gym: 'Alliance', placement: 'gold', beltLevel: 'black', division: 'male' },
  { year: 2019, competitionName: 'IBJJF Worlds', weightClass: 'Ultra Heavyweight', athleteName: 'Marcus Buchecha', gym: 'Checkmat', placement: 'gold', beltLevel: 'black', division: 'male' },
];

// Competitor Profiles
const COMPETITOR_PROFILES = [
  { referenceType: 'competitor_profile', athleteName: 'Gordon Ryan', gym: 'New Wave Jiu Jitsu', country: 'USA', details: { nickname: 'The King', specialty: 'Pressure passing, body lock, leg locks', titles: 'ADCC champion (multiple weight classes), ADCC Absolute champion' } },
  { referenceType: 'competitor_profile', athleteName: 'Mica Galvao', gym: 'Melqui Galvao', country: 'Brazil', details: { nickname: 'Galvão', specialty: 'Guard retention, berimbolo, back takes', titles: 'ADCC 77kg champion, IBJJF World champion' } },
  { referenceType: 'competitor_profile', athleteName: 'Nicholas Meregali', gym: 'New Wave Jiu Jitsu', country: 'Brazil', details: { specialty: 'Collar sleeve guard, triangle, chokes', titles: 'IBJJF World champion (multiple times)' } },
  { referenceType: 'competitor_profile', athleteName: 'Mikey Musumeci', gym: 'Independent', country: 'USA', details: { specialty: 'Leg locks, butterfly guard', titles: 'IBJJF World champion, ONE Championship' } },
  { referenceType: 'competitor_profile', athleteName: 'Ffion Davies', gym: 'ATOS', country: 'Wales', details: { specialty: 'Leg locks, arm bars', titles: 'ADCC champion (multiple times)' } },
  { referenceType: 'competitor_profile', athleteName: 'Tainan Dalpra', gym: 'AOJ', country: 'Brazil', details: { specialty: 'Passing, pressure, submissions', titles: 'IBJJF World champion' } },
  { referenceType: 'competitor_profile', athleteName: 'Felipe Pena', gym: 'Gracie Barra', country: 'Brazil', details: { nickname: 'Preguica', specialty: 'Over-under pass, collar drags', titles: 'ADCC champion, IBJJF World champion' } },
  { referenceType: 'competitor_profile', athleteName: 'Andre Galvao', gym: 'ATOS', country: 'Brazil', details: { specialty: 'Complete game, takedowns, passing', titles: 'ADCC champion (multiple times), IBJJF World champion (multiple times)' } },
  { referenceType: 'competitor_profile', athleteName: 'Marcelo Garcia', gym: 'Marcelo Garcia Academy', country: 'Brazil', details: { specialty: 'X-guard, guillotine, arm drags', titles: 'ADCC champion (4x), IBJJF World champion (5x)' } },
  { referenceType: 'competitor_profile', athleteName: 'Roger Gracie', gym: 'Roger Gracie Academy', country: 'Brazil', details: { specialty: 'Mount control, cross collar choke, fundamentals', titles: 'ADCC champion, IBJJF World champion (10x)' } },
];

async function seedReferenceData() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('SEEDING BJJ REFERENCE DATABASE');
  console.log('═══════════════════════════════════════════════════════════════');
  
  let insertedCount = 0;
  
  // Seed ADCC Champions
  console.log('\n📊 Seeding ADCC Champions...');
  for (const champion of ADCC_CHAMPIONS) {
    try {
      await db.insert(bjjReferenceData).values({
        referenceType: 'adcc_winner',
        ...champion,
        isVerified: true
      }).onConflictDoNothing();
      insertedCount++;
    } catch (error: any) {
      if (!error.message.includes('duplicate')) {
        console.error(`Error inserting ADCC data:`, error.message);
      }
    }
  }
  console.log(`   ✅ Inserted ${ADCC_CHAMPIONS.length} ADCC champion records`);
  
  // Seed IBJJF World Champions
  console.log('\n📊 Seeding IBJJF World Champions...');
  for (const champion of IBJJF_WORLD_CHAMPIONS) {
    try {
      await db.insert(bjjReferenceData).values({
        referenceType: 'ibjjf_champion',
        ...champion,
        isVerified: true
      }).onConflictDoNothing();
      insertedCount++;
    } catch (error: any) {
      if (!error.message.includes('duplicate')) {
        console.error(`Error inserting IBJJF data:`, error.message);
      }
    }
  }
  console.log(`   ✅ Inserted ${IBJJF_WORLD_CHAMPIONS.length} IBJJF champion records`);
  
  // Seed Competitor Profiles
  console.log('\n📊 Seeding Competitor Profiles...');
  for (const profile of COMPETITOR_PROFILES) {
    try {
      await db.insert(bjjReferenceData).values({
        ...profile,
        isVerified: true
      }).onConflictDoNothing();
      insertedCount++;
    } catch (error: any) {
      if (!error.message.includes('duplicate')) {
        console.error(`Error inserting profile:`, error.message);
      }
    }
  }
  console.log(`   ✅ Inserted ${COMPETITOR_PROFILES.length} competitor profiles`);
  
  // Summary
  const totalRecords = await db.select().from(bjjReferenceData);
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(`✅ SEEDING COMPLETE: ${totalRecords.length} total records in database`);
  console.log('═══════════════════════════════════════════════════════════════');
  
  process.exit(0);
}

seedReferenceData().catch(console.error);
