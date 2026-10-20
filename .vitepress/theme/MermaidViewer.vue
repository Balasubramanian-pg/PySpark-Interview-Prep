<script setup lang="ts">
import { ref, onMounted, computed, watch, nextTick } from 'vue'

const props = defineProps<{
  rawCode: string
}>()

const code = computed(() => {
  try {
    return decodeURIComponent(props.rawCode)
  } catch {
    return props.rawCode
  }
})

type Mode = 'diagram' | 'code'
const activeMode = ref<Mode>('diagram')
const svgHtml = ref('')
const renderError = ref('')
const copied = ref(false)
const isRendering = ref(true)

// Unique ID for mermaid render container
let renderCounter = 0
function getNextId() {
  renderCounter++
  return 'mermaid-svg-' + Math.random().toString(36).substring(2, 8) + '-' + renderCounter
}

async function renderDiagram() {
  if (typeof window === 'undefined') return
  isRendering.value = true
  renderError.value = ''

  try {
    const mermaidModule = await import('mermaid')
    const mermaid = mermaidModule.default || mermaidModule

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'neutral',
      fontFamily: 'Jost, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      themeVariables: {
        fontFamily: 'Jost, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '14px',
        primaryColor: '#EFF6FF',
        primaryTextColor: '#1E40AF',
        primaryBorderColor: '#2563EB',
        lineColor: '#1D4ED8',
        secondaryColor: '#F8FAFC',
        secondaryTextColor: '#334155',
        secondaryBorderColor: '#64748B',
        tertiaryColor: '#F0FDF4',
        tertiaryTextColor: '#166534',
        tertiaryBorderColor: '#22C55E',
        noteBkgColor: '#FEF3C7',
        noteTextColor: '#92400E',
        noteBorderColor: '#F59E0B'
      }
    })

    const containerId = getNextId()
    const { svg } = await mermaid.render(containerId, code.value)
    svgHtml.value = svg
    renderError.value = ''
  } catch (err: any) {
    console.warn('Mermaid render error:', err)
    renderError.value = err?.message || 'Diagram syntax could not be rendered.'
    // Fall back to code mode when diagram rendering fails
    activeMode.value = 'code'
  } finally {
    isRendering.value = false
  }
}

onMounted(() => {
  renderDiagram()
})

watch(() => props.rawCode, () => {
  renderDiagram()
})

function copyCode() {
  if (typeof navigator === 'undefined' || !navigator.clipboard) return
  navigator.clipboard.writeText(code.value).then(() => {
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 2000)
  })
}
</script>

<template>
  <div class="mermaid-block-wrapper">
    <!-- Diagram / Code Mode Switcher & Copy Action -->
    <div class="mermaid-header-bar">
      <div class="mermaid-toggle-group">
        <button
          type="button"
          class="mermaid-tab-btn"
          :class="{ active: activeMode === 'diagram' }"
          title="View Visual Diagram"
          @click="activeMode = 'diagram'"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7"></rect>
            <rect x="14" y="3" width="7" height="7"></rect>
            <rect x="14" y="14" width="7" height="7"></rect>
            <rect x="3" y="14" width="7" height="7"></rect>
          </svg>
          <span>Diagram</span>
        </button>

        <button
          type="button"
          class="mermaid-tab-btn"
          :class="{ active: activeMode === 'code' }"
          title="View Mermaid Syntax"
          @click="activeMode = 'code'"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
          <span>Mermaid Code</span>
        </button>
      </div>

      <div class="mermaid-actions">
        <button
          type="button"
          class="mermaid-action-btn"
          :title="copied ? 'Copied to clipboard!' : 'Copy Mermaid code'"
          @click="copyCode"
        >
          <svg v-if="!copied" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="#10B981" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>{{ copied ? 'Copied' : 'Copy Code' }}</span>
        </button>
      </div>
    </div>

    <!-- Main Canvas: SVG Graph or Raw Code -->
    <div class="mermaid-canvas-container">
      <!-- Diagram View -->
      <div v-show="activeMode === 'diagram'" class="mermaid-diagram-pane">
        <div v-if="svgHtml" class="mermaid-svg-host" v-html="svgHtml"></div>
        <div v-else-if="isRendering" class="mermaid-loading-state">
          <div class="mermaid-spinner"></div>
          <span>Rendering architecture diagram...</span>
        </div>
        <div v-else-if="renderError" class="mermaid-error-notice">
          <div class="error-badge">Diagram Render Notice</div>
          <p>{{ renderError }}</p>
          <button class="switch-to-code-btn" @click="activeMode = 'code'">View Mermaid Code</button>
        </div>
      </div>

      <!-- Raw Code View -->
      <div v-show="activeMode === 'code'" class="mermaid-code-pane">
        <pre class="mermaid-pre"><code class="mermaid-code-text">{{ code }}</code></pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.mermaid-block-wrapper {
  margin: 2rem 0;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  font-family: 'Jost', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

.mermaid-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: #F8FAFC;
  border-bottom: 1px solid #E2E8F0;
}

.mermaid-toggle-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: #EEF2F6;
  padding: 3px;
  border-radius: 8px;
}

.mermaid-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #64748B;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mermaid-tab-btn:hover {
  color: #0F172A;
}

.mermaid-tab-btn.active {
  background: #FFFFFF;
  color: #2563EB;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

.mermaid-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mermaid-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid #E2E8F0;
  background: #FFFFFF;
  color: #475569;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mermaid-action-btn:hover {
  background: #F1F5F9;
  color: #0F172A;
  border-color: #CBD5E1;
}

.mermaid-canvas-container {
  padding: 0;
  background: #FFFFFF;
  overflow-x: auto;
}

.mermaid-diagram-pane {
  padding: 28px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  background: #FFFFFF;
}

.mermaid-svg-host {
  width: 100%;
  display: flex;
  justify-content: center;
}

:deep(.mermaid-svg-host svg) {
  max-width: 100% !important;
  height: auto !important;
  display: block;
  margin: 0 auto;
}

:deep(.mermaid-svg-host .node rect),
:deep(.mermaid-svg-host .node circle),
:deep(.mermaid-svg-host .node polygon) {
  stroke-width: 1.5px !important;
}

.mermaid-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #64748B;
  font-size: 13px;
  padding: 30px;
}

.mermaid-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid #E2E8F0;
  border-top-color: #2563EB;
  border-radius: 50%;
  animation: mermaid-spin 0.8s linear infinite;
}

@keyframes mermaid-spin {
  to { transform: rotate(360deg); }
}

.mermaid-error-notice {
  text-align: center;
  padding: 20px;
  color: #991B1B;
}

.error-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  background: #FEE2E2;
  color: #DC2626;
  padding: 2px 8px;
  border-radius: 4px;
  margin-bottom: 8px;
}

.switch-to-code-btn {
  margin-top: 10px;
  font-size: 12px;
  font-weight: 600;
  color: #2563EB;
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  padding: 5px 12px;
  border-radius: 6px;
  cursor: pointer;
}

.mermaid-code-pane {
  background: #F8FAFC;
  padding: 0;
  margin: 0;
}

.mermaid-pre {
  margin: 0 !important;
  padding: 20px 24px !important;
  background: #F8FAFC !important;
  border: none !important;
  border-radius: 0 !important;
  overflow-x: auto !important;
}

.mermaid-code-text {
  font-family: 'Cabin', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-size: 14px !important;
  line-height: 1.7 !important;
  color: #1E293B !important;
  white-space: pre !important;
}
</style>