<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vitepress'
import {
  getCompletedLessons,
  getFavorites,
  getPomodoroStats,
  incrementPomodoroBlocks,
  getActivityMap,
  getTimeframe,
  setTimeframe,
  EVENT_PROGRESS_UPDATED,
  resolveUrl,
  normalizePath,
  isLessonCompleted,
  isFavorite,
  toggleFavorite
} from './.vitepress/theme/storage'
import WalkthroughGuide from './.vitepress/theme/WalkthroughGuide.vue'
import SearchModal from './.vitepress/theme/SearchModal.vue'
import QuizModal from './.vitepress/theme/QuizModal.vue'
import searchIndexData from './search-index.json'

const router = useRouter()

const walkthroughRef = ref<InstanceType<typeof WalkthroughGuide> | null>(null)
const searchModalRef = ref<InstanceType<typeof SearchModal> | null>(null)
const showQuizModal = ref(false)

// State
const completedLessons = ref<string[]>([])
const favorites = ref<string[]>([])
const pomodoroStats = ref<{ completedBlocks: number }>({ completedBlocks: 0 })
const activityMap = ref<Record<string, string[]>>({})
const selectedTimeframe = ref<'week' | 'month'>('week')
const activeFilter = ref<'all' | '1. Fundamentals' | '2. Intermediate' | '3. Advanced' | '4. Senior Dev'>('all')

// Interactive Question Feed State
const feedSearchQuery = ref('')
const selectedSubtopic = ref<string>('all')
const currentPage = ref(1)
const itemsPerPage = ref(12)

function setFilter(filter: 'all' | '1. Fundamentals' | '2. Intermediate' | '3. Advanced' | '4. Senior Dev') {
  activeFilter.value = filter
  selectedSubtopic.value = 'all'
  feedSearchQuery.value = ''
  currentPage.value = 1
}

function setSubtopic(subtopic: string) {
  selectedSubtopic.value = subtopic
  currentPage.value = 1
}

const availableSubtopics = computed(() => {
  let list = searchIndexData
  if (activeFilter.value !== 'all') {
    list = list.filter(item => item.module === activeFilter.value)
  }
  const subtopicMap: Record<string, number> = {}
  list.forEach(item => {
    subtopicMap[item.subtopic] = (subtopicMap[item.subtopic] || 0) + 1
  })
  return Object.entries(subtopicMap).map(([name, count]) => ({ name, count }))
})

const filteredQuestions = computed(() => {
  return searchIndexData.filter(item => {
    if (activeFilter.value !== 'all' && item.module !== activeFilter.value) {
      return false
    }
    if (selectedSubtopic.value !== 'all' && item.subtopic !== selectedSubtopic.value) {
      return false
    }
    if (feedSearchQuery.value.trim()) {
      const q = feedSearchQuery.value.toLowerCase().trim()
      const titleMatch = item.title.toLowerCase().includes(q)
      const subtopicMatch = item.subtopic.toLowerCase().includes(q)
      const summaryMatch = item.summary.toLowerCase().includes(q)
      if (!titleMatch && !subtopicMatch && !summaryMatch) {
        return false
      }
    }
    return true
  })
})

const totalPages = computed(() => {
  return Math.ceil(filteredQuestions.value.length / itemsPerPage.value) || 1
})

const paginatedQuestions = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  return filteredQuestions.value.slice(start, start + itemsPerPage.value)
})

function prevPage() {
  if (currentPage.value > 1) {
    currentPage.value--
  }
}

function nextPage() {
  if (currentPage.value < totalPages.value) {
    currentPage.value++
  }
}

function onToggleCardFavorite(item: any, e: Event) {
  e.stopPropagation()
  toggleFavorite(item.path)
  favorites.value = getFavorites()
}

// Pomodoro state
const POMO_KEY = 'portal_pomo_state'
const pomoRemaining = ref(25 * 60)
const pomoTotal = ref(25 * 60)
const pomoRunning = ref(false)
const pomoMode = ref<'work' | 'break'>('work')
let timerInterval: any = null

function loadAllState() {
  completedLessons.value = getCompletedLessons()
  favorites.value = getFavorites()
  pomodoroStats.value = getPomodoroStats()
  activityMap.value = getActivityMap()
  selectedTimeframe.value = getTimeframe()
  syncPomo()
}

function syncPomo() {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(POMO_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (data.status === 'running') {
      const diff = Math.max(0, Math.floor((data.targetEnd - Date.now()) / 1000))
      pomoRemaining.value = diff
      pomoTotal.value = data.totalSeconds || 25 * 60
      pomoMode.value = data.mode || 'work'
      if (diff > 0) {
        pomoRunning.value = true
        startTimerLoop()
      } else {
        finishPomoBlock()
      }
    }
  } catch {}
}

function startTimerLoop() {
  if (timerInterval) clearInterval(timerInterval)
  timerInterval = setInterval(() => {
    if (!pomoRunning.value) return
    const raw = localStorage.getItem(POMO_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    const diff = Math.max(0, Math.floor((data.targetEnd - Date.now()) / 1000))
    pomoRemaining.value = diff
    if (diff <= 0) {
      finishPomoBlock()
    }
  }, 1000)
}

function togglePomo() {
  if (pomoRunning.value) {
    pomoRunning.value = false
    if (timerInterval) clearInterval(timerInterval)
    localStorage.setItem(POMO_KEY, JSON.stringify({
      status: 'paused',
      remaining: pomoRemaining.value,
      mode: pomoMode.value,
      totalSeconds: pomoTotal.value
    }))
  } else {
    pomoRunning.value = true
    const targetEnd = Date.now() + pomoRemaining.value * 1000
    localStorage.setItem(POMO_KEY, JSON.stringify({
      status: 'running',
      targetEnd,
      mode: pomoMode.value,
      totalSeconds: pomoTotal.value
    }))
    startTimerLoop()
  }
}

function resetPomo(mode: 'work' | 'break' = 'work') {
  pomoRunning.value = false
  if (timerInterval) clearInterval(timerInterval)
  pomoMode.value = mode
  pomoTotal.value = mode === 'work' ? 25 * 60 : 5 * 60
  pomoRemaining.value = pomoTotal.value
  localStorage.removeItem(POMO_KEY)
}

function finishPomoBlock() {
  pomoRunning.value = false
  if (timerInterval) clearInterval(timerInterval)
  localStorage.removeItem(POMO_KEY)
  if (pomoMode.value === 'work') {
    incrementPomodoroBlocks()
    pomodoroStats.value = getPomodoroStats()
  }
  pomoRemaining.value = 0
}

onMounted(() => {
  loadAllState()
  window.addEventListener(EVENT_PROGRESS_UPDATED, loadAllState)
  window.addEventListener('storage', loadAllState)
})

onUnmounted(() => {
  if (timerInterval) clearInterval(timerInterval)
  window.removeEventListener(EVENT_PROGRESS_UPDATED, loadAllState)
  window.removeEventListener('storage', loadAllState)
})

// Metrics
const totalQuestionsCount = computed(() => searchIndexData.length)
const completedCount = computed(() => completedLessons.value.length)
const readinessScore = computed(() => {
  if (totalQuestionsCount.value === 0) return 0
  return Math.min(100, Math.round((completedCount.value / totalQuestionsCount.value) * 100))
})

// Pomodoro Progress Ring
const pomoStrokeOffset = computed(() => {
  const r = 48
  const c = 2 * Math.PI * r
  const elapsed = pomoTotal.value - pomoRemaining.value
  const fraction = pomoTotal.value > 0 ? elapsed / pomoTotal.value : 0
  return c * (1 - fraction)
})

const formattedPomoTime = computed(() => {
  const m = Math.floor(pomoRemaining.value / 60)
  const s = pomoRemaining.value % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
})

// Dynamic Performance Spline Wave — fully contained in a 220×80 box
const waveData = computed(() => {
  const s = Math.max(5, readinessScore.value)
  // Map 0–100 readiness to a peak that stays within [20,180] x and [10,65] y
  const peakX = 20 + (s / 100) * 140         // 20 → 160
  const peakY = 65 - (s / 100) * 45          // 65 → 20
  const curve = `M 0,70 C 50,70 ${Math.max(10, peakX - 40)},${peakY} ${peakX},${peakY} S 210,62 220,65`
  const area  = `${curve} L 220,80 L 0,80 Z`
  return { peakX, peakY, curve, area }
})

// Weekly & Monthly Data
const weeklyData = computed(() => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const today = new Date()
  return days.map((day, idx) => {
    const d = new Date()
    d.setDate(today.getDate() - (6 - idx))
    const dateStr = d.toISOString().slice(0, 10)
    const count = activityMap.value[dateStr] ? activityMap.value[dateStr].length : 0
    const maxVal = 10
    const heightPercent = count > 0 ? Math.min(100, Math.max(15, (count / maxVal) * 100)) : 10
    return {
      label: day.charAt(0),
      dayName: day,
      count,
      height: `${heightPercent}%`,
      hours: (count * 0.25).toFixed(1)
    }
  })
})

const monthlyData = computed(() => {
  const weeks = ['W1', 'W2', 'W3', 'W4']
  return weeks.map((w, idx) => {
    const count = Math.round(completedCount.value * (0.2 + idx * 0.2))
    const heightPercent = Math.min(100, Math.max(15, count * 2))
    return {
      label: w,
      dayName: `Week ${idx + 1}`,
      count,
      height: `${heightPercent}%`,
      hours: (count * 0.25).toFixed(1)
    }
  })
})

const favoriteQuestions = computed(() => {
  return searchIndexData.filter(item => {
    const clean = normalizePath(item.path)
    return favorites.value.some(fav => normalizePath(fav) === clean)
  }).slice(0, 6)
})

const nextUncompletedLesson = computed(() => {
  const found = searchIndexData.find(item => {
    const clean = normalizePath(item.path)
    return !completedLessons.value.some(c => normalizePath(c) === clean)
  })
  return found || searchIndexData[0]
})

const modulesList = [
  {
    id: '1. Fundamentals',
    name: 'Module 1: Fundamentals',
    tag: 'Core Architecture',
    desc: 'Spark Architecture, RDD vs DataFrame, Lazy Evaluation, Lineage, Aggregations, SparkSession',
    link: '/1. Fundamentals/1.1 Spark Architecture Basics/Readme',
    total: 70
  },
  {
    id: '2. Intermediate',
    name: 'Module 2: Intermediate',
    tag: 'Data Engineering Patterns',
    desc: 'Joins, Window Functions, Complex Types, Regex, UDFs, Data Quality, File Formats & Parquet',
    link: '/2. Intermediate/2.1 Joins And Join Types/Readme',
    total: 77
  },
  {
    id: '3. Advanced',
    name: 'Module 3: Advanced',
    tag: 'Optimization & Catalyst',
    desc: 'Partitioning, Bucketing, Shuffling, Skew Handling, Catalyst Optimizer, AQE, Broadcast Variables',
    link: '/3. Advanced/3.1 Partitioning And Bucketing/Readme',
    total: 68
  },
  {
    id: '4. Senior Dev',
    name: 'Module 4: Senior Dev',
    tag: 'Production & Staff Level',
    desc: 'Memory Management, OOM Debugging, Spark UI, Structured Streaming, Delta Lake, Cluster Sizing',
    link: '/4. Senior Dev/4.1 Memory Management And OOM Errors/Readme',
    total: 50
  }
]

function getModuleProgress(moduleId: string) {
  const moduleQuestions = searchIndexData.filter(i => i.module === moduleId)
  if (moduleQuestions.length === 0) return 0
  const completed = moduleQuestions.filter(i => {
    const clean = normalizePath(i.path)
    return completedLessons.value.some(c => normalizePath(c) === clean)
  })
  return Math.round((completed.length / moduleQuestions.length) * 100)
}

function getModuleCompletedCount(moduleId: string) {
  const moduleQuestions = searchIndexData.filter(i => i.module === moduleId)
  return moduleQuestions.filter(i => {
    const clean = normalizePath(i.path)
    return completedLessons.value.some(c => normalizePath(c) === clean)
  }).length
}

function openSearch() {
  searchModalRef.value?.open()
}

function openTour() {
  walkthroughRef.value?.open()
}

function navigateTo(path: string) {
  router.go(resolveUrl(path))
}

// ─── Random Daily Topic Carousel ─────────────────────────────────────────────
// Picks a fresh set of topics seeded by today's date (changes each day)
function getDailyTopics(count = 8) {
  const today = new Date().toISOString().slice(0, 10)
  const seed = today.split('-').reduce((a, b) => a + parseInt(b), 0)
  const allSubtopics = Array.from(new Set(searchIndexData.map(i => i.subtopic)))
  // Seeded shuffle — deterministic per day
  const shuffled = [...allSubtopics]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = (seed * (i + 1)) % (i + 1)
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled.slice(0, count).map(subtopic => {
    const items = searchIndexData.filter(i => i.subtopic === subtopic)
    const readme = items.find(i => i.path.toLowerCase().includes('readme')) || items[0]
    const firstQuestion = items.find(i => !i.path.toLowerCase().includes('readme')) || items[0]
    return {
      subtopic,
      path: readme?.path || firstQuestion?.path || '',
      firstQ: firstQuestion,
      count: items.length,
      module: items[0]?.module || ''
    }
  })
}

const dailyTopics = computed(() => getDailyTopics(8))

// Carousel scroll
const carouselEl = ref<HTMLElement | null>(null)
const carouselCanPrev = ref(false)
const carouselCanNext = ref(true)

function scrollCarousel(dir: 'prev' | 'next') {
  const el = carouselEl.value
  if (!el) return
  const scrollAmount = 340
  el.scrollBy({ left: dir === 'next' ? scrollAmount : -scrollAmount, behavior: 'smooth' })
  setTimeout(updateCarouselArrows, 350)
}

function updateCarouselArrows() {
  const el = carouselEl.value
  if (!el) return
  carouselCanPrev.value = el.scrollLeft > 8
  carouselCanNext.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 8
}

const moduleTagColors: Record<string, string> = {
  '1. Fundamentals': '#3B82F6',
  '2. Intermediate': '#8B5CF6',
  '3. Advanced': '#F59E0B',
  '4. Senior Dev': '#EF4444'
}
</script>

<template>
  <div class="dash-viewport">
    <!-- Streamlined Minimal Header -->
    <header class="dash-top-bar">
      <div class="brand-wrap" @click="navigateTo('/')">
        <svg class="brand-spark-svg" viewBox="0 0 24 24" width="24" height="24" fill="#FF6B35">
          <path d="M10.812 0c-.425.013-.845.215-1.196.605a3.593 3.593 0 00-.493.722c-.355.667-.425 1.415-.556 2.143a551.9 551.9 0 00-.726 4.087c-.027.16-.096.227-.244.273C5.83 8.386 4.06 8.94 2.3 9.514c-.387.125-.773.289-1.114.506-1.042.665-1.196 1.753-.415 2.71.346.422.79.715 1.284.936 1.1.49 2.202.976 3.3 1.47.019.01.036.013.053.019h-.004l1.306.535c0 .023.002.045 0 .073-.2 2.03-.39 4.063-.58 6.095-.04.419-.012.831.134 1.23.317.87 1.065 1.148 1.881.701.372-.204.666-.497.937-.818 1.372-1.623 2.746-3.244 4.113-4.872.111-.133.205-.15.363-.098.349.117.697.231 1.045.347h.001c.02.012.045.02.073.03l.142.042c1.248.416 2.68.775 3.929 1.19.4.132.622.164 1.045.098.311-.048.592-.062.828-.236.602-.33.995-.957.988-1.682-.005-.427-.154-.813-.35-1.186-.82-1.556-1.637-3.113-2.461-4.666-.078-.148-.076-.243.037-.375 1.381-1.615 2.756-3.236 4.133-4.855.272-.32.513-.658.653-1.058.308-.878-.09-1.57-1-1.741a2.783 2.783 0 00-1.235.069c-1.974.521-3.947 1.041-5.918 1.57-.175.047-.26.015-.355-.144a353.08 353.08 0 00-2.421-4.018 4.61 4.61 0 00-.652-.849c-.371-.37-.802-.549-1.227-.536zm.172 3.703a.592.592 0 01.189.211c.87 1.446 1.742 2.89 2.609 4.338.07.118.135.16.277.121 1.525-.41 3.052-.813 4.579-1.217.367-.098.735-.193 1.103-.289a.399.399 0 01-.1.2c-1.259 1.48-2.516 2.962-3.779 4.438-.11.13-.12.22-.04.37.937 1.803 1.768 3.309 2.498 4.76l-3.696-1.019c-.538-.18-1.077-.358-1.615-.539-.163-.055-.25-.03-.36.1-1.248 1.488-2.504 2.97-3.759 4.454a.398.398 0 01-.18.132c.035-.378.068-.757.104-1.136.149-1.572.297-3.144.451-4.716-.03-.318.117-.405-.322-.545-1.493-.593-3.346-1.321-4.816-1.905a.595.595 0 01.24-.134c1.797-.57 3.595-1.14 5.394-1.705.127-.04.199-.092.211-.233.013-.148.05-.294.076-.441.241-1.363.483-2.726.726-4.088.068-.386.14-.771.21-1.157z"/>
        </svg>
        <span class="brand-logo-text">PySpark Wiki</span>
      </div>

      <!-- Center Search Pill -->
      <div id="walkthrough-top-right" class="dash-search-pill" @click="openSearch">
        <svg class="search-svg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span class="search-placeholder">Search 260+ questions, concepts, code...</span>
        <span class="search-kbd">Ctrl K</span>
      </div>

      <!-- Right: GitHub + LinkedIn -->
      <div class="dash-header-actions">
        <a href="https://github.com/Balasubramanian-pg/PySpark-Interview-Prep" target="_blank" rel="noopener" class="header-icon-btn" title="GitHub Repository">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
        <a href="https://linkedin.com/in/balasubramanian-pg" target="_blank" rel="noopener" class="header-icon-btn" title="LinkedIn Profile">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
          </svg>
        </a>
      </div>
    </header>

    <!-- 2-Column Layout: Left sidebar + Main content -->
    <div class="dash-grid-layout">
      <!-- LEFT COLUMN: Favs & Saved Bookmarks -->
      <aside class="dash-col-left">
        <div class="sidebar-block">
          <div class="sidebar-section-title">Favs</div>
          <ul class="fav-list">
            <li class="fav-item" @click="navigateTo('/1. Fundamentals/1.1 Spark Architecture Basics/Readme')">
              <svg viewBox="0 0 24 24" class="fav-icon-svg" fill="currentColor">
                <path d="M10.812 0c-.425.013-.845.215-1.196.605a3.593 3.593 0 00-.493.722c-.355.667-.425 1.415-.556 2.143a551.9 551.9 0 00-.726 4.087c-.027.16-.096.227-.244.273C5.83 8.386 4.06 8.94 2.3 9.514c-.387.125-.773.289-1.114.506-1.042.665-1.196 1.753-.415 2.71.346.422.79.715 1.284.936 1.1.49 2.202.976 3.3 1.47.019.01.036.013.053.019h-.004l1.306.535c0 .023.002.045 0 .073-.2 2.03-.39 4.063-.58 6.095-.04.419-.012.831.134 1.23.317.87 1.065 1.148 1.881.701.372-.204.666-.497.937-.818 1.372-1.623 2.746-3.244 4.113-4.872.111-.133.205-.15.363-.098.349.117.697.231 1.045.347h.001c.02.012.045.02.073.03l.142.042c1.248.416 2.68.775 3.929 1.19.4.132.622.164 1.045.098.311-.048.592-.062.828-.236.602-.33.995-.957.988-1.682-.005-.427-.154-.813-.35-1.186-.82-1.556-1.637-3.113-2.461-4.666-.078-.148-.076-.243.037-.375 1.381-1.615 2.756-3.236 4.133-4.855.272-.32.513-.658.653-1.058.308-.878-.09-1.57-1-1.741a2.783 2.783 0 00-1.235.069c-1.974.521-3.947 1.041-5.918 1.57-.175.047-.26.015-.355-.144a353.08 353.08 0 00-2.421-4.018 4.61 4.61 0 00-.652-.849c-.371-.37-.802-.549-1.227-.536z"/>
              </svg>
              <span class="fav-text">Spark Architecture</span>
            </li>
            <li class="fav-item" @click="navigateTo('/3. Advanced/3.6 Spark SQL Engine/Readme')">
              <svg viewBox="0 0 24 24" class="fav-icon-svg" fill="currentColor">
                <path d="M.95 14.184L12 20.403l9.919-5.55v2.21L12 22.662l-11.05-6.23zm0-4.398L12 16.005l9.919-5.55v2.21L12 18.264l-11.05-6.23zm0-4.398L12 11.608l9.919-5.55v2.21L12 13.866l-11.05-6.23zm11.05-5.388l11.05 6.23-2.21 1.24-8.84-4.96-8.84 4.96-2.21-1.24z"/>
              </svg>
              <span class="fav-text">Catalyst Optimizer</span>
            </li>
            <li class="fav-item" @click="navigateTo('/3. Advanced/3.3 Join Strategies/Readme')">
              <svg viewBox="0 0 24 24" class="fav-icon-svg" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
              </svg>
              <span class="fav-text">Join Strategies</span>
            </li>
            <li class="fav-item" @click="navigateTo('/4. Senior Dev/4.1 Memory Management And OOM Errors/Readme')">
              <svg viewBox="0 0 24 24" class="fav-icon-svg" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
              </svg>
              <span class="fav-text">Memory & OOMs</span>
            </li>
            <li class="fav-item" @click="navigateTo('/4. Senior Dev/4.3 Structured Streaming/Readme')">
              <svg viewBox="0 0 24 24" class="fav-icon-svg" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
              </svg>
              <span class="fav-text">Streaming & Watermarks</span>
            </li>
            <li class="fav-item" @click="navigateTo('/4. Senior Dev/4.4 Delta Lake And Lakehouse Architecture/Readme')">
              <svg viewBox="0 0 24 24" class="fav-icon-svg" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>
              </svg>
              <span class="fav-text">Delta Lake & ACID</span>
            </li>
          </ul>
        </div>

        <!-- Saved Questions Section -->
        <div class="sidebar-block">
          <div class="sidebar-section-title">Saved Questions</div>
          <div v-if="favoriteQuestions.length === 0" class="empty-favs">
            <svg class="empty-bookmark-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"></path>
            </svg>
            <p class="empty-text">No bookmarked questions yet. Click the bookmark in any lesson to pin it here.</p>
          </div>
          <div v-else class="saved-cards-list">
            <div
              v-for="(fav, idx) in favoriteQuestions"
              :key="fav.path"
              class="saved-mini-card"
              :class="{ 'card-dark': idx % 2 === 0, 'card-orange': idx % 2 === 1 }"
              @click="navigateTo(fav.path)"
            >
              <div class="saved-card-tag">{{ fav.subtopic }}</div>
              <div class="saved-card-title">{{ fav.title }}</div>
            </div>
          </div>
        </div>

        <!-- Quick Resume Button -->
        <div id="walkthrough-continue-btn" class="quick-resume-card">
          <div class="resume-label">RESUME ACTIVE TOPIC</div>
          <div class="resume-title">{{ nextUncompletedLesson?.title }}</div>
          <button class="resume-action-btn" @click="navigateTo(nextUncompletedLesson?.path || '/')">
            Continue Reading
          </button>
        </div>
      </aside>

      <!-- MAIN COLUMN: Feed + Bento + Modules + Carousel -->
      <main class="dash-col-center">
        <!-- Feed Header & Filter Tabs -->
        <div class="feed-header">
          <h2 class="feed-title">Curriculum Feed</h2>
          <div class="feed-filter-chips">
            <button
              class="filter-pill"
              :class="{ active: activeFilter === 'all' }"
              @click="setFilter('all')"
            >All (265)</button>
            <button
              class="filter-pill"
              :class="{ active: activeFilter === '1. Fundamentals' }"
              @click="setFilter('1. Fundamentals')"
            >Fundamentals (70)</button>
            <button
              class="filter-pill"
              :class="{ active: activeFilter === '2. Intermediate' }"
              @click="setFilter('2. Intermediate')"
            >Intermediate (77)</button>
            <button
              class="filter-pill"
              :class="{ active: activeFilter === '3. Advanced' }"
              @click="setFilter('3. Advanced')"
            >Advanced (68)</button>
            <button
              class="filter-pill"
              :class="{ active: activeFilter === '4. Senior Dev' }"
              @click="setFilter('4. Senior Dev')"
            >Senior Dev (50)</button>
          </div>
        </div>

        <!-- FEATURED HERO CARDS shown on 'All' view -->
        <div v-if="activeFilter === 'all'" class="featured-cards-grid">
          <div class="feat-card feat-dark" @click="navigateTo('/1. Fundamentals/1.3 Lazy Evaluation And Lineage/1.3.6 How does Lineage help with fault tolerance')">
            <div class="feat-meta">
              <span class="feat-time">TODAY · 8 MIN READ</span>
              <span class="feat-badge-dark">Architecture</span>
            </div>
            <h3 class="feat-title">RDD Lineage & Fault Tolerance</h3>
            <p class="feat-desc">
              How Apache Spark reconstructs lost partitions using deterministic Directed Acyclic Graphs (DAG) without memory replication overhead.
            </p>
            <div class="feat-footer">
              <span class="read-link">Read deep dive</span>
              <button class="feat-pill-btn">Study Concept</button>
            </div>
          </div>

          <div class="feat-card feat-white" @click="navigateTo('/3. Advanced/3.3 Join Strategies/3.3.1 What are the different join strategies in PySpark')">
            <div class="feat-meta">
              <span class="feat-time" style="color: #64748B;">OPTIMIZATION · 12 MIN</span>
              <span class="feat-badge-orange">Join Mechanics</span>
            </div>
            <h3 class="feat-title" style="color: #0F172A;">What kind of Join Strategy?</h3>
            <p class="feat-desc" style="color: #475569;">
              SortMergeJoin vs BroadcastHashJoin vs ShuffleHashJoin. How Adaptive Query Execution (AQE) dynamically resolves joins at runtime.
            </p>
            <div class="feat-footer">
              <span class="read-link" style="color: #FF6B35;">Read more</span>
              <button class="feat-pill-orange">Explore Joins</button>
            </div>
          </div>

          <div class="feat-card feat-wide-blue" @click="navigateTo('/4. Senior Dev/4.1 Memory Management And OOM Errors/4.1.1 Describe the Spark Executor Memory architecture.')">
            <div class="feat-meta">
              <span class="feat-time" style="color: #475569;">STAFF LEVEL · 15 MIN</span>
              <span class="feat-badge-blue">Memory Management</span>
            </div>
            <h3 class="feat-title" style="color: #1E293B;">Unified Memory Manager & Zero OOMs</h3>
            <p class="feat-desc" style="color: #334155;">
              Storage vs Execution memory borrowing boundaries, off-heap buffers, and GC tuning for production clusters.
            </p>
            <div class="feat-footer">
              <span class="read-link" style="color: #2563EB;">Read architecture</span>
              <button class="feat-pill-dark">Master Sizing</button>
            </div>
          </div>
        </div>

        <!-- ACTIVE CURRICULUM QUESTIONS STREAM -->
        <div class="questions-stream-section">
          <!-- Feed Sub-Header -->
          <div class="feed-controls-bar">
            <div class="feed-sub-info">
              <span class="active-category-title">
                {{ activeFilter === 'all' ? 'All PySpark Questions & Notes' : activeFilter }}
              </span>
              <span class="active-count-badge">
                {{ filteredQuestions.length }} Notes
              </span>
            </div>

            <!-- In-feed keyword filter -->
            <div class="feed-search-box">
              <svg class="search-mini-svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input
                v-model="feedSearchQuery"
                type="text"
                placeholder="Filter active questions..."
                class="feed-search-input"
                @input="currentPage = 1"
              />
              <button v-if="feedSearchQuery" class="clear-search-btn" @click="feedSearchQuery = ''; currentPage = 1">✕</button>
            </div>
          </div>

          <!-- Dynamic Subtopic Filters -->
          <div v-if="availableSubtopics.length > 1" class="subtopic-chips-row">
            <button
              class="subtopic-pill"
              :class="{ active: selectedSubtopic === 'all' }"
              @click="setSubtopic('all')"
            >All Topics</button>
            <button
              v-for="sub in availableSubtopics"
              :key="sub.name"
              class="subtopic-pill"
              :class="{ active: selectedSubtopic === sub.name }"
              @click="setSubtopic(sub.name)"
            >{{ sub.name }} ({{ sub.count }})</button>
          </div>

          <!-- Empty Results State -->
          <div v-if="filteredQuestions.length === 0" class="empty-feed-state">
            <svg class="empty-icon-svg" viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.8">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            <div class="empty-title">No interview notes match your query</div>
            <p class="empty-desc">Try clearing your search query or switching to another category.</p>
            <button class="reset-feed-btn" @click="feedSearchQuery = ''; selectedSubtopic = 'all'; activeFilter = 'all'">
              Show All Questions
            </button>
          </div>

          <!-- Question Cards Stream Grid -->
          <div v-else class="question-cards-stream">
            <div
              v-for="item in paginatedQuestions"
              :key="item.path"
              class="question-stream-card"
              @click="navigateTo(item.path)"
            >
              <div class="q-card-header">
                <div class="q-card-tags">
                  <span class="q-module-badge">{{ item.module.replace(/^\d+\.\s*/, '') }}</span>
                  <span class="q-subtopic-badge">{{ item.subtopic }}</span>
                </div>

                <div class="q-card-actions">
                  <span v-if="isLessonCompleted(item.path)" class="status-badge completed" title="Completed">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.8">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>Done</span>
                  </span>
                  <span v-else class="status-badge ready"><span>Ready</span></span>

                  <button
                    class="q-fav-toggle-btn"
                    :class="{ active: isFavorite(item.path) }"
                    :title="isFavorite(item.path) ? 'Saved in Favs' : 'Bookmark'"
                    @click="onToggleCardFavorite(item, $event)"
                  >
                    <svg v-if="isFavorite(item.path)" viewBox="0 0 24 24" width="15" height="15" fill="#FBBF24">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                  </button>
                </div>
              </div>

              <!-- Question Title — uses resolveUrl for correct href -->
              <h4 class="q-card-title">
                <a :href="resolveUrl(item.path)" class="q-card-link" @click.prevent="navigateTo(item.path)">
                  {{ item.title }}
                </a>
              </h4>

              <p class="q-card-summary">{{ item.summary }}</p>

              <div class="q-card-footer">
                <span class="q-read-more">
                  Read interview answer
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="9 18 15 12 9 6"></polyline>
                  </svg>
                </span>
                <span class="q-action-chip">Study Note</span>
              </div>
            </div>
          </div>

          <!-- Pagination Bar -->
          <div v-if="totalPages > 1" class="feed-pagination-bar">
            <button class="pagination-btn" :disabled="currentPage === 1" @click="prevPage">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
              <span>Previous</span>
            </button>
            <span class="pagination-page-indicator">Page {{ currentPage }} of {{ totalPages }} ({{ filteredQuestions.length }} questions)</span>
            <button class="pagination-btn" :disabled="currentPage === totalPages" @click="nextPage">
              <span>Next</span>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>
        </div>

        <!-- 4-WIDGET ANALYTICS BENTO SECTION -->
        <div class="bento-section-title">Learning Intelligence Bento</div>
        <div class="analytics-bento-grid">
          <!-- Widget 1: Pomodoro Focus Clock -->
          <div id="walkthrough-pomodoro" class="bento-widget pomo-widget">
            <div class="widget-header">
              <span class="widget-tag">FOCUS ENGINE</span>
              <span class="widget-status" :class="{ running: pomoRunning }">
                {{ pomoRunning ? 'Focus Active' : 'Idle' }}
              </span>
            </div>

            <div class="pomo-clock-wrap">
              <svg width="116" height="116" viewBox="0 0 116 116" class="pomo-svg">
                <circle cx="58" cy="58" r="48" class="pomo-track" />
                <circle
                  cx="58" cy="58" r="48"
                  class="pomo-progress"
                  :class="{ active: pomoRunning }"
                  :style="{ strokeDashoffset: pomoStrokeOffset }"
                />
              </svg>
              <div class="pomo-center-digits">
                <span class="digits">{{ formattedPomoTime }}</span>
                <span class="mode-label">{{ pomoMode === 'work' ? 'Deep Work' : 'Break' }}</span>
              </div>
            </div>

            <div class="pomo-actions">
              <button class="pomo-btn main" @click="togglePomo">
                {{ pomoRunning ? 'Pause' : 'Start Focus' }}
              </button>
              <button class="pomo-btn alt" @click="resetPomo(pomoMode === 'work' ? 'break' : 'work')">
                {{ pomoMode === 'work' ? '5m Break' : '25m Focus' }}
              </button>
            </div>
          </div>

          <!-- Widget 2: Weekly & Monthly Capsule Pill Bar Chart -->
          <div id="walkthrough-progress" class="bento-widget chart-widget">
            <div class="widget-header">
              <span class="widget-tag">STUDY HABIT LOAD</span>
              <div class="chart-toggle">
                <button
                  class="toggle-btn"
                  :class="{ active: selectedTimeframe === 'week' }"
                  @click="setTimeframe('week'); selectedTimeframe = 'week'"
                >Week</button>
                <button
                  class="toggle-btn"
                  :class="{ active: selectedTimeframe === 'month' }"
                  @click="setTimeframe('month'); selectedTimeframe = 'month'"
                >Month</button>
              </div>
            </div>

            <div class="capsule-chart-container">
              <div
                v-for="col in (selectedTimeframe === 'week' ? weeklyData : monthlyData)"
                :key="col.label"
                class="capsule-col"
              >
                <div class="col-day">{{ col.label }}</div>
                <div class="col-pill-track">
                  <div class="col-pill-fill" :style="{ height: col.height }"></div>
                </div>
                <div class="col-count">{{ col.count }}</div>
              </div>
            </div>

            <div class="chart-summary">
              <span>Completed {{ completedCount }} of {{ totalQuestionsCount }} questions</span>
              <span class="summary-pill">{{ readinessScore }}% Readiness</span>
            </div>
          </div>

          <!-- Widget 3: Performance Spline Wave — fixed overflow -->
          <div class="bento-widget spline-widget">
            <div class="widget-header">
              <span class="widget-tag">TRAJECTORY SPLINE</span>
              <span class="readiness-indicator">{{ readinessScore }}% Target</span>
            </div>

            <div class="spline-visual-wrap">
              <svg width="220" height="80" viewBox="0 0 220 80" class="spline-svg" style="overflow:visible">
                <defs>
                  <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#FF6B35" stop-opacity="0.4" />
                    <stop offset="100%" stop-color="#FF6B35" stop-opacity="0" />
                  </linearGradient>
                  <clipPath id="splineClip">
                    <rect x="0" y="0" width="220" height="80" />
                  </clipPath>
                </defs>
                <g clip-path="url(#splineClip)">
                  <path :d="waveData.area" fill="url(#waveGrad)" />
                  <path :d="waveData.curve" fill="none" stroke="#FF6B35" stroke-width="2.5" stroke-linecap="round" />
                </g>
                <!-- Score dot & label rendered outside clip so it's always visible -->
                <circle :cx="waveData.peakX" :cy="waveData.peakY" r="5" fill="#FFFFFF" stroke="#FF6B35" stroke-width="2.5" />
                <rect
                  :x="Math.min(Math.max(waveData.peakX - 18, 0), 176)"
                  :y="Math.max(waveData.peakY - 24, 0)"
                  width="44" height="18" rx="9"
                  fill="#FF6B35"
                />
                <text
                  :x="Math.min(Math.max(waveData.peakX, 22), 198)"
                  :y="Math.max(waveData.peakY - 11, 13)"
                  text-anchor="middle"
                  font-size="10" font-weight="700" fill="white"
                >{{ readinessScore }}%</text>
              </svg>
            </div>

            <div class="spline-caption">
              Staff & Senior Big Data readiness trajectory dynamically re-evaluates as you mark interview questions completed.
            </div>
          </div>
        </div>

        <!-- CURRICULUM MODULES SECTION -->
        <div id="walkthrough-courses" class="curriculum-section">
          <div class="curriculum-header">
            <h3 class="section-title">Core Curriculum Modules</h3>
            <span class="section-sub">4 Master Modules · 260+ Questions</span>
          </div>

          <div class="modules-grid">
            <div
              v-for="mod in modulesList"
              :key="mod.id"
              class="module-card"
              @click="navigateTo(mod.link)"
            >
              <div class="module-card-top">
                <span class="module-tag">{{ mod.tag }}</span>
                <span class="module-percent">{{ getModuleProgress(mod.id) }}%</span>
              </div>
              <h4 class="module-card-title">{{ mod.name }}</h4>
              <p class="module-card-desc">{{ mod.desc }}</p>

              <div class="module-progress-bar">
                <div class="progress-fill" :style="{ width: `${getModuleProgress(mod.id)}%` }"></div>
              </div>

              <div class="module-card-footer">
                <span>{{ getModuleCompletedCount(mod.id) }} / {{ mod.total }} Completed</span>
                <span class="card-arrow">Start</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════════════
             RANDOM DAILY TOPIC — ADHD-Friendly Study Carousel
             Changes every day, links to real markdown files
             ═══════════════════════════════════════════════════════ -->
        <div class="daily-topic-section">
          <div class="daily-topic-header">
            <div class="daily-topic-left">
              <div class="daily-topic-eyebrow">
                <span class="daily-dot"></span>
                DAILY FOCUS · {{ new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) }}
              </div>
              <h3 class="daily-topic-title">Random Topic to Study</h3>
              <p class="daily-topic-sub">Fresh topics every day — click any card to dive into the full notes</p>
            </div>
            <div class="carousel-controls">
              <button
                class="carousel-arrow-btn"
                :disabled="!carouselCanPrev"
                @click="scrollCarousel('prev')"
                aria-label="Previous topics"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="15 18 9 12 15 6"></polyline>
                </svg>
              </button>
              <button
                class="carousel-arrow-btn"
                :disabled="!carouselCanNext"
                @click="scrollCarousel('next')"
                aria-label="Next topics"
              >
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
                  <polyline points="9 18 15 12 9 6"></polyline>
                </svg>
              </button>
            </div>
          </div>

          <!-- Horizontal scroll carousel -->
          <div
            ref="carouselEl"
            class="daily-carousel-track"
            @scroll="updateCarouselArrows"
          >
            <div
              v-for="(topic, idx) in dailyTopics"
              :key="topic.subtopic"
              class="daily-topic-card"
              :class="{ 'topic-card-featured': idx === 0 }"
              @click="navigateTo(topic.path)"
            >
              <div class="topic-card-top">
                <span
                  class="topic-module-chip"
                  :style="{ background: (moduleTagColors[topic.module] || '#FF6B35') + '22', color: moduleTagColors[topic.module] || '#FF6B35' }"
                >{{ topic.module.replace(/^\d+\.\s*/, '') }}</span>
                <span class="topic-card-count">{{ topic.count }} questions</span>
              </div>

              <div class="topic-card-body">
                <h4 class="topic-card-name">{{ topic.subtopic }}</h4>
                <p v-if="topic.firstQ" class="topic-card-preview">{{ topic.firstQ.title }}</p>
              </div>

              <div class="topic-card-footer">
                <span class="topic-read-btn">
                  Open Notes
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7"/>
                  </svg>
                </span>
                <div class="topic-pill-indicator" :class="{ 'pill-featured': idx === 0 }"></div>
              </div>
            </div>
          </div>
        </div>

      </main>
    </div>

    <!-- Modals & Overlays -->
    <WalkthroughGuide ref="walkthroughRef" />
    <SearchModal ref="searchModalRef" />
    <QuizModal v-if="showQuizModal" @close="showQuizModal = false" />
  </div>
</template>

<style scoped>
.dash-viewport {
  min-height: 100vh;
  background: var(--canvas-bg);
  color: #FFFFFF;
  padding: 24px 32px 64px 32px;
}

/* ── Header ─────────────────────────────────────────────────────── */
.dash-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: #12131A;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 12px 24px;
  margin-bottom: 24px;
}

.brand-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex-shrink: 0;
}

.brand-logo-text {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.02em;
  color: #FFFFFF;
}

.dash-search-pill {
  flex: 1;
  max-width: 620px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 18px;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s;
}

.dash-search-pill:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 107, 53, 0.4);
}

.search-svg-icon { color: #9CA3AF; flex-shrink: 0; }

.search-placeholder {
  flex: 1;
  font-size: 13.5px;
  color: #9CA3AF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-kbd {
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 7px;
  border-radius: 6px;
  color: #D1D5DB;
}

.dash-header-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #9CA3AF;
  text-decoration: none;
  transition: all 0.2s;
}

.header-icon-btn:hover {
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.15);
  border-color: rgba(255, 107, 53, 0.4);
}

/* ── 2-Column Grid ─────────────────────────────────────────────── */
.dash-grid-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 24px;
}

/* ── Left Column ────────────────────────────────────────────────── */
.dash-col-left {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.sidebar-block {
  background: #12131A;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 20px;
  padding: 18px;
}

.sidebar-section-title {
  font-size: 13px;
  font-weight: 700;
  color: #9CA3AF;
  margin-bottom: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.fav-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.fav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  font-size: 13px;
  color: #D1D5DB;
}

.fav-item:hover {
  background: rgba(255, 107, 53, 0.12);
  color: #FF6B35;
}

.fav-icon-svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: #FF6B35;
}

.empty-favs { padding: 14px 6px; text-align: center; }
.empty-bookmark-svg { color: #6E7387; margin-bottom: 6px; }
.empty-text { font-size: 11.5px; color: #6E7387; margin: 6px 0 0 0; line-height: 1.4; }

.saved-cards-list { display: flex; flex-direction: column; gap: 10px; }

.saved-mini-card {
  padding: 12px;
  border-radius: 14px;
  cursor: pointer;
  transition: transform 0.2s;
}
.saved-mini-card:hover { transform: translateY(-2px); }
.saved-mini-card.card-dark { background: #1E293B; border: 1px solid rgba(255,255,255,0.08); }
.saved-mini-card.card-orange { background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%); }
.saved-card-tag { font-size: 10px; font-weight: 700; opacity: 0.8; margin-bottom: 4px; }
.saved-card-title { font-size: 12.5px; font-weight: 600; line-height: 1.35; }

.quick-resume-card {
  background: linear-gradient(135deg, rgba(255,107,53,0.15) 0%, rgba(144,107,255,0.15) 100%);
  border: 1px solid rgba(255,107,53,0.3);
  border-radius: 20px;
  padding: 18px;
}
.resume-label { font-size: 10.5px; font-weight: 700; color: #FF6B35; letter-spacing: 0.05em; margin-bottom: 6px; }
.resume-title { font-size: 13.5px; font-weight: 600; color: #FFFFFF; margin-bottom: 12px; line-height: 1.4; }
.resume-action-btn {
  width: 100%;
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  border: none;
  color: #FFFFFF;
  font-size: 12.5px;
  font-weight: 600;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.resume-action-btn:hover { box-shadow: 0 4px 14px rgba(255,107,53,0.4); }

/* ── Center Column ──────────────────────────────────────────────── */
.dash-col-center {
  display: flex;
  flex-direction: column;
  gap: 24px;
  min-width: 0;
}

.feed-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.feed-title { font-size: 20px; font-weight: 700; margin: 0; }

.feed-filter-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-pill {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #9CA3AF;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.filter-pill:hover,
.filter-pill.active {
  background: rgba(255, 107, 53, 0.18);
  border-color: rgba(255, 107, 53, 0.45);
  color: #FF6B35;
}

/* ── Featured Hero Cards ─────────────────────────────────────────── */
.featured-cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}

.feat-card {
  border-radius: 22px;
  padding: 24px;
  cursor: pointer;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.25s;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 200px;
}

.feat-card:hover { transform: translateY(-3px); }

.feat-dark {
  background: #15161E;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 10px 30px rgba(0,0,0,0.4);
}
.feat-white {
  background: #FFFFFF;
  border: 1px solid rgba(0,0,0,0.06);
  box-shadow: 0 10px 30px rgba(0,0,0,0.06);
}
.feat-wide-blue {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, #E0E7FF 0%, #EDE9FE 100%);
  border: 1px solid rgba(99,102,241,0.15);
  box-shadow: 0 10px 30px rgba(0,0,0,0.05);
}

.feat-meta { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.feat-time { font-size: 11px; font-weight: 700; opacity: 0.7; }
.feat-badge-dark { font-size: 11px; font-weight: 700; color: #A78BFA; background: rgba(167,139,250,0.15); padding: 3px 8px; border-radius: 6px; }
.feat-badge-orange { font-size: 11px; font-weight: 700; color: #EA580C; background: rgba(234,88,12,0.12); padding: 3px 8px; border-radius: 6px; }
.feat-badge-blue { font-size: 11px; font-weight: 700; color: #2563EB; background: rgba(37,99,235,0.12); padding: 3px 8px; border-radius: 6px; }
.feat-title { font-size: 18px; font-weight: 700; margin: 0 0 10px 0; line-height: 1.35; }
.feat-desc { font-size: 13.5px; line-height: 1.5; margin: 0 0 20px 0; opacity: 0.85; flex: 1; }
.feat-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 12px; }
.read-link { font-size: 13px; font-weight: 600; color: #9CA3AF; }
.feat-pill-btn { background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2); color: #FFFFFF; font-size: 12.5px; font-weight: 600; padding: 7px 16px; border-radius: 9999px; cursor: pointer; }
.feat-pill-orange { background: #FF6B35; border: none; color: #FFFFFF; font-size: 12.5px; font-weight: 600; padding: 7px 16px; border-radius: 9999px; cursor: pointer; box-shadow: 0 4px 12px rgba(255,107,53,0.35); }
.feat-pill-dark { background: #0F172A; border: none; color: #FFFFFF; font-size: 12.5px; font-weight: 600; padding: 7px 16px; border-radius: 9999px; cursor: pointer; }

/* ── Analytics Bento ─────────────────────────────────────────────── */
.bento-section-title { font-size: 15px; font-weight: 700; color: #FFFFFF; letter-spacing: -0.01em; }

.analytics-bento-grid {
  display: grid;
  grid-template-columns: 200px 1fr 220px;
  gap: 18px;
  align-items: start;
}

.bento-widget {
  background: #12131A;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden; /* prevent any child from leaking */
}

.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.widget-tag { font-size: 10.5px; font-weight: 700; color: #FF6B35; letter-spacing: 0.05em; }

.widget-status { font-size: 11px; color: #6E7387; padding: 2px 8px; border-radius: 6px; background: rgba(255,255,255,0.05); }
.widget-status.running { color: #34D399; background: rgba(52,211,153,0.15); }

.pomo-clock-wrap {
  position: relative;
  width: 116px;
  height: 116px;
  margin: 0 auto 14px auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pomo-svg { transform: rotate(-90deg); }
.pomo-track { fill: none; stroke: rgba(255,255,255,0.08); stroke-width: 6; }
.pomo-progress { fill: none; stroke: #FF6B35; stroke-width: 6; stroke-linecap: round; stroke-dasharray: 301.59; transition: stroke-dashoffset 0.5s ease; }
.pomo-progress.active { stroke: #FF6B35; filter: drop-shadow(0 0 6px rgba(255,107,53,0.5)); }

.pomo-center-digits { position: absolute; display: flex; flex-direction: column; align-items: center; }
.digits { font-size: 20px; font-weight: 700; font-family: var(--vp-font-family-mono); }
.mode-label { font-size: 10px; color: #9CA3AF; text-transform: uppercase; }

.pomo-actions { display: flex; gap: 8px; }
.pomo-btn { flex: 1; padding: 7px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
.pomo-btn.main { background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%); border: none; color: #FFFFFF; }
.pomo-btn.alt { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: #D1D5DB; }

/* Chart widget */
.chart-toggle { display: flex; background: rgba(255,255,255,0.05); border-radius: 8px; padding: 2px; }
.toggle-btn { background: transparent; border: none; color: #9CA3AF; font-size: 11px; padding: 3px 8px; border-radius: 6px; cursor: pointer; }
.toggle-btn.active { background: #FF6B35; color: #FFFFFF; font-weight: 600; }

.capsule-chart-container {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 6px;
  height: 90px;
  margin-bottom: 12px;
  padding: 0 2px;
}

.capsule-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 5px; }
.col-day { font-size: 10px; color: #6E7387; font-weight: 600; }
.col-pill-track { width: 12px; height: 56px; background: #191B24; border-radius: 9999px; position: relative; overflow: hidden; border: 1px solid rgba(255,255,255,0.05); }
.col-pill-fill { position: absolute; bottom: 0; left: 0; right: 0; background: linear-gradient(180deg, #FF6B35 0%, #EA580C 100%); border-radius: 9999px; transition: height 0.6s cubic-bezier(0.16,1,0.3,1); }
.col-count { font-size: 10px; color: #9CA3AF; }

.chart-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #9CA3AF;
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: 10px;
}
.summary-pill { color: #FF6B35; font-weight: 700; }

/* Spline widget — fully contained */
.spline-widget { min-height: auto; }

.spline-visual-wrap {
  position: relative;
  width: 220px;
  height: 80px;
  margin: 8px 0 12px 0;
  overflow: hidden;
}

.spline-svg {
  display: block;
  width: 220px;
  height: 80px;
}

.readiness-indicator { font-size: 11px; font-weight: 700; color: #FF6B35; }

.spline-caption { font-size: 11px; color: #9CA3AF; line-height: 1.4; margin-top: 6px; }

/* ── Curriculum Modules ──────────────────────────────────────────── */
.curriculum-section { display: flex; flex-direction: column; gap: 16px; }

.curriculum-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.section-title { font-size: 18px; font-weight: 700; margin: 0; }
.section-sub { font-size: 12.5px; color: #9CA3AF; }

.modules-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.module-card {
  background: #12131A;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 18px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16,1,0.3,1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.module-card:hover {
  transform: translateY(-3px);
  border-color: rgba(255,107,53,0.4);
  background: #151620;
}

.module-card-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.module-tag { font-size: 11px; font-weight: 700; color: #FF6B35; background: rgba(255,107,53,0.12); padding: 3px 8px; border-radius: 6px; }
.module-percent { font-size: 12px; font-weight: 700; color: #FFFFFF; }
.module-card-title { font-size: 15.5px; font-weight: 700; color: #FFFFFF; margin: 0 0 6px 0; }
.module-card-desc { font-size: 12.5px; color: #9CA3AF; line-height: 1.45; margin: 0 0 16px 0; }

.module-progress-bar { height: 6px; background: #191B24; border-radius: 9999px; overflow: hidden; margin-bottom: 12px; }
.progress-fill { height: 100%; background: linear-gradient(90deg, #FF6B35 0%, #EA580C 100%); border-radius: 9999px; transition: width 0.6s ease; }

.module-card-footer { display: flex; align-items: center; justify-content: space-between; font-size: 11.5px; color: #6E7387; }
.card-arrow { color: #FF6B35; font-weight: 600; }

/* ═══════════════════════════════════════════════════════════════════
   DAILY RANDOM TOPIC CAROUSEL
   ═══════════════════════════════════════════════════════════════════ */
.daily-topic-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.daily-topic-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.daily-topic-left {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.daily-topic-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #FF6B35;
  letter-spacing: 0.06em;
}

.daily-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #FF6B35;
  box-shadow: 0 0 8px rgba(255, 107, 53, 0.7);
  animation: blink 2s ease-in-out infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.daily-topic-title {
  font-size: 20px;
  font-weight: 700;
  margin: 0;
  color: #FFFFFF;
}

.daily-topic-sub {
  font-size: 13px;
  color: #9CA3AF;
  margin: 0;
}

.carousel-controls {
  display: flex;
  gap: 10px;
  align-items: center;
}

.carousel-arrow-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #9CA3AF;
  cursor: pointer;
  transition: all 0.2s;
}

.carousel-arrow-btn:hover:not(:disabled) {
  background: rgba(255, 107, 53, 0.18);
  border-color: rgba(255, 107, 53, 0.45);
  color: #FF6B35;
}

.carousel-arrow-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* Horizontal scroll track — no scrollbar */
.daily-carousel-track {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  scroll-behavior: smooth;
  padding-bottom: 8px;
  scrollbar-width: none;
}

.daily-carousel-track::-webkit-scrollbar {
  display: none;
}

/* Topic Cards */
.daily-topic-card {
  flex: 0 0 280px;
  background: #12131A;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 160px;
}

.daily-topic-card:hover {
  transform: translateY(-4px);
  border-color: rgba(255, 107, 53, 0.4);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  background: #151620;
}

/* First card gets an accent gradient border */
.daily-topic-card.topic-card-featured {
  background: linear-gradient(145deg, #1A1B25, #141520);
  border-color: rgba(255, 107, 53, 0.35);
  box-shadow: 0 0 0 1px rgba(255, 107, 53, 0.15), 0 8px 24px rgba(0, 0, 0, 0.4);
}

.topic-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.topic-module-chip {
  font-size: 10.5px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 9999px;
  letter-spacing: 0.04em;
}

.topic-card-count {
  font-size: 11px;
  color: #6E7387;
  font-weight: 500;
}

.topic-card-body {
  flex: 1;
  margin-bottom: 14px;
}

.topic-card-name {
  font-size: 15px;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0 0 8px 0;
  line-height: 1.3;
}

.topic-card-preview {
  font-size: 12px;
  color: #6E7387;
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.topic-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.topic-read-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #FF6B35;
  transition: gap 0.2s;
}

.daily-topic-card:hover .topic-read-btn {
  gap: 10px;
}

.topic-pill-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
}

.topic-pill-indicator.pill-featured {
  background: #FF6B35;
  box-shadow: 0 0 6px rgba(255, 107, 53, 0.6);
}

/* ── Questions Stream ─────────────────────────────────────────────── */
.questions-stream-section { display: flex; flex-direction: column; gap: 16px; margin-top: 4px; }

.feed-controls-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}

.feed-sub-info { display: flex; align-items: center; gap: 10px; }
.active-category-title { font-size: 16px; font-weight: 700; color: #FFFFFF; }
.active-count-badge { background: rgba(255,107,53,0.15); color: #FF6B35; border: 1px solid rgba(255,107,53,0.3); font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 9999px; }

.feed-search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  background: #15161E;
  border: 1px solid rgba(255,255,255,0.1);
  padding: 6px 14px;
  border-radius: 9999px;
  min-width: 260px;
  transition: all 0.2s ease;
}

.feed-search-box:focus-within { border-color: #FF6B35; box-shadow: 0 0 0 2px rgba(255,107,53,0.2); }
.search-mini-svg { color: #9CA3AF; flex-shrink: 0; }
.feed-search-input { background: transparent; border: none; outline: none; color: #FFFFFF; font-size: 13px; width: 100%; }
.feed-search-input::placeholder { color: #6E7387; }
.clear-search-btn { background: none; border: none; color: #9CA3AF; cursor: pointer; font-size: 12px; padding: 0 4px; }
.clear-search-btn:hover { color: #FFFFFF; }

.subtopic-chips-row {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: thin;
}

.subtopic-pill {
  background: #15161E;
  border: 1px solid rgba(255,255,255,0.08);
  color: #9CA3AF;
  font-size: 12px;
  font-weight: 500;
  padding: 6px 12px;
  border-radius: 9999px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.18s ease;
}

.subtopic-pill:hover { border-color: rgba(255,255,255,0.2); color: #FFFFFF; }
.subtopic-pill.active { background: #FF6B35; border-color: #FF6B35; color: #FFFFFF; font-weight: 600; }

.question-cards-stream { display: grid; grid-template-columns: 1fr; gap: 14px; }

.question-stream-card {
  background: #15161E;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 18px;
  padding: 18px 20px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: all 0.22s cubic-bezier(0.16,1,0.3,1);
  position: relative;
}

.question-stream-card:hover {
  border-color: rgba(255,107,53,0.4);
  transform: translateY(-2px);
  box-shadow: 0 10px 28px rgba(0,0,0,0.4);
}

.q-card-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.q-card-tags { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.q-module-badge { background: rgba(255,107,53,0.12); color: #FF6B35; font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 6px; text-transform: uppercase; letter-spacing: 0.04em; }
.q-subtopic-badge { background: rgba(255,255,255,0.06); color: #9CA3AF; font-size: 11px; font-weight: 500; padding: 2px 8px; border-radius: 6px; }
.q-card-actions { display: flex; align-items: center; gap: 8px; }

.status-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 3px 8px; border-radius: 9999px; }
.status-badge.completed { background: rgba(52,211,153,0.15); color: #34D399; border: 1px solid rgba(52,211,153,0.3); }
.status-badge.ready { background: rgba(255,255,255,0.05); color: #9CA3AF; }

.q-fav-toggle-btn { background: none; border: none; color: #6E7387; cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center; border-radius: 6px; transition: all 0.15s ease; }
.q-fav-toggle-btn:hover { color: #FBBF24; background: rgba(251,191,36,0.1); }
.q-fav-toggle-btn.active { color: #FBBF24; }

.q-card-title { margin: 0; font-size: 15px; font-weight: 700; line-height: 1.4; color: #FFFFFF; }
.q-card-link { color: #FFFFFF; text-decoration: none; transition: color 0.15s ease; }
.q-card-link:hover { color: #FF6B35; }
.q-card-summary { margin: 0; font-size: 13px; color: #9CA3AF; line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

.q-card-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 4px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.04); }
.q-read-more { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 600; color: #FF6B35; }
.q-action-chip { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); color: #FFFFFF; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 9999px; transition: all 0.15s ease; }
.question-stream-card:hover .q-action-chip { background: #FF6B35; border-color: #FF6B35; }

/* Pagination */
.feed-pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px;
  background: #15161E;
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 16px;
  margin-top: 6px;
}

.pagination-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: #FFFFFF;
  font-size: 12.5px;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.18s ease;
}

.pagination-btn:hover:not(:disabled) { background: #FF6B35; border-color: #FF6B35; }
.pagination-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.pagination-page-indicator { font-size: 12.5px; color: #9CA3AF; font-weight: 500; }

/* Empty state */
.empty-feed-state { text-align: center; padding: 48px 24px; background: #15161E; border: 1px dashed rgba(255,255,255,0.12); border-radius: 20px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.empty-icon-svg { color: #6E7387; }
.empty-title { font-size: 16px; font-weight: 700; color: #FFFFFF; }
.empty-desc { font-size: 13px; color: #9CA3AF; max-width: 360px; margin: 0; }
.reset-feed-btn { background: #FF6B35; border: none; color: #FFFFFF; font-size: 12.5px; font-weight: 600; padding: 7px 16px; border-radius: 9999px; cursor: pointer; margin-top: 6px; }

/* ── Responsive ─────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .dash-grid-layout {
    grid-template-columns: 1fr;
  }
  .analytics-bento-grid {
    grid-template-columns: 1fr 1fr;
  }
  .modules-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .dash-viewport { padding: 16px 16px 48px 16px; }
  .analytics-bento-grid { grid-template-columns: 1fr; }
  .featured-cards-grid { grid-template-columns: 1fr; }
  .feat-wide-blue { grid-column: 1; }
  .feed-controls-bar { flex-direction: column; align-items: flex-start; }
  .feed-search-box { min-width: 100%; }
}
</style>
