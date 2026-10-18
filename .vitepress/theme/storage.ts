/**
 * Repo-Wiki Local State Management
 * Zero-Backend Client Persistence Primitives
 */

export const STORAGE_KEYS = {
  COMPLETED: 'pyspark_completed_lessons',
  ACTIVITY: 'pyspark_lesson_activity',
  POMO_STATE: 'portal_pomo_state',
  POMO_STATS: 'pyspark_pomodoro_stats',
  TIMEFRAME: 'pyspark_timeframe',
  WALKTHROUGH: 'pyspark_walkthrough_seen',
  CONSENT: 'pyspark_storage_consented',
  FAVORITES: 'pyspark_favorites',
  NOTES: 'pyspark_user_notes'
} as const

export const EVENT_PROGRESS_UPDATED = 'pyspark-progress-updated'

function isClient(): boolean {
  return typeof window !== 'undefined' && typeof localStorage !== 'undefined'
}

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
  const clean = path.replace(/\/$/, '')
  return list.some(p => p.replace(/\/$/, '') === clean)
}

export function toggleLessonCompletion(path: string): boolean {
  if (!isClient()) return false
  const list = getCompletedLessons()
  const clean = path.replace(/\/$/, '')
  const exists = list.some(p => p.replace(/\/$/, '') === clean)
  
  let updated: string[] = []
  if (exists) {
    updated = list.filter(p => p.replace(/\/$/, '') !== clean)
  } else {
    updated = [...list, clean]
  }

  try {
    localStorage.setItem(STORAGE_KEYS.COMPLETED, JSON.stringify(updated))
    
    // Log activity with consistent YYYY-MM-DD
    const today = new Date().toISOString().slice(0, 10)
    const activityRaw = localStorage.getItem(STORAGE_KEYS.ACTIVITY)
    const activity: Record<string, string[]> = activityRaw ? JSON.parse(activityRaw) : {}
    if (!activity[today]) activity[today] = []
    
    if (!exists) {
      if (!activity[today].includes(clean)) {
        activity[today].push(clean)
      }
    } else {
      activity[today] = activity[today].filter(p => p !== clean)
    }
    localStorage.setItem(STORAGE_KEYS.ACTIVITY, JSON.stringify(activity))
  } catch (e) {
    console.error('Failed to save completion to localStorage', e)
  }

  // Dispatch custom cross-component event
  window.dispatchEvent(new Event(EVENT_PROGRESS_UPDATED))
  return !exists
}

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
  const clean = path.replace(/\/$/, '')
  return favs.some(p => p.replace(/\/$/, '') === clean)
}

export function toggleFavorite(path: string): boolean {
  if (!isClient()) return false
  const favs = getFavorites()
  const clean = path.replace(/\/$/, '')
  const exists = favs.some(p => p.replace(/\/$/, '') === clean)
  
  const updated = exists ? favs.filter(p => p.replace(/\/$/, '') !== clean) : [...favs, clean]
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
