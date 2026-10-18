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
      colors: ['#FF6B35', '#906BFF', '#34D399', '#FBBF24']
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
      colors: ['#FF6B35', '#10B981']
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
    <!-- Active Recall & Spaced Repetition Bar -->
    <div class="srs-retention-pill">
      <div class="srs-pill-header">
        <span class="pill-tag">ACTIVE RECALL CHECK</span>
        <span class="pill-desc">How easily could you answer this in a real interview?</span>
      </div>

      <div v-if="!srsGraded" class="srs-pill-actions">
        <button class="srs-btn hard" @click="handleSRSGrade('hard')">
          <span>🧠 Hard</span>
          <small>Review in 1d</small>
        </button>
        <button class="srs-btn good" @click="handleSRSGrade('good')">
          <span>⚡ Good</span>
          <small>Review in 3d</small>
        </button>
        <button class="srs-btn mastered" @click="handleSRSGrade('mastered')">
          <span>🏆 Mastered</span>
          <small>Review in 7d</small>
        </button>
      </div>
      <div v-else class="srs-graded-confirmation">
        <span>Scheduled into your Ebbinghaus Spaced Repetition queue!</span>
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
  position: sticky;
  bottom: 16px;
  margin-top: 48px;
  z-index: 40;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
}

.srs-retention-pill {
  width: 100%;
  max-width: 860px;
  background: #11121C;
  border: 1px solid rgba(255, 107, 53, 0.3);
  border-radius: 14px;
  padding: 10px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.srs-pill-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pill-tag {
  font-size: 10px;
  font-weight: 700;
  color: #FF6B35;
  letter-spacing: 0.06em;
  background: rgba(255, 107, 53, 0.12);
  padding: 2px 6px;
  border-radius: 4px;
}

.pill-desc {
  font-size: 12px;
  color: #8C93A8;
}

.srs-pill-actions {
  display: flex;
  gap: 8px;
}

.srs-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #181926;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.srs-btn span {
  font-size: 11.5px;
  font-weight: 700;
  color: #FFFFFF;
}

.srs-btn small {
  font-size: 9px;
  color: #8C93A8;
}

.srs-btn.hard:hover {
  border-color: #EF4444;
  background: rgba(239, 68, 68, 0.15);
}

.srs-btn.good:hover {
  border-color: #F59E0B;
  background: rgba(245, 158, 11, 0.15);
}

.srs-btn.mastered:hover {
  border-color: #10B981;
  background: rgba(16, 185, 129, 0.15);
}

.srs-graded-confirmation {
  font-size: 11.5px;
  font-weight: 600;
  color: #10B981;
}

.completion-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  max-width: 860px;
  background: rgba(18, 19, 26, 0.94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 18px;
  padding: 12px 20px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
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
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #9CA3AF;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.nav-btn:hover:not(.disabled) {
  color: #FFFFFF;
  border-color: rgba(255, 107, 53, 0.4);
  background: rgba(255, 107, 53, 0.08);
}

.nav-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.action-buttons {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #D1D5DB;
  font-size: 13px;
  font-weight: 500;
  padding: 8px 14px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.fav-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #FFFFFF;
}

.fav-btn.active {
  background: rgba(251, 191, 36, 0.15);
  border-color: rgba(251, 191, 36, 0.4);
  color: #FBBF24;
}

.complete-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  border: none;
  color: #FFFFFF;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(255, 107, 53, 0.35);
  transition: all 0.2s ease;
}

.complete-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(255, 107, 53, 0.45);
}

.complete-btn.completed {
  background: linear-gradient(135deg, #059669 0%, #047857 100%);
  box-shadow: 0 4px 14px rgba(5, 150, 105, 0.35);
}

@media (max-width: 680px) {
  .srs-retention-pill {
    flex-direction: column;
    gap: 8px;
    align-items: flex-start;
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
