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
  return route.path === '/' || route.path === '/index.html'
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
    <!-- Decluttered Reader Top Bar for documentation pages -->
    <template #nav-bar-content-before>
      <div v-if="!isHomePage" class="reader-top-bar">
        <button class="reader-search-trigger" @click="openSearch">
          <span class="search-icon">🔍</span>
          <span class="search-text">Search 260+ questions...</span>
          <span class="kbd-shortcut">Ctrl K</span>
        </button>

        <div class="reader-quick-actions">
          <a
            href="https://linkedin.com/in/balasubramanian-pg"
            target="_blank"
            rel="noopener"
            class="action-icon-link"
            title="LinkedIn Profile"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
          </a>
          <a
            href="https://github.com/Balasubramanian-pg/PySpark-Interview-Prep"
            target="_blank"
            rel="noopener"
            class="action-icon-link"
            title="GitHub Repository"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
            </svg>
          </a>
          <a
            href="https://notebooklm.google.com"
            target="_blank"
            rel="noopener"
            class="action-icon-link"
            title="Google NotebookLM Companion"
          >
            <span style="font-weight: 800; font-size: 13px; color: #FF6B35;">NLM</span>
          </a>

          <!-- Active Pomodoro Indicator -->
          <div v-if="pomoRunning" class="floating-pomo-pill">
            <span class="flame">🔥</span>
            <span class="pomo-digits">{{ pomoFormattedTime }}</span>
          </div>
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
  gap: 16px;
  margin-left: 20px;
}

.reader-search-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 6px 14px;
  border-radius: 9999px;
  color: #9CA3AF;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reader-search-trigger:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #FFFFFF;
  border-color: rgba(255, 107, 53, 0.4);
}

.kbd-shortcut {
  font-size: 10px;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  color: #D1D5DB;
}

.reader-quick-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.action-icon-link {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #9CA3AF;
  text-decoration: none;
  transition: all 0.2s ease;
}

.action-icon-link:hover {
  background: rgba(255, 107, 53, 0.15);
  border-color: rgba(255, 107, 53, 0.4);
  color: #FF6B35;
}

.floating-pomo-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(255, 107, 53, 0.18);
  border: 1px solid rgba(255, 107, 53, 0.45);
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12.5px;
  font-weight: 700;
  color: #FF6B35;
  box-shadow: 0 0 12px rgba(255, 107, 53, 0.25);
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

.flame {
  font-size: 13px;
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
