<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vitepress'
import {
  getCompletedLessons,
  getFavorites,
  getPomodoroStats,
  incrementPomodoroBlocks,
  getActivityMap,
  getTimeframe,
  setTimeframe,
  EVENT_PROGRESS_UPDATED
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
const conceptQuery = ref('')

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
    // Pause
    pomoRunning.value = false
    if (timerInterval) clearInterval(timerInterval)
    localStorage.setItem(POMO_KEY, JSON.stringify({
      status: 'paused',
      remaining: pomoRemaining.value,
      mode: pomoMode.value,
      totalSeconds: pomoTotal.value
    }))
  } else {
    // Start or Resume
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

// Circular Pomodoro Progress Ring Math (r = 48 -> C = 301.59)
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

// Dynamic Performance Spline Wave Math
const waveData = computed(() => {
  const s = Math.max(8, readinessScore.value)
  const peakX = 30 + (s * 1.8)
  const peakY = 75 - (s * 0.55)
  const curve = `M 0,75 C 40,75 ${peakX - 30},${peakY} ${peakX},${peakY} S 200,65 240,70`
  const area = `${curve} L 240,90 L 0,90 Z`
  return { peakX, peakY, curve, area }
})

// Weekly and Monthly Capsule Bar Chart Data
const weeklyData = computed(() => {
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  // Calculate relative count based on activityMap
  const today = new Date()
  return days.map((day, idx) => {
    // Generate dates for current week
    const d = new Date()
    d.setDate(today.getDate() - (6 - idx))
    const dateStr = d.toISOString().slice(0, 10)
    const count = activityMap.value[dateStr] ? activityMap.value[dateStr].length : 0
    // baseline height if zero
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

// Favorite items resolved from search index
const favoriteQuestions = computed(() => {
  return searchIndexData.filter(item => {
    const clean = item.path.replace(/\/$/, '')
    return favorites.value.some(fav => fav.replace(/\/$/, '') === clean)
  }).slice(0, 6)
})

// Next uncompleted lesson for "Quick Jump"
const nextUncompletedLesson = computed(() => {
  const found = searchIndexData.find(item => {
    const clean = item.path.replace(/\/$/, '')
    return !completedLessons.value.some(c => c.replace(/\/$/, '') === clean)
  })
  return found || searchIndexData[0]
})

// Filtered Curriculum
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
    const clean = i.path.replace(/\/$/, '')
    return completedLessons.value.some(c => c.replace(/\/$/, '') === clean)
  })
  return Math.round((completed.length / moduleQuestions.length) * 100)
}

function getModuleCompletedCount(moduleId: string) {
  const moduleQuestions = searchIndexData.filter(i => i.module === moduleId)
  return moduleQuestions.filter(i => {
    const clean = i.path.replace(/\/$/, '')
    return completedLessons.value.some(c => c.replace(/\/$/, '') === clean)
  }).length
}

function openSearch() {
  searchModalRef.value?.open()
}

function openTour() {
  walkthroughRef.value?.open()
}

function navigateTo(path: string) {
  router.go(path)
}
</script>

<template>
  <div class="dash-viewport">
    <!-- Global Sticky Top Navigation Bar -->
    <header class="dash-top-bar">
      <div class="brand-wrap">
        <span class="brand-icon">⚡</span>
        <span class="brand-logo-text">PySpark Wiki</span>
        <span class="brand-badge">PRO</span>
      </div>

      <!-- Center Search Pill matching screenshot -->
      <div id="walkthrough-top-right" class="dash-search-pill" @click="openSearch">
        <span class="search-magnifier">🔍</span>
        <span class="search-placeholder">Search 260+ PySpark interview questions, code, concepts...</span>
        <span class="search-kbd">Ctrl K</span>
      </div>

      <!-- Right Header Actions -->
      <div class="dash-header-actions">
        <button class="tour-trigger-btn" @click="openTour">
          <span class="tour-icon">🧭</span>
          <span>Tour Guide</span>
        </button>
        <button class="quiz-trigger-btn" @click="showQuizModal = true">
          <span class="quiz-icon">🏆</span>
          <span>Scenario Quiz</span>
        </button>
        <a
          href="https://github.com/Balasubramanian-pg/PySpark-Interview-Prep"
          target="_blank"
          rel="noopener"
          class="header-icon-btn"
          title="GitHub Repo"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
      </div>
    </header>

    <!-- Main 3-Column Bowwow Layout Container -->
    <div class="dash-grid-layout">
      <!-- LEFT COLUMN: Favs & Saved Bookmarks -->
      <aside class="dash-col-left">
        <div class="sidebar-block">
          <div class="sidebar-section-title">Favs</div>
          <ul class="fav-list">
            <li class="fav-item" @click="navigateTo('/1. Fundamentals/1.1 Spark Architecture Basics/Readme')">
              <span class="fav-icon">⚡</span>
              <span class="fav-text">Spark Architecture</span>
            </li>
            <li class="fav-item" @click="navigateTo('/3. Advanced/3.6 Spark SQL Engine/Readme')">
              <span class="fav-icon">⚙️</span>
              <span class="fav-text">Catalyst Optimizer</span>
            </li>
            <li class="fav-item" @click="navigateTo('/3. Advanced/3.3 Join Strategies/Readme')">
              <span class="fav-icon">🔀</span>
              <span class="fav-text">Join Strategies</span>
            </li>
            <li class="fav-item" @click="navigateTo('/4. Senior Dev/4.1 Memory Management And OOM Errors/Readme')">
              <span class="fav-icon">💾</span>
              <span class="fav-text">Memory & OOMs</span>
            </li>
            <li class="fav-item" @click="navigateTo('/4. Senior Dev/4.3 Structured Streaming/Readme')">
              <span class="fav-icon">🌊</span>
              <span class="fav-text">Streaming & Watermarks</span>
            </li>
            <li class="fav-item" @click="navigateTo('/4. Senior Dev/4.4 Delta Lake And Lakehouse Architecture/Readme')">
              <span class="fav-icon">🧊</span>
              <span class="fav-text">Delta Lake & ACID</span>
            </li>
          </ul>
        </div>

        <!-- My Bowws / Saved Notes Section matching screenshot -->
        <div class="sidebar-block">
          <div class="sidebar-section-title">Saved Questions</div>
          <div v-if="favoriteQuestions.length === 0" class="empty-favs">
            <span class="empty-icon">🔖</span>
            <p class="empty-text">No bookmarked questions yet. Click the bookmark star in any lesson to pin it here.</p>
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

        <!-- Quick Jump Continue Hero Button -->
        <div id="walkthrough-continue-btn" class="quick-resume-card">
          <div class="resume-label">RESUME ACTIVE TOPIC</div>
          <div class="resume-title">{{ nextUncompletedLesson.title }}</div>
          <button class="resume-action-btn" @click="navigateTo(nextUncompletedLesson.path)">
            Continue Reading →
          </button>
        </div>
      </aside>

      <!-- CENTER COLUMN: Feed & Cards & Curriculum & Bento -->
      <main class="dash-col-center">
        <!-- Feed Header & Tabs -->
        <div class="feed-header">
          <h2 class="feed-title">Curriculum Feed</h2>
          <div class="feed-filter-chips">
            <button
              class="filter-pill"
              :class="{ active: activeFilter === 'all' }"
              @click="activeFilter = 'all'"
            >
              All (265)
            </button>
            <button
              class="filter-pill"
              :class="{ active: activeFilter === '1. Fundamentals' }"
              @click="activeFilter = '1. Fundamentals'"
            >
              Fundamentals (70)
            </button>
            <button
              class="filter-pill"
              :class="{ active: activeFilter === '2. Intermediate' }"
              @click="activeFilter = '2. Intermediate'"
            >
              Intermediate (77)
            </button>
            <button
              class="filter-pill"
              :class="{ active: activeFilter === '3. Advanced' }"
              @click="activeFilter = '3. Advanced'"
            >
              Advanced (68)
            </button>
            <button
              class="filter-pill"
              :class="{ active: activeFilter === '4. Senior Dev' }"
              @click="activeFilter = '4. Senior Dev'"
            >
              Senior Dev (50)
            </button>
          </div>
        </div>

        <!-- FEATURED HERO CARDS matching screenshot 3-card layout -->
        <div class="featured-cards-grid">
          <!-- Card 1: Dark Navy Card -->
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
              <span class="read-link">Read deep dive →</span>
              <button class="feat-pill-btn">Study Concept</button>
            </div>
          </div>

          <!-- Card 2: Crisp White Card with Orange Accent -->
          <div class="feat-card feat-white" @click="navigateTo('/3. Advanced/3.3 Join Strategies/3.3.1 What are the different join strategies in PySpark')">
            <div class="feat-meta">
              <span class="feat-time">OPTIMIZATION · 12 MIN</span>
              <span class="feat-badge-orange">Join Mechanics</span>
            </div>
            <h3 class="feat-title" style="color: #0F172A;">What kind of Join Strategy?</h3>
            <p class="feat-desc" style="color: #475569;">
              SortMergeJoin vs BroadcastHashJoin vs ShuffleHashJoin. How Adaptive Query Execution (AQE) dynamically resolves joins at runtime.
            </p>
            <div class="feat-footer">
              <span class="read-link" style="color: #FF6B35;">Read more →</span>
              <button class="feat-pill-orange">Explore Joins!</button>
            </div>
          </div>

          <!-- Card 3: Wide Soft Blue/Lavender Card below -->
          <div class="feat-card feat-wide-blue" @click="navigateTo('/4. Senior Dev/4.1 Memory Management And OOM Errors/4.1.1 Describe the Spark Executor Memory architecture.')">
            <div class="feat-meta">
              <span class="feat-time">STAFF LEVEL · 15 MIN</span>
              <span class="feat-badge-blue">Memory Management</span>
            </div>
            <h3 class="feat-title" style="color: #1E293B;">Unified Memory Manager & Zero OOMs</h3>
            <p class="feat-desc" style="color: #334155;">
              Storage vs Execution memory borrowing boundaries, off-heap buffers, and GC tuning for production clusters.
            </p>
            <div class="feat-footer">
              <span class="read-link" style="color: #2563EB;">Read architecture →</span>
              <button class="feat-pill-dark">Master Sizing</button>
            </div>
          </div>
        </div>

        <!-- 4-WIDGET ANALYTICS BENTO SECTION -->
        <div class="bento-section-title">Learning Intelligence Bento</div>
        <div class="analytics-bento-grid">
          <!-- Widget 1: Resilient Pomodoro Focus Clock -->
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
                >
                  Week
                </button>
                <button
                  class="toggle-btn"
                  :class="{ active: selectedTimeframe === 'month' }"
                  @click="setTimeframe('month'); selectedTimeframe = 'month'"
                >
                  Month
                </button>
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

          <!-- Widget 3: Dynamic Performance & Exam Readiness Spline Wave -->
          <div class="bento-widget spline-widget">
            <div class="widget-header">
              <span class="widget-tag">TRAJECTORY SPLINE</span>
              <span class="readiness-indicator">{{ readinessScore }}% Target</span>
            </div>

            <div class="spline-visual-wrap">
              <svg width="240" height="90" viewBox="0 0 240 90" class="spline-svg">
                <defs>
                  <linearGradient id="waveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stop-color="#FF6B35" stop-opacity="0.4" />
                    <stop offset="100%" stop-color="#FF6B35" stop-opacity="0" />
                  </linearGradient>
                </defs>
                <path :d="waveData.area" fill="url(#waveGrad)" />
                <path :d="waveData.curve" fill="none" stroke="#FF6B35" stroke-width="3" stroke-linecap="round" />
                <circle :cx="waveData.peakX" :cy="waveData.peakY" r="5" fill="#FFFFFF" stroke="#FF6B35" stroke-width="3" />
              </svg>

              <!-- Floating Score Pill -->
              <div
                class="floating-score-badge"
                :style="{ left: `${waveData.peakX - 22}px`, top: `${Math.max(4, waveData.peakY - 26)}px` }"
              >
                {{ readinessScore }}%
              </div>
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
                <span class="card-arrow">Start →</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <!-- RIGHT COLUMN: Profile, Stats & Action Cards matching screenshot -->
      <aside class="dash-col-right">
        <!-- Profile Card -->
        <div class="profile-card">
          <div class="profile-avatar-wrap">
            <div class="profile-avatar">BP</div>
          </div>
          <div class="profile-name">Balasubramanian PG</div>
          <div class="profile-role">Senior Data Engineer · PySpark</div>
          <button class="profile-edit-btn" @click="openTour">Guided Tour</button>

          <!-- Bio Speech Bubble matching screenshot -->
          <div class="speech-bubble">
            Targeting Staff & Senior Big Data Engineering roles. 260+ comprehensive questions with 100% zero-backend persistence.
          </div>

          <!-- 3 Stats metrics matching screenshot -->
          <div class="profile-stats-row">
            <div class="stat-col">
              <div class="stat-num">265</div>
              <div class="stat-lbl">Questions</div>
            </div>
            <div class="stat-col">
              <div class="stat-num">{{ completedCount }}</div>
              <div class="stat-lbl">Completed</div>
            </div>
            <div class="stat-col">
              <div class="stat-num">{{ pomodoroStats.completedBlocks }}</div>
              <div class="stat-lbl">Focus Pomo</div>
            </div>
          </div>
        </div>

        <!-- Mini Grid of Action Cards matching screenshot bottom right -->
        <div class="action-cards-grid">
          <div class="mini-card add-card" @click="showQuizModal = true">
            <span class="plus-icon">+</span>
            <span class="mini-title">Scenario Quiz</span>
          </div>

          <div class="mini-card outline-card" @click="navigateTo('/3. Advanced/3.2 Shuffling And Data Exchange/Readme')">
            <div class="line-art">〰️</div>
            <span class="mini-title">Be patient with shuffles</span>
          </div>

          <div class="mini-card outline-card" @click="navigateTo('/4. Senior Dev/4.1 Memory Management And OOM Errors/Readme')">
            <div class="ladder-art">🪜</div>
            <span class="mini-title">12 Steps to Debug OOMs</span>
          </div>

          <!-- Solid Orange Card matching screenshot "Zero Budget" -->
          <div class="mini-card solid-orange-card" @click="navigateTo('/3. Advanced/3.5 Handling Data Skewness/Readme')">
            <span class="mini-title-bold">Zero Data Skew</span>
          </div>
        </div>
      </aside>
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

/* Header */
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
  gap: 8px;
}

.brand-icon {
  font-size: 22px;
}

.brand-logo-text {
  font-size: 18px;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #FFFFFF;
}

.brand-badge {
  font-size: 10px;
  font-weight: 800;
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.15);
  padding: 2px 7px;
  border-radius: 6px;
}

.dash-search-pill {
  flex: 1;
  max-width: 580px;
  display: flex;
  align-items: center;
  gap: 10px;
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

.search-magnifier {
  font-size: 15px;
  opacity: 0.7;
}

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
  gap: 12px;
}

.tour-trigger-btn, .quiz-trigger-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #FFFFFF;
  padding: 8px 14px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.tour-trigger-btn:hover, .quiz-trigger-btn:hover {
  background: rgba(255, 107, 53, 0.18);
  border-color: rgba(255, 107, 53, 0.45);
  color: #FF6B35;
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
  color: #FFFFFF;
  background: rgba(255, 255, 255, 0.12);
}

/* 3-Column Grid */
.dash-grid-layout {
  display: grid;
  grid-template-columns: 240px 1fr 280px;
  gap: 24px;
}

/* Left Column */
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

.empty-favs {
  padding: 14px 6px;
  text-align: center;
}

.empty-icon {
  font-size: 20px;
  opacity: 0.6;
}

.empty-text {
  font-size: 11.5px;
  color: #6E7387;
  margin: 6px 0 0 0;
  line-height: 1.4;
}

.saved-cards-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.saved-mini-card {
  padding: 12px;
  border-radius: 14px;
  cursor: pointer;
  transition: transform 0.2s;
}

.saved-mini-card:hover {
  transform: translateY(-2px);
}

.saved-mini-card.card-dark {
  background: #1E293B;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.saved-mini-card.card-orange {
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
}

.saved-card-tag {
  font-size: 10px;
  font-weight: 700;
  opacity: 0.8;
  margin-bottom: 4px;
}

.saved-card-title {
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.35;
}

.quick-resume-card {
  background: linear-gradient(135deg, rgba(255, 107, 53, 0.15) 0%, rgba(144, 107, 255, 0.15) 100%);
  border: 1px solid rgba(255, 107, 53, 0.3);
  border-radius: 20px;
  padding: 18px;
}

.resume-label {
  font-size: 10.5px;
  font-weight: 700;
  color: #FF6B35;
  letter-spacing: 0.05em;
  margin-bottom: 6px;
}

.resume-title {
  font-size: 13.5px;
  font-weight: 600;
  color: #FFFFFF;
  margin-bottom: 12px;
  line-height: 1.4;
}

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

.resume-action-btn:hover {
  box-shadow: 0 4px 14px rgba(255, 107, 53, 0.4);
}

/* Center Column */
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

.feed-title {
  font-size: 20px;
  font-weight: 800;
  margin: 0;
}

.feed-filter-chips {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
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

.filter-pill:hover, .filter-pill.active {
  background: rgba(255, 107, 53, 0.18);
  border-color: rgba(255, 107, 53, 0.45);
  color: #FF6B35;
}

/* Featured Hero Cards Grid matching screenshot */
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
}

.feat-card:hover {
  transform: translateY(-3px);
}

.feat-dark {
  background: #15161E;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
}

.feat-white {
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.06);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.06);
}

.feat-wide-blue {
  grid-column: 1 / -1;
  background: linear-gradient(135deg, #E0E7FF 0%, #EDE9FE 100%);
  border: 1px solid rgba(99, 102, 241, 0.15);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.05);
}

.feat-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.feat-time {
  font-size: 11px;
  font-weight: 700;
  opacity: 0.7;
}

.feat-badge-dark {
  font-size: 11px;
  font-weight: 700;
  color: #A78BFA;
  background: rgba(167, 139, 250, 0.15);
  padding: 3px 8px;
  border-radius: 6px;
}

.feat-badge-orange {
  font-size: 11px;
  font-weight: 700;
  color: #EA580C;
  background: rgba(234, 88, 12, 0.12);
  padding: 3px 8px;
  border-radius: 6px;
}

.feat-badge-blue {
  font-size: 11px;
  font-weight: 700;
  color: #2563EB;
  background: rgba(37, 99, 235, 0.12);
  padding: 3px 8px;
  border-radius: 6px;
}

.feat-title {
  font-size: 18px;
  font-weight: 800;
  margin: 0 0 10px 0;
  line-height: 1.35;
}

.feat-desc {
  font-size: 13.5px;
  line-height: 1.5;
  margin: 0 0 20px 0;
  opacity: 0.85;
}

.feat-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
}

.read-link {
  font-size: 13px;
  font-weight: 600;
  color: #9CA3AF;
}

.feat-pill-btn {
  background: rgba(255, 255, 255, 0.12);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
  font-size: 12.5px;
  font-weight: 600;
  padding: 7px 16px;
  border-radius: 9999px;
  cursor: pointer;
}

.feat-pill-orange {
  background: #FF6B35;
  border: none;
  color: #FFFFFF;
  font-size: 12.5px;
  font-weight: 600;
  padding: 7px 16px;
  border-radius: 9999px;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.35);
}

.feat-pill-dark {
  background: #0F172A;
  border: none;
  color: #FFFFFF;
  font-size: 12.5px;
  font-weight: 600;
  padding: 7px 16px;
  border-radius: 9999px;
  cursor: pointer;
}

/* Analytics Bento */
.bento-section-title {
  font-size: 15px;
  font-weight: 800;
  color: #FFFFFF;
  letter-spacing: -0.01em;
}

.analytics-bento-grid {
  display: grid;
  grid-template-columns: 240px 1fr 240px;
  gap: 18px;
}

.bento-widget {
  background: #12131A;
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 20px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.widget-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.widget-tag {
  font-size: 10.5px;
  font-weight: 700;
  color: #FF6B35;
  letter-spacing: 0.05em;
}

.widget-status {
  font-size: 11px;
  color: #6E7387;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
}

.widget-status.running {
  color: #34D399;
  background: rgba(52, 211, 153, 0.15);
}

.pomo-clock-wrap {
  position: relative;
  width: 116px;
  height: 116px;
  margin: 0 auto 14px auto;
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
  font-size: 20px;
  font-weight: 800;
  font-family: var(--vp-font-family-mono);
}

.mode-label {
  font-size: 10px;
  color: #9CA3AF;
  text-transform: uppercase;
}

.pomo-actions {
  display: flex;
  gap: 8px;
}

.pomo-btn {
  flex: 1;
  padding: 7px 10px;
  border-radius: 8px;
  font-size: 12px;
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

/* Capsule Chart */
.chart-toggle {
  display: flex;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 2px;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: #9CA3AF;
  font-size: 11px;
  padding: 3px 8px;
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
  gap: 8px;
  height: 100px;
  margin-bottom: 12px;
  padding: 0 4px;
}

.capsule-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.col-day {
  font-size: 11px;
  color: #6E7387;
  font-weight: 600;
}

.col-pill-track {
  width: 14px;
  height: 64px;
  background: #191B24;
  border-radius: 9999px;
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.col-pill-fill {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(180deg, #FF6B35 0%, #EA580C 100%);
  border-radius: 9999px;
  transition: height 0.6s cubic-bezier(0.16, 1, 0.3, 1);
}

.col-count {
  font-size: 10px;
  color: #9CA3AF;
}

.chart-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: #9CA3AF;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 10px;
}

.summary-pill {
  color: #FF6B35;
  font-weight: 700;
}

/* Spline Wave */
.spline-visual-wrap {
  position: relative;
  margin: 0 auto;
}

.floating-score-badge {
  position: absolute;
  background: #FF6B35;
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 800;
  padding: 2px 7px;
  border-radius: 9999px;
  box-shadow: 0 0 10px rgba(255, 107, 53, 0.6);
  transition: all 0.3s ease;
}

.spline-caption {
  font-size: 11px;
  color: #9CA3AF;
  line-height: 1.4;
  margin-top: 10px;
}

/* Curriculum Modules Grid */
.curriculum-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.curriculum-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.section-title {
  font-size: 18px;
  font-weight: 800;
  margin: 0;
}

.section-sub {
  font-size: 12.5px;
  color: #9CA3AF;
}

.modules-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.module-card {
  background: #12131A;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 18px;
  padding: 20px;
  cursor: pointer;
  transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.module-card:hover {
  transform: translateY(-3px);
  border-color: rgba(255, 107, 53, 0.4);
  background: #151620;
}

.module-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.module-tag {
  font-size: 11px;
  font-weight: 700;
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.12);
  padding: 3px 8px;
  border-radius: 6px;
}

.module-percent {
  font-size: 12px;
  font-weight: 800;
  color: #FFFFFF;
}

.module-card-title {
  font-size: 15.5px;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0 0 6px 0;
}

.module-card-desc {
  font-size: 12.5px;
  color: #9CA3AF;
  line-height: 1.45;
  margin: 0 0 16px 0;
}

.module-progress-bar {
  height: 6px;
  background: #191B24;
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 12px;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #FF6B35 0%, #EA580C 100%);
  border-radius: 9999px;
  transition: width 0.6s ease;
}

.module-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: #6E7387;
}

.card-arrow {
  color: #FF6B35;
  font-weight: 600;
}

/* Right Column */
.dash-col-right {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.profile-card {
  background: #12131A;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  padding: 24px 20px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.profile-avatar-wrap {
  margin-bottom: 12px;
}

.profile-avatar {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  color: #FFFFFF;
  font-size: 18px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(255, 107, 53, 0.35);
}

.profile-name {
  font-size: 16px;
  font-weight: 800;
  color: #FFFFFF;
  margin-bottom: 2px;
}

.profile-role {
  font-size: 12px;
  color: #9CA3AF;
  margin-bottom: 12px;
}

.profile-edit-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #D1D5DB;
  font-size: 11.5px;
  padding: 4px 12px;
  border-radius: 9999px;
  cursor: pointer;
  margin-bottom: 16px;
}

.speech-bubble {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 12px 14px;
  font-size: 12px;
  color: #D1D5DB;
  line-height: 1.4;
  margin-bottom: 18px;
  text-align: left;
}

.profile-stats-row {
  display: flex;
  align-items: center;
  justify-content: space-around;
  width: 100%;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 14px;
}

.stat-col {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.stat-num {
  font-size: 18px;
  font-weight: 800;
  color: #FFFFFF;
}

.stat-lbl {
  font-size: 10.5px;
  color: #6E7387;
  text-transform: uppercase;
}

/* Action Cards Mini Grid matching screenshot */
.action-cards-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.mini-card {
  height: 100px;
  border-radius: 16px;
  padding: 14px;
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
  background: #1E293B;
  border: 1px solid rgba(255, 255, 255, 0.08);
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.plus-icon {
  font-size: 24px;
  color: #FF6B35;
  font-weight: 300;
}

.outline-card {
  background: #12131A;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.line-art, .ladder-art {
  font-size: 22px;
}

.mini-title {
  font-size: 12px;
  font-weight: 600;
  color: #FFFFFF;
  line-height: 1.3;
}

.solid-orange-card {
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  box-shadow: 0 6px 18px rgba(255, 107, 53, 0.35);
}

.mini-title-bold {
  font-size: 13.5px;
  font-weight: 800;
}

@media (max-width: 1200px) {
  .dash-grid-layout {
    grid-template-columns: 1fr;
  }
  .analytics-bento-grid {
    grid-template-columns: 1fr;
  }
}
</style>
