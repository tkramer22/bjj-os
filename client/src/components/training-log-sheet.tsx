import { useState, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Search, Check, Minus, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TaxonomyNode {
  id: number;
  name: string;
  slug: string;
  level: number;
  parentName?: string;
}

interface TrainingSession {
  id: number;
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
    category: string;
  }>;
}

interface Props {
  date: string;
  existingSession: TrainingSession | null;
  onClose: () => void;
  onSave: () => void;
}

const MOODS = [
  { key: 'great', label: 'Great', emoji: '\uD83D\uDD25' },
  { key: 'good', label: 'Good', emoji: '\uD83D\uDC4D' },
  { key: 'tough', label: 'Tough', emoji: '\uD83D\uDE24' },
  { key: 'rough', label: 'Rough', emoji: '\uD83D\uDC80' },
];

const SESSION_TYPES = [
  { key: 'class', label: 'Class', emoji: '\uD83E\uDD4B' },
  { key: 'sparring', label: 'Sparring', emoji: '\uD83E\uDD3C' },
  { key: 'open_mat', label: 'Open Mat', emoji: '\uD83D\uDCDA' },
  { key: 'competition', label: 'Comp', emoji: '\uD83C\uDFC6' },
];

const DURATION_OPTIONS = [
  { label: '30m', value: 30 },
  { label: '1hr', value: 60 },
  { label: '1.5hr', value: 90 },
  { label: '2hr', value: 120 },
  { label: '2.5hr', value: 150 },
  { label: '3hr', value: 180 },
];

const DEFAULT_TECHNIQUE_CHIPS = ['Armbar', 'Triangle', 'Guard Pass', 'Sweep', 'Takedown', 'Back Take'];

export function TrainingLogSheet({ date, existingSession, onClose, onSave }: Props) {
  const isEditing = !!existingSession;
  const [mood, setMood] = useState(existingSession?.mood || '');
  const [sessionType, setSessionType] = useState(existingSession?.sessionType || '');
  const [durationMinutes, setDurationMinutes] = useState(existingSession?.durationMinutes || 60);
  const [isGi, setIsGi] = useState(existingSession?.isGi ?? true);
  const [notes, setNotes] = useState(existingSession?.notes || '');
  const [rolls, setRolls] = useState(existingSession?.rolls || 0);
  const [submissions, setSubmissions] = useState(existingSession?.submissions || 0);
  const [taps, setTaps] = useState(existingSession?.taps || 0);
  const [techSearch, setTechSearch] = useState('');
  const [selectedTechniques, setSelectedTechniques] = useState<Array<{ taxonomyId: number; name: string; category: string }>>(
    existingSession?.techniques?.map(t => ({
      taxonomyId: t.taxonomy_id,
      name: t.technique_name || 'Unknown',
      category: t.category,
    })) || []
  );
  const [showMore, setShowMore] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const sheetRef = useRef<HTMLDivElement>(null);

  const { data: searchResults } = useQuery<{ taxonomyResults?: TaxonomyNode[] }>({
    queryKey: [`/api/taxonomy/search?q=${encodeURIComponent(techSearch)}`],
    enabled: techSearch.length >= 2,
  });

  const { data: recentTechData } = useQuery<{ techniques: Array<{ id: number; name: string; slug: string; level: number; category: string }> }>({
    queryKey: ['/api/training/recent-techniques'],
  });

  const { data: statsData } = useQuery<{ currentStreak: number; totalCount: number }>({
    queryKey: ['/api/training/stats'],
  });

  const taxonomyResults = useMemo(() => {
    if (!searchResults?.taxonomyResults) return [];
    return searchResults.taxonomyResults.slice(0, 10);
  }, [searchResults]);

  const recentTechChips = useMemo(() => {
    const totalSessions = statsData?.totalCount || 0;
    if (totalSessions < 3 || !recentTechData?.techniques?.length) {
      return DEFAULT_TECHNIQUE_CHIPS.map((name, i) => ({ id: -(i + 1), name, isDefault: true }));
    }
    return recentTechData.techniques
      .filter(t => t.name)
      .slice(0, 8)
      .map(t => ({ id: t.id, name: t.name, isDefault: false }));
  }, [recentTechData, statsData]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        sessionDate: date,
        mood: mood || null,
        sessionType: sessionType || null,
        durationMinutes,
        isGi,
        notes: notes || null,
        rolls,
        submissions,
        taps,
        techniques: selectedTechniques.map(t => ({
          taxonomyId: t.taxonomyId,
          category: t.category,
        })),
      };
      if (isEditing && existingSession) {
        await apiRequest('PUT', `/api/training/sessions/${existingSession.id}`, payload);
      } else {
        await apiRequest('POST', '/api/training/sessions', payload);
      }
    },
    onSuccess: () => {
      triggerHaptic('medium');
      const streak = (statsData?.currentStreak || 0) + (isEditing ? 0 : 1);
      const milestones = [7, 14, 21, 30, 60, 90, 100];
      const isMilestone = milestones.includes(streak);

      if (isEditing) {
        toast({ title: "Session updated" });
      } else if (isMilestone) {
        triggerHaptic('success');
        toast({ title: `\uD83D\uDD25 ${streak} day streak! Keep pushing.` });
      } else {
        toast({ title: `Session logged \u00B7 \uD83D\uDD25 ${streak > 0 ? streak : 1} day streak` });
      }
      onSave();
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (!existingSession) return;
      await apiRequest('DELETE', `/api/training/sessions/${existingSession.id}`);
    },
    onSuccess: () => {
      triggerHaptic('medium');
      toast({ title: "Session deleted" });
      queryClient.invalidateQueries({ predicate: (q) => (q.queryKey[0] as string)?.startsWith?.('/api/training') });
      onSave();
    },
  });

  const toggleTechnique = useCallback((tech: { id: number; name: string }) => {
    triggerHaptic('light');
    setSelectedTechniques(prev => {
      const exists = prev.find(t => t.taxonomyId === tech.id);
      if (exists) return prev.filter(t => t.taxonomyId !== tech.id);
      return [...prev, { taxonomyId: tech.id, name: tech.name, category: 'technique' }];
    });
    setTechSearch('');
  }, []);

  const toggleChipTechnique = useCallback((chip: { id: number; name: string; isDefault?: boolean }) => {
    triggerHaptic('light');
    if (chip.isDefault) {
      setSelectedTechniques(prev => {
        const exists = prev.find(t => t.name.toLowerCase() === chip.name.toLowerCase());
        if (exists) return prev.filter(t => t.name.toLowerCase() !== chip.name.toLowerCase());
        return [...prev, { taxonomyId: chip.id, name: chip.name, category: 'technique' }];
      });
    } else {
      setSelectedTechniques(prev => {
        const exists = prev.find(t => t.taxonomyId === chip.id);
        if (exists) return prev.filter(t => t.taxonomyId !== chip.id);
        return [...prev, { taxonomyId: chip.id, name: chip.name, category: 'technique' }];
      });
    }
  }, []);

  const removeTechnique = useCallback((taxonomyId: number) => {
    triggerHaptic('light');
    setSelectedTechniques(prev => prev.filter(t => t.taxonomyId !== taxonomyId));
  }, []);

  const dateObj = new Date(date + 'T00:00:00');
  const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const chipStyle = (selected: boolean) => ({
    padding: '8px 16px',
    borderRadius: '100px',
    border: selected ? '2px solid #8B5CF6' : '1px solid #2A2A2E',
    background: selected ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
    color: selected ? '#FFFFFF' : '#A1A1AA',
    fontSize: '14px',
    fontWeight: selected ? 600 : 400,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  });

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="training-log-sheet-backdrop"
    >
      <div
        ref={sheetRef}
        style={{ background: '#121214', borderTopLeftRadius: '20px', borderTopRightRadius: '20px', maxHeight: '90vh', overflowY: 'auto', paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
        data-testid="training-log-sheet"
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#3A3A3E' }} />
        </div>

        <div style={{ padding: '8px 20px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '4px' }}>
            <div>
              <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#FFFFFF' }} data-testid="text-sheet-title">
                How was training?
              </h2>
              <div style={{ fontSize: '13px', color: '#71717A', marginTop: '4px' }} data-testid="text-sheet-date">{dateLabel}</div>
            </div>
            <button onClick={onClose} data-testid="button-close-sheet" style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', color: '#71717A' }}>
              <X size={24} />
            </button>
          </div>

          <div style={{ marginTop: '20px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {MOODS.map(m => (
                <button
                  key={m.key}
                  onClick={() => { triggerHaptic('light'); setMood(mood === m.key ? '' : m.key); }}
                  data-testid={`mood-${m.key}`}
                  style={chipStyle(mood === m.key)}
                >
                  {m.emoji} {m.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {SESSION_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => { triggerHaptic('light'); setSessionType(sessionType === t.key ? '' : t.key); }}
                  data-testid={`session-type-${t.key}`}
                  style={chipStyle(sessionType === t.key)}
                >
                  {t.emoji} {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', color: '#71717A', marginBottom: '10px' }}>What did you work on?</div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {recentTechChips.map(chip => {
                const isSelected = chip.isDefault
                  ? selectedTechniques.some(t => t.name.toLowerCase() === chip.name.toLowerCase())
                  : selectedTechniques.some(t => t.taxonomyId === chip.id);
                return (
                  <button
                    key={chip.id}
                    onClick={() => toggleChipTechnique(chip)}
                    data-testid={`tech-chip-${chip.name.toLowerCase().replace(/\s+/g, '-')}`}
                    style={{
                      padding: '6px 12px',
                      borderRadius: '100px',
                      border: isSelected ? '1px solid #8B5CF6' : '1px solid #2A2A2E',
                      background: isSelected ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                      color: isSelected ? '#A78BFA' : '#A1A1AA',
                      fontSize: '13px',
                      cursor: 'pointer',
                    }}
                  >
                    {chip.name}
                  </button>
                );
              })}
            </div>

            {selectedTechniques.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {selectedTechniques
                  .filter(t => !recentTechChips.some(c => c.isDefault ? c.name.toLowerCase() === t.name.toLowerCase() : c.id === t.taxonomyId))
                  .map(t => (
                    <span
                      key={t.taxonomyId}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        padding: '4px 10px', borderRadius: '100px',
                        background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)',
                        color: '#A78BFA', fontSize: '12px',
                      }}
                    >
                      {t.name}
                      <button onClick={() => removeTechnique(t.taxonomyId)} style={{ background: 'transparent', border: 'none', padding: '0 2px', cursor: 'pointer', color: '#A78BFA', display: 'flex' }}>
                        <X size={12} />
                      </button>
                    </span>
                  ))}
              </div>
            )}

            <div style={{ position: 'relative' }}>
              <Search size={16} color="#71717A" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search techniques\u2026"
                value={techSearch}
                onChange={(e) => setTechSearch(e.target.value)}
                data-testid="input-technique-search"
                style={{
                  width: '100%', background: '#1A1A1D', border: '1px solid #2A2A2E', borderRadius: '10px',
                  padding: '10px 12px 10px 36px', color: '#FFFFFF', fontSize: '14px', outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
            {techSearch.length >= 2 && taxonomyResults.length > 0 && (
              <div style={{ marginTop: '6px', background: '#1A1A1D', border: '1px solid #2A2A2E', borderRadius: '10px', maxHeight: '160px', overflowY: 'auto' }}>
                {taxonomyResults.map((node: TaxonomyNode) => {
                  const isSelected = selectedTechniques.some(t => t.taxonomyId === node.id);
                  return (
                    <button
                      key={node.id}
                      onClick={() => toggleTechnique(node)}
                      data-testid={`search-result-${node.id}`}
                      style={{
                        width: '100%', padding: '10px 14px', background: 'transparent', border: 'none',
                        borderBottom: '1px solid #2A2A2E', color: isSelected ? '#8B5CF6' : '#FFFFFF',
                        fontSize: '13px', textAlign: 'left', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      }}
                    >
                      <span>
                        {node.name}
                        {node.parentName && (
                          <span style={{ color: '#71717A', fontSize: '12px', marginLeft: '6px' }}>({node.parentName})</span>
                        )}
                      </span>
                      {isSelected && <Check size={16} color="#8B5CF6" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button onClick={() => { triggerHaptic('light'); setIsGi(true); }} data-testid="button-gi" style={chipStyle(isGi)}>Gi</button>
            <button onClick={() => { triggerHaptic('light'); setIsGi(false); }} data-testid="button-nogi" style={chipStyle(!isGi)}>No-Gi</button>
          </div>

          <button
            onClick={() => { triggerHaptic('light'); setShowMore(!showMore); }}
            data-testid="button-toggle-details"
            style={{
              width: '100%', padding: '12px', background: 'transparent', border: '1px solid #2A2A2E',
              borderRadius: '10px', color: '#71717A', fontSize: '14px', cursor: 'pointer',
              marginBottom: showMore ? '16px' : '20px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
            }}
          >
            {showMore ? 'Less' : 'Add More'}
            {showMore ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showMore && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <div style={{ fontSize: '13px', color: '#71717A', marginBottom: '8px' }}>Duration</div>
                <div style={{ display: 'flex', gap: '6px', overflowX: 'auto', paddingBottom: '4px' }}>
                  {DURATION_OPTIONS.map(d => (
                    <button
                      key={d.value}
                      onClick={() => { triggerHaptic('light'); setDurationMinutes(d.value); }}
                      data-testid={`duration-${d.value}`}
                      style={{
                        padding: '8px 14px', borderRadius: '100px',
                        border: durationMinutes === d.value ? '1px solid #8B5CF6' : '1px solid #2A2A2E',
                        background: durationMinutes === d.value ? 'rgba(139, 92, 246, 0.15)' : 'transparent',
                        color: durationMinutes === d.value ? '#A78BFA' : '#A1A1AA',
                        fontSize: '13px', cursor: 'pointer', whiteSpace: 'nowrap',
                      }}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                {[
                  { label: 'Rolls', value: rolls, setter: setRolls },
                  { label: 'Submissions', value: submissions, setter: setSubmissions },
                  { label: 'Taps', value: taps, setter: setTaps },
                ].map(item => (
                  <div key={item.label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '12px', color: '#71717A', marginBottom: '8px' }}>{item.label}</div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                      <button
                        onClick={() => { triggerHaptic('light'); item.setter(Math.max(0, item.value - 1)); }}
                        style={{
                          width: '30px', height: '30px', borderRadius: '50%',
                          background: '#1A1A1D', border: '1px solid #2A2A2E',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: '#FFFFFF',
                        }}
                      >
                        <Minus size={14} />
                      </button>
                      <span style={{ fontSize: '16px', fontWeight: 600, minWidth: '20px', textAlign: 'center', color: '#FFFFFF' }}>{item.value}</span>
                      <button
                        onClick={() => { triggerHaptic('light'); item.setter(Math.min(99, item.value + 1)); }}
                        style={{
                          width: '30px', height: '30px', borderRadius: '50%',
                          background: '#1A1A1D', border: '1px solid #2A2A2E',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: '#FFFFFF',
                        }}
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: '12px', color: '#71717A', marginBottom: '6px' }}>Notes</div>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add a note\u2026"
                  data-testid="input-notes"
                  rows={3}
                  style={{
                    width: '100%', background: '#1A1A1D', border: '1px solid #2A2A2E', borderRadius: '10px',
                    padding: '10px 12px', color: '#FFFFFF', fontSize: '14px', outline: 'none', resize: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
          )}

          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            data-testid="button-save-session"
            style={{
              width: '100%', padding: '14px', background: '#8B5CF6', border: 'none', borderRadius: '12px',
              color: '#FFFFFF', fontSize: '16px', fontWeight: 600, cursor: 'pointer',
              opacity: saveMutation.isPending ? 0.7 : 1,
            }}
          >
            {saveMutation.isPending ? 'Saving...' : (isEditing ? 'Update' : 'Save')}
          </button>

          {isEditing && (
            <>
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  data-testid="button-delete-session"
                  style={{
                    width: '100%', marginTop: '12px', padding: '12px', background: 'transparent',
                    border: 'none', color: '#EF4444', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                  }}
                >
                  Delete session
                </button>
              ) : (
                <div style={{ marginTop: '12px', textAlign: 'center' }}>
                  <div style={{ fontSize: '14px', color: '#FFFFFF', marginBottom: '12px' }}>Delete this session?</div>
                  <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      data-testid="button-cancel-delete"
                      style={{ padding: '10px 20px', background: 'transparent', border: '1px solid #2A2A2E', borderRadius: '10px', color: '#FFFFFF', fontSize: '14px', cursor: 'pointer' }}
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate()}
                      data-testid="button-confirm-delete"
                      style={{ padding: '10px 20px', background: '#EF4444', border: 'none', borderRadius: '10px', color: '#FFFFFF', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  triggerHaptic('light');
                  onClose();
                  setTimeout(() => {
                    const event = new CustomEvent('training-add-another', { detail: { date } });
                    window.dispatchEvent(event);
                  }, 300);
                }}
                data-testid="button-add-another"
                style={{
                  width: '100%', marginTop: '12px', padding: '12px', background: 'transparent',
                  border: 'none', color: '#8B5CF6', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                }}
              >
                + Add another session
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
