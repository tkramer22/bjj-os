import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { aiVideoKnowledge } from './shared/schema.ts';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);

const videos = [
  { videoUrl: 'https://youtube.com/watch?v=BWitv9AKoNU', title: 'Triangle System', techniqueName: 'Triangle', instructorName: 'John Danaher', qualityScore: 9.5, positionCategory: 'Submissions', giOrNogi: 'both' },
  { videoUrl: 'https://youtube.com/watch?v=y6T1Dkk8jWU', title: 'Armbar Guide', techniqueName: 'Armbar', instructorName: 'John Danaher', qualityScore: 9.5, positionCategory: 'Submissions', giOrNogi: 'both' },
  { videoUrl: 'https://youtube.com/watch?v=LA2KC4NfOVU', title: 'Back Attacks', techniqueName: 'Back Takes', instructorName: 'John Danaher', qualityScore: 9.5, positionCategory: 'Position', giOrNogi: 'both' },
  { videoUrl: 'https://youtube.com/watch?v=2XXETsqS6Wk', title: 'Guard Retention', techniqueName: 'Guard', instructorName: 'Gordon Ryan', qualityScore: 9.0, positionCategory: 'Guard', giOrNogi: 'nogi' },
  { videoUrl: 'https://youtube.com/watch?v=JCTh3WXpzN8', title: 'Half Guard', techniqueName: 'Half Guard', instructorName: 'Lachlan Giles', qualityScore: 9.0, positionCategory: 'Guard', giOrNogi: 'both' },
  { videoUrl: 'https://youtube.com/watch?v=VVxGzKNdRgM', title: 'Spider Guard', techniqueName: 'Spider', instructorName: 'Bernardo Faria', qualityScore: 8.5, positionCategory: 'Guard', giOrNogi: 'gi' },
  { videoUrl: 'https://youtube.com/watch?v=6nP3EWzY0Xc', title: 'X-Guard', techniqueName: 'X-Guard', instructorName: 'Marcelo Garcia', qualityScore: 9.0, positionCategory: 'Guard', giOrNogi: 'both' },
  { videoUrl: 'https://youtube.com/watch?v=t7w4xO-W7rE', title: 'Mount Attacks', techniqueName: 'Mount', instructorName: 'Roger Gracie', qualityScore: 9.0, positionCategory: 'Position', giOrNogi: 'gi' },
  { videoUrl: 'https://youtube.com/watch?v=PVq3XNwDlxM', title: 'Fundamentals', techniqueName: 'Basics', instructorName: 'Caio Terra', qualityScore: 8.5, positionCategory: 'Fundamentals', giOrNogi: 'both' },
  { videoUrl: 'https://youtube.com/watch?v=qRPKqbP7KhU', title: 'Lapel Guard', techniqueName: 'Lapel', instructorName: 'Keenan Cornelius', qualityScore: 8.5, positionCategory: 'Guard', giOrNogi: 'gi' }
];

async function seed() {
  try {
    await db.insert(aiVideoKnowledge).values(videos);
    console.log('✅ Successfully added 10 videos');
    const count = await db.select().from(aiVideoKnowledge);
    console.log(`Total videos in database: ${count.length}`);
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await pool.end();
    process.exit(1);
  }
}

seed();
