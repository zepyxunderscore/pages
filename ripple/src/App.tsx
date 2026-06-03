import { useState, useEffect, useCallback, useRef } from 'react'
import {
  BookOpen, Dumbbell, BrainCircuit, Code2, Droplets,
  PenLine, Moon, Heart, Coffee,
  Settings, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Plus, X, Trash2,
  BarChart3, Grid3X3, Timer,
} from 'lucide-react'
import schemesData from '../schemes.json'

interface Habit {
  id: string
  name: string
  icon: string
  completedDates: string[]
  order: number
  goal: number
}

interface PomodoroSession {
  id: string
  habitId: string
  date: string
  duration: number
}

interface Bundle {
  id: string
  name: string
  startDate: string
  endDate: string
}

interface Scheme {
  id: string; name: string; bg: string; bgCard: string; bgHover: string
  fg: string; fgMuted: string; fgHeader: string; border: string; borderHover: string
  accent: string; accentDim: string; accentBg: string
}

interface GhConfig {
  token: string; owner: string; repo: string; path: string
}

type Page = 'habits' | 'analytics' | 'pomodoro'
type SyncState = 'idle' | 'busy' | 'ok' | 'err'

const ICON_MAP: Record<string, React.ComponentType<{ size?: number }>> = {
  BookOpen, Dumbbell, BrainCircuit, Code2, Droplets,
  PenLine, Moon, Heart, Coffee,
}

const HABIT_ICONS = ['BookOpen', 'Dumbbell', 'BrainCircuit', 'Code2', 'Droplets', 'PenLine', 'Moon', 'Heart', 'Coffee']

function getWeekDates(offset = 0) {
  const now = new Date()
  now.setDate(now.getDate() + offset * 7)
  const day = now.getDay()
  const diff = now.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(now.getFullYear(), now.getMonth(), diff)
  const labels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { date: d, label: labels[i], num: d.getDate(), key: dateKey(d) }
  })
}

function getMondayOfWeek(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00')
  const dayNum = d.getDay()
  const diff = d.getDate() - dayNum + (dayNum === 0 ? -6 : 1)
  return new Date(d.getFullYear(), d.getMonth(), diff)
}

function getBundleDayNumber(bundle: Bundle, date: Date): number | null {
  const start = new Date(bundle.startDate + 'T00:00:00')
  const end = new Date(bundle.endDate + 'T00:00:00')
  const current = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const st = start.getTime(); const et = end.getTime(); const ct = current.getTime()
  if (ct < st || ct > et) return null
  return Math.round((ct - st) / (1000 * 60 * 60 * 24)) + 1
}

function getPastDays(n: number): Date[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (n - 1 - i)); return d
  })
}

function getYearGrid(year: number): (Date | null)[][] {
  const jan1 = new Date(year, 0, 1)
  const dec31 = new Date(year, 11, 31)
  let cursor = new Date(jan1)
  while (cursor.getDay() !== 1) cursor.setDate(cursor.getDate() - 1)
  const weeks: (Date | null)[][] = []
  while (cursor <= dec31 || cursor.getDay() !== 1) {
    const week: (Date | null)[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor); d.setDate(cursor.getDate() + i)
      week.push(d >= jan1 && d <= dec31 ? d : null)
    }
    weeks.push(week)
    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

function getPeriodGrid(startDate: string, endDate: string): (Date | null)[][] {
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  let cursor = new Date(start)
  while (cursor.getDay() !== 1) cursor.setDate(cursor.getDate() - 1)
  const weeks: (Date | null)[][] = []
  while (cursor <= end || cursor.getDay() !== 1) {
    const week: (Date | null)[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(cursor); d.setDate(cursor.getDate() + i)
      week.push(d >= start && d <= end ? d : null)
    }
    weeks.push(week)
    cursor.setDate(cursor.getDate() + 7)
  }
  return weeks
}

function loadFromStorage<T>(key: string, fallback: T): T {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) as T : fallback }
  catch { return fallback }
}

function saveToStorage(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function genId(): string { return Math.random().toString(36).slice(2, 10) }

function fmtDMY(dateStr: string): string {
  const [y, m, d] = dateStr.split('-'); return `${d}/${m}/${y}`
}

function fmtDateShort(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const schemes = schemesData as Scheme[]

export default function App() {
  const [habits, setHabits] = useState<Habit[]>(() =>
    loadFromStorage<Habit[]>('habits', []).map(h => ({
      ...h, goal: h.goal ?? 7, icon: h.icon ?? HABIT_ICONS[0],
    }))
  )
  const [bundles, setBundles] = useState<Bundle[]>(() => loadFromStorage<Bundle[]>('bundles', []))
  const [activeBundleId, setActiveBundleId] = useState<string | null>(() =>
    loadFromStorage<string | null>('activeBundleId', null)
  )
  const [schemeId, setSchemeId] = useState<string>(() => {
    const saved = loadFromStorage<string>('scheme', '')
    if (saved && schemes.some(s => s.id === saved)) return saved
    return 'nothing'
  })
  const [authMode, setAuthMode] = useState<'github' | 'local' | null>(() =>
    loadFromStorage<'github' | 'local' | null>('authMode', null)
  )
  const [page, setPage] = useState<Page>('habits')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [weekOffset, setWeekOffset] = useState(0)
  const [iconPickerPos, setIconPickerPos] = useState<{ habitId: string; top: number; left: number } | null>(null)
  const [bundleForm, setBundleForm] = useState({ name: '', startDate: '', endDate: '' })
  const [ghConfig, setGhConfig] = useState<GhConfig | null>(() => loadFromStorage<GhConfig | null>('ghConfig', null))
  const [syncState, setSyncState] = useState<SyncState>('idle')
  const [syncLabel, setSyncLabel] = useState('Sync')
  const [ghSha, setGhSha] = useState<string | null>(() => loadFromStorage<string | null>('ghSha', null))
  const [ghForm, setGhForm] = useState<GhConfig>({ token: '', owner: '', repo: '', path: 'habit-data.json' })
  const [showGhForm, setShowGhForm] = useState(false)
  const [pomodoroSessions, setPomodoroSessions] = useState<PomodoroSession[]>(() =>
    loadFromStorage<PomodoroSession[]>('pomodoroSessions', [])
  )
  const [density, setDensity] = useState<'compact' | 'comfortable'>(() =>
    loadFromStorage<'compact' | 'comfortable'>('density', 'comfortable')
  )
  const [glyphStyle, setGlyphStyle] = useState<'dots' | 'glyphs' | 'minimal'>(() =>
    loadFromStorage<'dots' | 'glyphs' | 'minimal'>('glyphStyle', 'dots')
  )

  const scheme = schemes.find(s => s.id === schemeId) ?? schemes[0]
  const isLight = schemeId === 'nothing-light'
  const weekDates = getWeekDates(weekOffset)
  const activeBundle = bundles.find(b => b.id === activeBundleId) ?? null
  const days = weekDates.map(d => ({
    ...d, bundleDay: activeBundle ? getBundleDayNumber(activeBundle, d.date) : null,
  }))

  useEffect(() => { saveToStorage('habits', habits) }, [habits])
  useEffect(() => { saveToStorage('bundles', bundles) }, [bundles])
  useEffect(() => { saveToStorage('activeBundleId', activeBundleId) }, [activeBundleId])
  useEffect(() => { saveToStorage('scheme', schemeId) }, [schemeId])
  useEffect(() => { saveToStorage('ghConfig', ghConfig) }, [ghConfig])
  useEffect(() => { saveToStorage('authMode', authMode) }, [authMode])
  useEffect(() => { saveToStorage('pomodoroSessions', pomodoroSessions) }, [pomodoroSessions])
  useEffect(() => { saveToStorage('ghSha', ghSha) }, [ghSha])
  useEffect(() => { saveToStorage('density', density) }, [density])
  useEffect(() => { saveToStorage('glyphStyle', glyphStyle) }, [glyphStyle])

  const sortedHabits = [...habits].sort((a, b) => a.order - b.order)

  // Today's stats for sidebar
  const todayKey = dateKey(new Date())
  const todayDone = sortedHabits.filter(h => h.completedDates.includes(todayKey)).length
  const bestStreak = (() => {
    let max = 0
    sortedHabits.forEach(h => {
      let streak = 0; const d = new Date(); d.setHours(0, 0, 0, 0)
      for (let i = 0; i < 365; i++) {
        if (!h.completedDates.includes(dateKey(d))) break
        streak++; d.setDate(d.getDate() - 1)
      }
      if (streak > max) max = streak
    })
    return max
  })()
  const weekKeys = getWeekDates().map(d => d.key)
  const weekTotal = sortedHabits.length * 7
  const weekDoneTotal = sortedHabits.reduce((sum, h) =>
    sum + weekKeys.filter(k => h.completedDates.includes(k)).length, 0
  )
  const weekPct = weekTotal > 0 ? Math.round(weekDoneTotal / weekTotal * 100) : 0

  const addHabit = useCallback(() => {
    const name = newName.trim(); if (!name) return
    const maxOrder = habits.length ? Math.max(...habits.map(h => h.order)) : -1
    setHabits(prev => [...prev, {
      id: genId(), name, icon: HABIT_ICONS[prev.length % HABIT_ICONS.length],
      completedDates: [], order: maxOrder + 1, goal: 7,
    }])
    setNewName('')
  }, [newName, habits])

  const toggleDate = useCallback((habitId: string, dateKey: string) => {
    setHabits(prev => prev.map(h => {
      if (h.id !== habitId) return h
      const done = h.completedDates.includes(dateKey)
      return {
        ...h,
        completedDates: done
          ? h.completedDates.filter(d => d !== dateKey)
          : [...h.completedDates, dateKey],
      }
    }))
  }, [])

  const deleteHabit = useCallback((id: string) => {
    setHabits(prev => prev.filter(h => h.id !== id))
  }, [])

  const setGoal = useCallback((id: string, goal: number) => {
    setHabits(prev => prev.map(h =>
      h.id === id ? { ...h, goal: Math.max(1, Math.min(7, goal)) } : h
    ))
  }, [])

  const setIcon = useCallback((id: string, icon: string) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, icon } : h))
    setIconPickerPos(null)
  }, [])

  const startEdit = useCallback((id: string, name: string) => {
    setEditingId(id); setEditingName(name)
  }, [])

  const commitEdit = useCallback(() => {
    const name = editingName.trim()
    if (name && editingId) setHabits(prev => prev.map(h => h.id === editingId ? { ...h, name } : h))
    setEditingId(null); setEditingName('')
  }, [editingId, editingName])

  const cancelEdit = useCallback(() => {
    setEditingId(null); setEditingName('')
  }, [])

  const bundleTotalDays = bundleForm.startDate && bundleForm.endDate
    ? Math.round(
        (new Date(bundleForm.endDate + 'T00:00:00').getTime() -
         new Date(bundleForm.startDate + 'T00:00:00').getTime()) /
        (1000 * 60 * 60 * 24)
      ) + 1
    : 0

  const createBundle = useCallback(() => {
    const { name, startDate, endDate } = bundleForm
    if (!name.trim() || !startDate || !endDate) return
    if (new Date(endDate) < new Date(startDate)) return
    const b: Bundle = { id: genId(), name: name.trim(), startDate, endDate }
    setBundles(prev => [...prev, b])
    setActiveBundleId(b.id)
    setBundleForm({ name: '', startDate: '', endDate: '' })
    setSidebarOpen(false)
  }, [bundleForm])

  const deleteBundle = useCallback((id: string) => {
    setBundles(prev => prev.filter(b => b.id !== id))
    if (activeBundleId === id) setActiveBundleId(null)
  }, [activeBundleId])

  const extendBundle = useCallback(() => {
    if (!activeBundle) return
    const end = new Date(activeBundle.endDate + 'T00:00:00')
    end.setDate(end.getDate() + 7)
    setBundles(prev => prev.map(b => b.id === activeBundle.id ? { ...b, endDate: dateKey(end) } : b))
  }, [activeBundle])

  const deactivateBundle = useCallback(() => setActiveBundleId(null), [])

  // GitHub sync
  const ghHeaders = useCallback(() => ({
    Authorization: `token ${ghConfig!.token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  }), [ghConfig])

  const ghUrl = useCallback(() =>
    `https://api.github.com/repos/${ghConfig!.owner}/${ghConfig!.repo}/contents/${ghConfig!.path}`,
  [ghConfig])

  const loadFromGitHub = useCallback(async () => {
    if (!ghConfig) return
    setSyncState('busy'); setSyncLabel('Loading…')
    try {
      const res = await fetch(ghUrl(), { headers: ghHeaders() })
      if (res.status === 404) {
        setSyncState('ok'); setSyncLabel('Ready (new)'); return
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setGhSha(json.sha)
      const remote: { habits?: Habit[]; bundles?: Bundle[]; activeBundleId?: string } =
        JSON.parse(atob(json.content.replace(/\n/g, '')))
      if (remote.habits) setHabits(remote.habits)
      if (remote.bundles) setBundles(remote.bundles)
      if (remote.activeBundleId !== undefined) setActiveBundleId(remote.activeBundleId)
      setSyncState('ok'); setSyncLabel('Synced')
    } catch (e: unknown) {
      setSyncState('err'); setSyncLabel('Error')
    }
  }, [ghConfig, ghUrl, ghHeaders])

  const syncToGitHub = useCallback(async () => {
    if (!ghConfig) return
    setSyncState('busy'); setSyncLabel('Saving…')
    try {
      const payload = { habits, bundles, activeBundleId }
      const content = btoa(unescape(encodeURIComponent(JSON.stringify(payload, null, 2))))
      const body: Record<string, unknown> = {
        message: `Habit update ${dateKey(new Date())}`,
        content,
      }
      if (ghSha) body.sha = ghSha
      const res = await fetch(ghUrl(), {
        method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body),
      })
      if (res.status === 409 || res.status === 422) {
        await loadFromGitHub(); return
      }
      if (!res.ok) { const e = await res.json(); throw new Error(e.message || res.statusText) }
      const json = await res.json()
      setGhSha(json.content.sha)
      setSyncState('ok')
      setSyncLabel('Synced ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } catch (e: unknown) {
      setSyncState('err'); setSyncLabel('Failed')
    }
  }, [ghConfig, ghUrl, ghHeaders, habits, bundles, activeBundleId, ghSha, loadFromGitHub])

  const connectGitHub = useCallback(() => {
    const { token, owner, repo, path } = ghForm
    if (!token.trim() || !owner.trim() || !repo.trim()) return
    setGhConfig({ token: token.trim(), owner: owner.trim(), repo: repo.trim(), path: path.trim() || 'habit-data.json' })
    setShowGhForm(false)
    setAuthMode('github')
    setTimeout(() => loadFromGitHub(), 100)
  }, [ghForm, loadFromGitHub])

  const disconnectGitHub = useCallback(() => {
    setGhConfig(null); setGhSha(null); setSyncState('idle'); setSyncLabel('Sync'); setShowGhForm(true)
  }, [])

  const addPomodoroSession = useCallback((ses: PomodoroSession) => {
    setPomodoroSessions(prev => [...prev, ses])
  }, [])

  const signOut = useCallback(() => {
    setAuthMode(null); setGhConfig(null); setGhSha(null); setSyncState('idle')
    setSyncLabel('Sync'); setShowGhForm(true); setSidebarOpen(false)
  }, [])

  const s = scheme

  if (!authMode) {
    return (
    <div className="min-h-screen antialiased" style={{ backgroundColor: s.bg, color: s.fg, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="w-full max-w-sm">
            <div className="text-center mb-10">
              <h1 className="text-3xl font-bold tracking-widest uppercase" style={{ color: s.fgHeader, fontFamily: "'Space Mono', monospace" }}>ripple</h1>
              <p className="text-xs mt-2" style={{ color: s.fgMuted }}>habit tracker</p>
            </div>
            <div className="space-y-3">
              <button onClick={() => setAuthMode('local')}
                className="w-full py-3 rounded-sm text-xs font-medium uppercase tracking-wider transition-colors"
                style={{ backgroundColor: s.accent, color: s.bg }}>
                continue locally
              </button>
              <button onClick={() => setShowGhForm(true)}
                className="w-full py-3 rounded-sm text-xs font-medium uppercase tracking-wider transition-colors flex items-center justify-center gap-2"
                style={{ border: `1px solid ${s.border}`, color: s.fg }}>
                continue with github
              </button>
            </div>
            {showGhForm && (
              <div className="mt-6 space-y-2.5">
                <input type="password" placeholder="personal access token"
                  value={ghForm.token}
                  onChange={e => setGhForm(f => ({ ...f, token: e.target.value }))}
                  className="w-full bg-transparent text-xs px-3 py-2.5 rounded-sm outline-none transition-colors"
                  style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
                <div className="flex items-center gap-2 text-xs">
                  <input type="text" placeholder="owner"
                    value={ghForm.owner}
                    onChange={e => setGhForm(f => ({ ...f, owner: e.target.value }))}
                    className="flex-1 bg-transparent px-3 py-2.5 rounded-sm outline-none transition-colors"
                    style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
                  <span style={{ color: s.fgMuted }}>/</span>
                  <input type="text" placeholder="repo"
                    value={ghForm.repo}
                    onChange={e => setGhForm(f => ({ ...f, repo: e.target.value }))}
                    className="flex-1 bg-transparent px-3 py-2.5 rounded-sm outline-none transition-colors"
                    style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
                </div>
                <input type="text" placeholder="path (e.g. habit-data.json)"
                  value={ghForm.path}
                  onChange={e => setGhForm(f => ({ ...f, path: e.target.value }))}
                  className="w-full bg-transparent text-xs px-3 py-2.5 rounded-sm outline-none transition-colors"
                  style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
                <button onClick={connectGitHub}
                  disabled={!ghForm.token.trim() || !ghForm.owner.trim() || !ghForm.repo.trim()}
                  className="w-full py-3 rounded-sm text-xs font-medium uppercase tracking-wider transition-colors disabled:opacity-30"
                  style={{ backgroundColor: s.accent, color: s.bg }}>
                  connect & enter
                </button>
                <button onClick={() => setShowGhForm(false)}
                  className="w-full py-2 rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                  style={{ color: s.fgMuted }}>
                  back
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen antialiased flex" style={{ backgroundColor: s.bg, color: s.fg, fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      <aside className="hidden lg:flex lg:flex-col w-72 shrink-0 min-h-screen py-8 px-5"
        style={{ borderRight: `1px solid ${s.border}`, backgroundColor: s.bgCard }}>
        <div className="mb-auto">
          <div className="px-3 py-2.5" style={{ border: `1px solid ${s.border}` }}>
            <div className="text-lg font-bold tabular-nums" style={{ color: s.fg, fontFamily: "'Space Mono', monospace" }}>{todayDone}/{sortedHabits.length}</div>
            <div className="text-[10px] mt-0.5 tracking-wider uppercase" style={{ color: s.fgMuted }}>today done</div>
          </div>
          <div className="px-3 py-2.5" style={{ border: `1px solid ${s.border}` }}>
            <div className="text-lg font-bold tabular-nums" style={{ color: s.fg, fontFamily: "'Space Mono', monospace" }}>{bestStreak}d</div>
            <div className="text-[10px] mt-0.5 tracking-wider uppercase" style={{ color: s.fgMuted }}>best streak</div>
          </div>
          <div className="px-3 py-2.5" style={{ border: `1px solid ${s.border}` }}>
            <div className="text-lg font-bold tabular-nums" style={{ color: s.fg, fontFamily: "'Space Mono', monospace" }}>{weekPct}%</div>
            <div className="text-[10px] mt-0.5 tracking-wider uppercase" style={{ color: s.fgMuted }}>this week</div>
          </div>
        </div>
        <div className="mt-auto pt-8">
          <div className="flex flex-col gap-1">
            {schemes.map(sc => (
              <button key={sc.id} onClick={() => setSchemeId(sc.id)}
                className="w-full text-left px-3 py-2 text-[10px] uppercase tracking-wider transition-colors"
                style={{
                  backgroundColor: sc.id === schemeId ? s.bgHover : 'transparent',
                  color: sc.id === schemeId ? s.fg : s.fgMuted,
                }}
                onMouseEnter={e => { if (sc.id !== schemeId) e.currentTarget.style.backgroundColor = s.bgHover }}
                onMouseLeave={e => { if (sc.id !== schemeId) e.currentTarget.style.backgroundColor = 'transparent' }}>
                {sc.name}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-center pt-8 pb-2">
          <span className="w-[3px] h-[3px] dot-glow" style={{ backgroundColor: s.fgMuted }} />
        </div>
      </aside>
      <main className="flex-1 min-w-0 px-4 lg:px-8 py-8" data-glyph={glyphStyle}>

        {/* Header */}
        <header className="flex items-center justify-between mb-6" style={{ borderBottom: `1px solid ${s.border}`, paddingBottom: 14 }}>
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-xs font-semibold tracking-[0.15em] uppercase" style={{ color: activeBundle ? s.accent : s.fgHeader, fontFamily: "'Space Mono', monospace" }}>
                {activeBundle ? activeBundle.name : 'ripple'}
              </h1>
              <p className="text-[10px]" style={{ color: s.fgMuted }}>
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center gap-px ml-2" style={{ border: `1px solid ${s.border}` }}>
              <button onClick={() => setPage('habits')}
                className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase transition-colors"
                style={{
                  backgroundColor: page === 'habits' ? s.bgHover : 'transparent',
                  color: page === 'habits' ? s.fg : s.fgMuted,
                }}>
                <Grid3X3 size={10} className="inline mr-1" style={{ verticalAlign: -2 }} />
                habits
              </button>
              <button onClick={() => setPage('analytics')}
                className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase transition-colors"
                style={{
                  backgroundColor: page === 'analytics' ? s.bgHover : 'transparent',
                  color: page === 'analytics' ? s.fg : s.fgMuted,
                }}>
                <BarChart3 size={10} className="inline mr-1" style={{ verticalAlign: -2 }} />
                analytics
              </button>
              <button onClick={() => setPage('pomodoro')}
                className="px-2.5 py-1 text-[10px] font-medium tracking-wider uppercase transition-colors"
                style={{
                  backgroundColor: page === 'pomodoro' ? s.bgHover : 'transparent',
                  color: page === 'pomodoro' ? s.fg : s.fgMuted,
                }}>
                <Timer size={10} className="inline mr-1" style={{ verticalAlign: -2 }} />
                pomodoro
              </button>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            {activeBundle && page === 'habits' && (
              <button onClick={deactivateBundle}
                className="text-[10px] mr-1 px-2 py-1 rounded-sm uppercase tracking-wider transition-colors"
                style={{ color: s.fgMuted, border: `1px solid ${s.border}` }}
                onMouseEnter={e => { e.currentTarget.style.color = s.fg; e.currentTarget.style.borderColor = s.borderHover }}
                onMouseLeave={e => { e.currentTarget.style.color = s.fgMuted; e.currentTarget.style.borderColor = s.border }}>
                exit
              </button>
            )}
            {authMode === 'github' && ghConfig && page === 'habits' && (
              <button onClick={syncToGitHub}
                className="flex items-center gap-1 text-[10px] mr-1 px-2 py-1 uppercase tracking-wider transition-colors"
                style={{ color: syncState === 'ok' ? s.accent : syncState === 'err' ? s.fg : s.fgMuted, border: `1px solid ${syncState === 'ok' ? s.accent : syncState === 'err' ? s.fg : s.border}` }}>
                <span className="dot-glow" style={{
                  width: 6, height: 6, display: 'inline-block',
                  backgroundColor: syncState === 'ok' ? s.accent : syncState === 'busy' ? s.fgMuted : syncState === 'err' ? s.fg : s.fgMuted,
                }} />
                {syncLabel}
              </button>
            )}
            <button onClick={() => setSidebarOpen(true)}
              className="p-2 rounded transition-colors" style={{ color: s.fgMuted }}
              onMouseEnter={e => e.currentTarget.style.color = s.fg}
              onMouseLeave={e => e.currentTarget.style.color = s.fgMuted}
              aria-label="Settings">
              <Settings size={15} />
            </button>
            <button onClick={signOut}
              className="text-[10px] px-2 py-1 uppercase tracking-wider transition-colors ml-1"
              style={{ color: s.fgMuted, border: `1px solid ${s.border}` }}
              onMouseEnter={e => { e.currentTarget.style.color = s.fg; e.currentTarget.style.borderColor = s.fg }}
              onMouseLeave={e => { e.currentTarget.style.color = s.fgMuted; e.currentTarget.style.borderColor = s.border }}>
              logout
            </button>
          </div>
        </header>

        {/* Bundle indicator */}
        {activeBundle && page === 'habits' && (
          <div className="mb-4 flex items-center text-[10px]" style={{ color: s.fgMuted }}>
            <span>
              Day {days.find(d => d.bundleDay !== null)?.bundleDay ?? 1}–
              {days.filter(d => d.bundleDay !== null).slice(-1)[0]?.bundleDay ?? '?'} this week
              &nbsp;·&nbsp;{fmtDMY(activeBundle.startDate)} → {fmtDMY(activeBundle.endDate)}
            </span>
          </div>
        )}

        {/* Week navigation */}
        {page === 'habits' && (
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px]" style={{ color: s.fgMuted }}>
              {fmtDMY(days[0].key)} – {fmtDMY(days[6].key)}
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setWeekOffset(prev => prev - 1)}
                className="p-1 rounded transition-colors" style={{ color: s.fgMuted }}
                onMouseEnter={e => e.currentTarget.style.color = s.fg}
                onMouseLeave={e => e.currentTarget.style.color = s.fgMuted}>
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => setWeekOffset(0)}
                className="text-[10px] px-2 py-1 rounded-sm uppercase tracking-wider transition-colors"
                style={{ color: weekOffset === 0 ? s.accent : s.fgMuted, border: `1px solid ${weekOffset === 0 ? s.accent : s.border}` }}
                onMouseEnter={e => { if (weekOffset !== 0) { e.currentTarget.style.color = s.fg; e.currentTarget.style.borderColor = s.borderHover } }}
                onMouseLeave={e => { if (weekOffset !== 0) { e.currentTarget.style.color = s.fgMuted; e.currentTarget.style.borderColor = s.border } }}>
                today
              </button>
              <button onClick={() => setWeekOffset(prev => prev + 1)}
                className="p-1 rounded transition-colors" style={{ color: s.fgMuted }}
                onMouseEnter={e => e.currentTarget.style.color = s.fg}
                onMouseLeave={e => e.currentTarget.style.color = s.fgMuted}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* === HABITS PAGE === */}
        {page === 'habits' && (
          <>
            {sortedHabits.length > 0 ? (
              <div className="w-full overflow-x-auto" style={{ paddingRight: 4 }}>
                <div data-density={density} style={{
                  display: 'grid',
                  gridTemplateColumns: `1fr 56px 120px repeat(7, 36px) 48px`,
                  border: `1px solid ${s.border}`,
                  minWidth: 620,
                }}>
                  <HeaderCell scheme={s}>HABIT</HeaderCell>
                  <HeaderCell scheme={s}>GOAL</HeaderCell>
                  <HeaderCell scheme={s}>PROGRESS</HeaderCell>
                  {days.map(d => (
                    <HeaderCell key={d.key} scheme={s} className="text-center">
                      {activeBundle && d.bundleDay !== null ? (
                        <span style={{ color: s.accent }}>D{d.bundleDay}</span>
                      ) : activeBundle ? (
                        <span style={{ color: s.fgMuted, opacity: 0.4 }}>—</span>
                      ) : (
                        <>{d.label}<br /><span className="text-[10px]">{d.num}</span></>
                      )}
                    </HeaderCell>
                  ))}
                  <HeaderCell scheme={s} className="text-center">DONE</HeaderCell>

                  {sortedHabits.map((habit, idx) => {
                    const weeklyKeys = days.map(d => d.key)
                    const weeklyCount = weeklyKeys.filter(k => habit.completedDates.includes(k)).length
                    const progress = Math.min(weeklyCount / habit.goal, 1)
                    const Icon = ICON_MAP[habit.icon] || BookOpen
                    const isEditing = editingId === habit.id

                    return (
                      <div key={habit.id} className="contents">
                        <Cell idx={idx} total={sortedHabits.length} s={s}>
                            <div className="flex items-center gap-2 px-3 py-2 min-w-0 cursor-pointer"
                            onClick={() => !isEditing && startEdit(habit.id, habit.name)}>
                            <div className="shrink-0">
                              <button
                                onClick={e => {
                                  e.stopPropagation()
                                  const rect = e.currentTarget.getBoundingClientRect()
                                  setIconPickerPos(iconPickerPos?.habitId === habit.id ? null : {
                                    habitId: habit.id, top: rect.bottom + 4, left: rect.left,
                                  })
                                }}
                                className="p-0.5 rounded transition-colors hover:opacity-80"
                                style={{ color: s.fgMuted }}>
                                <Icon size={14} />
                              </button>
                            </div>
                            {isEditing ? (
                              <input autoFocus
                                className="w-full bg-transparent text-xs outline-none"
                                style={{ color: s.fg, borderBottom: `1.5px solid ${s.accent}` }}
                                value={editingName}
                                onChange={e => setEditingName(e.target.value)}
                                onBlur={commitEdit}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                                onClick={e => e.stopPropagation()}
                              />
                            ) : (
                              <span className="text-xs truncate">{habit.name}</span>
                            )}
                          </div>
                        </Cell>

                        <Cell idx={idx} total={sortedHabits.length} s={s}>
                          <div className="flex items-center justify-center gap-1 py-2">
                            <span className="text-xs tabular-nums" style={{ color: s.fg }}>{habit.goal}</span>
                            <div className="flex flex-col gap-px">
                              <button onClick={() => setGoal(habit.id, habit.goal + 1)} disabled={habit.goal >= 7}
                                className="p-0.5 leading-none disabled:opacity-20" style={{ color: s.fgMuted }}>
                                <ChevronUp size={7} />
                              </button>
                              <button onClick={() => setGoal(habit.id, habit.goal - 1)} disabled={habit.goal <= 1}
                                className="p-0.5 leading-none disabled:opacity-20" style={{ color: s.fgMuted }}>
                                <ChevronDown size={7} />
                              </button>
                            </div>
                          </div>
                        </Cell>

                        <Cell idx={idx} total={sortedHabits.length} s={s}>
                          <div className="flex items-center gap-1.5 px-2 py-2">
                            <div className="flex items-center gap-[2px]">
                              {Array.from({ length: habit.goal }, (_, gi) => (
                                <span key={gi} style={{
                                  width: 5, height: 5,
                                  backgroundColor: gi < weeklyCount ? s.accent : s.border,
                                  transition: 'background-color 0.15s',
                                }} />
                              ))}
                            </div>
                            <span className="text-[10px] tabular-nums shrink-0" style={{ color: s.fgMuted }}>
                              {weeklyCount}/{habit.goal}
                            </span>
                          </div>
                        </Cell>

                        {days.map(d => {
                          const inRange = !activeBundle || d.bundleDay !== null
                          const checked = inRange && habit.completedDates.includes(d.key)
                          return (
                            <Cell key={d.key} idx={idx} total={sortedHabits.length} s={s}>
                              <div className="flex items-center justify-center py-2">
                                <button onClick={() => inRange && toggleDate(habit.id, d.key)}
                                  className="w-4 h-4 mech-click transition-all duration-100 relative flex items-center justify-center"
                                  style={{
                                    backgroundColor: checked ? (isLight ? '#000000' : '#FFFFFF') : 'transparent',
                                    border: `1.5px solid ${checked ? (isLight ? '#000000' : '#FFFFFF') : inRange ? s.borderHover : 'transparent'}`,
                                    opacity: inRange ? 1 : 0.15,
                                    cursor: inRange ? 'pointer' : 'default',
                                  }}
                                  onMouseEnter={e => { if (inRange && !checked) e.currentTarget.style.borderColor = s.fg }}
                                  onMouseLeave={e => { if (inRange && !checked) e.currentTarget.style.borderColor = s.borderHover }}
                                  aria-label={checked ? 'Unmark' : 'Mark complete'}>
                                  {checked && <span className="w-[1.5px] h-[1.5px]" style={{ backgroundColor: isLight ? '#FFFFFF' : '#000000' }} />}
                                </button>
                              </div>
                            </Cell>
                          )
                        })}

                        <Cell idx={idx} total={sortedHabits.length} s={s}>
                          <div className="flex items-center justify-center gap-1 py-2 relative">
                            <span className="text-xs tabular-nums font-semibold"
                              style={{ color: weeklyCount >= habit.goal ? s.accent : s.fg }}>
                              {weeklyCount}
                            </span>
                            <button onClick={() => deleteHabit(habit.id)}
                              className="p-0.5 transition-opacity"
                              style={{ color: s.fgMuted, opacity: 0.25 }}
                              onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                              onMouseLeave={e => e.currentTarget.style.opacity = '0.25'}
                              aria-label="Delete habit">
                              <X size={9} />
                            </button>
                          </div>
                        </Cell>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              <div className="py-16 text-center text-xs" style={{ color: s.fgMuted }}>
                No habits yet. Add one below.
              </div>
            )}

            {/* Add habit */}
            <div className="mt-6 flex items-center gap-2 px-3 py-2.5 rounded-sm transition-colors"
              style={{ border: `1px solid ${s.border}`, backgroundColor: s.bgCard }}>
              <Plus size={14} style={{ color: s.fgMuted }} />
              <input type="text" placeholder="add a new habit..."
                value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addHabit() }}
                className="flex-1 bg-transparent text-xs outline-none placeholder:opacity-50"
                style={{ color: s.fg }} />
              {newName.trim() && (
                <div className="flex items-center gap-1">
                  <button onClick={() => setNewName('')} className="p-1 rounded transition-colors" style={{ color: s.fgMuted }}>
                    <X size={12} />
                  </button>
                  <button onClick={addHabit}
                    className="px-3 py-1 rounded-sm text-xs font-medium transition-colors"
                    style={{ backgroundColor: s.accent, color: s.bg }}>
                    add
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* === ANALYTICS PAGE === */}
        {page === 'analytics' && <AnalyticsPage habits={sortedHabits} scheme={s} activeBundle={activeBundle} />}
        {page === 'pomodoro' && <PomodoroPage habits={sortedHabits} scheme={s} sessions={pomodoroSessions} onSession={addPomodoroSession} />}

        {/* Footer */}
        <p className="mt-8 text-center text-[10px]" style={{ color: s.fgMuted }}>saved automatically</p>
      </main>

      {/* Sidebar overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40" style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className="fixed top-0 right-0 z-50 h-full w-[440px] overflow-y-auto transition-transform duration-200"
        style={{
          backgroundColor: s.bgCard,
          borderLeft: `1px solid ${s.border}`,
          transform: sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
        }}>
        <div className="p-5">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xs font-semibold tracking-widest uppercase" style={{ color: s.fgHeader }}>settings</h2>
            <button onClick={() => setSidebarOpen(false)} className="p-1 rounded transition-colors" style={{ color: s.fgMuted }}>
              <X size={14} />
            </button>
          </div>

          {/* Schemes */}
          <section className="mb-8">
            <h3 className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: s.fgHeader }}>scheme</h3>
            <div className="space-y-1">
              {schemes.map(sc => (
                <button key={sc.id} onClick={() => setSchemeId(sc.id)}
                  className="w-full text-left px-3 py-2.5 rounded-sm text-xs transition-colors flex items-center gap-2.5"
                  style={{
                    backgroundColor: sc.id === schemeId ? s.bgHover : 'transparent',
                    color: sc.id === schemeId ? s.fg : s.fgMuted,
                  }}
                  onMouseEnter={e => { if (sc.id !== schemeId) e.currentTarget.style.backgroundColor = s.bgHover }}
                  onMouseLeave={e => { if (sc.id !== schemeId) e.currentTarget.style.backgroundColor = 'transparent' }}>
                  <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: sc.accent }} />
                  {sc.name}
                </button>
              ))}
            </div>
          </section>

          {/* Display */}
          <section className="mb-8">
            <h3 className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: s.fgHeader }}>display</h3>
            <div className="space-y-1.5">
              <GlyphToggle on={density === 'compact'} onChange={v => setDensity(v ? 'compact' : 'comfortable')} s={s} label="Compact mode" />
              <GlyphToggle on={glyphStyle === 'glyphs'} onChange={v => setGlyphStyle(v ? 'glyphs' : 'dots')} s={s} label="Glyph indicators" />
            </div>
          </section>

          {/* Sign out */}
          <section className="mb-8">
            <button onClick={signOut}
              className="w-full text-left px-3 py-2.5 text-xs transition-colors flex items-center gap-2.5"
              style={{ color: s.fgMuted, border: `1px solid ${s.borderHover}` }}
              onMouseEnter={e => { e.currentTarget.style.color = s.fg; e.currentTarget.style.borderColor = s.fg }}
              onMouseLeave={e => { e.currentTarget.style.color = s.fgMuted; e.currentTarget.style.borderColor = s.borderHover }}>
              sign out
            </button>
          </section>

          {/* Bundles */}
          <section className="mb-8">
            <h3 className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: s.fgHeader }}>bundles</h3>
            {activeBundle && (
              <div className="mb-4 px-3 py-2.5 rounded-sm text-xs" style={{ border: `1px solid ${s.border}`, backgroundColor: s.bg }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold" style={{ color: s.accent }}>{activeBundle.name}</span>
                  <span className="text-[10px]" style={{ color: s.fgMuted }}>active</span>
                </div>
                <div className="text-[10px]" style={{ color: s.fgMuted }}>
                  {fmtDMY(activeBundle.startDate)} → {fmtDMY(activeBundle.endDate)}
                </div>
                <button onClick={extendBundle}
                  className="mt-2 w-full py-1.5 rounded-sm text-[10px] uppercase tracking-wider transition-colors"
                  style={{ border: `1px solid ${s.borderHover}`, color: s.fgMuted }}>
                  +7 days
                </button>
              </div>
            )}
            {bundles.length > 0 && (
              <div className="space-y-1 mb-4">
                {bundles.map(b => (
                  <div key={b.id}
                    className="flex items-center justify-between px-3 py-2.5 rounded-sm text-xs transition-colors"
                    style={{
                      backgroundColor: b.id === activeBundleId ? s.bgHover : 'transparent',
                      color: b.id === activeBundleId ? s.fg : s.fgMuted,
                      border: b.id === activeBundleId ? `1px solid ${s.border}` : 'none',
                    }}>
                    <div className="min-w-0">
                      <button onClick={() => setActiveBundleId(b.id === activeBundleId ? null : b.id)}
                        className="text-left w-full truncate">{b.name}</button>
                      <div className="text-[10px] mt-0.5" style={{ color: s.fgMuted }}>
                        {fmtDMY(b.startDate)} → {fmtDMY(b.endDate)}
                      </div>
                    </div>
                    <button onClick={() => deleteBundle(b.id)} className="p-1 rounded transition-colors shrink-0 ml-2" style={{ color: s.fgMuted }}>
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2.5">
              <input type="text" placeholder="bundle name"
                value={bundleForm.name}
                onChange={e => setBundleForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-transparent text-xs px-2 py-2 rounded-sm outline-none transition-colors"
                style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
              <div className="flex items-center gap-2 text-xs">
                <label className="flex-1">
                  <span className="text-[10px] block mb-0.5" style={{ color: s.fgMuted }}>start</span>
                  <input type="date" value={bundleForm.startDate}
                    onChange={e => setBundleForm(f => ({ ...f, startDate: e.target.value }))}
                    className="w-full bg-transparent px-2 py-1.5 rounded-sm outline-none text-xs"
                    style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
                </label>
                <label className="flex-1">
                  <span className="text-[10px] block mb-0.5" style={{ color: s.fgMuted }}>end</span>
                  <input type="date" value={bundleForm.endDate}
                    onChange={e => setBundleForm(f => ({ ...f, endDate: e.target.value }))}
                    className="w-full bg-transparent px-2 py-1.5 rounded-sm outline-none text-xs"
                    style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
                </label>
              </div>
              {bundleTotalDays > 0 && (
                <p className="text-[10px]" style={{ color: s.fgMuted }}>{bundleTotalDays} days total</p>
              )}
              <button onClick={createBundle}
                disabled={!bundleForm.name.trim() || !bundleForm.startDate || !bundleForm.endDate || bundleTotalDays <= 0}
                className="w-full py-2 rounded-sm text-xs font-medium transition-colors disabled:opacity-30"
                style={{ backgroundColor: s.accent, color: s.bg }}>
                create bundle
              </button>
            </div>
          </section>

          {/* GitHub Sync */}
          {authMode === 'github' && (
            <section className="mb-8">
              <h3 className="text-[10px] font-semibold tracking-widest uppercase mb-3" style={{ color: s.fgHeader }}>github sync</h3>
              {!ghConfig || showGhForm ? (
                <div className="space-y-2.5">
                  <input type="password" placeholder="personal access token"
                    value={ghForm.token}
                    onChange={e => setGhForm(f => ({ ...f, token: e.target.value }))}
                    className="w-full bg-transparent text-xs px-2 py-2 rounded-sm outline-none transition-colors"
                    style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
                  <div className="flex items-center gap-2 text-xs">
                    <input type="text" placeholder="owner"
                      value={ghForm.owner}
                      onChange={e => setGhForm(f => ({ ...f, owner: e.target.value }))}
                      className="flex-1 bg-transparent px-2 py-2 rounded-sm outline-none transition-colors"
                      style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
                    <span style={{ color: s.fgMuted }}>/</span>
                    <input type="text" placeholder="repo"
                      value={ghForm.repo}
                      onChange={e => setGhForm(f => ({ ...f, repo: e.target.value }))}
                      className="flex-1 bg-transparent px-2 py-2 rounded-sm outline-none transition-colors"
                      style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
                  </div>
                  <input type="text" placeholder="path (e.g. habit-data.json)"
                    value={ghForm.path}
                    onChange={e => setGhForm(f => ({ ...f, path: e.target.value }))}
                    className="w-full bg-transparent text-xs px-2 py-2 rounded-sm outline-none transition-colors"
                    style={{ color: s.fg, border: `1px solid ${s.border}`, backgroundColor: s.bg }} />
                  <button onClick={connectGitHub}
                    disabled={!ghForm.token.trim() || !ghForm.owner.trim() || !ghForm.repo.trim()}
                    className="w-full py-2 rounded-sm text-xs font-medium transition-colors disabled:opacity-30"
                    style={{ backgroundColor: s.accent, color: s.bg }}>
                    connect & sync
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="px-3 py-2 text-xs flex items-center gap-2" style={{ border: `1px solid ${s.border}`, backgroundColor: s.bg }}>
                    <span className="dot-glow" style={{
                      width: 7, height: 7, display: 'inline-block',
                      backgroundColor: syncState === 'ok' ? s.accent : syncState === 'busy' ? s.fgMuted : syncState === 'err' ? s.fg : s.fgMuted,
                    }} />
                    <span className="truncate" style={{ color: s.fg, maxWidth: 30 }}>{ghConfig.owner}/{ghConfig.repo}</span>
                    <span className="text-[10px] truncate shrink-0" style={{ color: s.fgMuted }}>
                      · {syncLabel}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={syncToGitHub}
                      className="flex-1 py-1.5 rounded-sm text-xs font-medium transition-colors"
                      style={{ backgroundColor: s.bgHover, color: s.fg, border: `1px solid ${s.border}` }}>
                      sync now
                    </button>
                    <button onClick={disconnectGitHub}
                      className="py-1.5 px-3 text-xs font-medium transition-colors"
                      style={{ color: s.fgMuted, border: `1px solid ${s.border}` }}>
                      disconnect
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

          <p className="text-[10px] leading-relaxed" style={{ color: s.fgMuted }}>
            Tip: Use GitHub sync to back up your data. Requires a repo with a personal access token (repo scope).
          </p>
        </div>
      </aside>

      {/* Icon picker overlay */}
      {iconPickerPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setIconPickerPos(null)} />
          <div className="fixed z-50 p-2"
            style={{
              top: iconPickerPos.top, left: iconPickerPos.left,
              backgroundColor: s.bgCard, border: `1px solid ${s.border}`,
            }}
            onClick={e => e.stopPropagation()}>
            <div className="grid grid-cols-5 gap-1">
              {HABIT_ICONS.map(ic => {
                const Ico = ICON_MAP[ic] || BookOpen
                const h = habits.find(x => x.id === iconPickerPos.habitId)
                return (
                  <button key={ic} onClick={() => setIcon(iconPickerPos.habitId, ic)}
                    className="p-1.5 rounded transition-colors"
                    style={{ backgroundColor: h?.icon === ic ? s.bgHover : 'transparent', color: s.fgMuted }}>
                    <Ico size={13} />
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function GlyphToggle({ on, onChange, s, label, id }: {
  on: boolean; onChange: (v: boolean) => void; s: Scheme; label: string; id?: string
}) {
  return (
    <button id={id} onClick={() => onChange(!on)}
      className="flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-sm text-xs transition-colors cursor-pointer"
      style={{ backgroundColor: s.bg, border: `1px solid ${s.border}` }}>
      <div className="flex items-center gap-[2px]">
        {Array.from({ length: 5 }, (_, i) => (
          <span key={i} style={{
            width: 4, height: 4,
            backgroundColor: on ? (i < 3 ? s.accent : s.border) : s.border,
            transition: 'background-color 0.2s',
          }} />
        ))}
      </div>
      <span style={{ color: on ? s.fg : s.fgMuted }}>{label}</span>
    </button>
  )
}

function DotMeter({ value, max, s, className = '' }: {
  value: number; max: number; s: Scheme; className?: string
}) {
  const dots = Math.min(Math.round(value), max)
  return (
    <div className={`flex items-center gap-[2px] ${className}`}>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} style={{
          width: 4, height: 4,
          backgroundColor: i < dots ? s.accent : s.border,
          transition: 'background-color 0.15s',
        }} />
      ))}
    </div>
  )
}

function Cell({ idx, total, s, children }: {
  idx: number; total: number; s: Scheme; children: React.ReactNode
}) {
  const [hover, setHover] = useState(false)
  return (
    <div className="grid-cell" style={{
      backgroundColor: hover ? s.bgHover : 'transparent',
      borderBottom: idx < total - 1 ? `1px solid ${s.border}` : 'none',
      transition: 'background-color 100ms',
    }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}>
      {children}
    </div>
  )
}

function HeaderCell({ scheme: s, className = '', children }: {
  scheme: Scheme; className?: string; children: React.ReactNode
}) {
  return (
    <div className={`header-cell px-2 py-1.5 text-[10px] font-semibold tracking-wider uppercase leading-tight ${className}`}
      style={{ color: s.fgHeader, backgroundColor: s.bg, borderBottom: `1px solid ${s.border}` }}>
      {children}
    </div>
  )
}

function AnalyticsPage({ habits, scheme: s, activeBundle }: { habits: Habit[]; scheme: Scheme; activeBundle: Bundle | null }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const past30 = getPastDays(30)
  const past90 = getPastDays(90)

  let totalDone30 = 0, totalPossible30 = 0
  const streakMap = new Map<string, number>()
  habits.forEach(h => {
    let streak = 0; const d = new Date(today)
    for (let i = 0; i < 365; i++) {
      if (!h.completedDates.includes(dateKey(d))) break
      streak++; d.setDate(d.getDate() - 1)
    }
    streakMap.set(h.id, streak)
    past30.forEach(d => {
      totalPossible30++
      if (h.completedDates.includes(dateKey(d))) totalDone30++
    })
  })
  const pct30 = totalPossible30 > 0 ? Math.round(totalDone30 / totalPossible30 * 100) : 0
  const bestStreak = Math.max(0, ...Array.from(streakMap.values()))
  const weekKeys = getWeekDates().map(d => d.key)
  const weekDone = habits.filter(h => h.completedDates.some(d => weekKeys.includes(d))).length

  // Grid heatmap
  const grid = activeBundle
    ? getPeriodGrid(activeBundle.startDate, activeBundle.endDate)
    : getYearGrid(today.getFullYear())

  const gridMonthLabels: { month: string; col: number }[] = []
  grid.forEach((week, ci) => {
    const first = week.find(d => d !== null)
    if (first) {
      const m = first.getMonth()
      if (ci === 0 || (grid[ci - 1].find(d => d !== null)?.getMonth() !== m)) {
        gridMonthLabels.push({ month: MONTHS_SHORT[m], col: ci })
      }
    }
  })

  const dowCounts = [0, 0, 0, 0, 0, 0, 0]
  const dowTotals = [0, 0, 0, 0, 0, 0, 0]
  past90.forEach(d => {
    const iso = d.getDay() === 0 ? 6 : d.getDay() - 1
    habits.forEach(h => {
      dowTotals[iso]++
      if (h.completedDates.includes(dateKey(d))) dowCounts[iso]++
    })
  })
  const dowPcts = dowCounts.map((c, i) => dowTotals[i] > 0 ? Math.round(c / dowTotals[i] * 100) : 0)
  const maxDow = Math.max(...dowPcts, 1)
  const weekLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  return (
    <div>
      {/* Stats cards */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard s={s} label="30-Day Rate" value={`${pct30}%`} />
        <StatCard s={s} label="Best Streak" value={`${bestStreak}d`} />
        <StatCard s={s} label="This Week" value={`${weekDone}/${habits.length}`} />
        <StatCard s={s} label="Total Habits" value={`${habits.length}`} />
      </div>

      {/* Heatmap grid */}
      {habits.length > 0 && (
        <div className="mb-6 p-4 rounded-sm" style={{ border: `1px solid ${s.border}`, backgroundColor: s.bgCard }}>
          <h3 className="text-[10px] font-semibold tracking-wider uppercase mb-3" style={{ color: s.fgHeader }}>
            {activeBundle
              ? `Bundle Activity · ${fmtDMY(activeBundle.startDate)} – ${fmtDMY(activeBundle.endDate)}`
              : `${today.getFullYear()} Activity`}
          </h3>
          <div className="overflow-x-auto">
            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 2 }}>
              <div style={{ display: 'flex', gap: 3, height: 14, marginLeft: 26 }}>
                {grid.map((_, ci) => {
                  const ml = gridMonthLabels.find(m => m.col === ci)
                  return (
                    <div key={ci} style={{ width: 12, fontSize: 8, color: s.fgMuted, lineHeight: '14px' }}>
                      {ml ? ml.month : ''}
                    </div>
                  )
                })}
              </div>
              {Array.from({ length: 7 }, (_, row) => (
                <div key={row} style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                  <span style={{ width: 24, fontSize: 8, color: s.fgMuted, textAlign: 'right', paddingRight: 3 }}>
                    {weekLabels[row]}
                  </span>
                  {grid.map((week, ci) => {
                    const d = week[row]
                    let heatCount = 0
                    if (d) {
                      const dk = dateKey(d)
                      habits.forEach(h => { if (h.completedDates.includes(dk)) heatCount++ })
                    }
                    const level = d ? calcHeatLevel(d, habits) : -1
                    return (
                      <div key={ci}
                        title={d ? `${fmtDateShort(d)}: ${heatCount}/${habits.length}` : ''}
                        style={{
                          width: 12, height: 12,
                          backgroundColor: level < 0 ? 'transparent' :
                            level === 0 ? s.bg :
                            level === 1 ? s.accentDim :
                            level === 2 ? s.borderHover :
                            level === 3 ? s.accentBg :
                            s.accent,
                          opacity: level < 0 ? 0 : 0.85,
                          transition: 'transform 0.1s',
                          cursor: 'default',
                        }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.35)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                      />
                    )
                  })}
                </div>
              ))}
              <div className="flex items-center gap-1.5 mt-2" style={{ fontSize: 8, color: s.fgMuted }}>
                <span>Less</span>
                {[0, 1, 2, 3, 4].map(l => (
                  <div key={l} style={{
                    width: 10, height: 10, borderRadius: 0,
                    backgroundColor: l === 0 ? s.bg : l === 1 ? s.accentDim : l === 2 ? s.borderHover : l === 3 ? s.accentBg : s.accent,
                    opacity: 0.85,
                  }} />
                ))}
                <span>More</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Day of week chart */}
      {habits.length > 0 && (
        <div className="mb-6 p-4 rounded-sm" style={{ border: `1px solid ${s.border}`, backgroundColor: s.bgCard }}>
          <h3 className="text-[10px] font-semibold tracking-wider uppercase mb-3" style={{ color: s.fgHeader }}>
            Best Days of Week
            <span className="ml-2 font-normal" style={{ color: s.fgMuted }}>— last 90 days</span>
          </h3>
          <div className="flex items-end gap-2" style={{ height: 70 }}>
            {weekLabels.map((l, i) => (
              <div key={i} className="flex flex-col items-center gap-1" style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
                <span className="text-[10px] font-semibold tabular-nums" style={{ color: s.fgHeader }}>{dowPcts[i]}%</span>
                <div style={{
                  width: '100%',
                  height: `${Math.max(3, Math.round(dowPcts[i] / maxDow * 50))}px`,
                  backgroundColor: s.accent,
                  opacity: dowPcts[i] > 0 ? 1 : 0.1,
                }} />
                <span className="text-[10px]" style={{ color: s.fgMuted }}>{l}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-habit breakdown */}
      {habits.length > 0 && (
        <div className="p-4 rounded-sm" style={{ border: `1px solid ${s.border}`, backgroundColor: s.bgCard }}>
          <h3 className="text-[10px] font-semibold tracking-wider uppercase mb-3" style={{ color: s.fgHeader }}>
            Per-Habit Breakdown
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${s.border}` }}>
                  <Th s={s}>Habit</Th>
                  <Th s={s}>Streak</Th>
                  <Th s={s}>This Week</Th>
                  <Th s={s}>30-Day Rate</Th>
                </tr>
              </thead>
              <tbody>
                {habits.map((h, i) => {
                  const streak = streakMap.get(h.id) ?? 0
                  const Icon = ICON_MAP[h.icon] || BookOpen
                  let done7 = 0
                  getWeekDates().forEach(d => { if (h.completedDates.includes(d.key)) done7++ })
                  let done30 = 0
                  past30.forEach(d => { if (h.completedDates.includes(dateKey(d))) done30++ })
                  const rate30 = Math.round(done30 / 30 * 100)

                  return (
                    <tr key={h.id} style={{ borderBottom: i < habits.length - 1 ? `1px solid ${s.border}` : 'none' }}>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <Icon size={13} style={{ color: s.fgMuted }} />
                          <span className="text-xs" style={{ color: s.fg }}>{h.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="font-semibold tabular-nums text-xs" style={{ color: streak > 0 ? s.accent : s.fgMuted }}>
                          {streak}d
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="tabular-nums text-xs" style={{ color: s.fg }}>
                          {done7}/{h.goal}
                        </span>
                      </td>
                      <td className="py-2.5 pl-3">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-[2px]">
                              {Array.from({ length: 10 }, (_, gi) => (
                                <span key={gi} style={{
                                  width: 4, height: 4,
                                  backgroundColor: gi < Math.round(rate30 / 10) ? s.accent : s.border,
                                }} />
                              ))}
                            </div>
                            <span className="text-[10px] font-semibold tabular-nums" style={{ color: s.fgHeader }}>
                              {rate30}%
                            </span>
                          </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {habits.length === 0 && (
        <div className="py-16 text-center text-xs" style={{ color: s.fgMuted }}>
          Add habits and start tracking to see your analytics.
        </div>
      )}
    </div>
  )
}

function PomodoroPage({ habits, scheme: s, sessions, onSession }: {
  habits: Habit[]; scheme: Scheme; sessions: PomodoroSession[]; onSession: (s: PomodoroSession) => void
}) {
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null)
  const [timerState, setTimerState] = useState<'idle' | 'running' | 'paused'>('idle')
  const [duration, setDuration] = useState(25)
  const [remaining, setRemaining] = useState(duration * 60)
  const intervalRef = useRef<number | null>(null)

  useEffect(() => {
    if (timerState !== 'running') return
    intervalRef.current = window.setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current)
          if (selectedHabitId) {
            onSession({
              id: genId(), habitId: selectedHabitId, date: dateKey(new Date()), duration,
            })
          }
          setTimerState('idle')
          return duration * 60
        }
        return prev - 1
      })
    }, 1000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [timerState, selectedHabitId, duration, onSession])

  const startTimer = () => setTimerState('running')
  const pauseTimer = () => { setTimerState('paused'); if (intervalRef.current) clearInterval(intervalRef.current) }
  const resetTimer = () => {
    setTimerState('idle'); if (intervalRef.current) clearInterval(intervalRef.current); setRemaining(duration * 60)
  }
  const changeDuration = (d: number) => {
    const nd = Math.max(5, Math.min(120, duration + d))
    setDuration(nd); if (timerState === 'idle') setRemaining(nd * 60)
  }

  const todayKey = dateKey(new Date())
  const todaySessions = sessions.filter(s => s.date === todayKey)
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0')
  const ss = String(remaining % 60).padStart(2, '0')

  return (
    <div>
      <div className="p-4 rounded-sm mb-6 text-center" style={{ border: `1px solid ${s.border}`, backgroundColor: s.bgCard }}>
        <div className="text-5xl font-bold mb-4" style={{ color: s.fg, fontFamily: "'Space Mono', monospace", letterSpacing: '-0.04em' }}>{mm}:{ss}</div>
        <div className="flex items-center justify-center gap-2 mb-4 text-xs" style={{ color: s.fgMuted }}>
          <button onClick={() => changeDuration(-5)} className="p-1 rounded transition-colors" style={{ color: s.fgMuted }}>
            <ChevronDown size={12} />
          </button>
          <span className="tabular-nums font-semibold" style={{ color: s.fg }}>{duration} min</span>
          <button onClick={() => changeDuration(5)} className="p-1 rounded transition-colors" style={{ color: s.fgMuted }}>
            <ChevronUp size={12} />
          </button>
        </div>
        <div className="flex flex-col items-center gap-2 mb-6">
          <div className="flex items-center justify-center gap-3">
            {timerState === 'idle' && (
              <button onClick={startTimer} disabled={!selectedHabitId}
                className="px-6 py-2 rounded-sm text-xs font-medium uppercase tracking-wider transition-colors"
                style={{
                  backgroundColor: selectedHabitId ? s.accent : 'transparent',
                  color: selectedHabitId ? s.bg : s.fgMuted,
                  border: selectedHabitId ? 'none' : `1px solid ${s.border}`,
                  opacity: selectedHabitId ? 1 : 0.7,
                }}>start</button>
            )}
            {timerState === 'running' && (
              <button onClick={pauseTimer}
                className="px-6 py-2 rounded-sm text-xs font-medium uppercase tracking-wider transition-colors"
                style={{ backgroundColor: s.bgHover, color: s.fg, border: `1px solid ${s.border}` }}>pause</button>
            )}
            {timerState === 'paused' && (
              <>
                <button onClick={startTimer}
                  className="px-6 py-2 rounded-sm text-xs font-medium uppercase tracking-wider transition-colors"
                  style={{ backgroundColor: s.accent, color: s.bg }}>resume</button>
                <button onClick={resetTimer}
                  className="px-6 py-2 text-xs font-medium uppercase tracking-wider transition-colors"
                  style={{ color: s.fgMuted, border: `1px solid ${s.border}` }}>reset</button>
              </>
            )}
          </div>
          {timerState === 'idle' && !selectedHabitId && (
            <span className="text-[10px] uppercase tracking-wider" style={{ color: s.fgMuted }}>
              select a habit to begin
            </span>
          )}
        </div>
        {habits.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {habits.map(h => {
              const Ico = ICON_MAP[h.icon] || BookOpen
              return (
                <button key={h.id} onClick={() => setSelectedHabitId(h.id === selectedHabitId ? null : h.id)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm text-xs transition-colors"
                  style={{
                    backgroundColor: h.id === selectedHabitId ? s.accentBg : s.bg,
                    color: h.id === selectedHabitId ? s.accent : s.fg,
                    border: `1px solid ${h.id === selectedHabitId ? s.accent : s.border}`,
                  }}>
                  <Ico size={12} />{h.name}
                </button>
              )
            })}
          </div>
        ) : (
          <div className="text-xs" style={{ color: s.fgMuted }}>No habits yet. Add one on the habits page.</div>
        )}
      </div>
      <div className="p-4 rounded-sm" style={{ border: `1px solid ${s.border}`, backgroundColor: s.bgCard }}>
        <h3 className="text-[10px] font-semibold tracking-wider uppercase mb-3" style={{ color: s.fgHeader }}>
          Today's Pomodoro Sessions
        </h3>
        {todaySessions.length > 0 ? (
          <div className="space-y-1.5">
            {todaySessions.map(ses => {
              const h = habits.find(hh => hh.id === ses.habitId)
              const Ico = h ? (ICON_MAP[h.icon] || BookOpen) : BookOpen
              return (
                <div key={ses.id} className="flex items-center justify-between px-3 py-2 rounded-sm text-xs"
                  style={{ backgroundColor: s.bg }}>
                  <div className="flex items-center gap-2">
                    <Ico size={13} style={{ color: s.fgMuted }} />
                    <span style={{ color: s.fg }}>{h?.name ?? 'Unknown'}</span>
                  </div>
                  <span className="text-[10px] tabular-nums" style={{ color: s.fgMuted }}>{ses.duration} min</span>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="text-xs" style={{ color: s.fgMuted }}>No sessions logged today.</div>
        )}
      </div>
    </div>
  )
}

function StatCard({ s, label, value }: { s: Scheme; label: string; value: string }) {
  return (
    <div className="p-3" style={{ border: `1px solid ${s.border}` }}>
      <div className="text-lg font-bold tabular-nums" style={{ color: s.fg, fontFamily: "'Space Mono', monospace" }}>{value}</div>
      <div className="text-[10px] mt-0.5 tracking-wider uppercase" style={{ color: s.fgMuted }}>{label}</div>
    </div>
  )
}

function Th({ s, children }: { s: Scheme; children: React.ReactNode }) {
  return (
    <th className="text-left py-2 pr-3 text-[10px] font-semibold tracking-wider uppercase" style={{ color: s.fgHeader }}>
      {children}
    </th>
  )
}

function calcHeatLevel(date: Date, habits: Habit[]): number {
  const dk = dateKey(date)
  let count = 0
  habits.forEach(h => { if (h.completedDates.includes(dk)) count++ })
  const max = habits.length
  if (count === 0) return 0
  if (max <= 2) return count
  const ratio = count / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}
