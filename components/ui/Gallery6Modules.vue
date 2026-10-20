<script setup lang="ts">
import { ref, onMounted } from 'vue'

export interface ModuleItem {
  id: string
  name: string
  tag: string
  desc: string
  link: string
  total: number
  completed: number
  image: string
}

const props = defineProps<{
  modules: ModuleItem[]
}>()

const emit = defineEmits<{
  (e: 'navigate', link: string): void
}>()

const containerRef = ref<HTMLElement | null>(null)
const canScrollPrev = ref(false)
const canScrollNext = ref(true)

function updateScrollState() {
  const el = containerRef.value
  if (!el) return
  canScrollPrev.value = el.scrollLeft > 10
  canScrollNext.value = el.scrollLeft < el.scrollWidth - el.clientWidth - 10
}

function scroll(direction: 'prev' | 'next') {
  const el = containerRef.value
  if (!el) return
  const itemWidth = 380
  const offset = direction === 'next' ? itemWidth : -itemWidth
  el.scrollBy({ left: offset, behavior: 'smooth' })
  setTimeout(updateScrollState, 350)
}

onMounted(() => {
  updateScrollState()
})
</script>

<template>
  <section class="gallery6-section">
    <div class="gallery6-header">
      <div>
        <div class="gallery6-eyebrow">CURRICULUM TRACKS</div>
        <h2 class="gallery6-heading">Core Master Modules</h2>
        <p class="gallery6-sub">4 Stage Progressive Curriculum &bull; 260+ Enterprise Interview Questions</p>
      </div>

      <div class="gallery6-controls">
        <button
          class="gallery6-btn"
          :disabled="!canScrollPrev"
          aria-label="Previous module"
          @click="scroll('prev')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="15 18 9 12 15 6"></polyline>
          </svg>
        </button>
        <button
          class="gallery6-btn"
          :disabled="!canScrollNext"
          aria-label="Next module"
          @click="scroll('next')"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        </button>
      </div>
    </div>

    <!-- Carousel Track -->
    <div
      ref="containerRef"
      class="gallery6-track"
      @scroll="updateScrollState"
    >
      <div
        v-for="item in modules"
        :key="item.id"
        class="gallery6-item"
        @click="emit('navigate', item.link)"
      >
        <!-- Cover Image with Aspect Ratio -->
        <div class="image-wrapper">
          <img
            :src="item.image"
            :alt="item.name"
            class="cover-image"
            loading="lazy"
          />
          <div class="image-gradient-overlay" />
          <span class="module-floating-badge">{{ item.tag }}</span>
          <span class="module-completion-badge">
            {{ Math.round((item.completed / item.total) * 100) }}% Completed
          </span>
        </div>

        <!-- Content -->
        <div class="item-body">
          <div class="item-header">
            <h3 class="item-title">{{ item.name }}</h3>
          </div>

          <p class="item-summary">{{ item.desc }}</p>

          <!-- Progress bar -->
          <div class="item-progress-track">
            <div
              class="item-progress-fill"
              :style="{ width: `${Math.round((item.completed / item.total) * 100)}%` }"
            />
          </div>

          <div class="item-footer">
            <span class="item-count">{{ item.completed }} / {{ item.total }} questions</span>
            <span class="item-read-link">
              Start Track
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.gallery6-section {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
}

.gallery6-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
}

.gallery6-eyebrow {
  font-size: 11px;
  font-weight: 700;
  color: #2563EB;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.gallery6-heading {
  font-size: 22px;
  font-weight: 800;
  color: #FFFFFF;
  margin: 0 0 6px 0;
  letter-spacing: -0.02em;
}

.gallery6-sub {
  font-size: 13px;
  color: #8C93A8;
  margin: 0;
}

.gallery6-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gallery6-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #D1D5DB;
  cursor: pointer;
  transition: all 0.2s ease;
}

.gallery6-btn:hover:not(:disabled) {
  background: rgba(37, 99, 235, 0.15);
  border-color: rgba(37, 99, 235, 0.4);
  color: #2563EB;
  transform: scale(1.06);
}

.gallery6-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.gallery6-track {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  scroll-behavior: smooth;
  padding-bottom: 8px;
  scrollbar-width: none;
}

.gallery6-track::-webkit-scrollbar {
  display: none;
}

.gallery6-item {
  flex: 0 0 350px;
  background: #141521;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
              border-color 0.25s ease,
              box-shadow 0.25s ease;
  display: flex;
  flex-direction: column;
}

.gallery6-item:hover {
  transform: translateY(-4px);
  border-color: rgba(37, 99, 235, 0.4);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.5);
  background: #171827;
}

.image-wrapper {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  background: #0E0F17;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.4s ease;
}

.gallery6-item:hover .cover-image {
  transform: scale(1.05);
}

.image-gradient-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(20,21,33,0.9) 100%);
}

.module-floating-badge {
  position: absolute;
  top: 12px;
  left: 12px;
  background: rgba(13, 14, 20, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #2563EB;
  font-size: 10.5px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 9999px;
  letter-spacing: 0.04em;
}

.module-completion-badge {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(13, 14, 20, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #10B981;
  font-size: 10.5px;
  font-weight: 700;
  padding: 3px 9px;
  border-radius: 9999px;
}

.item-body {
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  flex: 1;
  justify-content: space-between;
  gap: 12px;
}

.item-title {
  font-size: 16px;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
  line-height: 1.35;
}

.item-summary {
  font-size: 12.5px;
  color: #8C93A8;
  line-height: 1.5;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.item-progress-track {
  width: 100%;
  height: 5px;
  background: #1F2130;
  border-radius: 9999px;
  overflow: hidden;
}

.item-progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #2563EB 0%, #1D4ED8 100%);
  border-radius: 9999px;
  transition: width 0.6s ease;
}

.item-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
}

.item-count {
  font-size: 11.5px;
  color: #6C7287;
  font-weight: 500;
}

.item-read-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: #2563EB;
  transition: gap 0.2s;
}

.gallery6-item:hover .item-read-link {
  gap: 9px;
}
</style>
