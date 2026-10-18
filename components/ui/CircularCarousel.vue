<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'

export interface CarouselItem {
  id: string
  title: string
  description: string
  tag?: string
  url: string
}

const props = withDefaults(
  defineProps<{
    items: CarouselItem[]
    autoPlay?: boolean
    autoPlayInterval?: number
  }>(),
  {
    autoPlay: true,
    autoPlayInterval: 4500
  }
)

const emit = defineEmits<{
  (e: 'select', item: CarouselItem): void
}>()

const activeIndex = ref(0)
const isHovered = ref(false)
let timer: any = null

const VISIBLE_COUNT = 5
const RADIUS_X = 240
const RADIUS_Y = 85

function getItemPosition(index: number) {
  const total = props.items.length
  if (total === 0) return null

  const half = Math.floor(VISIBLE_COUNT / 2)
  let offset = index - activeIndex.value

  if (offset > half) offset -= total
  if (offset < -half) offset += total

  if (Math.abs(offset) > half * 2) return null

  const angle = (offset / VISIBLE_COUNT) * Math.PI
  const x = Math.sin(angle) * RADIUS_X
  const y = -Math.cos(angle) * RADIUS_Y

  const distance = Math.abs(offset)
  const maxDistance = half + 1
  const scale = Math.max(0, 1 - (distance / maxDistance) * 0.28)
  const opacity = Math.max(0.25, 1 - (distance / maxDistance) * 0.7)
  const zIndex = VISIBLE_COUNT - distance

  return { x, y, scale, opacity, zIndex, offset }
}

function goTo(index: number) {
  const total = props.items.length
  if (total === 0) return
  activeIndex.value = ((index % total) + total) % total
}

function next() {
  goTo(activeIndex.value + 1)
}

function prev() {
  goTo(activeIndex.value - 1)
}

function handleCardClick(item: CarouselItem, index: number) {
  if (index === activeIndex.value) {
    emit('select', item)
  } else {
    goTo(index)
  }
}

function startTimer() {
  stopTimer()
  if (!props.autoPlay) return
  timer = setInterval(() => {
    if (!isHovered.value) {
      next()
    }
  }, props.autoPlayInterval)
}

function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'ArrowLeft') prev()
  if (e.key === 'ArrowRight') next()
}

onMounted(() => {
  startTimer()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  stopTimer()
  window.removeEventListener('keydown', handleKeydown)
})

const currentItem = computed(() => props.items[activeIndex.value] || props.items[0])
</script>

<template>
  <div
    class="circular-carousel-wrapper"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <!-- Center Number Counter -->
    <div class="center-counter">
      <span class="center-digits">{{ String(activeIndex + 1).padStart(2, '0') }}</span>
      <span class="center-total">of {{ String(items.length).padStart(2, '0') }}</span>
    </div>

    <!-- Orbit Stage -->
    <div class="circular-stage">
      <div
        v-for="(item, i) in items"
        :key="item.id"
        v-show="getItemPosition(i) !== null"
        class="carousel-card"
        :class="{ active: i === activeIndex }"
        :style="{
          transform: getItemPosition(i)
            ? `translate(-50%, -50%) translate3d(${getItemPosition(i)!.x}px, ${getItemPosition(i)!.y}px, 0) scale(${getItemPosition(i)!.scale})`
            : undefined,
          opacity: getItemPosition(i)?.opacity ?? 0,
          zIndex: getItemPosition(i)?.zIndex ?? 0
        }"
        @click="handleCardClick(item, i)"
      >
        <div class="card-inner">
          <div class="card-header">
            <span v-if="item.tag" class="card-tag">{{ item.tag }}</span>
            <span v-if="i === activeIndex" class="card-active-indicator">FOCUS</span>
          </div>

          <div class="card-content">
            <h4 class="card-title">{{ item.title }}</h4>
            <p class="card-desc">{{ item.description }}</p>
          </div>

          <div class="card-cta">
            <span v-if="i === activeIndex" class="card-action-text">
              Study Topic &rarr;
            </span>
            <span v-else class="card-action-hint">Click to center</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Controls Row -->
    <div class="carousel-controls">
      <button
        class="control-btn"
        aria-label="Previous topic"
        @click="prev"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="15 18 9 12 15 6"></polyline>
        </svg>
      </button>

      <!-- Dot Indicators -->
      <div class="dot-track">
        <button
          v-for="(_, i) in items"
          :key="i"
          class="dot-indicator"
          :class="{ active: i === activeIndex }"
          :aria-label="`Topic ${i + 1}`"
          @click="goTo(i)"
        />
      </div>

      <button
        class="control-btn"
        aria-label="Next topic"
        @click="next"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
          <polyline points="9 18 15 12 9 6"></polyline>
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.circular-carousel-wrapper {
  position: relative;
  width: 100%;
  max-width: 820px;
  height: 340px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  user-select: none;
}

.center-counter {
  position: absolute;
  top: 48%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  pointer-events: none;
  z-index: 1;
}

.center-digits {
  font-size: 52px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.12);
  line-height: 1;
  font-family: var(--vp-font-family-mono);
  letter-spacing: -0.04em;
}

.center-total {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.22);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: 4px;
}

.circular-stage {
  position: relative;
  width: 100%;
  height: 250px;
}

.carousel-card {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 250px;
  height: 155px;
  border-radius: 18px;
  background: linear-gradient(145deg, #181926 0%, #12131D 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45);
  cursor: pointer;
  transition: transform 0.55s cubic-bezier(0.22, 1, 0.36, 1),
              opacity 0.45s ease,
              border-color 0.3s ease,
              box-shadow 0.3s ease;
  will-change: transform, opacity;
  padding: 14px;
}

.carousel-card:hover {
  border-color: rgba(255, 107, 53, 0.4);
}

.carousel-card.active {
  background: linear-gradient(145deg, #202234 0%, #161726 100%);
  border-color: #FF6B35;
  box-shadow: 0 16px 48px -8px rgba(255, 107, 53, 0.35),
              0 0 0 1px rgba(255, 107, 53, 0.3);
}

.card-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.card-tag {
  font-size: 9.5px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.12);
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid rgba(255, 107, 53, 0.25);
  white-space: nowrap;
}

.card-active-indicator {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #10B981;
  background: rgba(16, 185, 129, 0.12);
  padding: 2px 6px;
  border-radius: 4px;
}

.card-content {
  margin: 6px 0;
}

.card-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #FFFFFF;
  line-height: 1.3;
  margin: 0 0 4px 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.carousel-card.active .card-title {
  color: #FFFFFF;
}

.card-desc {
  font-size: 11px;
  color: #8C93A8;
  line-height: 1.4;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-cta {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  font-size: 11px;
  font-weight: 600;
}

.card-action-text {
  color: #FF6B35;
}

.card-action-hint {
  color: #555A70;
  font-size: 10px;
}

.carousel-controls {
  display: flex;
  align-items: center;
  gap: 16px;
  z-index: 10;
}

.control-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #D1D5DB;
  cursor: pointer;
  transition: all 0.2s ease;
}

.control-btn:hover {
  background: rgba(255, 107, 53, 0.2);
  border-color: rgba(255, 107, 53, 0.5);
  color: #FF6B35;
  transform: scale(1.06);
}

.dot-track {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot-indicator {
  width: 6px;
  height: 6px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.2);
  border: none;
  cursor: pointer;
  padding: 0;
  transition: all 0.3s ease;
}

.dot-indicator.active {
  width: 22px;
  background: #FF6B35;
  box-shadow: 0 0 8px rgba(255, 107, 53, 0.6);
}
</style>
