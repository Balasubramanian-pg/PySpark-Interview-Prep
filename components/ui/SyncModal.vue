<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  exportAllData,
  importAllData,
  generateSyncToken,
  importSyncToken,
  getFavorites,
  getCompletedLessons
} from '../../.vitepress/theme/storage'
import searchIndexData from '../../search-index.json'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeTab = ref<'sync' | 'cheatsheet' | 'badge'>('sync')
const syncTokenInput = ref('')
const copySuccess = ref(false)
const importSuccess = ref<boolean | null>(null)

const generatedToken = computed(() => generateSyncToken())

function copyToken() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(generatedToken.value)
    copySuccess.value = true
    setTimeout(() => { copySuccess.value = false }, 2500)
  }
}

function handleImportToken() {
  if (!syncTokenInput.value.trim()) return
  const ok = importSyncToken(syncTokenInput.value.trim())
  importSuccess.value = ok
  if (ok) {
    setTimeout(() => {
      emit('close')
    }, 1500)
  }
}

function downloadJSONBackup() {
  const data = exportAllData()
  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pyspark-study-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function handleFileImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => {
    const text = e.target?.result as string
    const ok = importAllData(text)
    importSuccess.value = ok
    if (ok) {
      setTimeout(() => { emit('close') }, 1500)
    }
  }
  reader.readAsText(file)
}

// ─── Custom Cheat Sheet Generator ─────────────────────────────────────
const favorites = computed(() => getFavorites())
const favoritedQuestions = computed(() => {
  return searchIndexData.filter(item => favorites.value.includes(item.path))
})

function downloadCheatSheet() {
  const items = favoritedQuestions.value.length > 0 ? favoritedQuestions.value : searchIndexData.slice(0, 25)
  let md = `# PySpark Staff Data Engineering Cheat Sheet\n`
  md += `*Generated from PySpark Interview Hub on ${new Date().toLocaleDateString()}*\n\n`
  md += `---\n\n`

  items.forEach((item, idx) => {
    md += `### ${idx + 1}. ${item.title}\n`
    md += `**Category:** ${item.module} &bull; ${item.subtopic}\n\n`
    md += `${item.summary}\n\n`
    md += `---\n\n`
  })

  const blob = new Blob([md], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `PySpark-Staff-Interview-CheatSheet.md`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Shareable Badge ──────────────────────────────────────────────────
const completedCount = computed(() => getCompletedLessons().length)
const totalCount = computed(() => searchIndexData.length)
const badgeText = computed(() => {
  return `[![PySpark Interview Mastery](https://img.shields.io/badge/PySpark_Interview_Hub-Staff_Readiness_${completedCount.value}%2F${totalCount.value}-FF6B35?style=for-the-badge&logo=apachespark&logoColor=white)](https://github.com/Balasubramanian-pg/PySpark-Interview-Prep)`
})

const badgeCopied = ref(false)
function copyBadge() {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(badgeText.value)
    badgeCopied.value = true
    setTimeout(() => { badgeCopied.value = false }, 2500)
  }
}
</script>

<template>
  <div class="sync-backdrop" @click.self="emit('close')">
    <div class="sync-dialog">
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="tab-triggers">
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'sync' }"
            @click="activeTab = 'sync'"
          >
            Cloud / Device Sync
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'cheatsheet' }"
            @click="activeTab = 'cheatsheet'"
          >
            Export Cheat Sheet
          </button>
          <button
            class="tab-btn"
            :class="{ active: activeTab === 'badge' }"
            @click="activeTab = 'badge'"
          >
            Proof of Work Badge
          </button>
        </div>
        <button class="close-icon" @click="emit('close')">&times;</button>
      </div>

      <!-- Tab 1: Sync & Backup -->
      <div v-if="activeTab === 'sync'" class="tab-body">
        <div class="feature-box">
          <h4 class="feature-title">Cross-Device Fast Sync Token</h4>
          <p class="feature-desc">
            Copy this compressed 1-line token to transfer your study streak, completed answers, and SRS deck to another laptop, phone, or incognito window instantly.
          </p>
          <div class="token-copy-row">
            <input
              type="text"
              readonly
              :value="generatedToken"
              class="token-input"
            />
            <button class="copy-btn" @click="copyToken">
              {{ copySuccess ? 'Copied!' : 'Copy Token' }}
            </button>
          </div>
        </div>

        <div class="feature-box">
          <h4 class="feature-title">Restore on This Device</h4>
          <p class="feature-desc">Paste your sync token below to restore your progress:</p>
          <div class="token-copy-row">
            <input
              v-model="syncTokenInput"
              type="text"
              placeholder="Paste sync token here..."
              class="token-input"
            />
            <button class="action-btn" @click="handleImportToken">
              Restore
            </button>
          </div>
          <div v-if="importSuccess === true" class="msg-success">
            Progress restored successfully!
          </div>
          <div v-if="importSuccess === false" class="msg-error">
            Invalid sync token. Please try again.
          </div>
        </div>

        <div class="file-backup-row">
          <button class="secondary-btn" @click="downloadJSONBackup">
            Download JSON Backup File
          </button>
          <label class="secondary-btn file-upload-btn">
            Upload JSON Backup
            <input type="file" accept=".json" class="hidden-input" @change="handleFileImport" />
          </label>
        </div>
      </div>

      <!-- Tab 2: Cheat Sheet -->
      <div v-if="activeTab === 'cheatsheet'" class="tab-body">
        <div class="feature-box">
          <h4 class="feature-title">Personalized Staff PySpark Cheat Sheet</h4>
          <p class="feature-desc">
            Compiles your {{ favoritedQuestions.length }} bookmarked questions into an offline, print-ready Markdown document to review right before your big tech interview.
          </p>
          <div class="cheatsheet-preview">
            <div class="preview-stat">
              <span>Included Topics:</span>
              <strong>{{ favoritedQuestions.length > 0 ? favoritedQuestions.length : 'Top 25 Core Topics' }}</strong>
            </div>
            <div class="preview-format">
              Format: <code>.md (Markdown)</code>
            </div>
          </div>
          <button class="cta-primary-btn" @click="downloadCheatSheet">
            Download My Custom Cheat Sheet (.md) &darr;
          </button>
        </div>
      </div>

      <!-- Tab 3: Proof of Work Badge -->
      <div v-if="activeTab === 'badge'" class="tab-body">
        <div class="feature-box">
          <h4 class="feature-title">Shareable GitHub / LinkedIn Certification Badge</h4>
          <p class="feature-desc">
            Embed this live proof-of-work badge into your GitHub Profile README or portfolio to showcase rigorous preparation for Staff & Senior Data Engineering roles.
          </p>
          <div class="badge-preview-wrap">
            <div class="badge-pill">
              <svg class="spark-logo-mini" viewBox="0 0 24 24" width="16" height="16" fill="#E25A1C">
                <path d="M10.812 0c-.425.013-.845.215-1.196.605a3.593 3.593 0 00-.493.722c-.355.667-.425 1.415-.556 2.143a551.9 551.9 0 00-.726 4.087c-.027.16-.096.227-.244.273C5.83 8.386 4.06 8.94 2.3 9.514c-.387.125-.773.289-1.114.506-1.042.665-1.196 1.753-.415 2.71.346.422.79.715 1.284.936 1.1.49 2.202.976 3.3 1.47.019.01.036.013.053.019h-.004l1.306.535c0 .023.002.045 0 .073-.2 2.03-.39 4.063-.58 6.095-.04.419-.012.831.134 1.23.317.87 1.065 1.148 1.881.701.372-.204.666-.497.937-.818 1.372-1.623 2.746-3.244 4.113-4.872.111-.133.205-.15.363-.098.349.117.697.231 1.045.347h.001c.02.012.045.02.073.03l.142.042c1.248.416 2.68.775 3.929 1.19.4.132.622.164 1.045.098.311-.048.592-.062.828-.236.602-.33.995-.957.988-1.682-.005-.427-.154-.813-.35-1.186-.82-1.556-1.637-3.113-2.461-4.666-.078-.148-.076-.243.037-.375 1.381-1.615 2.756-3.236 4.133-4.855.272-.32.513-.658.653-1.058.308-.878-.09-1.57-1-1.741a2.783 2.783 0 00-1.235.069c-1.974.521-3.947 1.041-5.918 1.57-.175.047-.26.015-.355-.144a353.08 353.08 0 00-2.421-4.018 4.61 4.61 0 00-.652-.849c-.371-.37-.802-.549-1.227-.536z"/>
              </svg>
              <span class="badge-label">PySpark Interview Hub</span>
              <span class="badge-score">Readiness: {{ completedCount }} / {{ totalCount }}</span>
            </div>
          </div>
          <div class="token-copy-row">
            <input
              type="text"
              readonly
              :value="badgeText"
              class="token-input"
            />
            <button class="copy-btn" @click="copyBadge">
              {{ badgeCopied ? 'Copied Markdown!' : 'Copy Markdown' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sync-backdrop {
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

.sync-dialog {
  width: 100%;
  max-width: 640px;
  background: #141521;
  border: 1px solid rgba(255, 107, 53, 0.35);
  border-radius: 24px;
  padding: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7);
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  padding-bottom: 14px;
}

.tab-triggers {
  display: flex;
  gap: 8px;
}

.tab-btn {
  background: transparent;
  border: none;
  color: #8C93A8;
  font-size: 13px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: #FFFFFF;
}

.tab-btn.active {
  background: rgba(255, 107, 53, 0.15);
  color: #FF6B35;
}

.close-icon {
  background: none;
  border: none;
  color: #8C93A8;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
}

.close-icon:hover {
  color: #FFFFFF;
}

.tab-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.feature-box {
  background: #11121C;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.feature-title {
  font-size: 14.5px;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}

.feature-desc {
  font-size: 12.5px;
  color: #8C93A8;
  line-height: 1.45;
  margin: 0;
}

.token-copy-row {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.token-input {
  flex: 1;
  background: #181926;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: #D1D5DB;
  font-size: 12px;
  font-family: var(--vp-font-family-mono);
  padding: 8px 12px;
  border-radius: 8px;
  outline: none;
}

.copy-btn, .action-btn {
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  border: none;
  color: #FFFFFF;
  font-size: 12px;
  font-weight: 700;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

.file-backup-row {
  display: flex;
  gap: 12px;
}

.secondary-btn {
  flex: 1;
  text-align: center;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: #D1D5DB;
  font-size: 12px;
  font-weight: 600;
  padding: 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.secondary-btn:hover {
  background: rgba(255, 107, 53, 0.12);
  border-color: rgba(255, 107, 53, 0.35);
  color: #FF6B35;
}

.file-upload-btn {
  display: block;
}

.hidden-input {
  display: none;
}

.msg-success {
  font-size: 12px;
  color: #10B981;
  font-weight: 600;
}

.msg-error {
  font-size: 12px;
  color: #EF4444;
  font-weight: 600;
}

.cheatsheet-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #181926;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 12px;
  color: #8C93A8;
}

.preview-stat strong {
  color: #FF6B35;
  margin-left: 6px;
}

.cta-primary-btn {
  width: 100%;
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  border: none;
  color: #FFFFFF;
  font-size: 13.5px;
  font-weight: 700;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
}

.badge-preview-wrap {
  display: flex;
  justify-content: center;
  padding: 12px;
}

.badge-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #000000;
  border: 1px solid rgba(255, 107, 53, 0.5);
  border-radius: 6px;
  padding: 6px 14px;
}

.badge-label {
  font-size: 12px;
  font-weight: 700;
  color: #FFFFFF;
}

.badge-score {
  font-size: 11px;
  font-weight: 700;
  background: #FF6B35;
  color: #FFFFFF;
  padding: 2px 8px;
  border-radius: 4px;
}
</style>
