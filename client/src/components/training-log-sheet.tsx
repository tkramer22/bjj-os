import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, Search, Check, Minus, Plus } from "lucide-react";
import { triggerHaptic } from "@/lib/haptics";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface TaxonomyNode {
  id: number;
  name: string;
  slug: string;
  level: number;
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
  { key: 'great', label: 'Great', color: '#22C55E' },
  { key: 'good', label: 'Good', color: '#86EFAC' },
  { key: 'okay', label: 'Okay', color: '#FBBF24' },
  { key: 'tough', label: 'Tough', color: '#F97316' },
  { key: 'rough', label: 'Rough', color: '#EF4444' },
];

const SESSION_TYPES = [
  { key: 'class', label: 'Class' },
  { key: 'drilling', label: 'Drilling' },
  { key: 'sparring', label: 'Sparring' },
  { key: 'open_mat', label: 'Open Mat' },
  { key: 'private', label: 'Private' },
  { key: 'competition', label: 'Comp' },
];

export function TrainingLogSheet({ date, existingSession, onClose, onSave }: Props) {
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
  const [showDetails, setShowDetails] = useState(false);

  const { toast } = useToast();
  const sheetRef = useRef<HTMLDivElement>(null);

  const { data: searchResults } = useQuery<{ taxonomyResults?: TaxonomyNode[] }>({
    queryKey: [`/api/taxonomy/search?q=${encodeURIComponent(techSearch)}`],
    enabled: techSearch.length >= 2,
  });

  const taxonomyResults = useMemo(() => {
    if (!searchResults?.taxonomyResults) return [];
    return searchResults.taxonomyResults.filter((n: TaxonomyNode) => n.level >= 1).slice(0, 10);
  }, [searchResults]);

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
      await apiRequest('POST', '/api/training/sessions', payload);
    },
    onSuccess: () => {
      triggerHaptic('success');
      toast({ title: existingSession ? "Session updated" : "Session logged!" });
      onSave();
    },
    onError: (err: any) => {
      toast({ title: "Failed to save", description: err.message, variant: "destructive" });
    },
  });

  const handleSave = useCallback(() => {
    saveMutation.mutate();
  }, [saveMutation]);

  const toggleTechnique = useCallback((tech: TaxonomyNode) => {
    triggerHaptic('light');
    setSelectedTechniques(prev => {
      const exists = prev.find(t => t.taxonomyId === tech.id);
      if (exists) {
        return prev.filter(t => t.taxonomyId !== tech.id);
      }
      return [...prev, { taxonomyId: tech.id, name: tech.name, category: tech.level <= 1 ? 'category' : 'technique' }];
    });
    setTechSearch('');
  }, []);

  const removeTechnique = useCallback((taxonomyId: number) => {
    triggerHaptic('light');
    setSelectedTechniques(prev => prev.filter(t => t.taxonomyId !== taxonomyId));
  }, []);

  const dateObj = new Date(date + 'T00:00:00');
  const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const stepper = useCallback((value: number, setter: (v: number) => void, min = 0, max = 99) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
      <button
        onClick={(e) => { e.preventDefault(); triggerHaptic('light'); setter(Math.max(min, value - 1)); }}
        style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: '#1A1A1D', border: '1px solid #2A2A2E',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#FFFFFF',
        }}
      >
        <Minus size={14} />
      </button>
      <span style={{ fontSize: '18px', fontWeight: 600, minWidth: '24px', textAlign: 'center' }}>{value}</span>
      <button
        onClick={(e) => { e.preventDefault(); triggerHaptic('light'); setter(Math.min(max, value + 1)); }}
        style={{
          width: '32px', height: '32px', borderRadius: '50%',
          background: '#1A1A1D', border: '1px solid #2A2A2E',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', color: '#FFFFFF',
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  ), []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 10000,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      data-testid="training-log-sheet-backdrop"
    >
      <div
        ref={sheetRef}
        style={{
          background: '#121214',
          borderTopLeftRadius: '20px',
          borderTopRightRadius: '20px',
          maxHeight: '90vh',
          overflowY: 'auto',
          paddingBottom: 'max(20px, env(safe-area-inset-bottom))',
        }}
        data-testid="training-log-sheet"
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#3A3A3E' }} />
        </div>

        <div style={{ padding: '8px 20px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: '#FFFFFF' }} data-testid="text-sheet-title">
              {existingSession ? 'Edit Session' : 'Log Training'}
            </h2>
            <button
              onClick={onClose}
              data-testid="button-close-sheet"
              style={{ background: 'transparent', border: 'none', padding: '4px', cursor: 'pointer', color: '#71717A' }}
            >
              <X size={24} />
            </button>
          </div>

          <div style={{ fontSize: '13px', color: '#A1A1AA', marginBottom: '20px' }} data-testid="text-sheet-date">{dateLabel}</div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#71717A', marginBottom: '8px', fontWeight: 500 }}>
              How did it feel?
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {MOODS.map(m => (
                <button
                  key={m.key}
                  onClick={() => { triggerHaptic('light'); setMood(mood === m.key ? '' : m.key); }}
                  data-testid={`mood-${m.key}`}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '100px',
                    border: mood === m.key ? `2px solid ${m.color}` : '1px solid #2A2A2E',
                    background: mood === m.key ? `${m.color}15` : 'transparent',
                    color: mood === m.key ? m.color : '#A1A1AA',
                    fontSize: '13px',
                    fontWeight: mood === m.key ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#71717A', marginBottom: '8px', fontWeight: 500 }}>
              Session Type
            </label>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {SESSION_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => { triggerHaptic('light'); setSessionType(sessionType === t.key ? '' : t.key); }}
                  data-testid={`session-type-${t.key}`}
                  style={{
                    padding: '8px 14px',
                    borderRadius: '100px',
                    border: sessionType === t.key ? '2px solid #8B5CF6' : '1px solid #2A2A2E',
                    background: sessionType === t.key ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                    color: sessionType === t.key ? '#A78BFA' : '#A1A1AA',
                    fontSize: '13px',
                    fontWeight: sessionType === t.key ? 600 : 400,
                    cursor: 'pointer',
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontSize: '13px', color: '#71717A', marginBottom: '8px', fontWeight: 500 }}>
              Techniques Practiced
            </label>
            {selectedTechniques.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {selectedTechniques.map(t => (
                  <span
                    key={t.taxonomyId}
                    data-testid={`chip-technique-${t.taxonomyId}`}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '4px 10px',
                      borderRadius: '100px',
                      background: 'rgba(139, 92, 246, 0.1)',
                      border: '1px solid rgba(139, 92, 246, 0.2)',
                      color: '#A78BFA',
                      fontSize: '12px',
                    }}
                  >
                    {t.name}
                    <button
                      onClick={() => removeTechnique(t.taxonomyId)}
                      style={{ background: 'transparent', border: 'none', padding: '0 2px', cursor: 'pointer', color: '#A78BFA', display: 'flex' }}
                    >
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
                placeholder="Search techniques..."
                value={techSearch}
                onChange={(e) => setTechSearch(e.target.value)}
                data-testid="input-technique-search"
                style={{
                  width: '100%',
                  background: '#1A1A1D',
                  border: '1px solid #2A2A2E',
                  borderRadius: '10px',
                  padding: '10px 12px 10px 36px',
                  color: '#FFFFFF',
                  fontSize: '14px',
                  outline: 'none',
                }}
              />
            </div>
            {techSearch.length >= 2 && taxonomyResults.length > 0 && (
              <div style={{
                marginTop: '6px',
                background: '#1A1A1D',
                border: '1px solid #2A2A2E',
                borderRadius: '10px',
                maxHeight: '160px',
                overflowY: 'auto',
              }}>
                {taxonomyResults.map((node: TaxonomyNode) => {
                  const isSelected = selectedTechniques.some(t => t.taxonomyId === node.id);
                  return (
                    <button
                      key={node.id}
                      onClick={() => toggleTechnique(node)}
                      data-testid={`search-result-${node.id}`}
                      style={{
                        width: '100%',
                        padding: '10px 14px',
                        background: 'transparent',
                        border: 'none',
                        borderBottom: '1px solid #2A2A2E',
                        color: isSelected ? '#8B5CF6' : '#FFFFFF',
                        fontSize: '13px',
                        textAlign: 'left',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <span>{node.name}</span>
                      {isSelected && <Check size={16} color="#8B5CF6" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
            <button
              onClick={() => { triggerHaptic('light'); setIsGi(true); }}
              data-testid="button-gi"
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                border: isGi ? '2px solid #8B5CF6' : '1px solid #2A2A2E',
                background: isGi ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                color: isGi ? '#A78BFA' : '#A1A1AA',
                fontSize: '14px',
                fontWeight: isGi ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              Gi
            </button>
            <button
              onClick={() => { triggerHaptic('light'); setIsGi(false); }}
              data-testid="button-nogi"
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '10px',
                border: !isGi ? '2px solid #8B5CF6' : '1px solid #2A2A2E',
                background: !isGi ? 'rgba(139, 92, 246, 0.1)' : 'transparent',
                color: !isGi ? '#A78BFA' : '#A1A1AA',
                fontSize: '14px',
                fontWeight: !isGi ? 600 : 400,
                cursor: 'pointer',
              }}
            >
              No-Gi
            </button>
          </div>

          <button
            onClick={() => { triggerHaptic('light'); setShowDetails(!showDetails); }}
            data-testid="button-toggle-details"
            style={{
              width: '100%',
              padding: '10px',
              background: 'transparent',
              border: '1px solid #2A2A2E',
              borderRadius: '10px',
              color: '#71717A',
              fontSize: '13px',
              cursor: 'pointer',
              marginBottom: showDetails ? '16px' : '20px',
            }}
          >
            {showDetails ? 'Hide details' : 'More details (duration, rolls, notes)'}
          </button>

          {showDetails && (
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '16px' }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#71717A', marginBottom: '6px' }}>Duration (min)</label>
                  <input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(parseInt(e.target.value) || 0)}
                    data-testid="input-duration"
                    style={{
                      width: '100%',
                      background: '#1A1A1D',
                      border: '1px solid #2A2A2E',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      color: '#FFFFFF',
                      fontSize: '14px',
                      outline: 'none',
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div style={{ textAlign: 'center' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#71717A', marginBottom: '8px' }}>Rolls</label>
                  {stepper(rolls, setRolls)}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#71717A', marginBottom: '8px' }}>Subs</label>
                  {stepper(submissions, setSubmissions)}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#71717A', marginBottom: '8px' }}>Taps</label>
                  {stepper(taps, setTaps)}
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', color: '#71717A', marginBottom: '6px' }}>Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="How was training today?"
                  data-testid="input-notes"
                  rows={3}
                  style={{
                    width: '100%',
                    background: '#1A1A1D',
                    border: '1px solid #2A2A2E',
                    borderRadius: '10px',
                    padding: '10px 12px',
                    color: '#FFFFFF',
                    fontSize: '14px',
                    outline: 'none',
                    resize: 'none',
                  }}
                />
              </div>
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            data-testid="button-save-session"
            style={{
              width: '100%',
              padding: '14px',
              background: '#8B5CF6',
              border: 'none',
              borderRadius: '12px',
              color: '#FFFFFF',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              opacity: saveMutation.isPending ? 0.7 : 1,
            }}
          >
            {saveMutation.isPending ? 'Saving...' : (existingSession ? 'Update Session' : 'Log Session')}
          </button>
        </div>
      </div>
    </div>
  );
}
