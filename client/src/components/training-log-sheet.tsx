import { useState, useCallback, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Search, Check, Minus, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { getApiUrl, getAuthToken } from "@/lib/capacitorAuth";

function parseTimeString(timeStr: string): { hour: number; minute: number; ampm: 'AM' | 'PM' } {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match) {
    return { hour: parseInt(match[1]), minute: parseInt(match[2]), ampm: match[3].toUpperCase() as 'AM' | 'PM' };
  }
  const parts = timeStr.split(':');
  let h = parseInt(parts[0]);
  const m = parseInt(parts[1]) || 0;
  const ampm: 'AM' | 'PM' = h >= 12 ? 'PM' : 'AM';
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return { hour: h, minute: m, ampm };
}

function formatTimeTo12h(hour: number, minute: number, ampm: string): string {
  return `${hour}:${String(minute).padStart(2, '0')} ${ampm}`;
}

function ScrollColumn({ items, selectedIndex, onChange, width }: {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  width: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const itemHeight = 36;
  const isScrollingRef = useRef(false);
  const lastRealIndexRef = useRef(selectedIndex);
  const centeredRawRef = useRef(0);
  const [centeredRaw, setCenteredRaw] = useState(0);
  const REPEATS = 20;
  const totalItems = items.length * REPEATS;
  const middleSetStart = Math.floor(REPEATS / 2) * items.length;

  useEffect(() => {
    if (containerRef.current && !isScrollingRef.current) {
      const targetRaw = middleSetStart + selectedIndex;
      containerRef.current.scrollTop = targetRaw * itemHeight;
      centeredRawRef.current = targetRaw;
      setCenteredRaw(targetRaw);
    }
  }, [selectedIndex]);

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    isScrollingRef.current = true;
    const scrollTop = containerRef.current.scrollTop;
    const rawIndex = Math.round(scrollTop / itemHeight);
    const realIndex = ((rawIndex % items.length) + items.length) % items.length;

    centeredRawRef.current = rawIndex;
    setCenteredRaw(rawIndex);

    if (realIndex !== lastRealIndexRef.current) {
      lastRealIndexRef.current = realIndex;
      
      onChange(realIndex);
    }

    clearTimeout((containerRef.current as any)._scrollTimer);
    (containerRef.current as any)._scrollTimer = setTimeout(() => {
      isScrollingRef.current = false;
      if (!containerRef.current) return;
      const currentRaw = Math.round(containerRef.current.scrollTop / itemHeight);
      const currentReal = ((currentRaw % items.length) + items.length) % items.length;
      const lowerBound = items.length * 10;
      const upperBound = totalItems - items.length * 10;
      if (currentRaw < lowerBound || currentRaw > upperBound) {
        const resetRaw = middleSetStart + currentReal;
        containerRef.current.scrollTop = resetRaw * itemHeight;
        centeredRawRef.current = resetRaw;
        setCenteredRaw(resetRaw);
      } else {
        containerRef.current.scrollTo({ top: currentRaw * itemHeight, behavior: 'smooth' });
      }
    }, 100);
  }, [items.length, onChange, middleSetStart, totalItems]);

  const allItems = useMemo(() => {
    const result: string[] = [];
    for (let r = 0; r < REPEATS; r++) {
      for (let i = 0; i < items.length; i++) {
        result.push(items[i]);
      }
    }
    return result;
  }, [items]);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        width,
        height: `${itemHeight * 3}px`,
        overflowY: 'auto',
        scrollSnapType: 'y mandatory',
        WebkitOverflowScrolling: 'touch',
        position: 'relative',
        msOverflowStyle: 'none',
        scrollbarWidth: 'none',
      }}
    >
      <div style={{ height: `${itemHeight}px` }} />
      {allItems.map((item, i) => {
        const realIndex = i % items.length;
        const isCentered = i === centeredRaw;
        return (
          <div
            key={i}
            onClick={() => {
              
              onChange(realIndex);
            }}
            style={{
              height: `${itemHeight}px`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              scrollSnapAlign: 'center',
              fontSize: isCentered ? '18px' : '14px',
              fontWeight: isCentered ? 600 : 400,
              color: isCentered ? '#FFFFFF' : '#71717A',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
              opacity: isCentered ? 1 : 0.5,
            }}
          >
            {item}
          </div>
        );
      })}
      <div style={{ height: `${itemHeight}px` }} />
    </div>
  );
}

const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
const AMPM_OPTIONS = ['AM', 'PM'];

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
  sessionTime: string | null;
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
  { key: 'open_mat', label: 'Open Mat', emoji: '\uD83D\uDCDA' },
  { key: 'competition', label: 'Comp', emoji: '\uD83C\uDFC6' },
  { key: 'private', label: 'Private', emoji: '\uD83C\uDFAF' },
];

const DURATION_OPTIONS = [
  { label: '30m', value: 30 },
  { label: '1hr', value: 60 },
  { label: '1.5hr', value: 90 },
  { label: '2hr', value: 120 },
  { label: '2.5hr', value: 150 },
  { label: '3hr', value: 180 },
];

const DEFAULT_TECHNIQUE_CHIPS = [
  { name: 'Armbar', id: 65 },
  { name: 'Triangle Choke', id: 72, displayName: 'Triangle' },
  { name: 'Half Guard', id: 14 },
  { name: 'Guard Passing', id: 2, displayName: 'Guard Pass' },
];

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

  const now = new Date();
  const defaultHour = now.getHours() > 12 ? now.getHours() - 12 : (now.getHours() === 0 ? 12 : now.getHours());
  const defaultAmPm = now.getHours() >= 12 ? 'PM' : 'AM';

  const initTime: { hour: number; minute: number; ampm: 'AM' | 'PM' } = existingSession?.sessionTime
    ? parseTimeString(existingSession.sessionTime)
    : { hour: defaultHour, minute: now.getMinutes(), ampm: defaultAmPm };

  const [timeHour, setTimeHour] = useState(initTime.hour);
  const [timeMinute, setTimeMinute] = useState(initTime.minute);
  const [timeAmPm, setTimeAmPm] = useState<'AM' | 'PM'>(initTime.ampm);
  const [timeInitialized, setTimeInitialized] = useState(!!existingSession?.sessionTime);

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

  const { data: lastTimeData } = useQuery<{ sessionTime: string | null }>({
    queryKey: ['/api/training/last-session-time'],
    enabled: !existingSession?.sessionTime,
  });

  useEffect(() => {
    if (!timeInitialized && lastTimeData?.sessionTime) {
      const parsed = parseTimeString(lastTimeData.sessionTime);
      setTimeHour(parsed.hour);
      setTimeMinute(parsed.minute);
      setTimeAmPm(parsed.ampm);
      setTimeInitialized(true);
    }
  }, [lastTimeData, timeInitialized]);

  const taxonomyResults = useMemo(() => {
    if (!searchResults?.taxonomyResults) return [];
    return searchResults.taxonomyResults.slice(0, 10);
  }, [searchResults]);

  const recentTechChips = useMemo(() => {
    const recents = (recentTechData?.techniques || [])
      .filter(t => t.name)
      .slice(0, 4)
      .map(t => ({ id: t.id, name: t.name, displayName: t.name, isDefault: false }));
    const needed = 4 - recents.length;
    const defaults = needed > 0
      ? DEFAULT_TECHNIQUE_CHIPS
          .filter(d => !recents.some(r => r.name.toLowerCase() === d.name.toLowerCase()))
          .slice(0, needed)
          .map(d => ({ id: d.id, name: d.name, displayName: (d as any).displayName || d.name, isDefault: true }))
      : [];
    return [...recents, ...defaults];
  }, [recentTechData]);

  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSaveSession = async () => {
    if (isSaving) return;
    setIsSaving(true);
    console.log('[TRAINING] Save started, isEditing:', isEditing);
    const sessionTimeStr = formatTimeTo12h(timeHour, timeMinute, timeAmPm);
    const payload = {
      sessionDate: date,
      sessionTime: sessionTimeStr,
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

    let token: string | null = null;
    try {
      token = await getAuthToken();
    } catch (e) {
      console.warn('[TRAINING] getAuthToken failed, proceeding without token:', e);
    }

    try {
      const url = isEditing && existingSession
        ? getApiUrl(`/api/training/sessions/${existingSession.id}`)
        : getApiUrl('/api/training/sessions');
      const method = isEditing && existingSession ? 'PUT' : 'POST';
      console.log('[TRAINING] Fetching:', method, url);

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
        credentials: 'include',
      });

      console.log('[TRAINING] Response status:', res.status);

      if (res.ok) {
        const streak = (statsData?.currentStreak || 0) + (isEditing ? 0 : 1);
        const milestones = [7, 14, 21, 30, 60, 90, 100];
        const isMilestone = milestones.includes(streak);
        if (isEditing) {
          toast({ title: "Session updated" });
        } else if (isMilestone) {
          toast({ title: `\uD83D\uDD25 ${streak} day streak! Keep pushing.` });
        } else {
          toast({ title: `Session logged \u00B7 \uD83D\uDD25 ${streak > 0 ? streak : 1} day streak` });
        }
        console.log('[TRAINING] Save successful, calling onSave to close sheet and refresh');
        setIsSaving(false);
        onSave();
        return;
      } else {
        const errorText = await res.text().catch(() => '');
        console.error('[TRAINING] Save failed:', res.status, errorText);
        toast({ title: "Failed to save", variant: "destructive" });
      }
    } catch (err: any) {
      console.error('[TRAINING] Save error:', err);
      toast({ title: "Failed to save", description: err?.message, variant: "destructive" });
    }
    setIsSaving(false);
  };

  const handleDeleteSession = async () => {
    if (!existingSession || isDeleting) return;
    setIsDeleting(true);
    console.log('[TRAINING] Delete started for session:', existingSession.id);

    let token: string | null = null;
    try {
      token = await getAuthToken();
    } catch (e) {
      console.warn('[TRAINING] getAuthToken failed, proceeding without token:', e);
    }

    try {
      const url = getApiUrl(`/api/training/sessions/${existingSession.id}`);
      console.log('[TRAINING] Fetching: DELETE', url);

      const res = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      });

      console.log('[TRAINING] Delete response status:', res.status);

      if (res.ok) {
        toast({ title: "Session deleted" });
        console.log('[TRAINING] Delete successful, calling onSave to close sheet and refresh');
        setIsDeleting(false);
        setShowDeleteConfirm(false);
        onSave();
        return;
      } else {
        const errorText = await res.text().catch(() => '');
        console.error('[TRAINING] Delete failed:', res.status, errorText);
        toast({ title: "Failed to delete", variant: "destructive" });
      }
    } catch (err: any) {
      console.error('[TRAINING] Delete error:', err);
      toast({ title: "Failed to delete", description: err?.message, variant: "destructive" });
    }
    setIsDeleting(false);
  };

  const toggleTechnique = useCallback((tech: { id: number; name: string }) => {
    
    setSelectedTechniques(prev => {
      const exists = prev.find(t => t.taxonomyId === tech.id);
      if (exists) return prev.filter(t => t.taxonomyId !== tech.id);
      return [...prev, { taxonomyId: tech.id, name: tech.name, category: 'technique' }];
    });
    setTechSearch('');
  }, []);

  const toggleChipTechnique = useCallback((chip: { id: number; name: string; displayName?: string }) => {
    
    setSelectedTechniques(prev => {
      const exists = prev.find(t => t.taxonomyId === chip.id);
      if (exists) return prev.filter(t => t.taxonomyId !== chip.id);
      return [...prev, { taxonomyId: chip.id, name: chip.name, category: 'technique' }];
    });
  }, []);

  const removeTechnique = useCallback((taxonomyId: number) => {
    
    setSelectedTechniques(prev => prev.filter(t => t.taxonomyId !== taxonomyId));
  }, []);

  const dateObj = new Date(date + 'T00:00:00');
  const dateLabel = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const uniformChipStyle = (selected: boolean): React.CSSProperties => ({
    flex: '1 1 0',
    minWidth: 0,
    height: '40px',
    padding: '8px 12px',
    borderRadius: '20px',
    border: selected ? '1px solid transparent' : '1px solid #3A3A3E',
    background: selected ? '#8B5CF6' : 'transparent',
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '5px',
    lineHeight: 1,
    boxSizing: 'border-box',
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

          <div
            data-testid="time-picker"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '2px',
              margin: '12px 0 16px',
              background: '#1A1A1D',
              borderRadius: '10px',
              padding: '4px 12px',
              position: 'relative',
              height: '56px',
              overflow: 'hidden',
            }}
          >
            <div style={{
              position: 'absolute',
              top: '50%',
              left: '12px',
              right: '12px',
              height: '36px',
              transform: 'translateY(-50%)',
              background: 'rgba(139, 92, 246, 0.12)',
              borderRadius: '8px',
              pointerEvents: 'none',
              zIndex: 0,
            }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0px', zIndex: 1 }}>
              <ScrollColumn
                items={HOURS}
                selectedIndex={timeHour - 1}
                onChange={(i) => setTimeHour(i + 1)}
                width="40px"
              />
              <span style={{ fontSize: '18px', fontWeight: 600, color: '#FFFFFF', padding: '0 1px' }}>:</span>
              <ScrollColumn
                items={MINUTES}
                selectedIndex={timeMinute}
                onChange={setTimeMinute}
                width="40px"
              />
              <ScrollColumn
                items={AMPM_OPTIONS}
                selectedIndex={timeAmPm === 'AM' ? 0 : 1}
                onChange={(i) => setTimeAmPm(i === 0 ? 'AM' : 'PM')}
                width="44px"
              />
            </div>
          </div>

          <div style={{ marginTop: '4px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {MOODS.map(m => (
                <button
                  key={m.key}
                  onClick={() => { setMood(mood === m.key ? '' : m.key); }}
                  data-testid={`mood-${m.key}`}
                  style={uniformChipStyle(mood === m.key)}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>{m.emoji}</span>
                  <span>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              {SESSION_TYPES.map(t => (
                <button
                  key={t.key}
                  onClick={() => { setSessionType(sessionType === t.key ? '' : t.key); }}
                  data-testid={`session-type-${t.key}`}
                  style={uniformChipStyle(sessionType === t.key)}
                >
                  <span style={{ fontSize: '16px', lineHeight: 1, display: 'flex', alignItems: 'center' }}>{t.emoji}</span>
                  <span>{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '13px', color: '#71717A', marginBottom: '10px' }}>What did you work on?</div>

            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
              {recentTechChips.map(chip => {
                const isSelected = selectedTechniques.some(t => t.taxonomyId === chip.id);
                return (
                  <button
                    key={chip.id}
                    onClick={() => toggleChipTechnique(chip)}
                    data-testid={`tech-chip-${(chip.displayName || chip.name).toLowerCase().replace(/\s+/g, '-')}`}
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
                    {chip.displayName || chip.name}
                  </button>
                );
              })}
            </div>

            {selectedTechniques.length > 0 && (
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {selectedTechniques
                  .filter(t => !recentTechChips.some(c => c.id === t.taxonomyId))
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
                placeholder={"Search techniques\u2026"}
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

          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
            <button onClick={() => { setIsGi(true); }} data-testid="button-gi" style={uniformChipStyle(isGi)}>Gi</button>
            <button onClick={() => { setIsGi(false); }} data-testid="button-nogi" style={uniformChipStyle(!isGi)}>No-Gi</button>
          </div>

          <button
            onClick={() => { setShowMore(!showMore); }}
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
                      onClick={() => { setDurationMinutes(d.value); }}
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
                        onClick={() => { item.setter(Math.max(0, item.value - 1)); }}
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
                        onClick={() => { item.setter(Math.min(99, item.value + 1)); }}
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
                  placeholder={"Add a note\u2026"}
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
            onClick={handleSaveSession}
            disabled={isSaving}
            data-testid="button-save-session"
            style={{
              width: '100%', padding: '14px', background: '#8B5CF6', border: 'none', borderRadius: '12px',
              color: '#FFFFFF', fontSize: '16px', fontWeight: 600, cursor: 'pointer',
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? 'Saving...' : (isEditing ? 'Update' : 'Save')}
          </button>

          {isEditing && (
            <>
              <button
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isDeleting}
                data-testid="button-delete-session"
                style={{
                  width: '100%', marginTop: '12px', padding: '12px', background: 'transparent',
                  border: 'none', color: '#EF4444', fontSize: '14px', fontWeight: 500, cursor: 'pointer',
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete session'}
              </button>

              <button
                onClick={() => {
                  
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

      {showDeleteConfirm && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 10001,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 40px',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}
          data-testid="delete-confirm-backdrop"
        >
          <div style={{
            background: '#1C1C1E', borderRadius: '14px', width: '100%', maxWidth: '300px',
            overflow: 'hidden', textAlign: 'center',
          }}>
            <div style={{ padding: '20px 16px 16px' }}>
              <div style={{ fontSize: '17px', fontWeight: 600, color: '#FFFFFF', marginBottom: '4px' }}>
                Delete this session?
              </div>
              <div style={{ fontSize: '13px', color: '#71717A' }}>
                This can't be undone.
              </div>
            </div>
            <div style={{ borderTop: '1px solid #2A2A2E', display: 'flex' }}>
              <button
                onClick={() => setShowDeleteConfirm(false)}
                data-testid="button-delete-cancel"
                style={{
                  flex: 1, padding: '14px', background: 'transparent', border: 'none',
                  borderRight: '1px solid #2A2A2E',
                  color: '#8B5CF6', fontSize: '17px', fontWeight: 400, cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteSession}
                disabled={isDeleting}
                data-testid="button-delete-confirm"
                style={{
                  flex: 1, padding: '14px', background: 'transparent', border: 'none',
                  color: '#EF4444', fontSize: '17px', fontWeight: 600, cursor: 'pointer',
                  opacity: isDeleting ? 0.5 : 1,
                }}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
