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
  getStudyStreak,
  getDueSRSReviews,
  getDiagnosticResult,
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
import DiagnosticModal from './components/ui/DiagnosticModal.vue'
import FlashcardModal from './components/ui/FlashcardModal.vue'
import SyncModal from './components/ui/SyncModal.vue'
import CircularCarousel from './components/ui/CircularCarousel.vue'
import Gallery6Modules from './components/ui/Gallery6Modules.vue'
import searchIndexData from './search-index.json'

const router = useRouter()

const walkthroughRef = ref<InstanceType<typeof WalkthroughGuide> | null>(null)
const searchModalRef = ref<InstanceType<typeof SearchModal> | null>(null)
const showQuizModal = ref(false)
const showDiagnosticModal = ref(false)
const showFlashcardModal = ref(false)
const showSyncModal = ref(false)

// State
const completedLessons = ref<string[]>([])
const favorites = ref<string[]>([])
const pomodoroStats = ref<{ completedBlocks: number }>({ completedBlocks: 0 })
const activityMap = ref<Record<string, string[]>>({})
const selectedTimeframe = ref<'week' | 'month'>('week')
const activeFilter = ref<'all' | '1. Fundamentals' | '2. Intermediate' | '3. Advanced' | '4. Senior Dev'>('all')

// Retention State
const studyStreak = ref({ currentStreak: 0, longestStreak: 0, lastStudyDate: '' })
const dueReviews = ref<any[]>([])
const diagnosticResult = ref<any>(null)

// Interactive Question Feed State
const selectedSubtopic = ref<string>('all')
const currentPage = ref(1)
const itemsPerPage = ref(6)

function setFilter(filter: 'all' | '1. Fundamentals' | '2. Intermediate' | '3. Advanced' | '4. Senior Dev') {
  activeFilter.value = filter
  selectedSubtopic.value = 'all'
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

// Company War Stories Tagging (high engagement hook)
const companyTags = ['Netflix', 'Databricks', 'Uber', 'Apple', 'Meta', 'Amazon', 'Stripe']
function getCompanyTag(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i)
  }
  return companyTags[Math.abs(hash) % companyTags.length]
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
  studyStreak.value = getStudyStreak()
  dueReviews.value = getDueSRSReviews()
  diagnosticResult.value = getDiagnosticResult()
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

// Dynamic Performance Spline Wave
const waveData = computed(() => {
  const score = readinessScore.value
  const normalizedScore = Math.max(8, score)
  const peakX = 25 + (normalizedScore / 100) * 160
  const peakY = 55 - (normalizedScore / 100) * 35
  const curve = `M 0,60 C 40,60 ${peakX - 35},${peakY} ${peakX},${peakY} S 190,48 220,52`
  const area = `${curve} L 220,70 L 0,70 Z`
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
    const maxVal = 8
    const heightPercent = count > 0 ? Math.min(100, Math.max(20, (count / maxVal) * 100)) : 12
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

// Core Modules
const modulesList = computed(() => [
  {
    id: '1. Fundamentals',
    name: 'Module 1: Fundamentals',
    tag: 'Core Architecture',
    desc: 'Spark Architecture, RDD vs DataFrame, Lazy Evaluation, Lineage, Aggregations, SparkSession',
    link: '/1. Fundamentals/1.1 Spark Architecture Basics/Readme',
    total: 70,
    completed: getModuleCompletedCount('1. Fundamentals'),
    image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: '2. Intermediate',
    name: 'Module 2: Intermediate',
    tag: 'Data Engineering Patterns',
    desc: 'Joins, Window Functions, Complex Types, Regex, UDFs, Data Quality, File Formats & Parquet',
    link: '/2. Intermediate/2.1 Joins And Join Types/Readme',
    total: 77,
    completed: getModuleCompletedCount('2. Intermediate'),
    image: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: '3. Advanced',
    name: 'Module 3: Advanced',
    tag: 'Optimization & Catalyst',
    desc: 'Partitioning, Bucketing, Shuffling, Skew Handling, Catalyst Optimizer, AQE, Broadcast Variables',
    link: '/3. Advanced/3.1 Partitioning And Bucketing/Readme',
    total: 68,
    completed: getModuleCompletedCount('3. Advanced'),
    image: 'https://images.unsplash.com/photo-1504639725590-34d0984388bd?auto=format&fit=crop&w=800&q=80'
  },
  {
    id: '4. Senior Dev',
    name: 'Module 4: Senior Dev',
    tag: 'Production & Staff Level',
    desc: 'Memory Management, OOM Debugging, Spark UI, Structured Streaming, Delta Lake, Cluster Sizing',
    link: '/4. Senior Dev/4.1 Memory Management And OOM Errors/Readme',
    total: 50,
    completed: getModuleCompletedCount('4. Senior Dev'),
    image: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=800&q=80'
  }
])

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

// ─── ADHD-Friendly 3D Orbit Carousel ──────────────────────────────────
const randomSeed = ref(Date.now())

const randomDailyTopics = computed(() => {
  const candidateTopics = [
    {
      id: 'topic-1',
      title: 'RDD Lineage & Fault Tolerance',
      description: 'How Spark reconstructs lost partitions deterministically via DAGs without storage replication.',
      tag: 'Architecture',
      url: '/1. Fundamentals/1.3 Lazy Evaluation And Lineage/1.3.6 How does Lineage help with fault tolerance'
    },
    {
      id: 'topic-2',
      title: 'Join Strategies & AQE',
      description: 'SortMergeJoin vs BroadcastHashJoin: How Adaptive Query Execution dynamically converts joins at runtime.',
      tag: 'Optimization',
      url: '/3. Advanced/3.3 Join Strategies/3.3.1 What are the different join strategies in PySpark'
    },
    {
      id: 'topic-3',
      title: 'Unified Memory Architecture',
      description: 'Storage vs Execution memory borrowing boundaries, off-heap buffers, and zero-OOM sizing.',
      tag: 'Senior Dev',
      url: '/4. Senior Dev/4.1 Memory Management And OOM Errors/4.1.1 Describe the Spark Executor Memory architecture.'
    },
    {
      id: 'topic-4',
      title: 'Handling Severe Data Skewness',
      description: 'Salted keys, broadcast joins, and isolated skew mitigation patterns for 10TB+ workloads.',
      tag: 'Advanced',
      url: '/3. Advanced/3.5 Handling Data Skewness/Readme'
    },
    {
      id: 'topic-5',
      title: 'Structured Streaming & Watermarks',
      description: 'Handling late-arriving event-time data with append and update streaming triggers.',
      tag: 'Streaming',
      url: '/4. Senior Dev/4.3 Structured Streaming/Readme'
    },
    {
      id: 'topic-6',
      title: 'Delta Lake ACID & Log Architecture',
      description: 'Parquet plus JSON transaction logs: Time travel, checkpointing, and concurrent writes.',
      tag: 'Lakehouse',
      url: '/4. Senior Dev/4.4 Delta Lake And Lakehouse Architecture/Readme'
    }
  ]

  const list = [...candidateTopics]
  const seed = randomSeed.value
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.abs(Math.sin(seed + i)) * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
})

function shuffleTopics() {
  randomSeed.value = Date.now()
}
</script>

<template>
  <div class="dash-viewport">
    <!-- Streamlined Minimal Header (Clean, High Signal) -->
    <header class="dash-top-bar">
      <div class="brand-wrap" @click="navigateTo('/')">
        <svg class="brand-spark-svg" viewBox="0 0 24 24" width="24" height="24" fill="#FF6B35">
          <path d="M10.812 0c-.425.013-.845.215-1.196.605a3.593 3.593 0 00-.493.722c-.355.667-.425 1.415-.556 2.143a551.9 551.9 0 00-.726 4.087c-.027.16-.096.227-.244.273C5.83 8.386 4.06 8.94 2.3 9.514c-.387.125-.773.289-1.114.506-1.042.665-1.196 1.753-.415 2.71.346.422.79.715 1.284.936 1.1.49 2.202.976 3.3 1.47.019.01.036.013.053.019h-.004l1.306.535c0 .023.002.045 0 .073-.2 2.03-.39 4.063-.58 6.095-.04.419-.012.831.134 1.23.317.87 1.065 1.148 1.881.701.372-.204.666-.497.937-.818 1.372-1.623 2.746-3.244 4.113-4.872.111-.133.205-.15.363-.098.349.117.697.231 1.045.347h.001c.02.012.045.02.073.03l.142.042c1.248.416 2.68.775 3.929 1.19.4.132.622.164 1.045.098.311-.048.592-.062.828-.236.602-.33.995-.957.988-1.682-.005-.427-.154-.813-.35-1.186-.82-1.556-1.637-3.113-2.461-4.666-.078-.148-.076-.243.037-.375 1.381-1.615 2.756-3.236 4.133-4.855.272-.32.513-.658.653-1.058.308-.878-.09-1.57-1-1.741a2.783 2.783 0 00-1.235.069c-1.974.521-3.947 1.041-5.918 1.57-.175.047-.26.015-.355-.144a353.08 353.08 0 00-2.421-4.018 4.61 4.61 0 00-.652-.849c-.371-.37-.802-.549-1.227-.536z"/>
        </svg>
        <span class="brand-logo-text">PySpark Wiki</span>
        
        <!-- Daily Streak Pill (Habit formation hook) -->
        <span class="streak-pill" :title="`Current Streak: ${studyStreak.currentStreak} days`">
          <span class="flame-icon">&#128293;</span>
          <span class="streak-text">{{ studyStreak.currentStreak > 0 ? `${studyStreak.currentStreak}-Day Streak` : 'Start Streak' }}</span>
        </span>
      </div>

      <!-- Single Global Search Pill (Ctrl+K) -->
      <div class="dash-search-pill" @click="openSearch">
        <svg class="search-svg-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <span class="search-placeholder">Search 260+ questions, concepts, code...</span>
        <span class="search-kbd">Ctrl K</span>
      </div>

      <!-- Retention Command Bar -->
      <div class="dash-header-actions">
        <!-- 5-Min Diagnostic Test Button -->
        <button class="retention-trigger-btn diagnostic" @click="showDiagnosticModal = true">
          <span>&#127919; 5-Min Diagnostic</span>
        </button>

        <!-- Flashcards Active Recall Button -->
        <button class="retention-trigger-btn flashcards" @click="showFlashcardModal = true">
          <span>&#9889; Flashcards</span>
        </button>

        <!-- Sync & Export Modal Button -->
        <button class="retention-trigger-btn sync" @click="showSyncModal = true">
          <span>&#9729; Sync &amp; Export</span>
        </button>

        <a
          href="https://github.com/Balasubramanian-pg/PySpark-Interview-Prep"
          target="_blank"
          rel="noopener"
          class="header-icon-btn"
          title="GitHub Repository"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
      </div>
    </header>

    <!-- Main Container -->
    <main class="dash-main-flow">
      <!-- ═════════════════════════════════════════════════════════════
           RETENTION ALERT: Ebbinghaus Spaced Repetition Due Today
           ═════════════════════════════════════════════════════════════ -->
      <div v-if="dueReviews.length > 0" class="srs-due-banner">
        <div class="srs-due-left">
          <span class="srs-due-icon">&#9200;</span>
          <div>
            <div class="srs-due-title">{{ dueReviews.length }} Topic{{ dueReviews.length > 1 ? 's' : '' }} Due for Review Today (Spaced Repetition)</div>
            <div class="srs-due-sub">Memory decay indicates these topics need recall practice before your interview.</div>
          </div>
        </div>
        <button class="srs-due-btn" @click="showFlashcardModal = true">
          Review Due Deck &rarr;
        </button>
      </div>

      <!-- ═════════════════════════════════════════════════════════════
           HERO SECTION: ADHD-Friendly 3D Circular Orbit Carousel
           ═════════════════════════════════════════════════════════════ -->
      <section class="hero-orbit-section">
        <div class="orbit-header">
          <div class="orbit-eyebrow">
            <span class="live-pulse-dot"></span>
            DAILY STUDY ENGINE &bull; RANDOM TOPIC TO STUDY
          </div>
          <h1 class="orbit-main-title">Eliminate Decision Fatigue. Pick One Topic.</h1>
          <p class="orbit-main-sub">
            Rotating 3D study orbit designed for high-focus deep work. Click the centered topic or hit shuffle to get a fresh prompt.
          </p>
          <div class="orbit-action-row">
            <button class="shuffle-btn" @click="shuffleTopics">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="16 3 21 3 21 8"></polyline>
                <line x1="4" y1="20" x2="21" y2="3"></line>
                <polyline points="21 16 21 21 16 21"></polyline>
                <line x1="15" y1="15" x2="21" y2="21"></line>
                <line x1="4" y1="4" x2="9" y2="9"></line>
              </svg>
              <span>Shuffle Topics</span>
            </button>
            <button class="commute-mode-btn" @click="showFlashcardModal = true">
              <span>&#9889; Mobile / Commute Flashcards</span>
            </button>
          </div>
        </div>

        <!-- 3D Circular Orbit Component -->
        <CircularCarousel
          :items="randomDailyTopics"
          :auto-play="true"
          :auto-play-interval="4000"
          @select="(item) => navigateTo(item.url)"
        />
      </section>

      <!-- ═════════════════════════════════════════════════════════════
           MODULES SECTION: Gallery6 Master Tracks with 16:9 Covers
           ═════════════════════════════════════════════════════════════ -->
      <Gallery6Modules
        :modules="modulesList"
        @navigate="(link) => navigateTo(link)"
      />

      <!-- ═════════════════════════════════════════════════════════════
           LEARNING INTELLIGENCE BENTO (Contained, Zero Overflow)
           ═════════════════════════════════════════════════════════════ -->
      <section class="bento-wrapper-section">
        <div class="bento-section-header">
          <div class="bento-badge">SYSTEM TELEMETRY</div>
          <h2 class="bento-heading">Study Intelligence Bento</h2>
        </div>

        <div class="analytics-bento-grid">
          <!-- Widget 1: Focus Engine Pomodoro Clock -->
          <div class="bento-widget pomo-widget">
            <div class="widget-header">
              <span class="widget-tag">FOCUS ENGINE</span>
              <span class="widget-status" :class="{ running: pomoRunning }">
                {{ pomoRunning ? 'Focus Active' : 'Idle' }}
              </span>
            </div>

            <div class="pomo-clock-wrap">
              <svg width="108" height="108" viewBox="0 0 116 116" class="pomo-svg">
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

          <!-- Widget 2: Study Habit Load Capsule Chart -->
          <div class="bento-widget chart-widget">
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
              <span>{{ completedCount }} of {{ totalQuestionsCount }} completed</span>
              <span class="summary-pill">{{ readinessScore }}% Readiness</span>
            </div>
          </div>

          <!-- Widget 3: Trajectory Spline (Zero Overflow, Fully Contained) -->
          <div class="bento-widget spline-widget">
            <div class="widget-header">
              <span class="widget-tag">READINESS TRAJECTORY</span>
              <span class="readiness-indicator">{{ readinessScore }}% Target</span>
            </div>

            <div class="spline-visual-wrap">
              <svg width="100%" height="70" viewBox="0 0 220 70" preserveAspectRatio="none" class="spline-svg">
                <defs>
                  <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#FF6B35" stop-opacity="0.35" />
                    <stop offset="100%" stop-color="#FF6B35" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <path :d="waveData.area" fill="url(#waveGrad)" />
                <path :d="waveData.curve" fill="none" stroke="#FF6B35" stroke-width="2.5" stroke-linecap="round" />
                <circle :cx="waveData.peakX" :cy="waveData.peakY" r="4.5" fill="#FFFFFF" stroke="#FF6B35" stroke-width="2.5" />
              </svg>
            </div>

            <div class="spline-caption">
              Dynamically maps big data mastery as questions are marked completed in localStorage.
            </div>
          </div>

          <!-- Widget 4: Quick Action Cards -->
          <div class="bento-widget action-cards-widget">
            <div class="widget-header">
              <span class="widget-tag">TACTICAL PLAYBOOKS</span>
            </div>

            <div class="mini-action-grid">
              <div class="mini-card add-card" @click="showQuizModal = true">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#FF6B35" stroke-width="2.5">
                  <line x1="12" y1="5" x2="12" y2="19"></line>
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                </svg>
                <span class="mini-title">Scenario Quiz</span>
              </div>

              <div class="mini-card outline-card" @click="navigateTo('/3. Advanced/3.2 Shuffling And Data Exchange/Readme')">
                <span class="mini-tag">Shuffles</span>
                <span class="mini-title">Be Patient with Shuffles</span>
              </div>

              <div class="mini-card outline-card" @click="navigateTo('/4. Senior Dev/4.1 Memory Management And OOM Errors/Readme')">
                <span class="mini-tag">Debugging</span>
                <span class="mini-title">12 Steps to Debug OOMs</span>
              </div>

              <div class="mini-card solid-orange-card" @click="navigateTo('/3. Advanced/3.5 Handling Data Skewness/Readme')">
                <span class="mini-title-bold">Zero Data Skew</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ═════════════════════════════════════════════════════════════
           CURRICULUM FEED: Progressive Disclosure + Company War Stories
           ═════════════════════════════════════════════════════════════ -->
      <section class="curriculum-feed-section">
        <div class="feed-header-wrap">
          <div>
            <div class="feed-eyebrow">QUESTION ARCHIVE</div>
            <h2 class="feed-main-title">Full Curriculum Repository</h2>
          </div>

          <!-- Working Filter Tabs -->
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

        <!-- Subtopics Row -->
        <div v-if="availableSubtopics.length > 1" class="subtopics-chip-row">
          <button
            class="subtopic-badge"
            :class="{ active: selectedSubtopic === 'all' }"
            @click="setSubtopic('all')"
          >All Subtopics</button>
          <button
            v-for="sub in availableSubtopics"
            :key="sub.name"
            class="subtopic-badge"
            :class="{ active: selectedSubtopic === sub.name }"
            @click="setSubtopic(sub.name)"
          >{{ sub.name }} ({{ sub.count }})</button>
        </div>

        <!-- Clean Cards with Company War Stories Badge -->
        <div class="feed-clean-grid">
          <div
            v-for="item in paginatedQuestions"
            :key="item.path"
            class="clean-question-card"
            @click="navigateTo(item.path)"
          >
            <div class="card-top-meta">
              <div class="meta-tag-row">
                <span class="clean-category-chip">{{ item.module.replace(/^\d+\.\s*/, '') }}</span>
                <span class="company-target-chip">Asked at {{ getCompanyTag(item.title) }}</span>
              </div>
              <button
                class="clean-fav-btn"
                :class="{ active: isFavorite(item.path) }"
                :title="isFavorite(item.path) ? 'Saved' : 'Bookmark'"
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

            <h3 class="clean-question-title">
              <a :href="resolveUrl(item.path)" class="clean-title-link" @click.prevent="navigateTo(item.path)">
                {{ item.title }}
              </a>
            </h3>

            <p class="clean-question-summary">{{ item.summary }}</p>

            <div class="clean-card-bottom">
              <span class="clean-subtopic-text">{{ item.subtopic }}</span>
              <span class="clean-read-trigger">
                Read Answer &rarr;
              </span>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div class="feed-pagination-bar">
          <button
            class="pagination-btn"
            :disabled="currentPage === 1"
            @click="prevPage"
          >
            &larr; Previous
          </button>
          <span class="pagination-page-indicator">
            Page {{ currentPage }} of {{ totalPages }} ({{ filteredQuestions.length }} questions)
          </span>
          <button
            class="pagination-btn"
            :disabled="currentPage === totalPages"
            @click="nextPage"
          >
            Next &rarr;
          </button>
        </div>
      </section>
    </main>

    <!-- Modals -->
    <WalkthroughGuide ref="walkthroughRef" />
    <SearchModal ref="searchModalRef" />
    <QuizModal v-if="showQuizModal" @close="showQuizModal = false" />
    <DiagnosticModal v-if="showDiagnosticModal" @close="showDiagnosticModal = false" />
    <FlashcardModal v-if="showFlashcardModal" @close="showFlashcardModal = false" />
    <SyncModal v-if="showSyncModal" @close="showSyncModal = false" />
  </div>
</template>

<style scoped>
.dash-viewport {
  min-height: 100vh;
  background: #0B0C12;
  color: #FFFFFF;
  padding: 24px 32px 80px 32px;
  font-family: var(--vp-font-family-base, 'Plus Jakarta Sans', system-ui, sans-serif);
}

/* ── Top Bar ───────────────────────────────────────────────────────── */
.dash-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  background: #12131C;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 12px 24px;
  margin-bottom: 32px;
}

.brand-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  flex-shrink: 0;
}

.brand-logo-text {
  font-size: 17px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #FFFFFF;
}

.streak-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.15);
  border: 1px solid rgba(255, 107, 53, 0.35);
  padding: 2px 8px;
  border-radius: 9999px;
}

.flame-icon {
  font-size: 12px;
}

.dash-search-pill {
  flex: 1;
  max-width: 480px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  padding: 8px 18px;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.dash-search-pill:hover {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 107, 53, 0.4);
}

.search-svg-icon {
  color: #8C93A8;
}

.search-placeholder {
  flex: 1;
  font-size: 13.5px;
  color: #8C93A8;
}

.search-kbd {
  font-size: 10.5px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 2px 7px;
  border-radius: 6px;
  color: #C0C5D6;
}

.dash-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.retention-trigger-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #D1D5DB;
  font-size: 11.5px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.retention-trigger-btn:hover {
  background: rgba(255, 107, 53, 0.15);
  border-color: rgba(255, 107, 53, 0.4);
  color: #FF6B35;
}

.retention-trigger-btn.diagnostic {
  border-color: rgba(16, 185, 129, 0.35);
  color: #10B981;
}

.retention-trigger-btn.diagnostic:hover {
  background: rgba(16, 185, 129, 0.15);
  border-color: #10B981;
}

.header-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: #9CA3AF;
  text-decoration: none;
  transition: all 0.2s;
}

.header-icon-btn:hover {
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.15);
  border-color: rgba(255, 107, 53, 0.4);
}

/* ── SRS Due Today Banner ──────────────────────────────────────────── */
.srs-due-banner {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.15) 0%, rgba(255, 107, 53, 0.15) 100%);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 16px;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.srs-due-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.srs-due-icon {
  font-size: 24px;
}

.srs-due-title {
  font-size: 14px;
  font-weight: 700;
  color: #F59E0B;
}

.srs-due-sub {
  font-size: 12px;
  color: #D1D5DB;
}

.srs-due-btn {
  background: #F59E0B;
  border: none;
  color: #000000;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

/* ── Main Flow Layout ──────────────────────────────────────────────── */
.dash-main-flow {
  max-width: 1200px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 56px;
}

/* ── Hero 3D Orbit Section ─────────────────────────────────────────── */
.hero-orbit-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 20px;
  padding: 24px 16px 36px 16px;
  background: radial-gradient(circle at 50% 0%, rgba(255, 107, 53, 0.08) 0%, rgba(18, 19, 28, 0) 70%);
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.orbit-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  max-width: 640px;
}

.orbit-eyebrow {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  font-weight: 700;
  color: #FF6B35;
  letter-spacing: 0.08em;
}

.live-pulse-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #FF6B35;
  box-shadow: 0 0 10px #FF6B35;
  animation: pulse 2s infinite ease-in-out;
}

@keyframes pulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.3); opacity: 0.5; }
}

.orbit-main-title {
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #FFFFFF;
  margin: 0;
  line-height: 1.25;
}

.orbit-main-sub {
  font-size: 13.5px;
  color: #8C93A8;
  line-height: 1.5;
  margin: 0;
}

.orbit-action-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.shuffle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #D1D5DB;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.shuffle-btn:hover {
  background: rgba(255, 107, 53, 0.15);
  border-color: rgba(255, 107, 53, 0.4);
  color: #FF6B35;
}

.commute-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #10B981;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
}

.commute-mode-btn:hover {
  background: rgba(16, 185, 129, 0.2);
}

/* ── Bento Section ─────────────────────────────────────────────────── */
.bento-wrapper-section {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.bento-section-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.bento-badge {
  font-size: 10.5px;
  font-weight: 700;
  color: #FF6B35;
  letter-spacing: 0.08em;
}

.bento-heading {
  font-size: 20px;
  font-weight: 800;
  color: #FFFFFF;
  margin: 0;
  letter-spacing: -0.02em;
}

.analytics-bento-grid {
  display: grid;
  grid-template-columns: 240px 1fr 240px 240px;
  gap: 18px;
}

.bento-widget {
  background: #141521;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  overflow: hidden;
}

.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.widget-tag {
  font-size: 10px;
  font-weight: 700;
  color: #FF6B35;
  letter-spacing: 0.06em;
}

.widget-status {
  font-size: 10.5px;
  color: #6E7387;
  padding: 2px 7px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
}

.widget-status.running {
  color: #10B981;
  background: rgba(16, 185, 129, 0.15);
}

.pomo-clock-wrap {
  position: relative;
  width: 108px;
  height: 108px;
  margin: 0 auto 10px auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pomo-svg {
  transform: rotate(-90deg);
}

.pomo-track {
  fill: none;
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 6;
}

.pomo-progress {
  fill: none;
  stroke: #FF6B35;
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 301.59;
  transition: stroke-dashoffset 0.5s ease;
}

.pomo-progress.active {
  stroke: #FF6B35;
  filter: drop-shadow(0 0 6px rgba(255, 107, 53, 0.5));
}

.pomo-center-digits {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.digits {
  font-size: 19px;
  font-weight: 700;
  font-family: var(--vp-font-family-mono);
}

.mode-label {
  font-size: 9.5px;
  color: #8C93A8;
  text-transform: uppercase;
}

.pomo-actions {
  display: flex;
  gap: 8px;
}

.pomo-btn {
  flex: 1;
  padding: 6px 8px;
  border-radius: 8px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.pomo-btn.main {
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  border: none;
  color: #FFFFFF;
}

.pomo-btn.alt {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #D1D5DB;
}

/* Habit Chart */
.chart-toggle {
  display: flex;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 2px;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: #8C93A8;
  font-size: 10.5px;
  padding: 2px 7px;
  border-radius: 6px;
  cursor: pointer;
}

.toggle-btn.active {
  background: #FF6B35;
  color: #FFFFFF;
  font-weight: 600;
}

.capsule-chart-container {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 6px;
  height: 80px;
  margin-bottom: 10px;
}

.capsule-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
}

.col-day {
  font-size: 10px;
  color: #6E7387;
  font-weight: 600;
}

.col-pill-track {
  width: 10px;
  height: 50px;
  background: #1C1E2B;
  border-radius: 9999px;
  position: relative;
  overflow: hidden;
}

.col-pill-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(180deg, #FF6B35 0%, #EA580C 100%);
  border-radius: 9999px;
  transition: height 0.6s ease;
}

.col-count {
  font-size: 9.5px;
  color: #8C93A8;
}

.chart-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: #8C93A8;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 8px;
}

.summary-pill {
  color: #FF6B35;
  font-weight: 700;
}

/* Spline Widget */
.spline-visual-wrap {
  width: 100%;
  height: 70px;
  overflow: hidden;
}

.spline-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.readiness-indicator {
  font-size: 11px;
  font-weight: 700;
  color: #FF6B35;
}

.spline-caption {
  font-size: 11px;
  color: #8C93A8;
  line-height: 1.4;
  margin-top: 8px;
}

/* Action Cards Mini Grid */
.mini-action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.mini-card {
  height: 70px;
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
}

.mini-card:hover {
  transform: translateY(-2px);
}

.add-card {
  background: #1A1C2C;
  border: 1px solid rgba(255, 255, 255, 0.08);
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.outline-card {
  background: #141521;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.mini-tag {
  font-size: 9px;
  font-weight: 700;
  color: #8C93A8;
  text-transform: uppercase;
}

.mini-title {
  font-size: 11px;
  font-weight: 600;
  color: #FFFFFF;
  line-height: 1.25;
}

.solid-orange-card {
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
}

.mini-title-bold {
  font-size: 12px;
  font-weight: 700;
}

/* ── Curriculum Feed ───────────────────────────────────────────────── */
.curriculum-feed-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.feed-header-wrap {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.feed-eyebrow {
  font-size: 11px;
  font-weight: 700;
  color: #FF6B35;
  letter-spacing: 0.08em;
}

.feed-main-title {
  font-size: 22px;
  font-weight: 800;
  color: #FFFFFF;
  margin: 4px 0 0 0;
  letter-spacing: -0.02em;
}

.feed-filter-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.filter-pill {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #8C93A8;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.filter-pill:hover,
.filter-pill.active {
  background: rgba(255, 107, 53, 0.18);
  border-color: rgba(255, 107, 53, 0.5);
  color: #FF6B35;
}

.subtopics-chip-row {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 6px;
  scrollbar-width: thin;
}

.subtopic-badge {
  background: #141521;
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #8C93A8;
  font-size: 11.5px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 9999px;
  white-space: nowrap;
  cursor: pointer;
  transition: all 0.18s ease;
}

.subtopic-badge:hover {
  border-color: rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
}

.subtopic-badge.active {
  background: #FF6B35;
  border-color: #FF6B35;
  color: #FFFFFF;
  font-weight: 600;
}

.feed-clean-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.clean-question-card {
  background: #141521;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 20px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 160px;
  gap: 10px;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.2s ease,
              box-shadow 0.2s ease;
}

.clean-question-card:hover {
  transform: translateY(-3px);
  border-color: rgba(255, 107, 53, 0.4);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4);
  background: #171826;
}

.card-top-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.meta-tag-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.clean-category-chip {
  font-size: 10.5px;
  font-weight: 700;
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.12);
  padding: 2px 8px;
  border-radius: 6px;
  letter-spacing: 0.04em;
}

.company-target-chip {
  font-size: 10px;
  font-weight: 600;
  color: #94A3B8;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 2px 7px;
  border-radius: 6px;
}

.clean-fav-btn {
  background: none;
  border: none;
  color: #6C7287;
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
  transition: color 0.15s;
}

.clean-fav-btn:hover {
  color: #FBBF24;
}

.clean-question-title {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.35;
  margin: 0;
  color: #FFFFFF;
}

.clean-title-link {
  color: #FFFFFF;
  text-decoration: none;
  transition: color 0.15s;
}

.clean-title-link:hover {
  color: #FF6B35;
}

.clean-question-summary {
  font-size: 12.5px;
  color: #8C93A8;
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.clean-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.clean-subtopic-text {
  font-size: 11px;
  color: #6C7287;
}

.clean-read-trigger {
  font-size: 11.5px;
  font-weight: 700;
  color: #FF6B35;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* Pagination Bar */
.feed-pagination-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px;
  background: #141521;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
}

.pagination-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 600;
  padding: 6px 14px;
  border-radius: 9999px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.pagination-btn:hover:not(:disabled) {
  background: #FF6B35;
  border-color: #FF6B35;
}

.pagination-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.pagination-page-indicator {
  font-size: 12px;
  color: #8C93A8;
}

/* ── Responsive ────────────────────────────────────────────────────── */
@media (max-width: 1100px) {
  .analytics-bento-grid {
    grid-template-columns: 1fr 1fr;
  }
  .feed-clean-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .dash-viewport {
    padding: 16px 16px 64px 16px;
  }
  .dash-top-bar {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }
  .analytics-bento-grid {
    grid-template-columns: 1fr;
  }
  .orbit-main-title {
    font-size: 21px;
  }
  .srs-due-banner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
