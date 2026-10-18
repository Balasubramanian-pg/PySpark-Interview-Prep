/**
 * Repo-Wiki Local State Management & Retention Engine
 * Zero-Backend Client Persistence with Cross-Device Sync & Spaced Repetition (SRS)
 */

import { withBase } from 'vitepress'

export const STORAGE_KEYS = {
  COMPLETED: 'pyspark_completed_lessons',
  ACTIVITY: 'pyspark_lesson_activity',
  POMO_STATE: 'portal_pomo_state',
  POMO_STATS: 'pyspark_pomodoro_stats',
  TIMEFRAME: 'pyspark_timeframe',
  WALKTHROUGH: 'pyspark_walkthrough_seen',
  CONSENT: 'pyspark_storage_consented',
  FAVORITES: 'pyspark_favorites',
  NOTES: 'pyspark_user_notes',
  STREAK: 'pyspark_study_streak',
  SRS: 'pyspark_srs_deck',
  DIAGNOSTIC: 'pyspark_diagnostic_result'
} as const

export const EVENT_PROGRESS_UPDATED = 'pyspark-progress-updated'

export interface SRSItem {
  path: string
  intervalDays: number
  nextReviewDate: string
  reviewsCount: number
  lastReviewed: string
  confidence: 'hard' | 'good' | 'mastered'
}

export interface StudyStreak {
  currentStreak: number
  longestStreak: number
  lastStudyDate: string
}

export interface DiagnosticResult {
  score: number
  total: number
  level: string
  weakAreas: string[]
  completedAt: string
}

/**
 * Strips base URL, .html, and trailing slashes so paths always match
 */
export function normalizePath(path: string): string {
  if (!path) return ''
  let p = path.trim()
  p = p.replace(/^\/PySpark-Interview-Prep\//, '/')
  p = p.replace(/\.html$/, '')
  p = p.replace(/\/$/, '')
  return p
}

/**
 * Resolves any route or question path into an exact URL with base and .html extension
 * for GitHub Pages zero-404 navigation.
 */
export function resolveUrl(path: string): string {
  if (!path || path === '/') {
    return withBase('/')
  }
  let target = path.trim()
  if (!target.endsWith('.html') && !target.includes('#')) {
    target = target + '.html'
  }
  if (target.startsWith('/PySpark-Interview-Prep/')) {
    return target
  }
  return withBase(target)
}

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

// ─── Completed Lessons ──────────────────────────────────────────────────
export function getCompletedLessons(): string[] {
  if (!isClient()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.COMPLETED)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function isLessonCompleted(path: string): boolean {
  const list = getCompletedLessons()
  const clean = normalizePath(path)
  return list.some(p => normalizePath(p) === clean)
}

export function toggleLessonCompletion(path: string): boolean {
  if (!isClient()) return false
  const list = getCompletedLessons()
  const clean = normalizePath(path)
  const exists = list.some(p => normalizePath(p) === clean)
  
  let updated: string[] = []
  if (exists) {
    updated = list.filter(p => normalizePath(p) !== clean)
  } else {
    updated = [...list, clean]
  }

  try {
    localStorage.setItem(STORAGE_KEYS.COMPLETED, JSON.stringify(updated))
    
    // Log activity
    const today = new Date().toISOString().slice(0, 10)
    const activityRaw = localStorage.getItem(STORAGE_KEYS.ACTIVITY)
    const activity: Record<string, string[]> = activityRaw ? JSON.parse(activityRaw) : {}
    if (!activity[today]) activity[today] = []
    
    if (!exists) {
      if (!activity[today].includes(clean)) {
        activity[today].push(clean)
      }
      recordStudyActivity()
    } else {
      activity[today] = activity[today].filter(p => p !== clean)
    }
    localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(activity))
  } catch (e) {
    console.error('Failed to save completion', e)
  }

  window.dispatchEvent(new Event(EVENT_PROGRESS_UPDATED))
  return !exists
}

// ─── Daily Study Streak (Habit-Forming Re-engagement) ───────────────────
export function getStudyStreak(): StudyStreak {
  if (!isClient()) return { currentStreak: 0, longestStreak: 0, lastStudyDate: '' }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.STREAK)
    if (!raw) return { currentStreak: 0, longestStreak: 0, lastStudyDate: '' }
    const streak: StudyStreak = JSON.parse(raw)
    
    // Check if streak was broken (missed yesterday)
    const today = new Date().toISOString().slice(0, 10)
    if (streak.lastStudyDate) {
      const last = new Date(streak.lastStudyDate)
      const current = new Date(today)
      const diffDays = Math.floor((current.getTime() - last.getTime()) / (1000 * 3600 * 24))
      if (diffDays > 1) {
        streak.currentStreak = 0 // Streak broken
        localStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(streak))
      }
    }
    return streak
  } catch {
    return { currentStreak: 0, longestStreak: 0, lastStudyDate: '' }
  }
}

export function recordStudyActivity(): void {
  if (!isClient()) return
  const today = new Date().toISOString().slice(0, 10)
  const streak = getStudyStreak()
  
  if (streak.lastStudyDate === today) {
    return // Already recorded today
  }

  if (streak.lastStudyDate) {
    const last = new Date(streak.lastStudyDate)
    const current = new Date(today)
    const diffDays = Math.floor((current.getTime() - last.getTime()) / (1000 * 3600 * 24))
    if (diffDays === 1) {
      streak.currentStreak += 1
    } else {
      streak.currentStreak = 1
    }
  } else {
    streak.currentStreak = 1
  }

  streak.longestStreak = Math.max(streak.longestStreak, streak.currentStreak)
  streak.lastStudyDate = today

  try {
    localStorage.setItem(STORAGE_KEYS.STREAK, JSON.stringify(streak))
  } catch {}
}

// ─── Spaced Repetition System (Ebbinghaus Forgetting Curve) ─────────────
export function getSRSDeck(): Record<string, SRSItem> {
  if (!isClient()) return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SRS)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function scheduleSRSReview(path: string, confidence: 'hard' | 'good' | 'mastered'): void {
  if (!isClient()) return
  const clean = normalizePath(path)
  const deck = getSRSDeck()
  const existing = deck[clean]

  const intervals = {
    hard: 1,      // Repeat tomorrow
    good: 3,      // Repeat in 3 days
    mastered: 7   // Repeat in 7 days
  }

  let intervalDays = intervals[confidence]
  if (existing && confidence === 'mastered') {
    intervalDays = Math.min(30, (existing.intervalDays || 7) * 2)
  }

  const nextDate = new Date()
  nextDate.setDate(nextDate.getDate() + intervalDays)
  const nextReviewDate = nextDate.toISOString().slice(0, 10)
  const today = new Date().toISOString().slice(0, 10)

  deck[clean] = {
    path: clean,
    intervalDays,
    nextReviewDate,
    reviewsCount: (existing?.reviewsCount || 0) + 1,
    lastReviewed: today,
    confidence
  }

  try {
    localStorage.setItem(STORAGE_KEYS.SRS, JSON.stringify(deck))
  } catch {}

  recordStudyActivity()
  window.dispatchEvent(new Event(EVENT_PROGRESS_UPDATED))
}

export function getDueSRSReviews(): SRSItem[] {
  if (!isClient()) return []
  const deck = getSRSDeck()
  const today = new Date().toISOString().slice(0, 10)
  return Object.values(deck).filter(item => item.nextReviewDate <= today)
}

// ─── Diagnostic Assessment Roadmap ──────────────────────────────────────
export function getDiagnosticResult(): DiagnosticResult | null {
  if (!isClient()) return null
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DIAGNOSTIC)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function saveDiagnosticResult(result: DiagnosticResult): void {
  if (!isClient()) return
  try {
    localStorage.setItem(STORAGE_KEYS.DIAGNOSTIC, JSON.stringify(result))
  } catch {}
  window.dispatchEvent(new Event(EVENT_PROGRESS_UPDATED))
}

// ─── Cross-Device Cloud & JSON Sync (Zero-Backend Bridge) ───────────────
export function exportAllData(): string {
  if (!isClient()) return '{}'
  const payload: Record<string, any> = {}
  Object.values(STORAGE_KEYS).forEach(k => {
    try {
      const val = localStorage.getItem(k)
      if (val) payload[k] = JSON.parse(val)
    } catch {}
  })
  payload._exportedAt = new Date().toISOString()
  payload._version = '1.0'
  return JSON.stringify(payload, null, 2)
}

export function importAllData(jsonStr: string): boolean {
  if (!isClient()) return false
  try {
    const data = JSON.parse(jsonStr)
    Object.values(STORAGE_KEYS).forEach(k => {
      if (data[k] !== undefined) {
        localStorage.setItem(k, JSON.stringify(data[k]))
      }
    })
    window.dispatchEvent(new Event(EVENT_PROGRESS_UPDATED))
    return true
  } catch (e) {
    console.error('Import failed', e)
    return false
  }
}

export function generateSyncToken(): string {
  if (!isClient()) return ''
  try {
    const data = exportAllData()
    // Standard Base64 encoding
    return btoa(unescape(encodeURIComponent(data)))
  } catch {
    return ''
  }
}

export function importSyncToken(token: string): boolean {
  if (!isClient() || !token) return false
  try {
    const jsonStr = decodeURIComponent(escape(atob(token.trim())))
    return importAllData(jsonStr)
  } catch {
    return false
  }
}

// ─── Favorites & Habits ─────────────────────────────────────────────────
export function getFavorites(): string[] {
  if (!isClient()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FAVORITES)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function isFavorite(path: string): boolean {
  const favs = getFavorites()
  const clean = normalizePath(path)
  return favs.some(p => normalizePath(p) === clean)
}

export function toggleFavorite(path: string): boolean {
  if (!isClient()) return false
  const favs = getFavorites()
  const clean = normalizePath(path)
  const exists = favs.some(p => normalizePath(p) === clean)
  
  const updated = exists ? favs.filter(p => normalizePath(p) !== clean) : [...favs, clean]
  try {
    localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated))
  } catch (e) {
    console.error('Failed to save favorite', e)
  }
  window.dispatchEvent(new Event(EVENT_PROGRESS_UPDATED))
  return !exists
}

export function getPomodoroStats(): { completedBlocks: number } {
  if (!isClient()) return { completedBlocks: 0 }
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.POMO_STATS)
    return raw ? JSON.parse(raw) : { completedBlocks: 0 }
  } catch {
    return { completedBlocks: 0 }
  }
}

export function incrementPomodoroBlocks(): void {
  if (!isClient()) return
  const stats = getPomodoroStats()
  stats.completedBlocks += 1
  try {
    localStorage.setItem(STORAGE_KEYS.POMO_STATS, JSON.stringify(stats))
  } catch (e) {
    console.error('Failed to save pomodoro stats', e)
  }
  recordStudyActivity()
  window.dispatchEvent(new Event(EVENT_PROGRESS_UPDATED))
}

export function getActivityMap(): Record<string, string[]> {
  if (!isClient()) return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVITY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function getTimeframe(): 'week' | 'month' {
  if (!isClient()) return 'week'
  const val = localStorage.getItem(STORAGE_KEYS.TIMEFRAME)
  return val === 'month' ? 'month' : 'week'
}

export function setTimeframe(val: 'week' | 'month'): void {
  if (!isClient()) return
  localStorage.setItem(STORAGE_KEYS.TIMEFRAME, val)
  window.dispatchEvent(new Event(EVENT_PROGRESS_UPDATED))
}

export function hasSeenWalkthrough(): boolean {
  if (!isClient()) return true
  return localStorage.getItem(STORAGE_KEYS.WALKTHROUGH) === 'true'
}

export function setWalkthroughSeen(seen = true): void {
  if (!isClient()) return
  localStorage.setItem(STORAGE_KEYS.WALKTHROUGH, seen ? 'true' : 'false')
}

export function hasStorageConsented(): boolean {
  if (!isClient()) return true
  return localStorage.getItem(STORAGE_KEYS.CONSENT) === 'true'
}

export function setStorageConsented(consented = true): void {
  if (!isClient()) return
  localStorage.setItem(STORAGE_KEYS.CONSENT, consented ? 'true' : 'false')
  window.dispatchEvent(new Event(EVENT_PROGRESS_UPDATED))
}
