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

// Master tracks metadata
const tracksMetadata = [
  {
    id: '1. Fundamentals',
    name: 'Fundamentals',
    code: '01',
    count: 70,
    subtitle: 'Core Spark Architecture, RDDs, DataFrames, SparkSession, Lazy Evaluation & Transformations.',
    icon: 'book'
  },
  {
    id: '2. Intermediate',
    name: 'Intermediate',
    code: '02',
    count: 77,
    subtitle: 'Joins, Window Functions, Complex Types, Regex, UDFs, Date/Time & File Formats.',
    icon: 'zap'
  },
  {
    id: '3. Advanced',
    name: 'Advanced',
    code: '03',
    count: 68,
    subtitle: 'Catalyst Optimizer, Shuffling, AQE, Join Strategies, Caching & Data Skew Remediation.',
    icon: 'rocket'
  },
  {
    id: '4. Senior Dev',
    name: 'Senior Dev',
    code: '04',
    count: 50,
    subtitle: 'Memory Management, OOM Debugging, Spark UI Analysis, Structured Streaming & Lakehouse.',
    icon: 'award'
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
  <div class="app-viewport-root">
    <!-- ═════════════════════════════════════════════════════════════════
         FULL 1920 CANVAS: Icon Rail + Secondary Panel + Main Workspace
         ═════════════════════════════════════════════════════════════════ -->
    <div class="app-workspace-body">
      <!-- 1. Slim Left Icon Rail (Kirrivan far left strip, 60px) -->
      <nav class="icon-rail">
        <!-- Streak Indicator in Rail -->
        <div class="rail-streak-badge" :title="`Study Streak: ${studyStreak.currentStreak} days active`">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="#2563EB">
            <path d="M12 0c-.28 0-.5.22-.5.5 0 2.24-1.32 3.63-2.6 4.98C7.54 6.89 6 8.52 6 11.5c0 3.59 2.91 6.5 6.5 6.5s6.5-2.91 6.5-6.5c0-4.08-3.08-6.19-5.58-8.75C12.74 2.05 12.08 1.13 12 0zm0 15c-1.93 0-3.5-1.57-3.5-3.5 0-1.3.7-2.31 1.6-3.3.8-1 1.9-2.12 1.9-4.2 1.34 1.5 3.5 3.32 3.5 6 0 2.76-1.57 5-3.5 5z"/>
          </svg>
          <span class="rail-streak-num">{{ studyStreak.currentStreak > 0 ? `${studyStreak.currentStreak}d` : '1d' }}</span>
        </div>

        <button
          class="rail-btn"
          :class="{ active: activeView.startsWith('1.') || activeView.startsWith('2.') || activeView.startsWith('3.') || activeView.startsWith('4.') || activeView === 'overview' }"
          title="Curriculum Tracks"
          @click="selectTrack('1. Fundamentals')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
          </svg>
        </button>

        <button
          class="rail-btn"
          :class="{ active: activeView === 'bookmarked' }"
          title="Saved Bookmarks"
          @click="selectTrack('bookmarked')"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
        </button>

        <button
          class="rail-btn"
          title="5-Min Diagnostic Test"
          @click="showDiagnosticModal = true"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <circle cx="12" cy="12" r="6"></circle>
          </svg>
        </button>

        <button
          class="rail-btn"
          title="Flashcards Spaced Repetition"
          @click="showFlashcardModal = true"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
        </button>

        <button
          class="rail-btn"
          title="Scenario Architecture Quiz"
          @click="showQuizModal = true"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
        </button>

        <div class="rail-spacer"></div>

        <button
          class="rail-btn"
          title="Data Sync & Backup"
          @click="showSyncModal = true"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </nav>

      <!-- 2. Secondary Left Panel (Kirrivan "Create Sequence" panel, 340px) -->
      <aside class="sequence-nav-panel">
        <div class="panel-header-top">
          <button class="back-link-btn" @click="selectTrack('overview')">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
            <span>Back</span>
          </button>
          <h2 class="panel-main-heading">Choose Track</h2>
        </div>

        <!-- Search Input -->
        <div class="panel-search-wrap">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            v-model="sidebarQuery"
            type="text"
            placeholder="Search sequence or topic..."
            class="panel-search-input"
          />
        </div>

        <!-- Selectable Sequence Cards (Exact Kirrivan visual format) -->
        <div class="sequence-list-scroll">
          <div class="section-micro-heading">Core Learning Tracks</div>

          <!-- 4 Pre-made Track Cards -->
          <div
            v-for="track in tracksMetadata"
            :key="track.id"
            class="sequence-selector-card"
            :class="{ selected: activeView === track.id }"
            @click="selectTrack(track.id as ViewType)"
          >
            <div class="seq-card-icon-box">
              <svg v-if="track.code === '01'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path>
              </svg>
              <svg v-else-if="track.code === '02'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
              </svg>
              <svg v-else-if="track.code === '03'" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"></path>
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"></path>
              </svg>
              <svg v-else viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="8" r="7"></circle>
                <polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline>
              </svg>
            </div>

            <div class="seq-card-details">
              <div class="seq-card-title-row">
                <span class="seq-card-title">{{ track.id.replace(/^\d+\.\s*/, '') }}</span>
                <span class="seq-card-count">{{ track.count }} topics</span>
              </div>
              <p class="seq-card-subtitle">{{ track.subtitle }}</p>
            </div>
          </div>

          <!-- Subtopics Accordion under Active Track -->
          <div v-if="currentSubtopics.length > 0" class="subtopics-tree-section">
            <div class="section-micro-heading">Subtopic Modules</div>
            <button
              class="subtopic-link-row"
              :class="{ active: selectedSubtopic === 'all' }"
              @click="selectSubtopic('all')"
            >
              <span class="dot-indicator"></span>
              <span class="subtopic-name">All {{ currentTrackMeta?.name }}</span>
              <span class="subtopic-count">{{ currentTrackMeta?.count }}</span>
            </button>

            <button
              v-for="sub in currentSubtopics"
              :key="sub.name"
              class="subtopic-link-row"
              :class="{ active: selectedSubtopic === sub.name }"
              @click="selectSubtopic(sub.name)"
            >
              <span class="dot-indicator"></span>
              <span class="subtopic-name">{{ sub.name.replace(/^\d+\.\d+\s*/, '') }}</span>
              <span class="subtopic-count">{{ sub.count }}</span>
            </button>
          </div>
        </div>
      </aside>

      <!-- 3. Main Workspace Area (Fills 1920 Screen Canvas, Pure White #FFFFFF) -->
      <main class="main-canvas-area">
        <!-- ─── CASE A: OVERVIEW DASHBOARD ─── -->
        <div v-if="activeView === 'overview'" class="canvas-overview-wrap">
          <div class="overview-header-row">
            <div>
              <h1 class="canvas-big-title">Platform Preview</h1>
              <p class="canvas-big-subtitle">265 curated production questions, real-world failure scenarios, and interview playbooks.</p>
            </div>
          </div>

          <div class="hero-stats-banner">
            <div class="hero-stat-card">
              <span class="hero-stat-val">265</span>
              <span class="hero-stat-lbl">Total Questions</span>
            </div>
            <div class="hero-stat-card">
              <span class="hero-stat-val">{{ completedLessons.length }}</span>
              <span class="hero-stat-lbl">Lessons Mastered</span>
            </div>
            <div class="hero-stat-card">
              <span class="hero-stat-val">{{ overallReadiness }}%</span>
              <span class="hero-stat-lbl">Interview Readiness</span>
            </div>
            <div class="hero-stat-card">
              <span class="hero-stat-val">{{ studyStreak.currentStreak }}d</span>
              <span class="hero-stat-lbl">Study Streak</span>
            </div>
          </div>

          <!-- Spaced Repetition Due Banner -->
          <div v-if="dueReviews.length > 0" class="srs-due-card">
            <div class="srs-card-left">
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563EB" stroke-width="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
              </svg>
              <div>
                <h4 class="srs-card-title">{{ dueReviews.length }} Topic{{ dueReviews.length > 1 ? 's' : '' }} Due for Review Today</h4>
                <p class="srs-card-sub">Ebbinghaus spaced repetition indicates memory decay on these questions.</p>
              </div>
            </div>
            <button class="srs-card-btn" @click="showFlashcardModal = true">
              Review Due Cards &rarr;
            </button>
          </div>

          <!-- Track Grid -->
          <div class="canvas-section-header">Select a Master Track to begin</div>
          <div class="tracks-full-grid">
            <div
              v-for="track in tracksMetadata"
              :key="track.id"
              class="track-hero-box"
              @click="selectTrack(track.id as ViewType)"
            >
              <div class="hero-box-top">
                <span class="hero-box-tag">TRACK {{ track.code }}</span>
                <span class="hero-box-count">{{ track.count }} Questions</span>
              </div>
              <h3 class="hero-box-title">{{ track.name }}</h3>
              <p class="hero-box-desc">{{ track.subtitle }}</p>
              <div class="hero-box-bottom">
                <div class="progress-bar-bg">
                  <div
                    class="progress-bar-val"
                    :style="{ width: `${getTrackProgress(track.id).percent}%` }"
                  ></div>
                </div>
                <span class="progress-status-lbl">{{ getTrackProgress(track.id).percent }}% complete</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ─── CASE B: SELECTED TRACK / TOPIC (Kirrivan Preview Flow) ─── -->
        <div v-else class="canvas-sequence-wrap">
          <!-- Canvas Header (Exact Kirrivan title + orange action button) -->
          <div class="preview-header-bar">
            <div class="preview-title-block">
              <h1 class="preview-heading">
                {{ selectedSubtopic !== 'all' ? selectedSubtopic : (currentTrackMeta ? currentTrackMeta.name : (activeView === 'bookmarked' ? 'Saved Questions' : 'Mastered Lessons')) }}
              </h1>
              <p class="preview-subtext">
                {{ currentTrackMeta ? currentTrackMeta.subtitle : 'Personal collection of PySpark interview concepts and architectural patterns.' }}
              </p>
              <div class="preview-meta-row">
                <span class="meta-item">{{ activeQuestions.length }} lessons</span>
                <span class="meta-dot">&bull;</span>
                <span class="meta-item">{{ currentTrackMeta ? `${getTrackProgress(currentTrackMeta.id).completed} of ${currentTrackMeta.count} completed` : `${activeQuestions.length} questions` }}</span>
              </div>
            </div>

            <button
              v-if="activeQuestions.length > 0"
              class="open-builder-btn"
              @click="openFirstLessonInView"
            >
              Open in Wiki Reader &rarr;
            </button>
          </div>

          <!-- Connected Step Cards Flow (Kirrivan Timeline Layout) -->
          <div class="connected-timeline-container">
            <div v-if="activeQuestions.length === 0" class="empty-state-notice">
              <p>No questions found matching your filter.</p>
            </div>

            <div
              v-for="(question, index) in activeQuestions"
              :key="question.path"
              class="timeline-step-row"
            >
              <!-- Step Pill & Vertical Connected Line -->
              <div class="timeline-gutter">
                <div class="step-counter-pill">
                  Lesson {{ index + 1 }}
                </div>
                <div v-if="index < activeQuestions.length - 1" class="connecting-line"></div>
              </div>

              <!-- Question Step Card (Stretches across wide canvas) -->
              <div
                class="kirrivan-step-card"
                :class="{ completed: isLessonCompleted(question.path) }"
                @click="navigateTo(question.path)"
              >
                <div class="step-card-top-row">
                  <div class="step-card-badges">
                    <span class="badge-subtopic">{{ question.subtopic.replace(/^\d+\.\d+\s*/, '') }}</span>
                    <span class="badge-company">Asked at {{ getCompanyTag(question.title) }}</span>
                    <span v-if="isLessonCompleted(question.path)" class="badge-done">
                      <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="3">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      Completed
                    </span>
                  </div>

                  <button
                    class="bookmark-icon-btn"
                    :class="{ active: isFavorite(question.path) }"
                    :title="isFavorite(question.path) ? 'Saved' : 'Bookmark'"
                    @click="onToggleFavorite(question.path, $event)"
                  >
                    <svg v-if="isFavorite(question.path)" viewBox="0 0 24 24" width="16" height="16" fill="#F59E0B">
                      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                    </svg>
                    <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                  </button>
                </div>

                <h3 class="step-card-question-title">
                  {{ question.title }}
                </h3>

                <p class="step-card-preview-text">
                  {{ question.summary }}
                </p>

                <div class="step-card-bottom-actions">
                  <button class="step-read-action-btn" @click.stop="navigateTo(question.path)">
                    <span>Read Answer</span>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                      <polyline points="9 18 15 12 9 6"></polyline>
                    </svg>
                  </button>

                  <button
                    class="step-complete-toggle-btn"
                    :class="{ done: isLessonCompleted(question.path) }"
                    @click="onToggleComplete(question.path, $event)"
                  >
                    <svg v-if="isLessonCompleted(question.path)" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="20 6 9 17 4 12"></polyline>
                    </svg>
                    <span>{{ isLessonCompleted(question.path) ? 'Completed' : 'Mark as done' }}</span>
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
   Full 1920x1080 Kirrivan Screen Layout | Pure White Background (#FFFFFF)
   Font: Open Sans (Google Fonts) | Code: Cabin
   ========================================================================== */

.app-viewport-root {
  width: 100vw;
  max-width: 100%;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--canvas-bg);
  color: var(--text-primary);
  font-family: 'Jost', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  overflow-x: hidden;
}

/* ─── Rail Streak Badge ─────────────────────────────────────────────────── */
.rail-streak-badge {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: var(--accent-brand-soft);
  border: 1px solid var(--accent-blue-border);
  margin-bottom: 8px;
  cursor: pointer;
}

.rail-streak-num {
  font-size: 10px;
  font-weight: 700;
  color: var(--accent-brand-dark);
}

/* ─── Body Layout: Icon Rail + Secondary Panel + Main Canvas ────────────── */
.app-workspace-body {
  display: flex;
  width: 100vw;
  max-width: 100%;
  flex: 1;
  min-height: calc(100vh - 56px);
  background: var(--canvas-bg);
}

/* 1. Slim Left Icon Rail (60px) */
.icon-rail {
  width: 60px;
  min-width: 60px;
  background: var(--surface-panel);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 18px 0;
  gap: 8px;
  flex-shrink: 0;
}

.rail-btn {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
}

.rail-btn:hover {
  background: var(--card-hover);
  color: var(--text-primary);
}

.rail-btn.active {
  background: var(--accent-brand-soft);
  color: var(--accent-brand);
}

.rail-btn.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 10px;
  bottom: 10px;
  width: 3px;
  background: #2563EB;
  border-radius: 0 4px 4px 0;
}

.rail-spacer {
  flex: 1;
}

/* 2. Secondary Left Sequence Panel (340px) */
.sequence-nav-panel {
  width: 340px;
  min-width: 340px;
  background: var(--surface-panel);
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  height: calc(100vh - 56px);
  position: sticky;
  top: 56px;
}

.panel-header-top {
  padding: 20px 20px 12px;
}

.back-link-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: #6B7280;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  padding: 0;
  margin-bottom: 8px;
}

.back-link-btn:hover {
  color: #111827;
}

.panel-main-heading {
  font-size: 20px;
  font-weight: 700;
  color: #111827;
  letter-spacing: -0.015em;
}

.panel-search-wrap {
  margin: 0 20px 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  background: #FFFFFF;
  border: 1px solid #D1D5DB;
  border-radius: 8px;
  padding: 8px 12px;
  color: #9CA3AF;
}

.panel-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 13px;
  color: #111827;
}

.panel-search-input::placeholder {
  color: #9CA3AF;
}

.sequence-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 0 16px 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-micro-heading {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #6B7280;
  padding: 10px 4px 6px;
}

/* Kirrivan Selectable Sequence Cards */
.sequence-selector-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 10px;
  padding: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.sequence-selector-card:hover {
  border-color: #CBD5E1;
  background: #F9FAFB;
}

.sequence-selector-card.selected {
  border: 1.5px solid #2563EB;
  background: #FFFFFF;
  box-shadow: 0 0 0 1px #2563EB, 0 2px 6px rgba(37, 99, 235, 0.08);
}

.seq-card-icon-box {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  background: #F3F4F6;
  color: #4B5563;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sequence-selector-card.selected .seq-card-icon-box {
  background: #EFF6FF;
  color: #2563EB;
}

.seq-card-details {
  flex: 1;
}

.seq-card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.seq-card-title {
  font-size: 14px;
  font-weight: 700;
  color: #111827;
}

.seq-card-count {
  font-size: 11px;
  color: #6B7280;
}

.seq-card-subtitle {
  font-size: 12px;
  line-height: 1.45;
  color: #4B5563;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Subtopics tree */
.subtopics-tree-section {
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid #E5E7EB;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.subtopic-link-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  padding: 7px 10px;
  border-radius: 6px;
  font-size: 13px;
  color: #4B5563;
  cursor: pointer;
  transition: all 0.15s ease;
}

.subtopic-link-row:hover {
  background: #F3F4F6;
  color: #111827;
}

.subtopic-link-row.active {
  background: #EFF6FF;
  color: #2563EB;
  font-weight: 600;
}

.dot-indicator {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #D1D5DB;
  flex-shrink: 0;
}

.subtopic-link-row.active .dot-indicator {
  background: #2563EB;
}

.subtopic-name {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.subtopic-count {
  font-size: 11px;
  color: #6B7280;
}

/* 3. Main Workspace Canvas (Fills 1920 Screen Canvas, Pure White #FFFFFF) */
.main-canvas-area {
  flex: 1;
  width: calc(100% - 400px);
  max-width: none !important;
  margin: 0 !important;
  padding: 36px 56px 80px;
  background: #FFFFFF;
  overflow-y: auto;
}

/* Overview inside canvas */
.canvas-overview-wrap {
  width: 100%;
}

.canvas-big-title {
  font-size: 28px;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.02em;
  margin-bottom: 6px;
}

.canvas-big-subtitle {
  font-size: 15px;
  color: #4B5563;
  margin-bottom: 24px;
}

.hero-stats-banner {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 28px;
}

.hero-stat-card {
  background: #FFFFFF;
  border: 1px solid #E5E7EB;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.hero-stat-val {
  display: block;
  font-size: 26px;
  font-weight: 800;
  color: #111827;
}

.hero-stat-lbl {
  font-size: 13px;
  color: #6B7280;
  margin-top: 4px;
}

.srs-due-card {
  background: var(--accent-blue-soft);
  border: 1px solid var(--accent-blue-border);
  border-radius: 12px;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 32px;
}

.srs-card-left {
  display: flex;
  align-items: center;
  gap: 14px;
}

.srs-card-title {
  font-size: 15px;
  font-weight: 700;
  color: #1D4ED8;
  margin-bottom: 2px;
}

.srs-card-sub {
  font-size: 13px;
  color: var(--text-secondary);
}

.srs-card-btn {
  background: #2563EB;
  border: none;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.srs-card-btn:hover {
  background: #1D4ED8;
}

.canvas-section-header {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 16px;
}

.tracks-full-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.track-hero-box {
  background: var(--card-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 24px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.track-hero-box:hover {
  border-color: #2563EB;
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.08);
}

.hero-box-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.hero-box-tag {
  font-size: 11px;
  font-family: 'Cabin', monospace;
  font-weight: 700;
  color: #2563EB;
  background: var(--accent-blue-soft);
  padding: 2px 7px;
  border-radius: 4px;
}

.hero-box-count {
  font-size: 12px;
  color: var(--text-muted);
}

.hero-box-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.hero-box-desc {
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--text-secondary);
  margin-bottom: 20px;
}

.hero-box-bottom {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar-bg {
  flex: 1;
  height: 6px;
  background: var(--capsule-container);
  border-radius: 9999px;
  overflow: hidden;
}

.progress-bar-val {
  height: 100%;
  background: #2563EB;
  border-radius: 9999px;
}

.progress-status-lbl {
  font-size: 12px;
  color: var(--text-muted);
}

/* ─── Selected Track: Kirrivan Preview Flow ─────────────────────────────── */
.canvas-sequence-wrap {
  width: 100%;
}

.preview-header-bar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 32px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border-subtle);
}

.preview-title-block {
  flex: 1;
}

.preview-heading {
  font-size: 26px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: -0.015em;
  margin-bottom: 6px;
}

.preview-subtext {
  font-size: 14.5px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 10px;
}

.preview-meta-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-muted);
}

.meta-dot {
  color: var(--border-medium);
}

/* Kirrivan Blue Button "Open builder" */
.open-builder-btn {
  background: #2563EB;
  border: none;
  color: #FFFFFF;
  font-size: 13.5px;
  font-weight: 600;
  padding: 10px 20px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  transition: all 0.2s ease;
}

.open-builder-btn:hover {
  background: #1D4ED8;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
}

/* Connected Step Cards Flow (Kirrivan Timeline Layout) */
.connected-timeline-container {
  display: flex;
  flex-direction: column;
  width: 100%;
}

.empty-state-notice {
  padding: 40px;
  text-align: center;
  color: var(--text-muted);
  border: 1px dashed var(--border-medium);
  border-radius: 12px;
}

.timeline-step-row {
  display: flex;
  gap: 24px;
  width: 100%;
}

/* Left Gutter: Pill badge + Vertical Connecting Track */
.timeline-gutter {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 80px;
  flex-shrink: 0;
}

.step-counter-pill {
  min-width: 76px;
  height: 28px;
  padding: 0 10px;
  background: #1E242B;
  color: #FFFFFF;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  letter-spacing: 0.02em;
  white-space: nowrap;
  z-index: 2;
}

.connecting-line {
  flex: 1;
  width: 2px;
  background: var(--border-subtle);
  margin: 6px 0;
}

/* Kirrivan Step Card (Stretches across full wide canvas) */
.kirrivan-step-card {
  flex: 1;
  background: var(--card-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 22px 28px;
  margin-bottom: 22px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.kirrivan-step-card:hover {
  border-color: #2563EB;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.08);
}

.kirrivan-step-card.completed {
  border-left: 4px solid #10B981;
}

.step-card-top-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.step-card-badges {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.badge-subtopic {
  font-size: 11px;
  font-weight: 600;
  background: #F3F4F6;
  color: #4B5563;
  padding: 2px 8px;
  border-radius: 4px;
}

.badge-company {
  font-size: 11px;
  font-weight: 600;
  background: #EFF6FF;
  color: #2563EB;
  padding: 2px 8px;
  border-radius: 4px;
}

.badge-done {
  font-size: 11px;
  font-weight: 600;
  background: rgba(16, 185, 129, 0.12);
  color: #10B981;
  padding: 2px 8px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.bookmark-icon-btn {
  background: none;
  border: 1px solid #E5E7EB;
  border-radius: 6px;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #6B7280;
  transition: all 0.15s ease;
}

.bookmark-icon-btn:hover {
  background: #F9FAFB;
  border-color: #D1D5DB;
  color: #111827;
}

.bookmark-icon-btn.active {
  background: #FEF3C7;
  border-color: #FCD34D;
  color: #D97706;
}

.step-card-question-title {
  font-size: 17px;
  font-weight: 700;
  color: #111827;
  line-height: 1.4;
  margin-bottom: 8px;
}

.step-card-preview-text {
  font-size: 14px;
  line-height: 1.6;
  color: #4B5563;
  margin-bottom: 16px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.step-card-bottom-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 14px;
  border-top: 1px solid #F3F4F6;
}

.step-read-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  color: #2563EB;
  font-size: 13.5px;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}

.step-read-action-btn:hover {
  text-decoration: underline;
}

.step-complete-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: #F3F4F6;
  border: 1px solid #E5E7EB;
  color: #4B5563;
  font-size: 12.5px;
  font-weight: 500;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.step-complete-toggle-btn:hover {
  background: #FFFFFF;
  color: #111827;
  border-color: #D1D5DB;
}

.step-complete-toggle-btn.done {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.3);
  color: #059669;
  font-weight: 600;
}

@media (max-width: 1024px) {
  .sequence-nav-panel {
    display: none;
  }
  .main-canvas-area {
    width: calc(100% - 60px);
    padding: 24px;
  }
  .tracks-full-grid {
    grid-template-columns: 1fr;
  }
  .hero-stats-banner {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
