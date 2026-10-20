<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { hasStorageConsented, setStorageConsented } from './storage'

const visible = ref(false)

onMounted(() => {
  if (!hasStorageConsented()) {
    setTimeout(() => {
      visible.value = true
    }, 1200)
  }
})

function onAccept() {
  setStorageConsented(true)
  visible.value = false
}
</script>

<template>
  <div v-if="visible" class="storage-consent-banner">
    <div class="consent-inner">
      <div class="consent-info">
        <svg class="consent-lock-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#2563EB" stroke-width="2">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
          <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
        </svg>
        <div class="consent-text">
          <span class="consent-title">Zero Server Tracking & 100% Local-First Storage</span>
          <span class="consent-desc">Your PySpark question completions, focus timers, and bookmark stats are saved strictly in your browser's localStorage. No cookies, no accounts, and zero server telemetry.</span>
        </div>
      </div>
      <button class="consent-accept-btn" @click="onAccept">
        Got it & Keep Saving
      </button>
    </div>
  </div>
</template>

<style scoped>
.storage-consent-banner {
  position: fixed;
  bottom: 24px;
  left: 24px;
  right: 24px;
  z-index: 1000;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.consent-inner {
  pointer-events: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  max-width: 860px;
  width: 100%;
  background: #FAF7F0;
  border: 1px solid #E2DAC9;
  border-radius: 18px;
  padding: 16px 24px;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.12);
  animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}

:global(.dark) .consent-inner {
  background: #2D3238;
  border: 1px solid #4B535E;
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.consent-info {
  display: flex;
  align-items: center;
  gap: 14px;
}

.consent-lock-svg {
  flex-shrink: 0;
}

.consent-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.consent-title {
  font-size: 14px;
  font-weight: 700;
  color: #1F2937;
}

:global(.dark) .consent-title {
  color: #EEEEEE;
}

.consent-desc {
  font-size: 12.5px;
  color: #4B5563;
  line-height: 1.4;
}

:global(.dark) .consent-desc {
  color: #9CA3AF;
}

.consent-accept-btn {
  background: #2563EB;
  border: none;
  color: #FFFFFF;
  padding: 8px 18px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3);
  transition: all 0.2s ease;
}

.consent-accept-btn:hover {
  background: #1D4ED8;
  transform: translateY(-1px);
  box-shadow: 0 6px 18px rgba(37, 99, 235, 0.45);
}

@media (max-width: 680px) {
  .consent-inner {
    flex-direction: column;
    align-items: flex-start;
  }
  .consent-accept-btn {
    width: 100%;
    text-align: center;
  }
}
</style>
