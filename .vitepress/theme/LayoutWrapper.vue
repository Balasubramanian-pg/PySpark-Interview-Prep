<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import LessonCompletion from './LessonCompletion.vue'
import StorageConsent from './StorageConsent.vue'
import SearchModal from './SearchModal.vue'

const { Layout } = DefaultTheme
const route = useRoute()

const searchModalRef = ref<InstanceType<typeof SearchModal> | null>(null)

const isHomePage = computed(() => {
  const p = route.path.replace(/\/index\.html$/, '').replace(/\/$/, '')
  return p === '' || p === '/PySpark-Interview-Prep' || p === '/'
})

// Pomodoro global sync for reader top pill
const pomoRunning = ref(false)
const pomoFormattedTime = ref('25:00')
let pomoTimer: any = null

function syncPomodoro() {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem('portal_pomo_state')
    if (!raw) {
      pomoRunning.value = false
      return
    }
    const data = JSON.parse(raw)
    if (data.status === 'running') {
      const diff = Math.max(0, Math.floor((data.targetEnd - Date.now()) / 1000))
      if (diff > 0) {
        pomoRunning.value = true
        const m = Math.floor(diff / 60)
        const s = diff % 60
        pomoFormattedTime.value = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
      } else {
        pomoRunning.value = false
      }
    } else {
      pomoRunning.value = false
    }
  } catch {
    pomoRunning.value = false
  }
}

onMounted(() => {
  syncPomodoro()
  pomoTimer = setInterval(syncPomodoro, 1000)
  window.addEventListener('storage', syncPomodoro)
  window.addEventListener('pyspark-progress-updated', syncPomodoro)
})

onUnmounted(() => {
  if (pomoTimer) clearInterval(pomoTimer)
  window.removeEventListener('storage', syncPomodoro)
  window.removeEventListener('pyspark-progress-updated', syncPomodoro)
})

function openSearch() {
  searchModalRef.value?.open()
}
</script>

<template>
  <Layout>
    <!-- Single Search Bar in Top Nav -->
    <template #nav-bar-content-before>
      <div class="reader-top-bar">
        <button class="reader-search-trigger" @click="openSearch">
          <svg class="search-svg" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <span class="search-text">Search 260+ questions...</span>
          <span class="kbd-shortcut">Ctrl K</span>
        </button>

        <!-- Active Pomodoro Indicator with SVG flame -->
        <div v-if="pomoRunning" class="floating-pomo-pill">
          <svg class="flame-svg" viewBox="0 0 24 24" width="14" height="14" fill="#2563EB">
            <path d="M12 0c-.28 0-.5.22-.5.5 0 2.24-1.32 3.63-2.6 4.98C7.54 6.89 6 8.52 6 11.5c0 3.59 2.91 6.5 6.5 6.5s6.5-2.91 6.5-6.5c0-4.08-3.08-6.19-5.58-8.75C12.74 2.05 12.08 1.13 12 0zm0 15c-1.93 0-3.5-1.57-3.5-3.5 0-1.3.7-2.31 1.6-3.3.8-1 1.9-2.12 1.9-4.2 1.34 1.5 3.5 3.32 3.5 6 0 2.76-1.57 5-3.5 5z"/>
          </svg>
          <span class="pomo-digits">{{ pomoFormattedTime }}</span>
        </div>
      </div>
    </template>

    <!-- Bottom of every article -->
    <template #doc-after>
      <LessonCompletion v-if="!isHomePage" />
    </template>

    <!-- Global modals mounted at root -->
    <template #layout-bottom>
      <SearchModal ref="searchModalRef" />
      <StorageConsent />
    </template>
  </Layout>
</template>

<style scoped>
.reader-top-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: 16px;
}

.reader-search-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--border-subtle);
  padding: 6px 14px;
  border-radius: 20px;
  color: var(--text-muted);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reader-search-trigger:hover {
  background: var(--surface-panel);
  color: var(--text-primary);
  border-color: var(--accent-orange);
}

.search-svg {
  color: var(--text-muted);
  flex-shrink: 0;
}

.kbd-shortcut {
  font-size: 10px;
  font-family: var(--vp-font-family-mono);
  background: var(--surface-panel);
  border: 1px solid var(--border-subtle);
  padding: 2px 6px;
  border-radius: 4px;
  color: var(--text-secondary);
}

.reader-quick-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-icon-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: var(--vp-c-bg-alt);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s ease;
}

.action-icon-link:hover {
  background: var(--accent-orange-soft);
  border-color: var(--accent-orange);
  color: var(--accent-orange-dark);
}

.floating-pomo-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--accent-orange-soft);
  border: 1px solid rgba(249, 115, 22, 0.4);
  padding: 4px 10px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 700;
  color: var(--accent-orange-dark);
  animation: pulseFlame 2s infinite ease-in-out;
}

@keyframes pulseFlame {
  0%, 100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.03);
  }
}

.flame-svg {
  flex-shrink: 0;
}

.pomo-digits {
  font-family: var(--vp-font-family-mono);
}

@media (max-width: 768px) {
  .search-text {
    display: none;
  }
}
</style>
