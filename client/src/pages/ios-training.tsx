import { useState, useMemo, useCallback } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Plus, Flame, Calendar, TrendingUp, ChevronLeft, ChevronRight, Trash2, X } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { apiRequest } from "@/lib/queryClient";
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
}

const MOODS: Record<string, string> = {
  great: 'Great',
  good: 'Good',
  okay: 'Okay',
  tough: 'Tough',
  rough: 'Rough',
};

const MOOD_COLORS: Record<string, string> = {
  great: '#22C55E',
  good: '#86EFAC',
  okay: '#FBBF24',
  tough: '#F97316',
  rough: '#EF4444',
};

const SESSION_TYPES: Record<string, string> = {
  drilling: 'Drilling',
  sparring: 'Sparring',
  competition: 'Competition',
  private: 'Private',
  open_mat: 'Open Mat',
  class: 'Class',
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

export default function IOSTrainingPage() {
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [showLogSheet, setShowLogSheet] = useState(false);
  const [editingSession, setEditingSession] = useState<TrainingSession | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: user } = useQuery<{ id: number }>({
    queryKey: ["/api/auth/me"],
  });

  const { data: statsData } = useQuery<TrainingStats>({
    queryKey: ['/api/training/stats'],
    enabled: !!user?.id,
  });

  const { data: sessionsData, isLoading } = useQuery<{ sessions: TrainingSession[] }>({
    queryKey: [`/api/training/sessions?month=${currentMonth + 1}&year=${currentYear}`],
    enabled: !!user?.id,
  });

  const deleteMutation = useMutation({
    mutationFn: async (sessionId: number) => {
      await apiRequest('DELETE', `/api/training/sessions/${sessionId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith('/api/training/') });
      triggerHaptic('medium');
      toast({ title: "Session deleted" });
    },
  });

  const sessions = sessionsData?.sessions || [];
  const stats = statsData || { currentStreak: 0, longestStreak: 0, weekCount: 0, monthCount: 0, totalCount: 0, trainedToday: false };

  const trainedDates = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach(s => set.add(s.sessionDate));
    return set;
  }, [sessions]);

  const days = useMemo(() => getMonthDays(currentYear, currentMonth), [currentYear, currentMonth]);
  const today = new Date();
  const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const navigateMonth = useCallback((dir: 1 | -1) => {
    triggerHaptic('light');
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
    triggerHaptic('light');
    const existing = sessions.find(s => s.sessionDate === dateStr);
    if (existing) {
      setEditingSession(existing);
      setSelectedDate(dateStr);
      setShowLogSheet(true);
    } else {
      setEditingSession(null);
      setSelectedDate(dateStr);
      setShowLogSheet(true);
    }
  }, [currentYear, currentMonth, sessions]);

  const handleLogPress = useCallback(() => {
    triggerHaptic('medium');
    setEditingSession(null);
    setSelectedDate(todayStr);
    setShowLogSheet(true);
  }, [todayStr]);

  const handleSheetClose = useCallback(() => {
    setShowLogSheet(false);
    setEditingSession(null);
    setSelectedDate(null);
  }, []);

  const handleSheetSave = useCallback(() => {
    queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith('/api/training/') });
    setShowLogSheet(false);
    setEditingSession(null);
    setSelectedDate(null);
  }, [queryClient]);

  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
      .slice(0, 5);
  }, [sessions]);

  const weekDots = useMemo(() => {
    const result: boolean[] = [];
    const now = new Date();
    const dayOfWeek = now.getDay();
    for (let i = 0; i < 7; i++) {
      const d = new Date(now);
      d.setDate(now.getDate() - dayOfWeek + i);
      const str = formatDateStr(d.getFullYear(), d.getMonth(), d.getDate());
      result.push(trainedDates.has(str));
    }
    return result;
  }, [trainedDates]);

  return (
    <div
      className="ios-page"
      style={{
        minHeight: '100vh',
        background: '#0A0A0B',
        color: '#FFFFFF',
        paddingBottom: '100px',
      }}
    >
      <div style={{
        padding: '16px 20px',
        paddingTop: 'max(16px, env(safe-area-inset-top))',
        borderBottom: '1px solid #2A2A2E',
        position: 'sticky',
        top: 0,
        background: '#0A0A0B',
        zIndex: 10,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1 style={{ fontSize: '28px', fontWeight: 700, margin: 0 }} data-testid="text-training-title">Training</h1>
          <button
            onClick={handleLogPress}
            data-testid="button-log-training"
            style={{
              background: '#8B5CF6',
              border: 'none',
              borderRadius: '12px',
              padding: '10px 18px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#FFFFFF',
              fontSize: '14px',
              fontWeight: 600,
            }}
          >
            <Plus size={18} />
            Log
          </button>
        </div>
      </div>

      <div style={{ padding: '16px 20px' }}>
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '20px',
        }}>
          <div style={{
            flex: 1,
            background: '#121214',
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }} data-testid="stat-streak">
            <Flame size={22} color="#F97316" />
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF' }}>{stats.currentStreak}</div>
              <div style={{ fontSize: '11px', color: '#71717A' }}>day streak</div>
            </div>
          </div>
          <div style={{
            flex: 1,
            background: '#121214',
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }} data-testid="stat-week">
            <Calendar size={22} color="#8B5CF6" />
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF' }}>{stats.weekCount}</div>
              <div style={{ fontSize: '11px', color: '#71717A' }}>this week</div>
            </div>
          </div>
          <div style={{
            flex: 1,
            background: '#121214',
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }} data-testid="stat-month">
            <TrendingUp size={22} color="#22C55E" />
            <div>
              <div style={{ fontSize: '22px', fontWeight: 700, color: '#FFFFFF' }}>{stats.monthCount}</div>
              <div style={{ fontSize: '11px', color: '#71717A' }}>this month</div>
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '8px',
          marginBottom: '20px',
        }} data-testid="week-dots">
          {WEEKDAYS.map((day, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '10px', color: '#71717A', marginBottom: '4px' }}>{day}</div>
              <div style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: weekDots[i] ? '#8B5CF6' : '#1A1A1D',
                border: weekDots[i] ? 'none' : '1px solid #2A2A2E',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                {weekDots[i] && (
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#FFFFFF' }} />
                )}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          background: '#121214',
          borderRadius: '16px',
          padding: '16px',
          marginBottom: '20px',
        }} data-testid="calendar-grid">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <button
              onClick={() => navigateMonth(-1)}
              data-testid="button-prev-month"
              style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', color: '#71717A' }}
            >
              <ChevronLeft size={20} />
            </button>
            <span style={{ fontSize: '15px', fontWeight: 600, color: '#FFFFFF' }} data-testid="text-current-month">
              {monthNames[currentMonth]} {currentYear}
            </span>
            <button
              onClick={() => navigateMonth(1)}
              data-testid="button-next-month"
              style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', color: '#71717A' }}
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
            {WEEKDAYS.map((d, i) => (
              <div key={i} style={{ textAlign: 'center', fontSize: '11px', color: '#71717A', padding: '4px 0', fontWeight: 500 }}>
                {d}
              </div>
            ))}
            {days.map((day, i) => {
              if (day === null) {
                return <div key={`empty-${i}`} />;
              }
              const dateStr = formatDateStr(currentYear, currentMonth, day);
              const isTrained = trainedDates.has(dateStr);
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={day}
                  onClick={() => handleDayPress(day)}
                  data-testid={`calendar-day-${day}`}
                  style={{
                    width: '100%',
                    aspectRatio: '1',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '50%',
                    border: isToday && !isTrained ? '1px solid #8B5CF6' : 'none',
                    background: isTrained ? '#8B5CF6' : 'transparent',
                    color: isTrained ? '#FFFFFF' : isToday ? '#8B5CF6' : '#A1A1AA',
                    fontSize: '13px',
                    fontWeight: isTrained || isToday ? 600 : 400,
                    cursor: 'pointer',
                    padding: 0,
                  }}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>

        {!stats.trainedToday && (
          <button
            onClick={handleLogPress}
            data-testid="button-log-today-cta"
            style={{
              width: '100%',
              background: 'rgba(139, 92, 246, 0.08)',
              border: '1px solid rgba(139, 92, 246, 0.2)',
              borderRadius: '12px',
              padding: '16px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px',
              color: '#FFFFFF',
            }}
          >
            <div style={{
              width: '40px', height: '40px', borderRadius: '50%',
              background: 'rgba(139, 92, 246, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <Plus size={20} color="#8B5CF6" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <div style={{ fontSize: '15px', fontWeight: 600 }}>Log today's training</div>
              <div style={{ fontSize: '12px', color: '#71717A' }}>
                {stats.currentStreak > 0 
                  ? `Keep your ${stats.currentStreak}-day streak going!`
                  : 'Start building your streak!'
                }
              </div>
            </div>
          </button>
        )}

        {recentSessions.length > 0 && (
          <div>
            <h2 style={{ fontSize: '17px', fontWeight: 600, marginBottom: '12px', color: '#FFFFFF' }} data-testid="text-recent-sessions">
              Recent Sessions
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {recentSessions.map(session => {
                const sessionDate = new Date(session.sessionDate + 'T00:00:00');
                const dayName = sessionDate.toLocaleDateString('en-US', { weekday: 'short' });
                const dateLabel = sessionDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                return (
                  <div
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
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{
                      width: '40px', height: '40px', borderRadius: '10px',
                      background: session.mood ? `${MOOD_COLORS[session.mood]}15` : '#1A1A1D',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <div style={{
                        width: '10px', height: '10px', borderRadius: '50%',
                        background: session.mood ? MOOD_COLORS[session.mood] : '#71717A',
                      }} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '14px', fontWeight: 600, color: '#FFFFFF' }}>
                          {dayName}, {dateLabel}
                        </span>
                        {session.sessionType && (
                          <span style={{
                            fontSize: '11px',
                            color: '#A78BFA',
                            background: 'rgba(139, 92, 246, 0.1)',
                            padding: '2px 8px',
                            borderRadius: '100px',
                          }}>
                            {SESSION_TYPES[session.sessionType] || session.sessionType}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: '#71717A', marginTop: '2px' }}>
                        {[
                          session.mood ? MOODS[session.mood] : null,
                          session.durationMinutes ? `${session.durationMinutes}min` : null,
                          session.isGi === false ? 'No-Gi' : session.isGi ? 'Gi' : null,
                          session.techniques?.length ? `${session.techniques.length} techniques` : null,
                        ].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        triggerHaptic('medium');
                        deleteMutation.mutate(session.id);
                      }}
                      data-testid={`button-delete-session-${session.id}`}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        padding: '8px',
                        cursor: 'pointer',
                        color: '#71717A',
                        flexShrink: 0,
                      }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

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
