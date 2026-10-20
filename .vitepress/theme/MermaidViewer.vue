<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'

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
const isFullscreen = ref(false)
const zoomLevel = ref(100)

// Unique ID for mermaid render container
let renderCounter = 0
function getNextId() {
  renderCounter++
  return 'mermaid-svg-' + Math.random().toString(36).substring(2, 8) + '-' + renderCounter
}

function getIsDark(): boolean {
  if (typeof document === 'undefined') return false
  return document.documentElement.classList.contains('dark')
}

async function renderDiagram() {
  if (typeof window === 'undefined') return
  isRendering.value = true
  renderError.value = ''

  try {
    const mermaidModule = await import('mermaid')
    const mermaid = mermaidModule.default || mermaidModule
    const isDark = getIsDark()

    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'base',
      fontFamily: 'Jost, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      themeVariables: isDark ? {
        darkMode: true,
        background: 'transparent',
        mainBkg: '#2D3238',
        nodeBorder: '#3B82F6',
        nodeTextColor: '#F1F5F9',
        fontFamily: 'Jost, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13.5px',
        primaryColor: '#1E293B',
        primaryTextColor: '#93C5FD',
        primaryBorderColor: '#3B82F6',
        lineColor: '#60A5FA',
        secondaryColor: '#22262B',
        secondaryTextColor: '#E2E8F0',
        secondaryBorderColor: '#4B535E',
        tertiaryColor: '#1A2E26',
        tertiaryTextColor: '#86EFAC',
        tertiaryBorderColor: '#22C55E',
        clusterBkg: '#22262B',
        clusterBorder: '#4B535E',
        titleColor: '#F1F5F9',
        edgeLabelBackground: '#2D3238'
      } : {
        darkMode: false,
        background: 'transparent',
        mainBkg: '#FAF7F0',
        nodeBorder: '#2563EB',
        nodeTextColor: '#1F2937',
        fontFamily: 'Jost, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13.5px',
        primaryColor: '#EFF6FF',
        primaryTextColor: '#1E40AF',
        primaryBorderColor: '#2563EB',
        lineColor: '#2563EB',
        secondaryColor: '#FAF7F0',
        secondaryTextColor: '#334155',
        secondaryBorderColor: '#CBD5E1',
        tertiaryColor: '#F0FDF4',
        tertiaryTextColor: '#166534',
        tertiaryBorderColor: '#22C55E',
        clusterBkg: '#F5EFE1',
        clusterBorder: '#D8CEBD',
        titleColor: '#1F2937',
        edgeLabelBackground: '#FAF7F0'
      }
    })

    const containerId = getNextId()
    const { svg } = await mermaid.render(containerId, code.value)
    svgHtml.value = svg
    renderError.value = ''
  } catch (err: any) {
    console.warn('Mermaid render error:', err)
    renderError.value = err?.message || 'Diagram syntax could not be rendered.'
    activeMode.value = 'code'
  } finally {
    isRendering.value = false
  }
}

let themeObserver: MutationObserver | null = null

onMounted(() => {
  renderDiagram()
  if (typeof document !== 'undefined') {
    themeObserver = new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.attributeName === 'class') {
          renderDiagram()
          break
        }
      }
    })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  }
})

onUnmounted(() => {
  if (themeObserver) {
    themeObserver.disconnect()
    themeObserver = null
  }
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

function zoomIn() {
  if (zoomLevel.value < 200) zoomLevel.value += 15
}

function zoomOut() {
  if (zoomLevel.value > 50) zoomLevel.value -= 15
}

function resetZoom() {
  zoomLevel.value = 100
}

function toggleFullscreen() {
  isFullscreen.value = !isFullscreen.value
  if (!isFullscreen.value) {
    zoomLevel.value = 100
  }
}
</script>

<template>
  <div class="mermaid-block-wrapper" :class="{ 'is-fullscreen': isFullscreen }">
    <!-- Header Bar -->
    <div class="mermaid-header-bar">
      <!-- Diagram / Code Mode Switcher -->
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

      <!-- Actions: Zoom & Copy -->
      <div class="mermaid-actions">
        <!-- Zoom Controls (Diagram Mode Only) -->
        <div v-if="activeMode === 'diagram' && svgHtml" class="zoom-controls">
          <button type="button" class="zoom-btn" title="Zoom Out" @click="zoomOut">-</button>
          <span class="zoom-indicator" title="Reset Zoom" @click="resetZoom">{{ zoomLevel }}%</span>
          <button type="button" class="zoom-btn" title="Zoom In" @click="zoomIn">+</button>
          <button
            type="button"
            class="zoom-btn fit-btn"
            :title="isFullscreen ? 'Exit Fullscreen' : 'Expand to Fullscreen'"
            @click="toggleFullscreen"
          >
            <svg v-if="!isFullscreen" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M4 14h6m0 0v6m0-6L3 21m17-7h-6m0 0v6m0-6l7 7M14 4h6m-6 0v6m0-6l7-7M4 10h6m0 0V4m0 6L3 3"></path>
            </svg>
          </button>
        </div>

        <!-- Copy Code Action -->
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

    <!-- Main Canvas -->
    <div class="mermaid-canvas-container">
      <!-- Diagram View -->
      <div v-show="activeMode === 'diagram'" class="mermaid-diagram-pane">
        <div
          v-if="svgHtml"
          class="mermaid-svg-host"
          :style="{ transform: `scale(${zoomLevel / 100})`, transformOrigin: 'center center' }"
          v-html="svgHtml"
        ></div>
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
  border: 1px solid #E2DAC9;
  border-radius: 14px;
  background: #FAF7F0;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  font-family: 'Jost', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  transition: all 0.25s ease;
}

:global(.dark) .mermaid-block-wrapper {
  background: #2D3238;
  border-color: #4B535E;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

/* Fullscreen Mode */
.mermaid-block-wrapper.is-fullscreen {
  position: fixed;
  inset: 24px;
  z-index: 100000;
  margin: 0;
  border-radius: 18px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);
  display: flex;
  flex-direction: column;
}

.mermaid-block-wrapper.is-fullscreen .mermaid-canvas-container {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.mermaid-block-wrapper.is-fullscreen .mermaid-diagram-pane {
  flex: 1;
  max-height: calc(100vh - 120px) !important;
}

.mermaid-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  background: #F0EAE1;
  border-bottom: 1px solid #E2DAC9;
  flex-wrap: wrap;
  gap: 8px;
}

:global(.dark) .mermaid-header-bar {
  background: #25292E;
  border-bottom: 1px solid #4B535E;
}

.mermaid-toggle-group {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.05);
  padding: 3px;
  border-radius: 8px;
}

:global(.dark) .mermaid-toggle-group {
  background: rgba(255, 255, 255, 0.08);
}

.mermaid-tab-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: #4B5563;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

:global(.dark) .mermaid-tab-btn {
  color: #9CA3AF;
}

.mermaid-tab-btn:hover {
  color: #1F2937;
}

:global(.dark) .mermaid-tab-btn:hover {
  color: #FFFFFF;
}

.mermaid-tab-btn.active {
  background: #FAF7F0;
  color: #2563EB;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}

:global(.dark) .mermaid-tab-btn.active {
  background: #2D3238;
  color: #60A5FA;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
}

.mermaid-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.zoom-controls {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  background: rgba(0, 0, 0, 0.04);
  padding: 2px;
  border-radius: 6px;
  border: 1px solid #E2DAC9;
}

:global(.dark) .zoom-controls {
  background: rgba(255, 255, 255, 0.05);
  border-color: #4B535E;
}

.zoom-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #4B5563;
  font-size: 14px;
  font-weight: 700;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}

:global(.dark) .zoom-btn {
  color: #9CA3AF;
}

.zoom-btn:hover {
  background: rgba(37, 99, 235, 0.1);
  color: #2563EB;
}

:global(.dark) .zoom-btn:hover {
  background: rgba(37, 99, 235, 0.25);
  color: #60A5FA;
}

.zoom-indicator {
  font-size: 11px;
  font-weight: 600;
  color: #6B7280;
  padding: 0 6px;
  cursor: pointer;
  user-select: none;
}

:global(.dark) .zoom-indicator {
  color: #9CA3AF;
}

.zoom-indicator:hover {
  color: #2563EB;
}

.mermaid-action-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 6px;
  border: 1px solid #E2DAC9;
  background: #FAF7F0;
  color: #374151;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

:global(.dark) .mermaid-action-btn {
  background: #2D3238;
  border-color: #4B535E;
  color: #D1D5DB;
}

.mermaid-action-btn:hover {
  background: rgba(37, 99, 235, 0.08);
  color: #2563EB;
  border-color: rgba(37, 99, 235, 0.35);
}

:global(.dark) .mermaid-action-btn:hover {
  background: rgba(37, 99, 235, 0.2);
  color: #60A5FA;
  border-color: rgba(37, 99, 235, 0.5);
}

.mermaid-canvas-container {
  padding: 0;
  background: #FAF7F0;
  overflow: hidden;
}

:global(.dark) .mermaid-canvas-container {
  background: #2D3238;
}

.mermaid-diagram-pane {
  padding: 24px 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 180px;
  max-height: 520px;
  overflow: auto;
  background: #FAF7F0;
  transition: all 0.2s ease;
}

:global(.dark) .mermaid-diagram-pane {
  background: #2D3238;
}

.mermaid-svg-host {
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

/* Constrain Mermaid SVG so height fits naturally within viewport and doesn't explode */
:deep(.mermaid-svg-host svg) {
  max-width: 100% !important;
  max-height: 470px !important;
  width: auto !important;
  height: auto !important;
  display: block;
  margin: 0 auto;
}

.mermaid-block-wrapper.is-fullscreen :deep(.mermaid-svg-host svg) {
  max-height: calc(100vh - 160px) !important;
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
  color: #6B7280;
  font-size: 13px;
  padding: 30px;
}

:global(.dark) .mermaid-loading-state {
  color: #9CA3AF;
}

.mermaid-spinner {
  width: 22px;
  height: 22px;
  border: 2px solid #E2DAC9;
  border-top-color: #2563EB;
  border-radius: 50%;
  animation: mermaid-spin 0.8s linear infinite;
}

:global(.dark) .mermaid-spinner {
  border-color: #4B535E;
  border-top-color: #3B82F6;
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
  background: #FAF7F0;
  padding: 0;
  margin: 0;
}

:global(.dark) .mermaid-code-pane {
  background: #22262B;
}

.mermaid-pre {
  margin: 0 !important;
  padding: 20px 24px !important;
  background: #FAF7F0 !important;
  border: none !important;
  border-radius: 0 !important;
  overflow-x: auto !important;
}

:global(.dark) .mermaid-pre {
  background: #22262B !important;
}

.mermaid-code-text {
  font-family: 'Cabin', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important;
  font-size: 14px !important;
  line-height: 1.7 !important;
  color: #1F2937 !important;
  white-space: pre !important;
}

:global(.dark) .mermaid-code-text {
  color: #EEEEEE !important;
}
</style>
