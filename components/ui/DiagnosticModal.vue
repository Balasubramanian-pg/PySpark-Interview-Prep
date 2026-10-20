<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vitepress'
import { saveDiagnosticResult, resolveUrl } from '../../.vitepress/theme/storage'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const router = useRouter()

interface Question {
  id: number
  category: string
  scenario: string
  options: { label: string; text: string; correct: boolean }[]
  explanation: string
  recommendedPath: string
}

const questions: Question[] = [
  {
    id: 1,
    category: 'Architecture',
    scenario: 'A PySpark driver crashes with java.lang.OutOfMemoryError: Java heap space right after a line executing df.collect(). Why did this happen?',
    options: [
      { label: 'A', text: 'Executors did not have enough shuffle memory to execute the action.', correct: false },
      { label: 'B', text: 'collect() pulls all partition data from worker executors to the single Driver JVM.', correct: true },
      { label: 'C', text: 'Broadcast join exceeded the 10MB autoBroadcastJoinThreshold.', correct: false },
      { label: 'D', text: 'The garbage collector spent over 98% of time collecting memory.', correct: false }
    ],
    explanation: 'df.collect() brings all distributed rows from all partitions into the Driver process memory. For large datasets, use df.take(n) or write to disk.',
    recommendedPath: '/1. Fundamentals/1.1 Spark Architecture Basics/1.1.1 What is the role of the Spark Driver'
  },
  {
    id: 2,
    category: 'Optimization & AQE',
    scenario: 'In Spark 3.x with AQE enabled (spark.sql.adaptive.enabled = true), when does Spark convert a SortMergeJoin into a BroadcastHashJoin?',
    options: [
      { label: 'A', text: 'Before query planning begins, by inspecting the parquet file sizes on S3.', correct: false },
      { label: 'B', text: 'At runtime after shuffle stage execution, when the actual materialized table size is below the threshold.', correct: true },
      { label: 'C', text: 'Only when the user explicitly adds a /*+ BROADCAST() */ SQL hint.', correct: false },
      { label: 'D', text: 'Whenever both tables have fewer than 200 partitions.', correct: false }
    ],
    explanation: 'AQE re-plans the physical join at runtime by inspecting actual shuffle write statistics after map stages complete.',
    recommendedPath: '/3. Advanced/3.3 Join Strategies/3.3.1 What are the different join strategies in PySpark'
  },
  {
    id: 3,
    category: 'Data Skew Handling',
    scenario: 'During a SortMergeJoin, 199 tasks finish in 10 seconds, but 1 task hangs for 45 minutes on shuffle read. What is the root cause?',
    options: [
      { label: 'A', text: 'Data skew on the join key (one key has millions of records routed to one partition).', correct: true },
      { label: 'B', text: 'The driver memory is too small for broadcast exchange.', correct: false },
      { label: 'C', text: 'Executors are suffering from network disconnects.', correct: false },
      { label: 'D', text: 'The spark.sql.shuffle.partitions is set too high.', correct: false }
    ],
    explanation: 'Severe data skew routes disproportionate keys to a single partition. Mitigate using AQE skew join handling (spark.sql.adaptive.skewJoin.enabled) or salting.',
    recommendedPath: '/3. Advanced/3.5 Handling Data Skewness/Readme'
  },
  {
    id: 4,
    category: 'Memory Management',
    scenario: 'Under Spark Unified Memory Manager, what happens when Execution memory needs space while Storage memory is currently holding cached DataFrames?',
    options: [
      { label: 'A', text: 'Execution fails immediately with an OutOfMemory error.', correct: false },
      { label: 'B', text: 'Execution can evict cached storage blocks to disk/spill until storage reaches its minimum threshold.', correct: true },
      { label: 'C', text: 'Execution memory is strictly frozen at 50% and cannot borrow from Storage.', correct: false },
      { label: 'D', text: 'Spark automatically increases yarn executor overhead.', correct: false }
    ],
    explanation: 'Execution borrowing takes priority over Storage. Execution can evict cached blocks from Storage, but Storage cannot evict active Execution memory.',
    recommendedPath: '/4. Senior Dev/4.1 Memory Management And OOM Errors/4.1.1 Describe the Spark Executor Memory architecture.'
  },
  {
    id: 5,
    category: 'Streaming & Watermarks',
    scenario: 'In Structured Streaming with event-time aggregation, what does withWatermark("timestamp", "10 minutes") do?',
    options: [
      { label: 'A', text: 'Limits streaming batch processing duration to 10 minutes.', correct: false },
      { label: 'B', text: 'Drops events whose event-time is older than max(event_time) seen minus 10 minutes, allowing state cleanup.', correct: true },
      { label: 'C', text: 'Delays writing output rows for exactly 10 minutes.', correct: false },
      { label: 'D', text: 'Triggers checkpoint compaction every 10 minutes.', correct: false }
    ],
    explanation: 'Watermarks define how late data can arrive before being discarded, allowing the engine to safely evict old aggregation state from memory.',
    recommendedPath: '/4. Senior Dev/4.3 Structured Streaming/Readme'
  }
]

const currentStep = ref(0)
const selectedAnswers = ref<Record<number, string>>({})
const isSubmitted = ref(false)

const currentQ = computed(() => questions[currentStep.value])

function selectOption(label: string) {
  if (isSubmitted.value) return
  selectedAnswers.value[currentQ.value.id] = label
}

function nextQuestion() {
  if (currentStep.value < questions.length - 1) {
    currentStep.value++
  } else {
    finishQuiz()
  }
}

function prevQuestion() {
  if (currentStep.value > 0) {
    currentStep.value--
  }
}

const score = computed(() => {
  let count = 0
  questions.forEach(q => {
    const chosen = selectedAnswers.value[q.id]
    const correctOpt = q.options.find(o => o.correct)
    if (chosen && correctOpt && chosen === correctOpt.label) {
      count++
    }
  })
  return count
})

const levelAssessed = computed(() => {
  const pct = (score.value / questions.length) * 100
  if (pct >= 80) return 'Staff Big Data Architect'
  if (pct >= 60) return 'Senior PySpark Engineer'
  if (pct >= 40) return 'Mid-Level Data Engineer'
  return 'Foundational Explorer'
})

const weakAreas = computed(() => {
  const list: Question[] = []
  questions.forEach(q => {
    const chosen = selectedAnswers.value[q.id]
    const correctOpt = q.options.find(o => o.correct)
    if (!chosen || chosen !== correctOpt?.label) {
      list.push(q)
    }
  })
  return list
})

function finishQuiz() {
  isSubmitted.value = true
  saveDiagnosticResult({
    score: score.value,
    total: questions.length,
    level: levelAssessed.value,
    weakAreas: weakAreas.value.map(q => q.category),
    completedAt: new Date().toISOString()
  })
}

function goToTopic(path: string) {
  emit('close')
  router.go(resolveUrl(path))
}
</script>

<template>
  <div class="diagnostic-backdrop" @click.self="emit('close')">
    <div class="diagnostic-modal">
      <!-- Modal Header -->
      <div class="modal-header">
        <div class="header-badge">5-MINUTE DIAGNOSTIC ASSESSMENT</div>
        <button class="close-btn" @click="emit('close')">&times;</button>
      </div>

      <!-- Test Active State -->
      <div v-if="!isSubmitted" class="test-body">
        <div class="progress-indicator">
          <span>Question {{ currentStep + 1 }} of {{ questions.length }}</span>
          <span class="category-pill">{{ currentQ.category }}</span>
        </div>

        <div class="scenario-box">
          {{ currentQ.scenario }}
        </div>

        <div class="options-grid">
          <button
            v-for="opt in currentQ.options"
            :key="opt.label"
            class="option-card"
            :class="{ selected: selectedAnswers[currentQ.id] === opt.label }"
            @click="selectOption(opt.label)"
          >
            <span class="opt-label">{{ opt.label }}</span>
            <span class="opt-text">{{ opt.text }}</span>
          </button>
        </div>

        <div class="modal-nav">
          <button
            class="nav-btn"
            :disabled="currentStep === 0"
            @click="prevQuestion"
          >
            Back
          </button>
          <button
            class="next-action-btn"
            :disabled="!selectedAnswers[currentQ.id]"
            @click="nextQuestion"
          >
            {{ currentStep === questions.length - 1 ? 'Analyze My Level &rarr;' : 'Next Question &rarr;' }}
          </button>
        </div>
      </div>

      <!-- Result & Tailored Roadmap State -->
      <div v-else class="result-body">
        <div class="score-card">
          <div class="score-number">{{ score }} / {{ questions.length }}</div>
          <div class="level-title">{{ levelAssessed }}</div>
          <p class="score-desc">
            Based on your responses, we have computed your architectural blind spots and created an accelerated study path.
          </p>
        </div>

        <div class="roadmap-section">
          <h4 class="roadmap-heading">Your Tailored High-Yield Study Roadmap</h4>
          
          <div v-if="weakAreas.length === 0" class="mastery-note">
            <svg class="mastery-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#10B981" stroke-width="2">
              <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.45 1-1 1H8c-.55 0-1 .45-1 1v1h10v-1c0-.55-.45-1-1-1h-1c-.55 0-1-.45-1-1v-2.34"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
            </svg>
            <span>Perfect score! You have strong grasp of core Spark mechanics. Deep dive directly into Senior Dev &amp; Cost FinOps topics!</span>
          </div>

          <div v-else class="weak-topics-list">
            <div
              v-for="item in weakAreas"
              :key="item.id"
              class="roadmap-item"
              @click="goToTopic(item.recommendedPath)"
            >
              <div class="item-left">
                <span class="blindspot-tag">PRIORITY BLIND SPOT</span>
                <span class="item-cat">{{ item.category }}</span>
                <div class="item-exp">{{ item.explanation }}</div>
              </div>
              <button class="study-link-btn">Study Topic &rarr;</button>
            </div>
          </div>
        </div>

        <div class="result-footer">
          <button class="close-action-btn" @click="emit('close')">
            Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.diagnostic-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(15, 23, 42, 0.5);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.diagnostic-modal {
  width: 100%;
  max-width: 680px;
  max-height: 90vh;
  background: #FAF7F0;
  border: 1px solid #E2DAC9;
  border-radius: 20px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.15);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  font-family: 'Jost', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}

:global(.dark) .diagnostic-modal {
  background: #2D3238;
  border: 1px solid #4B535E;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px;
  border-bottom: 1px solid #E2DAC9;
}

:global(.dark) .modal-header {
  border-bottom: 1px solid #4B535E;
}

.header-badge {
  font-size: 11.5px;
  font-weight: 700;
  color: #2563EB;
  letter-spacing: 0.08em;
}

:global(.dark) .header-badge {
  color: #60A5FA;
}

.close-btn {
  background: none;
  border: none;
  color: #6B7280;
  font-size: 24px;
  cursor: pointer;
  line-height: 1;
}

.close-btn:hover {
  color: #1E242B;
}

:global(.dark) .close-btn:hover {
  color: #FFFFFF;
}

.test-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.progress-indicator {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  color: #6B7280;
}

.category-pill {
  font-size: 11.5px;
  font-weight: 700;
  color: #1D4ED8;
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  padding: 3px 10px;
  border-radius: 6px;
}

:global(.dark) .category-pill {
  color: #93C5FD;
  background: rgba(37, 99, 235, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
}

.scenario-box {
  background: #FFFFFF;
  border: 1px solid #E2DAC9;
  border-radius: 12px;
  padding: 18px 20px;
  font-size: 15px;
  font-weight: 600;
  color: #1E242B;
  line-height: 1.5;
}

:global(.dark) .scenario-box {
  background: #222831;
  border-color: #4B535E;
  color: #EEEEEE;
}

.options-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: #FFFFFF;
  border: 1.5px solid #E2DAC9;
  border-radius: 12px;
  padding: 14px 18px;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

:global(.dark) .option-card {
  background: #222831;
  border-color: #4B535E;
}

.option-card:hover {
  border-color: #2563EB;
  background: #F8FAFC;
}

:global(.dark) .option-card:hover {
  border-color: #3B82F6;
  background: #2A303A;
}

.option-card.selected {
  border-color: #2563EB;
  background: #EFF6FF;
}

:global(.dark) .option-card.selected {
  border-color: #3B82F6;
  background: rgba(37, 99, 235, 0.2);
}

.opt-label {
  font-size: 12px;
  font-weight: 700;
  background: #E2DAC9;
  padding: 2px 8px;
  border-radius: 6px;
  color: #1E242B;
  flex-shrink: 0;
}

:global(.dark) .opt-label {
  background: #4B535E;
  color: #EEEEEE;
}

.option-card.selected .opt-label {
  background: #2563EB;
  color: #FFFFFF;
}

.opt-text {
  font-size: 13.5px;
  color: #393E46;
  line-height: 1.5;
}

:global(.dark) .opt-text {
  color: #D1D5DB;
}

.modal-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}

.nav-btn {
  background: #FFFFFF;
  border: 1px solid #E2DAC9;
  color: #4B5563;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 18px;
  border-radius: 8px;
  cursor: pointer;
}

:global(.dark) .nav-btn {
  background: #222831;
  border-color: #4B535E;
  color: #D1D5DB;
}

.nav-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.next-action-btn {
  background: #2563EB;
  border: none;
  color: #FFFFFF;
  font-size: 13.5px;
  font-weight: 700;
  padding: 9px 22px;
  border-radius: 8px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  transition: all 0.2s ease;
}

.next-action-btn:hover:not(:disabled) {
  background: #1D4ED8;
  transform: translateY(-1px);
}

.next-action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* Results */
.result-body {
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.score-card {
  text-align: center;
  background: #FFFFFF;
  border: 1.5px solid #E2DAC9;
  border-radius: 16px;
  padding: 28px 20px;
}

:global(.dark) .score-card {
  background: #222831;
  border-color: #4B535E;
}

.score-number {
  font-size: 46px;
  font-weight: 800;
  color: #2563EB;
  font-family: var(--vp-font-family-mono);
  line-height: 1;
}

:global(.dark) .score-number {
  color: #60A5FA;
}

.level-title {
  font-size: 19px;
  font-weight: 700;
  color: #1E242B;
  margin: 10px 0 6px 0;
}

:global(.dark) .level-title {
  color: #EEEEEE;
}

.score-desc {
  font-size: 13px;
  color: #6B7280;
  margin: 0;
}

.roadmap-heading {
  font-size: 15px;
  font-weight: 700;
  color: #1E242B;
  margin: 0 0 12px 0;
}

:global(.dark) .roadmap-heading {
  color: #EEEEEE;
}

.weak-topics-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: 240px;
  overflow-y: auto;
}

.roadmap-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #FFFFFF;
  border: 1px solid #E2DAC9;
  border-radius: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: all 0.2s ease;
}

:global(.dark) .roadmap-item {
  background: #222831;
  border-color: #4B535E;
}

.roadmap-item:hover {
  border-color: #2563EB;
}

.item-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.blindspot-tag {
  font-size: 9.5px;
  font-weight: 700;
  color: #DC2626;
  letter-spacing: 0.04em;
}

.item-cat {
  font-size: 14px;
  font-weight: 700;
  color: #1E242B;
}

:global(.dark) .item-cat {
  color: #EEEEEE;
}

.item-exp {
  font-size: 12px;
  color: #6B7280;
  line-height: 1.4;
}

.study-link-btn {
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  color: #2563EB;
  font-size: 12px;
  font-weight: 700;
  padding: 6px 14px;
  border-radius: 8px;
  cursor: pointer;
  white-space: nowrap;
}

:global(.dark) .study-link-btn {
  background: rgba(37, 99, 235, 0.2);
  border-color: rgba(59, 130, 246, 0.4);
  color: #93C5FD;
}

.close-action-btn {
  width: 100%;
  background: #2563EB;
  border: none;
  color: #FFFFFF;
  font-size: 13.5px;
  font-weight: 600;
  padding: 12px;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.25);
  transition: all 0.2s ease;
}

.close-action-btn:hover {
  background: #1D4ED8;
}

.mastery-note {
  display: flex;
  align-items: center;
  gap: 10px;
  background: #ECFDF5;
  border: 1px solid #A7F3D0;
  padding: 12px 16px;
  border-radius: 10px;
  color: #047857;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
}

.mastery-icon {
  flex-shrink: 0;
}
</style>
