import { useState, useMemo, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ArrowLeft, Bot } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { useToast } from "@/hooks/use-toast";
import { TrainingLogSheet } from "@/components/training-log-sheet";

interface TrainingSession {
  id: number;
  userId: string;
  sessionDate: string;
  mood: string | null;
  sessionType: string | null;
  durationMinutes: number | null;
  isGi: boolean | null;
  notes: string | null;
  rolls: number | null;
  submissions: number | null;
  taps: number | null;
  techniques: Array<{
    id: number;
    taxonomy_id: number;
    technique_name: string | null;
    slug: string | null;
    category: string;
  }>;
}

interface TrainingStats {
  currentStreak: number;
  longestStreak: number;
  weekCount: number;
  monthCount: number;
  totalCount: number;
  trainedToday: boolean;
  sessionsToday: number;
  daysSinceLastSession: number;
  mostLoggedTechnique: string | null;
}

const MOOD_EMOJI: Record<string, string> = {
  great: '\uD83D\uDD25',
  good: '\uD83D\uDC4D',
  tough: '\uD83D\uDE24',
  rough: '\uD83D\uDC80',
};

const MOOD_LABELS: Record<string, string> = {
  great: 'Great',
  good: 'Good',
  tough: 'Tough',
  rough: 'Rough',
};

const SESSION_TYPE_LABELS: Record<string, string> = {
  class: 'Class',
  sparring: 'Sparring',
  open_mat: 'Open Mat',
  competition: 'Comp',
  drilling: 'Drilling',
  private: 'Private',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function getMonthDays(year: number, month: number) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startOffset = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const days: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let i = 1; i <= totalDays; i++) days.push(i);
  return days;
}

function formatDateStr(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getInsightMessage(stats: TrainingStats): string {
  const { currentStreak, weekCount, sessionsToday, daysSinceLastSession, totalCount, mostLoggedTechnique } = stats;

  if (totalCount === 0) return "Log your first session and I'll start tracking your journey.";
  if (totalCount === 1) return "First one logged. This is where it starts.";
  if (currentStreak >= 14) return `\uD83D\uDD25 ${currentStreak} days straight. That's elite.`;
  if (currentStreak >= 7) return `\uD83D\uDD25 ${currentStreak} days. You're building something.`;
  if (weekCount >= 5) return `${weekCount} sessions this week. You're a machine.`;
  if (daysSinceLastSession === 0 && sessionsToday > 1) return "Twice today. That's a competitor's mentality.";
  if (weekCount >= 3) return `${weekCount} sessions this week. Solid work.`;
  if (daysSinceLastSession === 1) return "Back on the mat. Let's go.";
  if (daysSinceLastSession >= 5) return "It's been a minute. No judgment \u2014 just get back.";
  if (daysSinceLastSession >= 2) return "Haven't seen you in a couple days. Your mat is waiting.";
  if (mostLoggedTechnique) return `You've been drilling ${mostLoggedTechnique} a lot. That focus pays off.`;
  if (currentStreak >= 2) return `\uD83D\uDD25 ${currentStreak} day streak. Keep it rolling.`;
  return "Your mat is waiting. Let's get after it.";
}

export default function IOSTrainingPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showStatsDetail, setShowStatsDetail] = useState(false);
  const [showDaySessionsList, setShowDaySessionsList] = useState(false);
  const [daySessionsDate, setDaySessionsDate] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: number }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: statsData } = useQuery<TrainingStats>({
    queryKey: ['/api/training/stats'],
    enabled: !!user?.id,
  });

  const { data: sessionsData } = useQuery<{ sessions: TrainingSession[] }>({
    queryKey: [`/api/training/sessions?month=${currentMonth + 1}&year=${currentYear}`],
    enabled: !!user?.id,
  });

  const { data: recentData } = useQuery<{ sessions: TrainingSession[] }>({
    queryKey: ['/api/training/sessions'],
    enabled: !!user?.id,
  });

  const sessions = sessionsData?.sessions || [];
  const allSessions = recentData?.sessions || [];
  const stats = statsData || {
    currentStreak: 0, longestStreak: 0, weekCount: 0, monthCount: 0,
    totalCount: 0, trainedToday: false, sessionsToday: 0, daysSinceLastSession: -1,
    mostLoggedTechnique: null,
  };

  const trainedDates = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => set.add(s.sessionDate));
    return set;
  }, [sessions]);

  const sessionsByDate = useMemo(() => {
    const map = new Map<string, TrainingSession[]>();
    sessions.forEach(s => {
      const existing = map.get(s.sessionDate) || [];
      existing.push(s);
      map.set(s.sessionDate, existing);
    });
    return map;
  }, [sessions]);

  const days = useMemo(() => getMonthDays(currentYear, currentMonth), [currentYear, currentMonth]);
  const today = new Date();
  const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const navigateMonth = useCallback((dir: 1 | -1) => {
    setCurrentMonth(prev => {
      const newMonth = prev + dir;
      if (newMonth < 0) {
        setCurrentYear(y => y - 1);
        return 11;
      }
      if (newMonth > 11) {
        setCurrentYear(y => y + 1);
        return 0;
      }
      return newMonth;
    });
  }, []);

  const handleDayPress = useCallback((day: number) => {
    const dateStr = formatDateStr(currentYear, currentMonth, day);
    const futureCheck = new Date(currentYear, currentMonth, day);
    futureCheck.setHours(0, 0, 0, 0);
    const todayCheck = new Date();
    todayCheck.setHours(0, 0, 0, 0);
    if (futureCheck > todayCheck) return;

    triggerHaptic('light');
    const daySessions = sessionsByDate.get(dateStr) || [];

    if (daySessions.length === 0) {
      setEditingSession(null);
      setSelectedDate(dateStr);
      setShowLogSheet(true);
    } else if (daySessions.length === 1) {
      setEditingSession(daySessions[0]);
      setSelectedDate(dateStr);
      setShowLogSheet(true);
    } else {
      setDaySessionsDate(dateStr);
      setShowDaySessionsList(true);
    }
  }, [currentYear, currentMonth, sessionsByDate]);

  const handleSheetClose = useCallback(() => {
    setShowLogSheet(false);
    setEditingSession(null);
    setSelectedDate(null);
  }, []);

  const handleSheetSave = useCallback(() => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.('/api/training') });
    setShowLogSheet(false);
    setEditingSession(null);
    setSelectedDate(null);
    setShowDaySessionsList(false);
  }, [queryClient]);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.date) {
        setEditingSession(null);
        setSelectedDate(detail.date);
        setShowLogSheet(true);
      }
    };
    window.addEventListener('training-add-another', handler);
    return () => window.removeEventListener('training-add-another', handler);
  }, []);

  const recentSessions = useMemo(() => {
    return [...allSessions]
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
      .slice(0, 7);
  }, [allSessions]);

  if (showStatsDetail) {
    return (
      <div className="ios-page" style={{ minHeight: '100vh', background: '#0A0A0B', color: '#FFFFFF', paddingBottom: '100px' }}>
        <div style={{ padding: '16px 20px', paddingTop: 'max(16px, env(safe-area-inset-top))', borderBottom: '1px solid #2A2A2E', position: 'sticky', top: 0, background: '#0A0A0B', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button onClick={() => setShowStatsDetail(false)} data-testid="button-stats-back" style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', color: '#FFFFFF' }}>
              <ArrowLeft size={24} />
            </button>
            <h1 style={{ fontSize: '20px', fontWeight: 700, margin: 0 }}>Training Stats</h1>
          </div>
        </div>
        <div style={{ padding: '20px' }}>
          <div style={{ background: '#121214', borderRadius: '12px', overflow: 'hidden' }}>
            {[
              { label: 'Sessions this week', value: stats.weekCount },
              { label: 'Sessions this month', value: stats.monthCount },
              { label: 'Longest streak', value: `${stats.longestStreak} days` },
              { label: 'Total sessions', value: stats.totalCount },
            ].map((item, i) => (
              <div key={i} style={{ padding: '16px 20px', borderBottom: i < 3 ? '1px solid #1A1A1D' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '15px', color: '#A1A1AA' }}>{item.label}</span>
                <span style={{ fontSize: '17px', fontWeight: 600, color: '#FFFFFF' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const daySessionsForList = daySessionsDate ? (sessionsByDate.get(daySessionsDate) || []) : [];
  const daySessionsDateObj = daySessionsDate ? new Date(daySessionsDate + 'T00:00:00') : null;

  return (
    <div className="ios-page" style={{ minHeight: '100vh', background: '#0A0A0B', color: '#FFFFFF', paddingBottom: '100px' }}>
      <div style={{ padding: '16px 20px', paddingTop: 'max(16px, env(safe-area-inset-top))', position: 'sticky', top: 0, background: '#0A0A0B', zIndex: 10 }}>
        <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0 }} data-testid="text-training-title">Training</h1>
      </div>

      <div style={{ padding: '0 20px' }}>
        <button
          onClick={() => { triggerHaptic('light'); setShowStatsDetail(true); }}
          data-testid="button-streak-line"
          style={{ background: 'transparent', border: 'none', padding: '0 0 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', width: '100%' }}
        >
          {stats.currentStreak > 0 ? (
            <>
              <span style={{ fontSize: '16px' }}>{'\uD83D\uDD25'}</span>
              <span style={{ fontSize: '16px', fontWeight: 700, color: '#FFFFFF' }}>{stats.currentStreak}</span>
              <span style={{ fontSize: '16px', color: '#71717A' }}>day streak</span>
            </>
          ) : (
            <span style={{ fontSize: '16px', color: '#71717A' }}>Start your streak</span>
          )}
        </button>

        <div style={{ background: '#121214', borderRadius: '12px', padding: '16px', marginBottom: '16px' }} data-testid="calendar-grid">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <button onClick={() => navigateMonth(-1)} data-testid="button-prev-month" style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', color: '#71717A' }}>
              <ChevronLeft size={20} />
            </button>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }} data-testid="text-current-month">
              {monthNames[currentMonth]} {currentYear}
            </span>
            <button onClick={() => navigateMonth(1)} data-testid="button-next-month" style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', color: '#71717A' }}>
              <ChevronRight size={20} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px' }}>
            {WEEKDAYS.map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '11px', color: '#71717A', padding: '4px 0', fontWeight: 500 }}>{d}</div>
            ))}
            {days.map((day, i) => {
              if (day === null) return <div key={`empty-${i}`} />;

              const dateStr = formatDateStr(currentYear, currentMonth, day);
              const isTrained = trainedDates.has(dateStr);
              const isToday = dateStr === todayStr;
              const cellDate = new Date(currentYear, currentMonth, day);
              cellDate.setHours(0, 0, 0, 0);
              const todayDate = new Date();
              todayDate.setHours(0, 0, 0, 0);
              const isFuture = cellDate > todayDate;

              let bg = 'transparent';
              let color = '#71717A';
              let fontWeight = 400;
              let boxShadow = 'none';

              const isSelected = selectedDate === dateStr;

              if (isFuture) {
                color = 'rgba(113, 113, 122, 0.4)';
              } else if (isSelected) {
                bg = '#8B5CF6';
                color = '#FFFFFF';
                fontWeight = 600;
                boxShadow = '0 0 10px rgba(139, 92, 246, 0.5)';
              } else if (isToday && isTrained) {
                bg = '#9B6FF6';
                color = '#FFFFFF';
                fontWeight = 600;
                boxShadow = '0 0 12px rgba(139, 92, 246, 0.5)';
              } else if (isToday && !isTrained) {
                bg = 'rgba(139, 92, 246, 0.2)';
                color = '#A78BFA';
                fontWeight = 600;
              } else if (isTrained) {
                bg = '#8B5CF6';
                color = '#FFFFFF';
                fontWeight = 600;
                boxShadow = '0 0 6px rgba(139, 92, 246, 0.3)';
              }

              return (
                <button
                  key={day}
                  onClick={() => !isFuture && handleDayPress(day)}
                  data-testid={`calendar-day-${day}`}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    border: 'none',
                    background: bg,
                    color,
                    fontSize: '13px',
                    fontWeight,
                    cursor: isFuture ? 'default' : 'pointer',
                    padding: 0,
                    boxShadow,
                    position: 'relative',
                    outline: 'none',
                    transition: 'background 0.1s ease-out',
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {stats.totalCount < 3 && (
          <div style={{ textAlign: 'center', padding: '4px 0 16px', fontSize: '14px', color: '#71717A' }} data-testid="text-first-time-hint">
            {stats.totalCount === 0 ? "Tap a date to log your first session." : "Tap a date to log your session"}
          </div>
        )}

        {stats.totalCount === 0 && (
          <div style={{ textAlign: 'center', padding: '20px 0 24px' }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', marginBottom: '8px' }}>Track Your Training</div>
            <div style={{ fontSize: '14px', color: '#71717A' }}>Tap a date to log your first session.</div>
          </div>
        )}

        {recentSessions.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '12px', color: '#FFFFFF' }} data-testid="text-recent-sessions">
              Recent Sessions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentSessions.map(session => {
                const sessionDate = new Date(session.sessionDate + 'T00:00:00');
                const dateLabel = sessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const moodEmoji = session.mood ? MOOD_EMOJI[session.mood] || '' : '';
                const moodLabel = session.mood ? MOOD_LABELS[session.mood] || '' : '';
                const typeLabel = session.sessionType ? SESSION_TYPE_LABELS[session.sessionType] || session.sessionType : '';
                const giLabel = session.isGi === false ? 'No-Gi' : session.isGi ? 'Gi' : '';
                const firstLine = [dateLabel, moodEmoji ? `${moodEmoji} ${moodLabel}` : '', typeLabel, giLabel].filter(Boolean).join(' \u00B7 ');
                const techNames = session.techniques?.map(t => t.technique_name).filter(Boolean).join(' \u00B7 ') || '';
                const notesPreview = session.notes ? `"${session.notes.split('\n')[0].slice(0, 60)}${session.notes.length > 60 ? '\u2026' : ''}"` : '';

                return (
                  <button
                    key={session.id}
                    data-testid={`session-card-${session.id}`}
                    onClick={() => {
                      triggerHaptic('light');
                      setEditingSession(session);
                      setSelectedDate(session.sessionDate);
                      setShowLogSheet(true);
                    }}
                    style={{
                      background: '#121214',
                      borderRadius: '12px',
                      padding: '14px 16px',
                      cursor: 'pointer',
                      textAlign: 'left',
                      border: 'none',
                      width: '100%',
                    }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#FFFFFF', marginBottom: techNames ? '4px' : '0' }}>{firstLine}</div>
                    {techNames && <div style={{ fontSize: '13px', color: '#A78BFA', marginBottom: notesPreview ? '4px' : '0' }}>{techNames}</div>}
                    {notesPreview && <div style={{ fontSize: '12px', color: '#71717A', fontStyle: 'italic' }}>{notesPreview}</div>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {stats.totalCount > 0 && (
          <div
            style={{
              background: '#121214',
              borderRadius: '12px',
              padding: '16px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '12px',
              border: '1px solid rgba(139, 92, 246, 0.15)',
              marginBottom: '16px',
            }}
            data-testid="insight-card"
          >
            <div style={{
              width: '36px', height: '36px', borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <Bot size={18} color="#8B5CF6" />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', color: '#8B5CF6', fontWeight: 600, marginBottom: '4px' }}>PROF. OS</div>
              <div style={{ fontSize: '14px', color: '#E4E4E7', lineHeight: '1.5' }}>
                {getInsightMessage(stats)}
              </div>
            </div>
          </div>
        )}
      </div>

      {showDaySessionsList && daySessionsDate && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDaySessionsList(false); }}
          data-testid="day-sessions-list-backdrop"
        >
          <div style={{ background: '#121214', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', maxHeight: '70vh', overflowY: 'auto', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
              <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#3A3A3E' }} />
            </div>
            <div style={{ padding: '8px 20px 16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: 700, color: '#FFFFFF', marginBottom: '16px' }}>
                {daySessionsDateObj?.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {daySessionsForList.map(session => {
                  const moodEmoji = session.mood ? MOOD_EMOJI[session.mood] || '' : '';
                  const moodLabel = session.mood ? MOOD_LABELS[session.mood] || '' : '';
                  const typeLabel = session.sessionType ? SESSION_TYPE_LABELS[session.sessionType] || session.sessionType : '';
                  const giLabel = session.isGi === false ? 'No-Gi' : session.isGi ? 'Gi' : '';
                  const techNames = session.techniques?.map(t => t.technique_name).filter(Boolean).join(' \u00B7 ') || '';

                  return (
                    <div key={session.id} style={{ background: '#1A1A1D', borderRadius: '10px', padding: '14px 16px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: techNames ? '6px' : '0' }}>
                        <div style={{ fontSize: '14px', color: '#FFFFFF' }}>
                          {[moodEmoji ? `${moodEmoji} ${moodLabel}` : '', typeLabel, giLabel].filter(Boolean).join(' \u00B7 ')}
                        </div>
                        <button
                          onClick={() => {
                            triggerHaptic('light');
                            setEditingSession(session);
                            setSelectedDate(session.sessionDate);
                            setShowDaySessionsList(false);
                            setShowLogSheet(true);
                          }}
                          data-testid={`button-edit-session-${session.id}`}
                          style={{ background: 'transparent', border: 'none', color: '#8B5CF6', fontSize: '14px', fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}
                        >
                          Edit
                        </button>
                      </div>
                      {techNames && <div style={{ fontSize: '13px', color: '#A1A1AA' }}>{techNames}</div>}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => {
                  triggerHaptic('light');
                  setEditingSession(null);
                  setSelectedDate(daySessionsDate);
                  setShowDaySessionsList(false);
                  setShowLogSheet(true);
                }}
                data-testid="button-add-another-session"
                style={{
                  width: '100%',
                  marginTop: '16px',
                  padding: '14px',
                  background: 'transparent',
                  border: '1px solid #2A2A2E',
                  borderRadius: '10px',
                  color: '#8B5CF6',
                  fontSize: '15px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                + Add another session
              </button>
            </div>
          </div>
        </div>
      )}

      {showLogSheet && (
        <TrainingLogSheet
          date={selectedDate || todayStr}
          existingSession={editingSession}
          onClose={handleSheetClose}
          onSave={handleSheetSave}
        />
      )}
    </div>
  );
}
