<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue'
import { useRoute, useRouter } from 'vitepress'
import confetti from 'canvas-confetti'
import {
  isLessonCompleted,
  toggleLessonCompletion,
  isFavorite,
  toggleFavorite,
  resolveUrl,
  normalizePath,
  scheduleSRSReview,
  recordStudyActivity
} from './storage'
import searchIndexData from '../../search-index.json'

const route = useRoute()
const router = useRouter()

const completed = ref(false)
const favorited = ref(false)
const srsGraded = ref(false)

function checkState() {
  const currentPath = route.path
  completed.value = isLessonCompleted(currentPath)
  favorited.value = isFavorite(currentPath)
  srsGraded.value = false
}

onMounted(() => {
  checkState()
  recordStudyActivity()
})

watch(() => route.path, () => {
  checkState()
  recordStudyActivity()
})

function onToggleCompletion() {
  const nowCompleted = toggleLessonCompletion(route.path)
  completed.value = nowCompleted
  if (nowCompleted) {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.85 },
      colors: ['#2563EB', '#60A5FA', '#34D399', '#FBBF24']
    })
  }
}

function onToggleFavorite() {
  favorited.value = toggleFavorite(route.path)
}

function handleSRSGrade(confidence: 'hard' | 'good' | 'mastered') {
  scheduleSRSReview(route.path, confidence)
  srsGraded.value = true
  if (!completed.value) {
    onToggleCompletion()
  } else {
    confetti({
      particleCount: 35,
      spread: 50,
      origin: { y: 0.85 },
      colors: ['#2563EB', '#10B981']
    })
  }
}

// Find previous and next questions
const currentIndex = computed(() => {
  const cleanPath = normalizePath(route.path)
  return searchIndexData.findIndex(item => normalizePath(item.path) === cleanPath)
})

const prevQuestion = computed(() => {
  if (currentIndex.value > 0) {
    return searchIndexData[currentIndex.value - 1]
  }
  return null
})

const nextQuestion = computed(() => {
  if (currentIndex.value >= 0 && currentIndex.value < searchIndexData.length - 1) {
    return searchIndexData[currentIndex.value + 1]
  }
  return null
})

function navigateTo(path: string) {
  router.go(resolveUrl(path))
}
</script>

<template>
  <div class="completion-bar">
    <!-- Active Recall & Spaced Repetition Card -->
    <div class="srs-retention-pill">
      <div class="srs-pill-header">
        <div class="pill-badge-row">
          <span class="pill-tag">ACTIVE RECALL CHECK</span>
          <span class="pill-retention-badge">Spaced Repetition</span>
        </div>
        <h4 class="pill-heading">How easily could you answer this question in a live technical interview?</h4>
        <p class="pill-subtext">Rating your confidence schedules this question into your personalized Ebbinghaus spaced repetition review queue.</p>
      </div>

      <div v-if="!srsGraded" class="srs-pill-actions">
        <button class="srs-btn hard" @click="handleSRSGrade('hard')">
          <div class="srs-btn-icon-wrap hard-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="8" x2="12" y2="12"></line>
              <line x1="12" y1="16" x2="12.01" y2="16"></line>
            </svg>
          </div>
          <div class="srs-btn-content">
            <span class="srs-btn-title">Hard</span>
            <span class="srs-btn-interval">Review in 1 day</span>
          </div>
        </button>

        <button class="srs-btn good" @click="handleSRSGrade('good')">
          <div class="srs-btn-icon-wrap good-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
          </div>
          <div class="srs-btn-content">
            <span class="srs-btn-title">Good</span>
            <span class="srs-btn-interval">Review in 3 days</span>
          </div>
        </button>

        <button class="srs-btn mastered" @click="handleSRSGrade('mastered')">
          <div class="srs-btn-icon-wrap mastered-icon">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
            </svg>
          </div>
          <div class="srs-btn-content">
            <span class="srs-btn-title">Mastered</span>
            <span class="srs-btn-interval">Review in 7 days</span>
          </div>
        </button>
      </div>

      <div v-else class="srs-graded-confirmation">
        <div class="confirm-icon-wrap">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#10B981" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </div>
        <div class="confirm-text-wrap">
          <strong>Review Scheduled!</strong>
          <p>Scheduled into your Spaced Repetition queue according to the Ebbinghaus forgetting curve.</p>
        </div>
      </div>
    </div>

    <!-- Navigation & Completion Controls -->
    <div class="completion-inner">
      <div class="nav-links">
        <button
          v-if="prevQuestion"
          class="nav-btn prev-btn"
          :title="prevQuestion.title"
          @click="navigateTo(prevQuestion.path)"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
          <span>Previous</span>
        </button>
        <span v-else class="nav-btn disabled">
          <span>First Question</span>
        </span>

        <button
          v-if="nextQuestion"
          class="nav-btn next-btn"
          :title="nextQuestion.title"
          @click="navigateTo(nextQuestion.path)"
        >
          <span>Next Question</span>
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>

      <div class="action-buttons">
        <button
          class="fav-btn"
          :class="{ active: favorited }"
          :title="favorited ? 'Saved in Cheat Sheet' : 'Save to Cheat Sheet'"
          @click="onToggleFavorite"
        >
          <svg v-if="favorited" viewBox="0 0 24 24" width="15" height="15" fill="#FBBF24">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>
          <span>{{ favorited ? 'Saved in Cheat Sheet' : 'Bookmark' }}</span>
        </button>

        <button
          class="complete-btn"
          :class="{ completed: completed }"
          @click="onToggleCompletion"
        >
          <svg v-if="completed" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9"></circle>
          </svg>
          <span>{{ completed ? 'Completed' : 'Mark as Complete' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.completion-bar {
  position: static !important;
  margin-top: 64px;
  margin-bottom: 48px;
  width: 100%;
  max-width: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 16px;
  padding: 0;
  font-family: 'Jost', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.srs-retention-pill {
  width: 100%;
  max-width: 100%;
  background: var(--surface-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  padding: 24px 28px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
}

.pill-badge-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.pill-tag {
  font-size: 11px;
  font-weight: 700;
  color: var(--accent-brand-dark);
  letter-spacing: 0.06em;
  background: var(--accent-brand-soft);
  padding: 3px 8px;
  border-radius: 5px;
}

.pill-retention-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--capsule-container);
  padding: 3px 8px;
  border-radius: 5px;
}

.pill-heading {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-primary);
  margin: 0 0 4px 0;
  letter-spacing: -0.01em;
}

.pill-subtext {
  font-size: 13.5px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.5;
}

.srs-pill-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  width: 100%;
}

.srs-btn {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 14px;
  padding: 14px 20px;
  border-radius: 10px;
  border: 1.5px solid var(--border-subtle);
  background: #FFFFFF;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
}

.srs-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.srs-btn-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.srs-btn.hard .hard-icon {
  background: #FEE2E2;
  color: #DC2626;
}

.srs-btn.hard:hover {
  border-color: #F87171;
  background: #FEF2F2;
}

.srs-btn.good .good-icon {
  background: #FEF3C7;
  color: #D97706;
}

.srs-btn.good:hover {
  border-color: #FBBF24;
  background: #FFFBEB;
}

.srs-btn.mastered .mastered-icon {
  background: #D1FAE5;
  color: #059669;
}

.srs-btn.mastered:hover {
  border-color: #34D399;
  background: #ECFDF5;
}

.srs-btn-content {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}

.srs-btn-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.srs-btn-interval {
  font-size: 11.5px;
  color: var(--text-muted);
  font-weight: 500;
}

.srs-graded-confirmation {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border-radius: 10px;
  background: #F0FDF4;
  border: 1px solid #BBF7D0;
}

.confirm-icon-wrap {
  flex-shrink: 0;
}

.confirm-text-wrap strong {
  display: block;
  font-size: 14px;
  color: #15803D;
  margin-bottom: 2px;
}

.confirm-text-wrap p {
  margin: 0;
  font-size: 12.5px;
  color: #166534;
}

.completion-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  max-width: 100%;
  background: var(--surface-panel);
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  padding: 14px 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}

.nav-links {
  display: flex;
  align-items: center;
  gap: 10px;
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--card-bg);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 13.5px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.nav-btn:hover:not(.disabled) {
  color: var(--text-primary);
  border-color: var(--accent-brand);
  background: var(--accent-brand-soft);
}

.nav-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.fav-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  background: var(--card-bg);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  font-size: 13.5px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.fav-btn:hover {
  background: var(--card-hover);
  color: var(--text-primary);
  border-color: var(--border-medium);
}

.fav-btn.active {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.4);
  color: #D97706;
}

.complete-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--accent-brand);
  border: none;
  color: #FFFFFF;
  font-size: 13.5px;
  font-weight: 600;
  padding: 9px 18px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 1px 3px rgba(37, 99, 235, 0.3);
}

.complete-btn:hover {
  background: var(--accent-brand-dark);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
}

.complete-btn.completed {
  background: var(--accent-mint);
  box-shadow: 0 1px 3px rgba(16, 185, 129, 0.3);
}

.complete-btn.completed:hover {
  background: #059669;
}

@media (max-width: 768px) {
  .srs-pill-actions {
    grid-template-columns: 1fr;
  }
  .completion-inner {
    flex-direction: column;
    gap: 12px;
  }
  .nav-links, .action-buttons {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
