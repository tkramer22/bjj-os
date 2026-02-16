import express from 'express';
import jwt from 'jsonwebtoken';
import { db } from "./db";
import { trainingSessions, trainingSessionTechniques } from "@shared/schema";
import { eq, desc, sql, and, gte, lte, count } from "drizzle-orm";

const router = express.Router();
const JWT_SECRET = process.env.SESSION_SECRET || 'your-secret-key';

let tablesInitialized = false;

async function ensureTablesExist() {
  if (tablesInitialized) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS training_sessions (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        session_date DATE NOT NULL,
        mood VARCHAR(20),
        session_type VARCHAR(20),
        duration_minutes INTEGER,
        is_gi BOOLEAN DEFAULT true,
        notes TEXT,
        rolls INTEGER DEFAULT 0,
        submissions INTEGER DEFAULT 0,
        taps INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT now() NOT NULL,
        updated_at TIMESTAMP DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS training_session_techniques (
        id SERIAL PRIMARY KEY,
        session_id INTEGER NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
        taxonomy_id INTEGER NOT NULL,
        category VARCHAR(20) NOT NULL,
        created_at TIMESTAMP DEFAULT now() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_training_sessions_user ON training_sessions(user_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_training_sessions_date ON training_sessions(session_date)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_training_techniques_session ON training_session_techniques(session_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_training_techniques_taxonomy ON training_session_techniques(taxonomy_id)`);

    try {
      await db.execute(sql`ALTER TABLE training_sessions DROP CONSTRAINT IF EXISTS unique_user_session_date`);
    } catch (e) {}

    tablesInitialized = true;
    console.log('[TRAINING] Tables initialized successfully');
  } catch (e: any) {
    if (e.message?.includes('already exists')) {
      tablesInitialized = true;
    } else {
      console.error('[TRAINING] Table initialization error:', e.message);
    }
  }
}

function getUserId(req: express.Request): string | null {
  if ((req as any).userId) return String((req as any).userId);
  const xUserId = req.headers['x-user-id'] as string;
  if (xUserId) return xUserId;
  return null;
}

router.use(async (req, _res, next) => {
  await ensureTablesExist();
  try {
    let token = req.cookies?.sessionToken;
    const authHeader = req.headers.authorization;
    if (!token && authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }
    if (token) {
      const decoded: any = jwt.verify(token, JWT_SECRET);
      if (decoded?.userId) {
        (req as any).userId = decoded.userId;
      }
    }
  } catch (e) {}
  next();
});

function normalizeSession(s: any) {
  const dateVal = s.session_date ?? s.sessionDate;
  let sessionDate: string;
  if (dateVal instanceof Date) {
    sessionDate = dateVal.toISOString().split('T')[0];
  } else if (typeof dateVal === 'string') {
    sessionDate = dateVal.includes('T') ? dateVal.split('T')[0] : dateVal;
  } else {
    sessionDate = String(dateVal);
  }
  return {
    id: s.id,
    userId: s.user_id ?? s.userId,
    sessionDate,
    mood: s.mood,
    sessionType: s.session_type ?? s.sessionType,
    durationMinutes: s.duration_minutes ?? s.durationMinutes,
    isGi: s.is_gi ?? s.isGi,
    notes: s.notes,
    rolls: s.rolls,
    submissions: s.submissions,
    taps: s.taps,
    createdAt: s.created_at ?? s.createdAt,
    updatedAt: s.updated_at ?? s.updatedAt,
  };
}

router.get('/sessions', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { month, year } = req.query;
    const userIdStr = String(userId);

    let sessions: any[];
    if (month && year) {
      const m = String(month).padStart(2, '0');
      const y = String(year);
      const startDate = `${y}-${m}-01`;
      const endMonth = Number(month) === 12 ? 1 : Number(month) + 1;
      const endYear = Number(month) === 12 ? Number(year) + 1 : Number(year);
      const endDate = `${endYear}-${String(endMonth).padStart(2, '0')}-01`;
      const result = await db.execute(sql`
        SELECT * FROM training_sessions
        WHERE user_id = ${userIdStr}
        AND session_date >= ${startDate}::date
        AND session_date < ${endDate}::date
        ORDER BY session_date DESC, created_at DESC
      `);
      sessions = Array.isArray(result) ? result : (result as any).rows || [];
    } else {
      const result = await db.execute(sql`
        SELECT * FROM training_sessions
        WHERE user_id = ${userIdStr}
        ORDER BY session_date DESC, created_at DESC
      `);
      sessions = Array.isArray(result) ? result : (result as any).rows || [];
    }

    const sessionIds = sessions.map((s: any) => Number(s.id)).filter((id: number) => Number.isInteger(id) && id > 0);
    let techniques: any[] = [];
    if (sessionIds.length > 0) {
      const idParams = sessionIds.map((id: number) => sql`${String(id)}::int`);
      const techResult = await db.execute(sql`
        SELECT tst.*, ttv2.name as technique_name, ttv2.slug, ttv2.level
        FROM training_session_techniques tst
        LEFT JOIN technique_taxonomy_v2 ttv2 ON tst.taxonomy_id = ttv2.id
        WHERE tst.session_id IN (${sql.join(idParams, sql`, `)})
      `);
      techniques = Array.isArray(techResult) ? techResult : (techResult as any).rows || [];
    }

    const sessionsWithTechniques = sessions.map((s: any) => ({
      ...normalizeSession(s),
      techniques: (techniques as any[]).filter((t: any) => t.session_id === s.id),
    }));

    res.json({ sessions: sessionsWithTechniques });
  } catch (error: any) {
    console.error('[TRAINING] Error fetching sessions:', error.message, error.stack?.slice(0, 300));
    res.status(500).json({ error: 'Failed to fetch sessions' });
  }
});

router.post('/sessions', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const { sessionDate, mood, sessionType, durationMinutes, isGi, notes, rolls, submissions, taps, techniques } = req.body;

    if (!sessionDate) return res.status(400).json({ error: 'Session date is required' });

    const [session] = await db
      .insert(trainingSessions)
      .values({
        userId: String(userId),
        sessionDate, mood, sessionType, durationMinutes, isGi, notes,
        rolls: rolls || 0, submissions: submissions || 0, taps: taps || 0,
      })
      .returning();

    if (techniques && Array.isArray(techniques) && techniques.length > 0) {
      const techValues = techniques.map((t: any) => ({
        sessionId: session.id,
        taxonomyId: t.taxonomyId,
        category: t.category || 'technique',
      }));
      await db.insert(trainingSessionTechniques).values(techValues);
    }

    const techResult = await db.execute(sql`
      SELECT tst.*, ttv2.name as technique_name, ttv2.slug, ttv2.level
      FROM training_session_techniques tst
      LEFT JOIN technique_taxonomy_v2 ttv2 ON tst.taxonomy_id = ttv2.id
      WHERE tst.session_id = ${session.id}
    `);
    const techs = Array.isArray(techResult) ? techResult : (techResult as any).rows || [];

    res.json({ session: { ...session, techniques: techs } });
  } catch (error: any) {
    console.error('[TRAINING] Error saving session:', error.message);
    res.status(500).json({ error: 'Failed to save session' });
  }
});

router.put('/sessions/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const sessionId = parseInt(req.params.id);
    const { mood, sessionType, durationMinutes, isGi, notes, rolls, submissions, taps, techniques } = req.body;

    const [existing] = await db
      .select()
      .from(trainingSessions)
      .where(and(eq(trainingSessions.id, sessionId), eq(trainingSessions.userId, String(userId))))
      .limit(1);

    if (!existing) return res.status(404).json({ error: 'Session not found' });

    const [updated] = await db
      .update(trainingSessions)
      .set({
        mood, sessionType, durationMinutes, isGi, notes,
        rolls: rolls || 0, submissions: submissions || 0, taps: taps || 0,
        updatedAt: new Date(),
      })
      .where(eq(trainingSessions.id, sessionId))
      .returning();

    await db.execute(sql`DELETE FROM training_session_techniques WHERE session_id = ${sessionId}`);

    if (techniques && Array.isArray(techniques) && techniques.length > 0) {
      const techValues = techniques.map((t: any) => ({
        sessionId: sessionId,
        taxonomyId: t.taxonomyId,
        category: t.category || 'technique',
      }));
      await db.insert(trainingSessionTechniques).values(techValues);
    }

    const techResult = await db.execute(sql`
      SELECT tst.*, ttv2.name as technique_name, ttv2.slug, ttv2.level
      FROM training_session_techniques tst
      LEFT JOIN technique_taxonomy_v2 ttv2 ON tst.taxonomy_id = ttv2.id
      WHERE tst.session_id = ${sessionId}
    `);
    const techs = Array.isArray(techResult) ? techResult : (techResult as any).rows || [];

    res.json({ session: { ...updated, techniques: techs } });
  } catch (error: any) {
    console.error('[TRAINING] Error updating session:', error.message);
    res.status(500).json({ error: 'Failed to update session' });
  }
});

router.delete('/sessions/:id', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const sessionId = parseInt(req.params.id);
    const [session] = await db
      .select()
      .from(trainingSessions)
      .where(and(eq(trainingSessions.id, sessionId), eq(trainingSessions.userId, String(userId))))
      .limit(1);

    if (!session) return res.status(404).json({ error: 'Session not found' });

    await db.execute(sql`DELETE FROM training_session_techniques WHERE session_id = ${sessionId}`);
    await db.delete(trainingSessions).where(eq(trainingSessions.id, sessionId));

    res.json({ success: true });
  } catch (error: any) {
    console.error('[TRAINING] Error deleting session:', error.message);
    res.status(500).json({ error: 'Failed to delete session' });
  }
});

router.get('/stats', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await db.execute(sql`
      SELECT DISTINCT session_date FROM training_sessions
      WHERE user_id = ${String(userId)}
      ORDER BY session_date DESC
    `);
    const allDates: string[] = (Array.isArray(result) ? result : (result as any).rows || [])
      .map((r: any) => {
        const d = r.session_date;
        if (d instanceof Date) return d.toISOString().split('T')[0];
        if (typeof d === 'string') return d.includes('T') ? d.split('T')[0] : d;
        return String(d);
      });

    let currentStreak = 0;
    let longestStreak = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    if (allDates.length > 0) {
      if (allDates[0] === todayStr || allDates[0] === yesterdayStr) {
        currentStreak = 1;
        for (let i = 1; i < allDates.length; i++) {
          const prev = new Date(allDates[i - 1] + 'T00:00:00');
          const curr = new Date(allDates[i] + 'T00:00:00');
          const diffDays = Math.round((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays === 1) {
            currentStreak++;
          } else {
            break;
          }
        }
      }

      let streak = 1;
      for (let i = 1; i < allDates.length; i++) {
        const prev = new Date(allDates[i - 1] + 'T00:00:00');
        const curr = new Date(allDates[i] + 'T00:00:00');
        const diffDays = Math.round((prev.getTime() - curr.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 1) {
          streak++;
        } else {
          longestStreak = Math.max(longestStreak, streak);
          streak = 1;
        }
      }
      longestStreak = Math.max(longestStreak, streak);
    }

    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const weekStr = startOfWeek.toISOString().split('T')[0];
    const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    const weekDates = allDates.filter(d => d >= weekStr);
    const monthDates = allDates.filter(d => d >= startOfMonth);

    const weekCount = weekDates.length;
    const monthCount = monthDates.length;
    const totalCount = allDates.length;
    const trainedToday = allDates.includes(todayStr);

    const sessionsTodayResult = await db.execute(sql`
      SELECT COUNT(*) as cnt FROM training_sessions
      WHERE user_id = ${String(userId)} AND session_date = ${todayStr}::date
    `);
    const sessionsToday = Number((Array.isArray(sessionsTodayResult) ? sessionsTodayResult : (sessionsTodayResult as any).rows || [])[0]?.cnt || 0);

    let daysSinceLastSession = -1;
    if (allDates.length > 0) {
      const lastDate = new Date(allDates[0] + 'T00:00:00');
      daysSinceLastSession = Math.round((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
    }

    let mostLoggedTechnique: string | null = null;
    try {
      const techResult = await db.execute(sql`
        SELECT ttv2.name, COUNT(*) as cnt
        FROM training_session_techniques tst
        JOIN training_sessions ts ON tst.session_id = ts.id
        LEFT JOIN technique_taxonomy_v2 ttv2 ON tst.taxonomy_id = ttv2.id
        WHERE ts.user_id = ${String(userId)}
          AND ts.session_date >= (CURRENT_DATE - INTERVAL '30 days')
        GROUP BY ttv2.name
        ORDER BY cnt DESC
        LIMIT 1
      `);
      const techRows = Array.isArray(techResult) ? techResult : (techResult as any).rows || [];
      if (techRows.length > 0 && techRows[0].name) {
        mostLoggedTechnique = techRows[0].name;
      }
    } catch (e) {}

    res.json({
      currentStreak,
      longestStreak,
      weekCount,
      monthCount,
      totalCount,
      trainedToday,
      sessionsToday,
      daysSinceLastSession,
      mostLoggedTechnique,
    });
  } catch (error: any) {
    console.error('[TRAINING] Error fetching stats:', error.message);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

router.get('/recent-techniques', async (req, res) => {
  try {
    const userId = getUserId(req);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const result = await db.execute(sql`
      SELECT DISTINCT ON (ttv2.id) ttv2.id, ttv2.name, ttv2.slug, ttv2.level, tst.category,
             ts.session_date
      FROM training_session_techniques tst
      JOIN training_sessions ts ON tst.session_id = ts.id
      LEFT JOIN technique_taxonomy_v2 ttv2 ON tst.taxonomy_id = ttv2.id
      WHERE ts.user_id = ${String(userId)}
      ORDER BY ttv2.id, ts.session_date DESC
      LIMIT 20
    `);
    const techniques = Array.isArray(result) ? result : (result as any).rows || [];

    res.json({ techniques });
  } catch (error: any) {
    console.error('[TRAINING] Error fetching recent techniques:', error.message);
    res.status(500).json({ error: 'Failed to fetch recent techniques' });
  }
});

export default router;
