<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vitepress'
import { scheduleSRSReview, resolveUrl } from '../../.vitepress/theme/storage'
import searchIndexData from '../../search-index.json'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const router = useRouter()

// Get questions for flashcards
const flashcards = computed(() => {
  return searchIndexData.slice(0, 35) // Curated set
})

const currentIndex = ref(0)
const isFlipped = ref(false)

const currentCard = computed(() => flashcards.value[currentIndex.value] || flashcards.value[0])

function flipCard() {
  isFlipped.value = !isFlipped.value
}

function handleGrade(confidence: 'hard' | 'good' | 'mastered') {
  if (currentCard.value) {
    scheduleSRSReview(currentCard.value.path, confidence)
  }
  isFlipped.value = false
  if (currentIndex.value < flashcards.value.length - 1) {
    currentIndex.value++
  } else {
    currentIndex.value = 0
  }
}

function prevCard() {
  isFlipped.value = false
  if (currentIndex.value > 0) {
    currentIndex.value--
  }
}

function nextCard() {
  isFlipped.value = false
  if (currentIndex.value < flashcards.value.length - 1) {
    currentIndex.value++
  }
}

function openFullNotes() {
  emit('close')
  router.go(resolveUrl(currentCard.value.path))
}
</script>

<template>
  <div class="flashcard-backdrop" @click.self="emit('close')">
    <div class="flashcard-dialog">
      <!-- Header -->
      <div class="flashcard-header">
        <div class="header-left">
          <span class="flashcard-badge">ACTIVE RECALL ENGINE</span>
          <span class="counter-text">{{ currentIndex + 1 }} of {{ flashcards.length }}</span>
        </div>
        <button class="close-icon-btn" @click="emit('close')">&times;</button>
      </div>

      <!-- Card Stage with 3D Flip -->
      <div class="card-scene" @click="flipCard">
        <div class="card-3d" :class="{ 'is-flipped': isFlipped }">
          <!-- Card Front: Question -->
          <div class="card-face card-front">
            <div class="face-top">
              <span class="module-chip">{{ currentCard.module.replace(/^\d+\.\s*/, '') }}</span>
              <span class="tap-hint">Tap to reveal answer</span>
            </div>
            <div class="front-content">
              <h3 class="flashcard-q">{{ currentCard.title }}</h3>
            </div>
            <div class="face-bottom">
              <span class="subtopic-label">{{ currentCard.subtopic }}</span>
              <span class="flip-icon">&olarr; Flip</span>
            </div>
          </div>

          <!-- Card Back: Answer -->
          <div class="card-face card-back">
            <div class="face-top">
              <span class="answer-badge">STAFF ANSWER PREVIEW</span>
              <span class="tap-hint">Tap to flip back</span>
            </div>
            <div class="back-content">
              <p class="flashcard-summary">{{ currentCard.summary }}</p>
            </div>
            <div class="face-bottom">
              <button class="read-full-link" @click.stop="openFullNotes">
                Open Full Deep Dive &rarr;
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Self-Grading SRS Controls -->
      <div v-if="isFlipped" class="srs-grading-bar">
        <div class="grading-label">How well did you know this?</div>
        <div class="grade-buttons">
          <button class="grade-btn hard" @click="handleGrade('hard')">
            <div class="grade-icon hard-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 4.44-2.04z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-4.44-2.04z"/></svg>
            </div>
            <span class="grade-title">Hard</span>
            <span class="grade-sub">Review in 1d</span>
          </button>
          <button class="grade-btn good" @click="handleGrade('good')">
            <div class="grade-icon good-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <span class="grade-title">Good</span>
            <span class="grade-sub">Review in 3d</span>
          </button>
          <button class="grade-btn mastered" @click="handleGrade('mastered')">
            <div class="grade-icon mastered-icon">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/></svg>
            </div>
            <span class="grade-title">Mastered</span>
            <span class="grade-sub">Review in 7d</span>
          </button>
        </div>
      </div>

      <!-- Navigation Arrows if not flipped -->
      <div v-else class="flashcard-nav-row">
        <button class="nav-arrow-btn" :disabled="currentIndex === 0" @click="prevCard">
          &larr; Previous
        </button>
        <button class="nav-arrow-btn" @click="flipCard">
          Reveal Answer
        </button>
        <button class="nav-arrow-btn" :disabled="currentIndex === flashcards.length - 1" @click="nextCard">
          Next &rarr;
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flashcard-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(8, 9, 13, 0.85);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.flashcard-dialog {
  width: 100%;
  max-width: 580px;
  background: #141521;
  border: 1px solid rgba(255, 107, 53, 0.35);
  border-radius: 24px;
  padding: 20px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.flashcard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.flashcard-badge {
  font-size: 10.5px;
  font-weight: 700;
  color: #FF6B35;
  letter-spacing: 0.08em;
}

.counter-text {
  font-size: 11.5px;
  color: #8C93A8;
}

.close-icon-btn {
  background: none;
  border: none;
  color: #8C93A8;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
}

.close-icon-btn:hover {
  color: #FFFFFF;
}

/* 3D Card Flip Scene */
.card-scene {
  perspective: 1000px;
  width: 100%;
  height: 290px;
  cursor: pointer;
}

.card-3d {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  transform-style: preserve-3d;
}

.card-3d.is-flipped {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  inset: 0;
  border-radius: 20px;
  padding: 22px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  -webkit-backface-visibility: hidden;
  backface-visibility: hidden;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.card-front {
  background: linear-gradient(145deg, #1A1C2C, #131420);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.card-back {
  background: linear-gradient(145deg, #201D2C, #141521);
  border: 1px solid rgba(255, 107, 53, 0.4);
  transform: rotateY(180deg);
}

.face-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.module-chip {
  font-size: 10px;
  font-weight: 700;
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.12);
  padding: 2px 8px;
  border-radius: 6px;
}

.answer-badge {
  font-size: 10px;
  font-weight: 700;
  color: #10B981;
  background: rgba(16, 185, 129, 0.12);
  padding: 2px 8px;
  border-radius: 6px;
}

.tap-hint {
  font-size: 10.5px;
  color: #6C7287;
}

.front-content {
  margin: 12px 0;
}

.flashcard-q {
  font-size: 18px;
  font-weight: 700;
  color: #FFFFFF;
  line-height: 1.4;
  margin: 0;
}

.back-content {
  margin: 8px 0;
}

.flashcard-summary {
  font-size: 13.5px;
  color: #D1D5DB;
  line-height: 1.55;
  margin: 0;
}

.face-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.subtopic-label {
  font-size: 11.5px;
  color: #8C93A8;
}

.flip-icon {
  font-size: 11.5px;
  color: #FF6B35;
  font-weight: 600;
}

.read-full-link {
  background: none;
  border: none;
  color: #FF6B35;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 0;
}

.read-full-link:hover {
  text-decoration: underline;
}

/* SRS Grading Bar */
.srs-grading-bar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #11121C;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 12px;
}

.grading-label {
  font-size: 11px;
  font-weight: 600;
  color: #8C93A8;
  text-align: center;
}

.grade-buttons {
  display: flex;
  gap: 8px;
}

.grade-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px 6px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: #171827;
  cursor: pointer;
  transition: all 0.2s;
}

.grade-btn.hard:hover {
  border-color: #EF4444;
  background: rgba(239, 68, 68, 0.12);
}

.grade-btn.good:hover {
  border-color: #F59E0B;
  background: rgba(245, 158, 11, 0.12);
}

.grade-btn.mastered:hover {
  border-color: #10B981;
  background: rgba(16, 185, 129, 0.12);
}

.grade-icon {
  margin-bottom: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.grade-icon.hard-icon { color: #EF4444; }
.grade-icon.good-icon { color: #F59E0B; }
.grade-icon.mastered-icon { color: #10B981; }

.grade-title {
  font-size: 12px;
  font-weight: 700;
  color: #FFFFFF;
}

.grade-sub {
  font-size: 9.5px;
  color: #8C93A8;
}

/* Nav row */
.flashcard-nav-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.nav-arrow-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #D1D5DB;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 9999px;
  cursor: pointer;
}

.nav-arrow-btn:hover:not(:disabled) {
  background: rgba(255, 107, 53, 0.15);
  border-color: rgba(255, 107, 53, 0.4);
  color: #FF6B35;
}

.nav-arrow-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
