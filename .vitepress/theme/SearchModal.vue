<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vitepress'
import searchIndexData from '../../search-index.json'

const router = useRouter()
const isVisible = ref(false)
const searchQuery = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)

// Concept keyword quick links
const conceptKeywords = [
  { label: 'Catalyst Optimizer', query: 'catalyst' },
  { label: 'Adaptive Query (AQE)', query: 'adaptive' },
  { label: 'OOM & Memory Debug', query: 'oom' },
  { label: 'Join Strategies', query: 'join' },
  { label: 'Data Skewness', query: 'skew' },
  { label: 'Structured Streaming', query: 'streaming' },
  { label: 'Delta Lake & ACID', query: 'delta' },
  { label: 'Vectorized Pandas UDF', query: 'pandas' }
]

const filteredResults = computed(() => {
  if (!searchQuery.value.trim()) {
    // Show top curated sample
    return searchIndexData.slice(0, 8)
  }
  const q = searchQuery.value.toLowerCase().trim()
  return searchIndexData.filter(item => {
    return (
      item.title.toLowerCase().includes(q) ||
      item.summary.toLowerCase().includes(q) ||
      item.module.toLowerCase().includes(q) ||
      item.subtopic.toLowerCase().includes(q)
    )
  }).slice(0, 15)
})

function open() {
  isVisible.value = true
  selectedIndex.value = 0
  nextTick(() => {
    inputRef.value?.focus()
  })
}

function close() {
  isVisible.value = false
  searchQuery.value = ''
}

function selectItem(item: any) {
  router.go(item.path)
  close()
}

function handleKeydown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault()
    if (isVisible.value) close()
    else open()
  }

  if (!isVisible.value) return

  if (e.key === 'Escape') {
    close()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value + 1) % filteredResults.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    selectedIndex.value = (selectedIndex.value - 1 + filteredResults.value.length) % filteredResults.value.length
  } else if (e.key === 'Enter') {
    e.preventDefault()
    if (filteredResults.value[selectedIndex.value]) {
      selectItem(filteredResults.value[selectedIndex.value])
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})

defineExpose({ open, close })
</script>

<template>
  <div v-if="isVisible" class="search-backdrop" @click.self="close">
    <div class="search-dialog">
      <div class="search-input-header">
        <span class="search-icon">🔍</span>
        <input
          ref="inputRef"
          v-model="searchQuery"
          type="text"
          placeholder="Search 260+ PySpark interview questions, concepts, code..."
          class="search-input"
        />
        <span class="esc-badge" @click="close">ESC</span>
      </div>

      <!-- Quick Concept Chips -->
      <div class="concept-chips">
        <span class="chip-label">Concepts:</span>
        <button
          v-for="chip in conceptKeywords"
          :key="chip.label"
          class="chip-btn"
          @click="searchQuery = chip.query"
        >
          {{ chip.label }}
        </button>
      </div>

      <!-- Results List -->
      <div class="search-results-list">
        <div v-if="filteredResults.length === 0" class="no-results">
          No PySpark interview questions match "{{ searchQuery }}"
        </div>

        <div
          v-for="(item, idx) in filteredResults"
          :key="item.path"
          class="result-item"
          :class="{ active: idx === selectedIndex }"
          @click="selectItem(item)"
          @mouseenter="selectedIndex = idx"
        >
          <div class="result-meta">
            <span class="result-module">{{ item.module }}</span>
            <span class="meta-dot">·</span>
            <span class="result-subtopic">{{ item.subtopic }}</span>
          </div>
          <div class="result-title">{{ item.title }}</div>
          <div class="result-summary">{{ item.summary }}</div>
        </div>
      </div>

      <div class="search-footer">
        <span>↑↓ Navigate</span>
        <span>↵ Select</span>
        <span>ESC Close</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(8, 9, 13, 0.82);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 80px;
}

.search-dialog {
  width: 90%;
  max-width: 680px;
  background: #15161E;
  border: 1px solid rgba(255, 107, 53, 0.35);
  border-radius: 20px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.search-input-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.search-icon {
  font-size: 18px;
  opacity: 0.7;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #FFFFFF;
  font-size: 16px;
  font-family: inherit;
}

.search-input::placeholder {
  color: #6E7387;
}

.esc-badge {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  padding: 3px 8px;
  border-radius: 6px;
  color: #9CA3AF;
  cursor: pointer;
}

.concept-chips {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.2);
  overflow-x: auto;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.chip-label {
  font-size: 11.5px;
  color: #6E7387;
  font-weight: 600;
  white-space: nowrap;
}

.chip-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: #D1D5DB;
  font-size: 11.5px;
  padding: 4px 10px;
  border-radius: 9999px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.chip-btn:hover {
  background: rgba(255, 107, 53, 0.18);
  border-color: rgba(255, 107, 53, 0.4);
  color: #FF6B35;
}

.search-results-list {
  max-height: 420px;
  overflow-y: auto;
  padding: 10px;
}

.no-results {
  padding: 36px 20px;
  text-align: center;
  color: #6E7387;
  font-size: 14px;
}

.result-item {
  padding: 12px 16px;
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid transparent;
}

.result-item:hover, .result-item.active {
  background: rgba(255, 107, 53, 0.12);
  border-color: rgba(255, 107, 53, 0.25);
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #FF6B35;
  font-weight: 600;
  margin-bottom: 3px;
}

.meta-dot {
  color: #6E7387;
}

.result-subtopic {
  color: #9CA3AF;
}

.result-title {
  font-size: 14.5px;
  font-weight: 600;
  color: #FFFFFF;
  margin-bottom: 3px;
}

.result-summary {
  font-size: 12px;
  color: #9CA3AF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.search-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 10px 20px;
  background: rgba(0, 0, 0, 0.35);
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 11.5px;
  color: #6E7387;
}
</style>
