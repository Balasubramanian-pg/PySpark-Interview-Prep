<script setup lang="ts">
import { ref } from 'vue'
import confetti from 'canvas-confetti'

const emit = defineEmits(['close'])

interface QuizQuestion {
  id: number
  scenario: string
  options: string[]
  answer: number
  explanation: string
}

const questions: QuizQuestion[] = [
  {
    id: 1,
    scenario: "A production PySpark pipeline encounters severe data skew on a join key ('cust_id' = 0 accounts for 40% of records). One executor tasks takes 45 minutes while others complete in 30 seconds. What is the optimal, production-grade solution in Spark 3.x?",
    options: [
      "Set spark.sql.shuffle.partitions=2000 and increase driver memory.",
      "Enable Adaptive Query Execution (AQE) skew join optimization: spark.sql.adaptive.skewJoin.enabled=true.",
      "Broadcast the skewed 100GB table using broadcast() hint.",
      "Switch from Parquet to CSV format with inferSchema=true."
    ],
    answer: 1,
    explanation: "In Spark 3.x, AQE skew join optimization automatically detects skewed partitions at runtime and splits them into smaller sub-partitions without requiring manual salting code or cluster restarts."
  },
  {
    id: 2,
    scenario: "You observe significant 'Spill (Memory)' and 'Spill (Disk)' metrics in the Spark UI Stage tab during a Sort-Merge Join. What does this indicate and how should you address it?",
    options: [
      "The driver node has run out of memory; increase spark.driver.memory.",
      "Executors ran out of execution memory while sorting/buffering rows, spilling pages to local scratch disk. Increase spark.sql.shuffle.partitions or executor memory.",
      "The Parquet files are corrupted and must be re-ingested with .option('mode', 'DROPMALFORMED').",
      "Network saturation between worker nodes; enable compression with spark.io.compression.codec=snappy."
    ],
    answer: 1,
    explanation: "Spill occurs when the memory manager's execution space is exceeded, forcing intermediate sort/aggregate buffers onto the executor disk, incurring severe I/O penalties. Increasing shuffle partition count reduces partition size so they fit in memory."
  },
  {
    id: 3,
    scenario: "In a Structured Streaming pipeline tracking user pageviews, late-arriving events cause the state store (RocksDB) to grow indefinitely until executors crash with OOM. What mechanism is required?",
    options: [
      "Add df.persist(StorageLevel.MEMORY_AND_DISK).",
      "Apply withWatermark('event_time', '2 hours') to allow the engine to discard state older than the watermark threshold.",
      "Change Output Mode from Append to Complete.",
      "Increase spark.cleaner.periodicGC.interval."
    ],
    answer: 1,
    explanation: "Watermarking defines how late data can arrive before being dropped and allows the stateful streaming engine to evict old state entries from memory/RocksDB, bounding state store growth."
  },
  {
    id: 4,
    scenario: "A data scientist proposes implementing a Python UDF using standard row-by-row iteration for calculating statistical z-scores across a 500-million row DataFrame. Why should this be refactored?",
    options: [
      "Python UDFs cannot execute on worker nodes; they only run on the driver.",
      "Standard Python UDFs suffer from heavy serialization overhead between JVM and Python processes (Py4J). Replace with PySpark native SQL functions or Arrow-vectorized Pandas UDFs.",
      "Python UDFs automatically drop NULL values silently.",
      "UDFs disable all disk caching on executor nodes."
    ],
    answer: 1,
    explanation: "Standard Python UDFs serialize data row-by-row across JVM and Python daemon via pipes. Vectorized Pandas UDFs leverage Apache Arrow columnar batches, executing orders of magnitude faster with SIMD vectorization."
  },
  {
    id: 5,
    scenario: "You have a Delta Lake table with 10 billion records. Queries frequently filter by 'device_uuid' (cardinality > 50 million). Partitioning by device_uuid resulted in millions of tiny files. What is the Lakehouse best practice?",
    options: [
      "Partition by device_uuid and run VACUUM RETAIN 0 HOURS.",
      "Keep the table unpartitioned (or partitioned by date) and execute OPTIMIZE table ZORDER BY (device_uuid) to cluster data within files.",
      "Convert the Delta table to JSON format for faster indexing.",
      "Use spark.conf.set('spark.sql.files.maxPartitionBytes', 1024)."
    ],
    answer: 1,
    explanation: "High-cardinality columns should never be used as directory partition keys due to the small file problem. Z-Ordering collocates related records inside Parquet files, allowing Delta data skipping to prune files efficiently."
  }
]

const currentIndex = ref(0)
const selectedOption = ref<number | null>(null)
const isAnswerSubmitted = ref(false)
const score = ref(0)
const isCompleted = ref(false)

function onSelectOption(idx: number) {
  if (isAnswerSubmitted.value) return
  selectedOption.value = idx
}

function submitAnswer() {
  if (selectedOption.value === null) return
  isAnswerSubmitted.value = true
  if (selectedOption.value === questions[currentIndex.value].answer) {
    score.value++
  }
}

function nextQuestion() {
  if (currentIndex.value < questions.length - 1) {
    currentIndex.value++
    selectedOption.value = null
    isAnswerSubmitted.value = false
  } else {
    isCompleted.value = true
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#FF6B35', '#906BFF', '#34D399']
    })
  }
}

function restartQuiz() {
  currentIndex.value = 0
  selectedOption.value = null
  isAnswerSubmitted.value = false
  score.value = 0
  isCompleted.value = false
}

function close() {
  emit('close')
}
</script>

<template>
  <div class="quiz-backdrop" @click.self="close">
    <div class="quiz-dialog">
      <div class="quiz-header">
        <div class="header-left">
          <span class="quiz-badge">SCENARIO SIMULATOR</span>
          <h3 class="quiz-title">Staff / Senior PySpark Interview Challenge</h3>
        </div>
        <button class="close-btn" @click="close">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>

      <!-- Quiz Body -->
      <div v-if="!isCompleted" class="quiz-body">
        <div class="progress-indicator">
          <span>Question {{ currentIndex + 1 }} of {{ questions.length }}</span>
          <span class="current-score">Score: {{ score }} / {{ currentIndex + (isAnswerSubmitted ? 1 : 0) }}</span>
        </div>

        <div class="scenario-box">
          <p class="scenario-text">{{ questions[currentIndex].scenario }}</p>
        </div>

        <div class="options-grid">
          <button
            v-for="(opt, idx) in questions[currentIndex].options"
            :key="idx"
            class="option-card"
            :class="{
              selected: selectedOption === idx,
              correct: isAnswerSubmitted && idx === questions[currentIndex].answer,
              wrong: isAnswerSubmitted && selectedOption === idx && idx !== questions[currentIndex].answer
            }"
            @click="onSelectOption(idx)"
          >
            <span class="option-letter">{{ ['A', 'B', 'C', 'D'][idx] }}</span>
            <span class="option-text">{{ opt }}</span>
          </button>
        </div>

        <!-- Explanation Feedback -->
        <div v-if="isAnswerSubmitted" class="explanation-box" :class="{ 'is-correct': selectedOption === questions[currentIndex].answer }">
          <div class="explanation-title">
            <svg v-if="selectedOption === questions[currentIndex].answer" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#10B981" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:4px;">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <svg v-else viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#EF4444" stroke-width="2.5" style="display:inline-block; vertical-align:middle; margin-right:4px;">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
            <span>{{ selectedOption === questions[currentIndex].answer ? 'Correct Architectural Decision' : 'Review Architecture Principle' }}</span>
          </div>
          <div class="explanation-text">{{ questions[currentIndex].explanation }}</div>
        </div>

        <div class="quiz-footer">
          <button
            v-if="!isAnswerSubmitted"
            class="btn-submit"
            :disabled="selectedOption === null"
            @click="submitAnswer"
          >
            Confirm Answer
          </button>
          <button
            v-else
            class="btn-next"
            @click="nextQuestion"
          >
            <span>{{ currentIndex === questions.length - 1 ? 'View Final Results' : 'Next Scenario' }}</span>
          </button>
        </div>
      </div>

      <!-- Results Screen -->
      <div v-else class="quiz-results">
        <svg class="trophy-svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#FF6B35" stroke-width="1.8">
          <path d="M6 9H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3m12 6h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2h-3M6 3h12v7a6 6 0 0 1-12 0V3z"></path>
          <path d="M9 21h6"></path>
          <path d="M12 17v4"></path>
        </svg>
        <h2 class="result-title">Scenario Challenge Complete</h2>
        <p class="result-score">
          You scored <span class="highlight">{{ score }}</span> out of <span class="highlight">{{ questions.length }}</span> ({{ Math.round((score / questions.length) * 100) }}%)
        </p>
        <p class="result-msg">
          {{ score >= 4 ? 'Exceptional! Your distributed systems intuition and PySpark internals knowledge are on track for Senior/Staff interview rounds.' : 'Good effort! Review the Memory Management, Shuffle Optimization, and Structured Streaming sections to tighten your answers.' }}
        </p>

        <div class="result-actions">
          <button class="btn-restart" @click="restartQuiz">Retake Challenge</button>
          <button class="btn-done" @click="close">Return to Dashboard</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.quiz-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: rgba(8, 9, 13, 0.85);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.quiz-dialog {
  width: 100%;
  max-width: 720px;
  background: #15161E;
  border: 1px solid rgba(255, 107, 53, 0.4);
  border-radius: 24px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.quiz-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.quiz-badge {
  font-size: 11px;
  font-weight: 700;
  color: #FF6B35;
  background: rgba(255, 107, 53, 0.14);
  padding: 3px 10px;
  border-radius: 9999px;
  letter-spacing: 0.05em;
  display: inline-block;
  margin-bottom: 4px;
}

.quiz-title {
  margin: 0;
  font-size: 17px;
  color: #FFFFFF;
}

.close-btn {
  background: transparent;
  border: none;
  color: #6E7387;
  cursor: pointer;
  padding: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #FFFFFF;
}

.quiz-body {
  padding: 24px;
}

.progress-indicator {
  display: flex;
  justify-content: space-between;
  font-size: 12.5px;
  color: #9CA3AF;
  margin-bottom: 14px;
}

.scenario-box {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 18px;
}

.scenario-text {
  margin: 0;
  color: #FFFFFF;
  font-size: 14.5px;
  line-height: 1.5;
}

.options-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 18px;
}

.option-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 12px 16px;
  text-align: left;
  cursor: pointer;
  color: #E2E8F0;
  transition: all 0.2s ease;
}

.option-card:hover:not(.correct):not(.wrong) {
  background: rgba(255, 255, 255, 0.07);
  border-color: rgba(255, 107, 53, 0.4);
}

.option-card.selected {
  background: rgba(255, 107, 53, 0.15);
  border-color: #FF6B35;
}

.option-card.correct {
  background: rgba(5, 150, 105, 0.2);
  border-color: #10B981;
  color: #A7F3D0;
}

.option-card.wrong {
  background: rgba(239, 68, 68, 0.18);
  border-color: #EF4444;
  color: #FECACA;
}

.option-letter {
  font-weight: 700;
  font-size: 12.5px;
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 7px;
  border-radius: 6px;
}

.option-text {
  font-size: 13.5px;
  line-height: 1.4;
}

.explanation-box {
  background: rgba(255, 107, 53, 0.1);
  border: 1px solid rgba(255, 107, 53, 0.3);
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 18px;
}

.explanation-box.is-correct {
  background: rgba(5, 150, 105, 0.12);
  border-color: rgba(16, 185, 129, 0.35);
}

.explanation-title {
  display: flex;
  align-items: center;
  font-size: 13.5px;
  font-weight: 700;
  color: #FFFFFF;
  margin-bottom: 4px;
}

.explanation-text {
  font-size: 12.5px;
  color: #D1D5DB;
  line-height: 1.45;
}

.quiz-footer {
  display: flex;
  justify-content: flex-end;
}

.btn-submit, .btn-next {
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  border: none;
  color: #FFFFFF;
  font-size: 13.5px;
  font-weight: 600;
  padding: 10px 22px;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(255, 107, 53, 0.35);
  transition: all 0.2s ease;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  box-shadow: none;
}

.quiz-results {
  padding: 40px 24px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.trophy-svg {
  margin-bottom: 14px;
}

.result-title {
  font-size: 22px;
  color: #FFFFFF;
  margin: 0 0 10px 0;
}

.result-score {
  font-size: 16px;
  color: #9CA3AF;
  margin: 0 0 12px 0;
}

.highlight {
  color: #FF6B35;
  font-weight: bold;
}

.result-msg {
  max-width: 520px;
  margin: 0 auto 28px auto;
  font-size: 14px;
  color: #D1D5DB;
  line-height: 1.5;
}

.result-actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

.btn-restart {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
  padding: 10px 20px;
  border-radius: 10px;
  cursor: pointer;
}

.btn-done {
  background: linear-gradient(135deg, #FF6B35 0%, #EA580C 100%);
  border: none;
  color: #FFFFFF;
  padding: 10px 22px;
  border-radius: 10px;
  cursor: pointer;
  font-weight: 600;
}
</style>
