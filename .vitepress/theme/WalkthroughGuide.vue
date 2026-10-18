<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { hasSeenWalkthrough, setWalkthroughSeen } from './storage'

const emit = defineEmits(['close'])

const isVisible = ref(false)
const currentStep = ref(0)

interface Step {
  target: string
  stationTag: string
  title: string
  description: string
}

const steps: Step[] = [
  {
    target: '#walkthrough-top-right',
    stationTag: 'STATION 1 · COMMAND CENTER',
    title: 'Instant Search & External Portals',
    description: 'Use the global search bar or press Ctrl+K anywhere to jump instantly to any of the 260+ PySpark questions. Access GitHub and LinkedIn directly from here.'
  },
  {
    target: '#walkthrough-continue-btn',
    stationTag: 'STATION 2 · QUICK JUMP',
    title: 'One-Click Active Lesson Resume',
    description: 'Never lose your place. This dynamic trigger automatically tracks your last viewed or active topic so you can resume your interview prep immediately.'
  },
  {
    target: '#walkthrough-courses',
    stationTag: 'STATION 3 · CURRICULUM & CONCEPT NAVIGATOR',
    title: 'Structured Modules & Keyword Filter',
    description: 'Filter 260+ questions by key concepts like Catalyst, AQE, Shuffles, Delta Lake, or OOM. Track individual module completion percentages in real time.'
  },
  {
    target: '#walkthrough-progress',
    stationTag: 'STATION 4 · REAL-TIME ANALYTICS',
    title: 'Interactive Study Bento & Readiness Wave',
    description: 'Monitor daily question completions with the capsule bar chart and see your projected Staff/Senior interview readiness curve climb dynamically.'
  },
  {
    target: '#walkthrough-pomodoro',
    stationTag: 'STATION 5 · STUDY ENGINE',
    title: 'Resilient Pomodoro Focus Clock',
    description: 'Built with timestamp-delta persistence. Start a 25-minute deep focus block, navigate to any question or refresh the browser—your timer keeps ticking uninterrupted.'
  }
]

const spotlightBox = ref({ x: 0, y: 0, width: 0, height: 0, radius: 16 })
const popoverStyle = ref({ top: '0px', left: '0px', width: '380px', opacity: 0 })

function updateCoordinates() {
  const step = steps[currentStep.value]
  if (!step) return
  const targetEl = document.querySelector(step.target) as HTMLElement
  if (!targetEl) return

  targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })

  const rect = targetEl.getBoundingClientRect()
  const pad = 12

  spotlightBox.value = {
    x: Math.max(4, rect.left - pad),
    y: Math.max(4, rect.top - pad),
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
    radius: step.target.includes('btn') ? 9999 : 18
  }

  const cardWidth = Math.min(380, window.innerWidth - 32)
  const cardHeight = 220
  const margin = 16

  let top = rect.bottom + margin
  let left = rect.left

  if (top + cardHeight > window.innerHeight) {
    top = Math.max(margin, rect.top - cardHeight - margin)
  }

  if (left + cardWidth > window.innerWidth) {
    left = window.innerWidth - cardWidth - margin
  }
  left = Math.max(margin, left)

  popoverStyle.value = {
    top: `${top}px`,
    left: `${left}px`,
    width: `${cardWidth}px`,
    opacity: 1
  }
}

function next() {
  if (currentStep.value < steps.length - 1) {
    currentStep.value++
    nextTick(() => updateCoordinates())
  } else {
    dismiss()
  }
}

function prev() {
  if (currentStep.value > 0) {
    currentStep.value--
    nextTick(() => updateCoordinates())
  }
}

function dismiss() {
  isVisible.value = false
  setWalkthroughSeen(true)
  emit('close')
}

function handleKeydown(e: KeyboardEvent) {
  if (!isVisible.value) return
  if (e.key === 'Escape') dismiss()
  if (e.key === 'ArrowRight' || e.key === 'Enter') next()
  if (e.key === 'ArrowLeft') prev()
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('resize', updateCoordinates)

  if (!hasSeenWalkthrough()) {
    setTimeout(() => {
      isVisible.value = true
      nextTick(() => updateCoordinates())
    }, 700)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('resize', updateCoordinates)
})

defineExpose({
  open: () => {
    currentStep.value = 0
    isVisible.value = true
    nextTick(() => updateCoordinates())
  }
})
</script>

<template>
  <div v-if="isVisible" class="walkthrough-container">
    <svg class="walkthrough-svg-overlay">
      <defs>
        <mask id="spotlight-mask">
          <rect x="0" y="0" width="100%" height="100%" fill="white" />
          <rect
            :x="spotlightBox.x"
            :y="spotlightBox.y"
            :width="spotlightBox.width"
            :height="spotlightBox.height"
            :rx="spotlightBox.radius"
            fill="black"
          />
        </mask>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" fill="rgba(8, 9, 13, 0.84)" mask="url(#spotlight-mask)" />
    </svg>

    <!-- Floating Spotlight Card -->
    <div class="walkthrough-popover" :style="popoverStyle">
      <div class="popover-badge">{{ steps[currentStep].stationTag }}</div>
      <h3 class="popover-title">{{ steps[currentStep].title }}</h3>
      <p class="popover-desc">{{ steps[currentStep].description }}</p>

      <div class="popover-footer">
        <div class="step-dots">
          <span
            v-for="(s, idx) in steps"
            :key="idx"
            class="dot"
            :class="{ active: idx === currentStep }"
          />
        </div>
        <div class="popover-actions">
          <button v-if="currentStep > 0" class="btn-subtle" @click="prev">Back</button>
          <button class="btn-primary" @click="next">
            {{ currentStep === steps.length - 1 ? 'Finish Tour' : 'Next →' }}
          </button>
          <button class="btn-close" title="Close Tour" @click="dismiss">✕</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.walkthrough-container {
  position: fixed;
  inset: 0;
  z-index: 99999;
  pointer-events: auto;
}

.walkthrough-svg-overlay {
  position: absolute;
  inset: 0;
  width: 100vw;
  height: 100vh;
  pointer-events: auto;
}

.walkthrough-popover {
  position: fixed;
  background: #15161E;
  border: 1px solid rgba(255, 107, 53, 0.4);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.7), 0 0 30px rgba(255, 107, 53, 0.2);
  border-radius: 20px;
  padding: 22px;
  color: #FFFFFF;
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 100000;
}

.popover-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.14);
  padding: 4px 10px;
  border-radius: 9999px;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}

.popover-title {
  margin: 0 0 8px 0;
  font-size: 17px;
  font-weight: 700;
  color: #FFFFFF;
}

.popover-desc {
  margin: 0 0 18px 0;
  font-size: 13.5px;
  line-height: 1.5;
  color: #9CA3AF;
}

.popover-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 14px;
}

.step-dots {
  display: flex;
  gap: 6px;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.2);
  transition: all 0.25s ease;
}

.dot.active {
  width: 20px;
  background: #FF6B35;
}

.popover-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-subtle {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #9CA3AF;
  padding: 6px 12px;
  border-radius: 8px;
  font-size: 12.5px;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-subtle:hover {
  color: #FFFFFF;
  border-color: rgba(255, 255, 255, 0.3);
}

.btn-primary {
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  border: none;
  color: #FFFFFF;
  padding: 7px 16px;
  border-radius: 8px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(255, 107, 53, 0.35);
  transition: all 0.2s;
}

.btn-primary:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(255, 107, 53, 0.45);
}

.btn-close {
  background: transparent;
  border: none;
  color: #6E7387;
  font-size: 14px;
  cursor: pointer;
  padding: 4px 8px;
}

.btn-close:hover {
  color: #FFFFFF;
}
</style>
