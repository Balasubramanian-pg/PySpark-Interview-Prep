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
  toggleFavorite,
  toggleLessonCompletion
} from './.vitepress/theme/storage'
import WalkthroughGuide from './.vitepress/theme/WalkthroughGuide.vue'
import SearchModal from './.vitepress/theme/SearchModal.vue'
import QuizModal from './.vitepress/theme/QuizModal.vue'
import DiagnosticModal from './components/ui/DiagnosticModal.vue'
import FlashcardModal from './components/ui/FlashcardModal.vue'
import SyncModal from './components/ui/SyncModal.vue'
import searchIndexData from './search-index.json'

const router = useRouter()

// Modal refs & states
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
const studyStreak = ref({ currentStreak: 0, longestStreak: 0, lastStudyDate: '' })
const dueReviews = ref<any[]>([])
const diagnosticResult = ref<any>(null)

// Navigation & Active View State
type ViewType = 'overview' | '1. Fundamentals' | '2. Intermediate' | '3. Advanced' | '4. Senior Dev' | 'bookmarked' | 'completed'
const activeView = ref<ViewType>('1. Fundamentals')
const selectedSubtopic = ref<string>('all')
const sidebarQuery = ref<string>('')

// Collapsible Track sections in Sidebar
const expandedTracks = ref<Record<string, boolean>>({
  '1. Fundamentals': true,
  '2. Intermediate': false,
  '3. Advanced': false,
  '4. Senior Dev': false
})

function toggleTrackExpand(track: string) {
  expandedTracks.value[track] = !expandedTracks.value[track]
}

// Master tracks metadata
const tracksMetadata = [
  {
    id: '1. Fundamentals',
    name: 'Fundamentals',
    code: '01',
    count: 70,
    desc: 'Core Spark Architecture, RDDs, DataFrames, SparkSession, Lazy Evaluation & Transformations.',
    icon: 'book',
    color: '#F97316'
  },
  {
    id: '2. Intermediate',
    name: 'Intermediate',
    code: '02',
    count: 77,
    desc: 'Joins, Window Functions, Complex Types, Regex, UDFs, Date/Time & File Formats.',
    icon: 'zap',
    color: '#0EA5E9'
  },
  {
    id: '3. Advanced',
    name: 'Advanced',
    code: '03',
    count: 68,
    desc: 'Catalyst Optimizer, Shuffling, AQE, Join Strategies, Caching & Data Skew Remediation.',
    icon: 'rocket',
    color: '#8B5CF6'
  },
  {
    id: '4. Senior Dev',
    name: 'Senior Dev',
    code: '04',
    count: 50,
    desc: 'Memory Management, OOM Debugging, Spark UI Analysis, Structured Streaming & Lakehouse.',
    icon: 'award',
    color: '#10B981'
  }
]

// Company War Stories Tagging
const companyTags = ['Netflix', 'Databricks', 'Uber', 'Apple', 'Meta', 'Amazon', 'Stripe', 'Google', 'Airbnb']
function getCompanyTag(title: string): string {
  let hash = 0
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i)
  }
  return companyTags[Math.abs(hash) % companyTags.length]
}

// Subtopics calculation per track
function getSubtopicsForTrack(trackId: string) {
  const map: Record<string, number> = {}
  searchIndexData
    .filter(item => item.module === trackId)
    .forEach(item => {
      map[item.subtopic] = (map[item.subtopic] || 0) + 1
    })
  return Object.entries(map).map(([name, count]) => ({ name, count }))
}

// Track completion stats
function getTrackProgress(trackId: string) {
  const items = searchIndexData.filter(item => item.module === trackId)
  if (!items.length) return { completed: 0, total: 0, percent: 0 }
  const done = items.filter(item => isLessonCompleted(item.path)).length
  return {
    completed: done,
    total: items.length,
    percent: Math.round((done / items.length) * 100)
  }
}

// Overall Readiness Score
const overallReadiness = computed(() => {
  const total = searchIndexData.length
  if (!total) return 0
  return Math.round((completedLessons.value.length / total) * 100)
})

// Filtered Questions in Active Workspace
const activeQuestions = computed(() => {
  let list = searchIndexData

  if (activeView.value === 'bookmarked') {
    return list.filter(item => isFavorite(item.path))
  }

  if (activeView.value === 'completed') {
    return list.filter(item => isLessonCompleted(item.path))
  }

  if (activeView.value !== 'overview') {
    list = list.filter(item => item.module === activeView.value)
    if (selectedSubtopic.value !== 'all') {
      list = list.filter(item => item.subtopic === selectedSubtopic.value)
    }
  }

  if (sidebarQuery.value.trim()) {
    const q = sidebarQuery.value.toLowerCase().trim()
    list = list.filter(item =>
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.subtopic.toLowerCase().includes(q)
    )
  }

  return list
})

// Subtopic list for current selected track
const currentSubtopics = computed(() => {
  if (activeView.value === 'overview' || activeView.value === 'bookmarked' || activeView.value === 'completed') {
    return []
  }
  return getSubtopicsForTrack(activeView.value)
})

// Current Track Metadata
const currentTrackMeta = computed(() => {
  return tracksMetadata.find(t => t.id === activeView.value) || null
})

// View Switchers
function selectTrack(trackId: ViewType, subtopic = 'all') {
  activeView.value = trackId
  selectedSubtopic.value = subtopic
  if (trackId.startsWith('1.') || trackId.startsWith('2.') || trackId.startsWith('3.') || trackId.startsWith('4.')) {
    expandedTracks.value[trackId] = true
  }
}

function selectSubtopic(subtopic: string) {
  selectedSubtopic.value = subtopic
}

// Navigation & State actions
function navigateTo(path: string) {
  router.go(resolveUrl(path))
}

function openFirstLessonInView() {
  if (activeQuestions.value.length > 0) {
    navigateTo(activeQuestions.value[0].path)
  }
}

function onToggleFavorite(path: string, event: Event) {
  event.stopPropagation()
  toggleFavorite(path)
  refreshState()
}

function onToggleComplete(path: string, event: Event) {
  event.stopPropagation()
  toggleLessonCompletion(path)
  refreshState()
}

function openSearch() {
  searchModalRef.value?.open()
}

// Refresh local state from storage
function refreshState() {
  completedLessons.value = getCompletedLessons()
  favorites.value = getFavorites()
  pomodoroStats.value = getPomodoroStats()
  studyStreak.value = getStudyStreak()
  dueReviews.value = getDueSRSReviews()
  diagnosticResult.value = getDiagnosticResult()
}

onMounted(() => {
  refreshState()
  window.addEventListener('storage', refreshState)
  window.addEventListener(EVENT_PROGRESS_UPDATED, refreshState)
})

onUnmounted(() => {
  window.removeEventListener('storage', refreshState)
  window.removeEventListener(EVENT_PROGRESS_UPDATED, refreshState)
})
</script>

<template>
  <div class="wiki-portal-container">
    <!-- Top Header Bar -->
    <header class="portal-header">
      <div class="header-left">
        <div class="portal-logo" @click="selectTrack('overview')">
          <svg class="spark-logo-icon" viewBox="0 0 24 24" width="22" height="22" fill="#F97316">
            <path d="M12 0c-.28 0-.5.22-.5.5 0 2.24-1.32 3.63-2.6 4.98C7.54 6.89 6 8.52 6 11.5c0 3.59 2.91 6.5 6.5 6.5s6.5-2.91 6.5-6.5c0-4.08-3.08-6.19-5.58-8.75C12.74 2.05 12.08 1.13 12 0zm0 15c-1.93 0-3.5-1.57-3.5-3.5 0-1.3.7-2.31 1.6-3.3.8-1 1.9-2.12 1.9-4.2 1.34 1.5 3.5 3.32 3.5 6 0 2.76-1.57 5-3.5 5z"/>
          </svg>
          <span class="portal-title">PySpark Wiki</span>
          <span class="portal-badge">265 Questions</span>
        </div>
      </div>

      <!-- Center Search Pill -->
      <div class="header-center">
        <button class="portal-search-trigger" @click="openSearch">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span class="search-hint">Search 260+ questions, concepts, code...</span>
          <span class="search-kbd">Ctrl K</span>
        </button>
      </div>

      <!-- Right Header Actions -->
      <div class="header-right">
        <!-- Streak counter -->
        <div class="streak-pill" :title="`Streak: ${studyStreak.currentStreak} days`">
          <svg viewBox="0 0 24 24" width="13" height="13" fill="#F97316">
            <path d="M12 0c-.28 0-.5.22-.5.5 0 2.24-1.32 3.63-2.6 4.98C7.54 6.89 6 8.52 6 11.5c0 3.59 2.91 6.5 6.5 6.5s6.5-2.91 6.5-6.5c0-4.08-3.08-6.19-5.58-8.75C12.74 2.05 12.08 1.13 12 0zm0 15c-1.93 0-3.5-1.57-3.5-3.5 0-1.3.7-2.31 1.6-3.3.8-1 1.9-2.12 1.9-4.2 1.34 1.5 3.5 3.32 3.5 6 0 2.76-1.57 5-3.5 5z"/>
          </svg>
          <span>{{ studyStreak.currentStreak > 0 ? `${studyStreak.currentStreak}d Streak` : 'Active' }}</span>
        </div>

        <!-- 5-min Diagnostic button -->
        <button class="tool-btn" @click="showDiagnosticModal = true" title="Test your level in 5 minutes">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="6"></circle>
          </svg>
          <span>Diagnostic</span>
        </button>

        <!-- Flashcards button -->
        <button class="tool-btn" @click="showFlashcardModal = true" title="Spaced repetition recall deck">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          <span>Flashcards</span>
        </button>

        <!-- GitHub link -->
        <a
          href="https://github.com/Balasubramanian-pg/PySpark-Interview-Prep"
          target="_blank"
          rel="noopener"
          class="icon-link-btn"
          title="GitHub Repository"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
        </a>
      </div>
    </header>

    <!-- Main Dual-Panel Workspace -->
    <div class="portal-body">
      <!-- ══════════════════════════════════════════════════════════════
           LEFT SIDEBAR NAVIGATION (Allows user to choose where to go)
           ══════════════════════════════════════════════════════════════ -->
      <aside class="portal-sidebar">
        <!-- Sidebar Search / Filter -->
        <div class="sidebar-search-box">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            v-model="sidebarQuery"
            type="text"
            placeholder="Filter topics..."
            class="sidebar-input"
          />
        </div>

        <div class="sidebar-nav-scroll">
          <!-- Overview Option -->
          <div
            class="nav-item-single"
            :class="{ active: activeView === 'overview' }"
            @click="selectTrack('overview')"
          >
            <div class="nav-item-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="7" height="7"></rect>
                <rect x="14" y="3" width="7" height="7"></rect>
                <rect x="14" y="14" width="7" height="7"></rect>
                <rect x="3" y="14" width="7" height="7"></rect>
              </svg>
            </div>
            <div class="nav-item-info">
              <span class="nav-item-title">Overview Dashboard</span>
            </div>
          </div>

          <!-- Section Label: Learning Tracks -->
          <div class="nav-section-title">LEARNING TRACKS</div>

          <!-- 4 Tracks with Collapsible Subtopics -->
          <div
            v-for="track in tracksMetadata"
            :key="track.id"
            class="track-group"
          >
            <div
              class="track-item-header"
              :class="{
                active: activeView === track.id,
                expanded: expandedTracks[track.id]
              }"
              @click="selectTrack(track.id as ViewType)"
            >
              <div class="track-left">
                <span class="track-code-badge">{{ track.code }}</span>
                <span class="track-name">{{ track.name }}</span>
              </div>
              <div class="track-right">
                <span class="track-count-pill">{{ getTrackProgress(track.id).completed }}/{{ track.count }}</span>
                <button
                  class="expand-caret-btn"
                  @click.stop="toggleTrackExpand(track.id)"
                  :aria-label="`Toggle ${track.name} subtopics`"
                >
                  <svg
                    class="caret-icon"
                    :class="{ rotated: expandedTracks[track.id] }"
                    viewBox="0 0 24 24"
                    width="14"
                    height="14"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
              </div>
            </div>

            <!-- Subtopics List inside Track -->
            <div v-if="expandedTracks[track.id]" class="subtopics-list">
              <button
                class="subtopic-item-btn"
                :class="{ active: activeView === track.id && selectedSubtopic === 'all' }"
                @click="selectTrack(track.id as ViewType, 'all')"
              >
                <span class="subtopic-dot"></span>
                <span class="subtopic-title">All {{ track.name }}</span>
                <span class="subtopic-badge">{{ track.count }}</span>
              </button>

              <button
                v-for="sub in getSubtopicsForTrack(track.id)"
                :key="sub.name"
                class="subtopic-item-btn"
                :class="{ active: activeView === track.id && selectedSubtopic === sub.name }"
                @click="selectTrack(track.id as ViewType, sub.name)"
              >
                <span class="subtopic-dot"></span>
                <span class="subtopic-title">{{ sub.name.replace(/^\d+\.\d+\s*/, '') }}</span>
                <span class="subtopic-badge">{{ sub.count }}</span>
              </button>
            </div>
          </div>

          <!-- Section Label: Interactive Practice -->
          <div class="nav-section-title">INTERACTIVE PRACTICE</div>

          <div class="nav-item-single" @click="showDiagnosticModal = true">
            <div class="nav-item-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"></circle>
                <circle cx="12" cy="12" r="6"></circle>
              </svg>
            </div>
            <div class="nav-item-info">
              <span class="nav-item-title">5-Min Diagnostic Test</span>
            </div>
          </div>

          <div class="nav-item-single" @click="showFlashcardModal = true">
            <div class="nav-item-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
            </div>
            <div class="nav-item-info">
              <span class="nav-item-title">Flashcards Active Recall</span>
            </div>
          </div>

          <div class="nav-item-single" @click="showQuizModal = true">
            <div class="nav-item-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                <polyline points="14 2 14 8 20 8"></polyline>
                <line x1="16" y1="13" x2="8" y2="13"></line>
                <line x1="16" y1="17" x2="8" y2="17"></line>
              </svg>
            </div>
            <div class="nav-item-info">
              <span class="nav-item-title">Scenario Architecture Quiz</span>
            </div>
          </div>

          <!-- Section Label: My Library -->
          <div class="nav-section-title">MY LIBRARY</div>

          <div
            class="nav-item-single"
            :class="{ active: activeView === 'bookmarked' }"
            @click="selectTrack('bookmarked')"
          >
            <div class="nav-item-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </div>
            <div class="nav-item-info">
              <span class="nav-item-title">Saved Questions</span>
            </div>
            <span class="nav-count-badge">{{ favorites.length }}</span>
          </div>

          <div
            class="nav-item-single"
            :class="{ active: activeView === 'completed' }"
            @click="selectTrack('completed')"
          >
            <div class="nav-item-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
            </div>
            <div class="nav-item-info">
              <span class="nav-item-title">Mastered Lessons</span>
            </div>
            <span class="nav-count-badge">{{ completedLessons.length }}</span>
          </div>
        </div>
      </aside>

      <!-- ══════════════════════════════════════════════════════════════
           RIGHT MAIN ACTIVE WORKSPACE
           ══════════════════════════════════════════════════════════════ -->
      <main class="portal-main">
        <!-- ─── CASE A: OVERVIEW DASHBOARD ─── -->
        <div v-if="activeView === 'overview'" class="overview-view-container">
          <div class="overview-hero-card">
            <div class="hero-badge">PYSPARK CERTIFICATION &amp; INTERVIEW PREP</div>
            <h1 class="hero-title">Master PySpark Architecture &amp; Production Engineering</h1>
            <p class="hero-subtitle">
              Choose your focus track on the left sidebar to navigate step-by-step through 265 production interview questions, architecture diagrams, and deep dives.
            </p>

            <div class="hero-stats-row">
              <div class="stat-box">
                <span class="stat-number">265</span>
                <span class="stat-label">Total Questions</span>
              </div>
              <div class="stat-box">
                <span class="stat-number">{{ completedLessons.length }}</span>
                <span class="stat-label">Mastered</span>
              </div>
              <div class="stat-box">
                <span class="stat-number">{{ overallReadiness }}%</span>
                <span class="stat-label">Interview Readiness</span>
              </div>
              <div class="stat-box">
                <span class="stat-number">{{ studyStreak.currentStreak }}d</span>
                <span class="stat-label">Study Streak</span>
              </div>
            </div>
          </div>

          <!-- Spaced Repetition Due Banner -->
          <div v-if="dueReviews.length > 0" class="srs-alert-card">
            <div class="srs-alert-left">
              <span class="srs-bell-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                  <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
                </svg>
              </span>
              <div>
                <div class="srs-title">{{ dueReviews.length }} Topic{{ dueReviews.length > 1 ? 's' : '' }} Due for Spaced Repetition</div>
                <div class="srs-desc">Memory decay indicates these topics need recall practice today.</div>
              </div>
            </div>
            <button class="srs-review-btn" @click="showFlashcardModal = true">
              Review Due Cards &rarr;
            </button>
          </div>

          <!-- Track Cards Grid -->
          <div class="overview-tracks-section">
            <div class="section-heading-row">
              <h2 class="section-title">Core Learning Tracks</h2>
              <span class="section-sub">Select any track to start reading</span>
            </div>

            <div class="tracks-cards-grid">
              <div
                v-for="track in tracksMetadata"
                :key="track.id"
                class="track-display-card"
                @click="selectTrack(track.id as ViewType)"
              >
                <div class="track-card-top">
                  <span class="card-track-code">TRACK {{ track.code }}</span>
                  <span class="card-track-count">{{ track.count }} Questions</span>
                </div>

                <h3 class="track-card-title">{{ track.name }}</h3>
                <p class="track-card-desc">{{ track.desc }}</p>

                <div class="track-card-bottom">
                  <div class="progress-wrap">
                    <div class="progress-bar-track">
                      <div
                        class="progress-bar-fill"
                        :style="{ width: `${getTrackProgress(track.id).percent}%` }"
                      ></div>
                    </div>
                    <span class="progress-text">{{ getTrackProgress(track.id).percent }}% complete</span>
                  </div>
                  <button class="track-open-btn">
                    Explore &rarr;
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ─── CASE B: SPECIFIC TRACK OR FILTERED VIEW ─── -->
        <div v-else class="track-view-container">
          <!-- Active Track Header (Inspired by Kirrivan & Riddle UI) -->
          <div class="workspace-header-card">
            <div class="workspace-header-top">
              <div class="breadcrumbs-row">
                <span class="crumb-link" @click="selectTrack('overview')">Wiki</span>
                <span class="crumb-sep">/</span>
                <span class="crumb-active">{{ currentTrackMeta ? currentTrackMeta.name : (activeView === 'bookmarked' ? 'Bookmarked Questions' : 'Mastered Lessons') }}</span>
                <template v-if="selectedSubtopic !== 'all'">
                  <span class="crumb-sep">/</span>
                  <span class="crumb-sub">{{ selectedSubtopic }}</span>
                </template>
              </div>

              <!-- Quick Action button -->
              <button
                v-if="activeQuestions.length > 0"
                class="open-wiki-btn"
                @click="openFirstLessonInView"
              >
                <span>Open in Wiki Reader</span>
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="5" y1="12" x2="19" y2="12"></line>
                  <polyline points="12 5 19 12 12 19"></polyline>
                </svg>
              </button>
            </div>

            <div class="workspace-title-row">
              <h1 class="workspace-main-title">
                {{ selectedSubtopic !== 'all' ? selectedSubtopic : (currentTrackMeta ? currentTrackMeta.name : (activeView === 'bookmarked' ? 'Saved Questions' : 'Mastered Lessons')) }}
              </h1>
              <span class="workspace-count-pill">{{ activeQuestions.length }} Questions</span>
            </div>

            <p class="workspace-desc">
              {{ currentTrackMeta ? currentTrackMeta.desc : 'Personal collection of PySpark interview concepts and architectural patterns.' }}
            </p>

            <!-- Subtopic Filter Pills (if track selected) -->
            <div v-if="currentSubtopics.length > 1" class="subtopic-pills-row">
              <button
                class="sub-pill"
                :class="{ active: selectedSubtopic === 'all' }"
                @click="selectSubtopic('all')"
              >
                All ({{ currentTrackMeta?.count }})
              </button>
              <button
                v-for="sub in currentSubtopics"
                :key="sub.name"
                class="sub-pill"
                :class="{ active: selectedSubtopic === sub.name }"
                @click="selectSubtopic(sub.name)"
              >
                {{ sub.name.replace(/^\d+\.\d+\s*/, '') }} ({{ sub.count }})
              </button>
            </div>
          </div>

          <!-- Step Cards Flow (Inspired directly by Kirrivan Image 1) -->
          <div class="sequence-step-flow">
            <div v-if="activeQuestions.length === 0" class="empty-state-card">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="8" y1="12" x2="16" y2="12"></line>
              </svg>
              <h3>No questions found</h3>
              <p>Try clearing your filter or selecting a different category from the sidebar.</p>
            </div>

            <!-- Connected Timeline & Step Cards -->
            <div
              v-for="(question, index) in activeQuestions"
              :key="question.path"
              class="step-row-wrapper"
            >
              <!-- Timeline left indicator -->
              <div class="step-timeline-indicator">
                <div class="step-badge-pill">
                  {{ String(index + 1).padStart(2, '0') }}
                </div>
                <div v-if="index < activeQuestions.length - 1" class="timeline-vertical-line"></div>
              </div>

              <!-- Question Card -->
              <div
                class="step-card"
                :class="{ completed: isLessonCompleted(question.path) }"
                @click="navigateTo(question.path)"
              >
                <div class="step-card-header">
                  <div class="tags-group">
                    <span class="subtopic-tag">{{ question.subtopic.replace(/^\d+\.\d+\s*/, '') }}</span>
                    <span class="company-tag">Asked at {{ getCompanyTag(question.title) }}</span>
                    <span v-if="isLessonCompleted(question.path)" class="completed-tag">
                      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      Mastered
                    </span>
                  </div>

                  <div class="card-top-actions">
                    <!-- Bookmark button -->
                    <button
                      class="card-action-icon-btn"
                      :class="{ active: isFavorite(question.path) }"
                      :title="isFavorite(question.path) ? 'Saved' : 'Bookmark'"
                      @click="onToggleFavorite(question.path, $event)"
                    >
                      <svg v-if="isFavorite(question.path)" viewBox="0 0 24 24" width="15" height="15" fill="#FBBF24">
                        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                      </svg>
                      <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                      </svg>
                    </button>
                  </div>
                </div>

                <h3 class="step-card-title">
                  {{ question.title }}
                </h3>

                <p class="step-card-summary">
                  {{ question.summary }}
                </p>

                <div class="step-card-footer">
                  <button class="read-btn" @click.stop="navigateTo(question.path)">
                    <span>Read Full Answer</span>
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>

                  <button
                    class="mark-complete-btn"
                    :class="{ done: isLessonCompleted(question.path) }"
                    @click="onToggleComplete(question.path, $event)"
                  >
                    <svg v-if="isLessonCompleted(question.path)" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>{{ isLessonCompleted(question.path) ? 'Completed' : 'Mark as Done' }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- Modals -->
    <SearchModal ref="searchModalRef" />
    <WalkthroughGuide ref="walkthroughRef" />
    <DiagnosticModal v-if="showDiagnosticModal" @close="showDiagnosticModal = false" />
    <FlashcardModal v-if="showFlashcardModal" @close="showFlashcardModal = false" />
    <QuizModal v-if="showQuizModal" @close="showQuizModal = false" />
    <SyncModal v-if="showSyncModal" @close="showSyncModal = false" />
  </div>
</template>

<style scoped>
/* ==========================================================================
   Wiki Portal Layout & Modern Styling (Easy on the eyes, active, minimal)
   ========================================================================== */

.wiki-portal-container {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--canvas-bg);
  color: var(--text-primary);
  font-family: var(--vp-font-family-base);
}

/* ─── Top Header ────────────────────────────────────────────────────────── */
.portal-header {
  position: sticky;
  top: 0;
  z-index: 50;
  height: 60px;
  background: var(--surface-panel);
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
}

.header-left {
  display: flex;
  align-items: center;
}

.portal-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
  text-decoration: none;
}

.spark-logo-icon {
  flex-shrink: 0;
}

.portal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.01em;
}

.portal-badge {
  font-size: 11px;
  font-weight: 600;
  background: var(--accent-orange-soft);
  color: var(--accent-orange-dark);
  padding: 2px 7px;
  border-radius: 9999px;
}

.header-center {
  flex: 1;
  max-width: 480px;
  margin: 0 20px;
}

.portal-search-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--capsule-container);
  border: 1px solid var(--border-subtle);
  padding: 8px 14px;
  border-radius: 8px;
  color: var(--text-muted);
  font-size: 13.5px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.portal-search-trigger:hover {
  background: var(--surface-panel);
  border-color: var(--accent-orange);
  color: var(--text-primary);
}

.search-hint {
  flex: 1;
  text-align: left;
}

.search-kbd {
  font-size: 10.5px;
  font-family: var(--vp-font-family-mono);
  background: var(--surface-panel);
  border: 1px solid var(--border-subtle);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-secondary);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.streak-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-orange-soft);
  border: 1px solid rgba(249, 115, 22, 0.3);
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-orange-dark);
}

.tool-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--capsule-container);
  border: 1px solid var(--border-subtle);
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: var(--card-hover);
  border-color: var(--border-medium);
  color: var(--text-primary);
}

.icon-link-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: var(--capsule-container);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s ease;
}

.icon-link-btn:hover {
  background: var(--accent-orange-soft);
  color: var(--accent-orange-dark);
  border-color: var(--accent-orange);
}

/* ─── Body Layout: Left Sidebar + Main Active Workspace ────────────────── */
.portal-body {
  display: flex;
  flex: 1;
}

/* ─── Left Sidebar Navigation ───────────────────────────────────────────── */
.portal-sidebar {
  width: 310px;
  flex-shrink: 0;
  background: var(--surface-panel);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  height: calc(100vh - 60px);
  position: sticky;
  top: 60px;
}

.sidebar-search-box {
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
}

.sidebar-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: var(--text-primary);
}

.sidebar-input::placeholder {
  color: var(--text-muted);
}

.sidebar-nav-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nav-section-title {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
  padding: 14px 12px 6px;
}

.nav-item-single {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--text-secondary);
}

.nav-item-single:hover {
  background: var(--capsule-container);
  color: var(--text-primary);
}

.nav-item-single.active {
  background: var(--accent-orange-soft);
  color: var(--accent-orange-dark);
  font-weight: 600;
}

.nav-item-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.nav-item-info {
  flex: 1;
}

.nav-item-title {
  font-size: 13.5px;
}

.nav-count-badge {
  font-size: 11px;
  font-weight: 600;
  background: var(--capsule-container);
  padding: 2px 7px;
  border-radius: 9999px;
  color: var(--text-muted);
}

/* Track Group in Sidebar */
.track-group {
  margin-bottom: 3px;
}

.track-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--text-secondary);
}

.track-item-header:hover {
  background: var(--capsule-container);
  color: var(--text-primary);
}

.track-item-header.active {
  background: var(--accent-orange-soft);
  color: var(--accent-orange-dark);
  font-weight: 600;
}

.track-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.track-code-badge {
  font-size: 10px;
  font-family: var(--vp-font-family-mono);
  font-weight: 700;
  background: var(--capsule-container);
  border: 1px solid var(--border-subtle);
  padding: 1px 5px;
  border-radius: 4px;
}

.track-name {
  font-size: 13.5px;
}

.track-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.track-count-pill {
  font-size: 11px;
  color: var(--text-muted);
}

.expand-caret-btn {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--text-muted);
  display: flex;
  align-items: center;
}

.caret-icon {
  transition: transform 0.2s ease;
}

.caret-icon.rotated {
  transform: rotate(180deg);
}

/* Subtopics List inside Track */
.subtopics-list {
  padding-left: 20px;
  margin-top: 2px;
  margin-bottom: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.subtopic-item-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 6px 10px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.subtopic-item-btn:hover {
  background: var(--capsule-container);
  color: var(--text-primary);
}

.subtopic-item-btn.active {
  background: var(--surface-panel);
  border: 1px solid var(--border-subtle);
  color: var(--accent-orange-dark);
  font-weight: 600;
}

.subtopic-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--border-medium);
  flex-shrink: 0;
}

.subtopic-item-btn.active .subtopic-dot {
  background: var(--accent-orange);
}

.subtopic-title {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subtopic-badge {
  font-size: 10.5px;
  color: var(--text-muted);
}

/* ─── Right Main Content ────────────────────────────────────────────────── */
.portal-main {
  flex: 1;
  padding: 28px 36px 80px;
  max-width: 980px;
  margin: 0 auto;
  overflow-y: auto;
}

/* Overview Layout */
.overview-hero-card {
  background: var(--surface-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 32px 36px;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.hero-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--accent-orange-dark);
  margin-bottom: 10px;
}

.hero-title {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.25;
  margin-bottom: 12px;
  letter-spacing: -0.02em;
}

.hero-subtitle {
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-secondary);
  max-width: 720px;
  margin-bottom: 24px;
}

.hero-stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding-top: 20px;
  border-top: 1px solid var(--border-subtle);
}

.stat-box {
  display: flex;
  flex-direction: column;
}

.stat-number {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
}

.stat-label {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Spaced Repetition Due Alert */
.srs-alert-card {
  background: var(--accent-orange-soft);
  border: 1px solid rgba(249, 115, 22, 0.3);
  border-radius: 12px;
  padding: 14px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 28px;
}

.srs-alert-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.srs-bell-icon {
  color: var(--accent-orange);
}

.srs-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--accent-orange-dark);
}

.srs-desc {
  font-size: 12.5px;
  color: var(--text-secondary);
}

.srs-review-btn {
  background: var(--accent-orange);
  color: #FFFFFF;
  border: none;
  padding: 7px 14px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.srs-review-btn:hover {
  background: var(--accent-orange-dark);
}

/* Tracks Grid in Overview */
.overview-tracks-section {
  margin-top: 16px;
}

.section-heading-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 16px;
}

.section-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
}

.section-sub {
  font-size: 13px;
  color: var(--text-muted);
}

.tracks-cards-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.track-display-card {
  background: var(--surface-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 22px;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.track-display-card:hover {
  border-color: var(--accent-orange);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.05);
}

.track-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.card-track-code {
  font-size: 11px;
  font-family: var(--vp-font-family-mono);
  font-weight: 700;
  color: var(--accent-orange-dark);
  background: var(--accent-orange-soft);
  padding: 2px 7px;
  border-radius: 4px;
}

.card-track-count {
  font-size: 12px;
  color: var(--text-muted);
}

.track-card-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.track-card-desc {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-secondary);
  flex: 1;
  margin-bottom: 18px;
}

.track-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.progress-wrap {
  flex: 1;
}

.progress-bar-track {
  height: 6px;
  background: var(--capsule-container);
  border-radius: 9999px;
  overflow: hidden;
  margin-bottom: 4px;
}

.progress-bar-fill {
  height: 100%;
  background: var(--accent-orange);
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.progress-text {
  font-size: 11px;
  color: var(--text-muted);
}

.track-open-btn {
  background: var(--capsule-container);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.track-display-card:hover .track-open-btn {
  background: var(--accent-orange);
  border-color: var(--accent-orange);
  color: #FFFFFF;
}

/* ─── Active Track / Subtopic View ──────────────────────────────────────── */
.workspace-header-card {
  background: var(--surface-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 26px 30px;
  margin-bottom: 28px;
}

.workspace-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.breadcrumbs-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-muted);
}

.crumb-link {
  cursor: pointer;
  color: var(--text-secondary);
}

.crumb-link:hover {
  color: var(--accent-orange-dark);
}

.crumb-sep {
  color: var(--border-medium);
}

.crumb-active {
  color: var(--text-primary);
  font-weight: 600;
}

.crumb-sub {
  color: var(--accent-orange-dark);
  font-weight: 600;
}

.open-wiki-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--accent-orange);
  border: none;
  color: #FFFFFF;
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(249, 115, 22, 0.25);
  transition: all 0.2s ease;
}

.open-wiki-btn:hover {
  background: var(--accent-orange-dark);
  transform: translateY(-1px);
}

.workspace-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.workspace-main-title {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.015em;
}

.workspace-count-pill {
  font-size: 12px;
  font-weight: 600;
  background: var(--capsule-container);
  border: 1px solid var(--border-subtle);
  padding: 2px 8px;
  border-radius: 9999px;
  color: var(--text-secondary);
}

.workspace-desc {
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 18px;
}

.subtopic-pills-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--border-subtle);
}

.sub-pill {
  background: var(--capsule-container);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 12.5px;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sub-pill:hover {
  background: var(--surface-panel);
  color: var(--text-primary);
  border-color: var(--border-medium);
}

.sub-pill.active {
  background: var(--accent-orange-soft);
  border-color: var(--accent-orange);
  color: var(--accent-orange-dark);
  font-weight: 600;
}

/* ─── Step Cards Sequence Flow (Kirrivan Style - Image 1) ───────────────── */
.sequence-step-flow {
  display: flex;
  flex-direction: column;
}

.empty-state-card {
  background: var(--surface-panel);
  border: 1px dashed var(--border-medium);
  border-radius: 12px;
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
}

.empty-state-card h3 {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 12px 0 6px;
}

.step-row-wrapper {
  display: flex;
  gap: 18px;
  position: relative;
}

.step-timeline-indicator {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 36px;
  flex-shrink: 0;
}

.step-badge-pill {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: var(--surface-panel);
  border: 2px solid var(--border-medium);
  font-family: var(--vp-font-family-mono);
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.04);
}

.step-row-wrapper:hover .step-badge-pill {
  border-color: var(--accent-orange);
  color: var(--accent-orange);
}

.timeline-vertical-line {
  flex: 1;
  width: 2px;
  background: var(--border-subtle);
  margin: 6px 0;
}

/* Step Card Body */
.step-card {
  flex: 1;
  background: var(--surface-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 18px 22px;
  margin-bottom: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.step-card:hover {
  border-color: var(--accent-orange);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.05);
}

.step-card.completed {
  border-left: 3px solid var(--accent-mint);
}

.step-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.tags-group {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.subtopic-tag {
  font-size: 11px;
  font-weight: 600;
  background: var(--capsule-container);
  color: var(--text-secondary);
  padding: 2px 7px;
  border-radius: 4px;
}

.company-tag {
  font-size: 11px;
  font-weight: 600;
  background: rgba(14, 165, 233, 0.1);
  color: #0284C7;
  padding: 2px 7px;
  border-radius: 4px;
}

.completed-tag {
  font-size: 11px;
  font-weight: 600;
  background: var(--accent-mint-bg);
  color: var(--accent-mint);
  padding: 2px 7px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.card-top-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.card-action-icon-btn {
  background: none;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-muted);
  transition: all 0.15s ease;
}

.card-action-icon-btn:hover {
  background: var(--capsule-container);
  color: var(--text-primary);
  border-color: var(--border-medium);
}

.card-action-icon-btn.active {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.4);
  color: #D97706;
}

.step-card-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.4;
  margin-bottom: 8px;
}

.step-card-summary {
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-secondary);
  margin-bottom: 14px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.step-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}

.read-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: var(--accent-orange-dark);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.read-btn:hover {
  text-decoration: underline;
}

.mark-complete-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: var(--capsule-container);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 500;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mark-complete-btn:hover {
  background: var(--surface-panel);
  color: var(--text-primary);
  border-color: var(--border-medium);
}

.mark-complete-btn.done {
  background: var(--accent-mint-bg);
  border-color: rgba(16, 185, 129, 0.3);
  color: var(--accent-mint);
  font-weight: 600;
}

/* ─── Responsive Media Queries ─────────────────────────────────────────── */
@media (max-width: 900px) {
  .portal-sidebar {
    display: none;
  }
  .portal-main {
    padding: 20px;
  }
  .tracks-cards-grid {
    grid-template-columns: 1fr;
  }
  .hero-stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
