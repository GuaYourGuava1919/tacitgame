<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { api, MODES, net, type RoomView } from '../net'
import { saveGame } from '../records'
import { aggregateEdges } from '../stats'
import LobbyPanel from './LobbyPanel.vue'
import ResultPanel from './ResultPanel.vue'
import StringWeb, { type WebEdge, type WebNode } from './StringWeb.vue'

const props = defineProps<{ room: RoomView }>()

const draft = ref('')
const now = ref(Date.now())
const inputEl = ref<HTMLInputElement | null>(null)
const tick = window.setInterval(() => (now.value = Date.now()), 250)
onUnmounted(() => clearInterval(tick))

const mode = computed(() => props.room.settings.mode)
const modeName = computed(() => MODES.find((m) => m.id === mode.value)?.name ?? '')
const scored = computed(() => mode.value !== 'chain')
const you = computed(() => props.room.you)
const me = computed(() => props.room.players.find((p) => p.id === you.value))
const done = computed(() => ['finished', 'success', 'capped'].includes(props.room.phase))
const prev = computed(() => props.room.history[props.room.history.length - 1])
const hero = computed(() => props.room.players.find((p) => p.id === props.room.protagonist))
const iAmHero = computed(() => props.room.protagonist === you.value)
const centerId = computed(() => (mode.value === 'guess' ? props.room.protagonist : ''))
const nameOf = (id: string) => props.room.players.find((p) => p.id === id)?.name ?? '?'

const remaining = computed(() => {
  const ms = props.room.deadline - (now.value + net.clockOffset)
  return Math.max(0, Math.ceil(ms / 1000))
})
const progress = computed(() => Math.min(1, remaining.value / props.room.settings.timer))

// ---- 揭曉 ----
const words = computed(() => props.room.words ?? {})
const norm = (w: string) => w.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '')
const exact = (a: string, b: string) =>
  !!words.value[a] && !!words.value[b] && norm(words.value[a]) === norm(words.value[b])
const livePairs = computed(() => props.room.live?.pairs ?? [])
const matched = (a: string, b: string) =>
  livePairs.value.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
const claimed = (from: string, to: string) => (props.room.claims[from] ?? []).includes(to)
const inAnyPair = (id: string) => livePairs.value.some(([x, y]) => x === id || y === id)

function canClaim(target: string) {
  if (props.room.phase !== 'revealed') return false
  if (target === you.value) return false
  if (!words.value[you.value] || !words.value[target]) return false
  if (exact(you.value, target)) return false
  if (mode.value === 'guess') return iAmHero.value
  return true
}

/** 有人對我牽了線、我還沒回應 */
const pending = computed(() =>
  props.room.players
    .filter((p) => p.id !== you.value && claimed(p.id, you.value) && !matched(p.id, you.value))
    .map((p) => p.name),
)

// ---- 網的資料 ----
const pastEdges = computed<WebEdge[]>(() =>
  aggregateEdges(props.room.history).map((e) => ({ ...e, kind: 'past' })),
)

const writingNodes = computed<WebNode[]>(() =>
  props.room.players.map((p) => ({
    id: p.id,
    name: p.name,
    me: p.id === you.value,
    state: !p.connected ? 'off' : p.submitted ? 'inked' : 'idle',
    tag: scored.value ? String(p.score) : undefined,
  })),
)

const revealNodes = computed<WebNode[]>(() =>
  props.room.players.map((p) => ({
    id: p.id,
    name: p.name,
    me: p.id === you.value,
    word: words.value[p.id] || '（沒寫）',
    state: !p.connected ? 'off' : 'idle',
    hit: inAnyPair(p.id),
    clickable: canClaim(p.id),
    active: claimed(you.value, p.id),
    tag: scored.value && props.room.live ? `+${props.room.live.points[p.id] ?? 0}` : undefined,
  })),
)

const revealEdges = computed<WebEdge[]>(() => {
  const fresh: WebEdge[] = livePairs.value.map(([a, b], i) => ({
    a,
    b,
    kind: 'fresh',
    delay: 300 + i * 260,
    key: `f-${props.room.round}-${a}-${b}`,
  }))
  const claims: WebEdge[] = []
  for (const [from, tos] of Object.entries(props.room.claims))
    for (const to of tos)
      if (!matched(from, to)) claims.push({ a: from, b: to, kind: 'claim', key: `c-${from}-${to}` })
  return [...pastEdges.value, ...claims, ...fresh]
})

const readyCount = computed(() => props.room.players.filter((p) => p.ready).length)
const onlineCount = computed(() => props.room.players.filter((p) => p.connected).length)
const isLast = computed(() => scored.value && props.room.round >= props.room.total)

watch(
  () => [props.room.round, props.room.phase] as const,
  async ([, phase]) => {
    if (phase === 'writing' && props.room.myWord === null) {
      draft.value = ''
      await nextTick()
      inputEl.value?.focus()
    }
    if (['finished', 'success', 'capped'].includes(phase)) saveGame(props.room)
  },
  { immediate: true },
)

function submit() {
  const w = draft.value.trim()
  if (w && props.room.myWord === null) api.submit(w)
}

function leave() {
  const inGame = props.room.phase === 'writing' || props.room.phase === 'revealed'
  if (!inGame || confirm('遊戲進行中，確定離開？')) api.leave()
}
</script>

<template>
  <div class="room">
    <div class="head">
      <strong class="code">{{ room.code }}</strong>
      <span class="muted small meta">
        {{ modeName }}
        <template v-if="room.phase !== 'waiting' && scored">・{{ room.round }}/{{ room.total }}</template>
        <template v-else-if="room.phase !== 'waiting' && room.round">・第 {{ room.round }} 輪</template>
      </span>
      <button class="btn ghost" @click="leave">離開</button>
    </div>

    <LobbyPanel v-if="room.phase === 'waiting'" :room="room" />

    <ResultPanel v-else-if="done" :room="room" />

    <!-- 作答中 -->
    <section v-else-if="room.phase === 'writing'" class="stage">
      <header class="q">
        <p class="kicker">
          <template v-if="mode === 'guess'">
            <template v-if="iAmHero">這題你是主角・照你自己的想法答</template>
            <template v-else>猜猜「{{ hero?.name }}」會怎麼答</template>
          </template>
          <template v-else-if="mode === 'chain'">{{ prev ? '從這些詞出發，想一個連起它們的詞' : '第一輪・想到什麼就寫什麼' }}</template>
          <template v-else>第 {{ room.round }} 題・猜猜大家會怎麼答</template>
        </p>
        <h2 v-if="room.question">{{ room.question }}</h2>
        <div v-else-if="prev" class="chips">
          <span v-for="p in room.players" :key="p.id" class="chip">{{ prev.words[p.id] || '—' }}</span>
        </div>
      </header>

      <StringWeb :nodes="writingNodes" :edges="pastEdges" :center-id="centerId" :progress="progress">
        <template v-if="!centerId">
          <span class="count" :class="{ low: remaining <= 5 }">{{ remaining }}</span>
          <span class="muted tiny">秒</span>
        </template>
      </StringWeb>
      <p v-if="centerId" class="count-inline" :class="{ low: remaining <= 5 }">{{ remaining }} 秒</p>

      <form v-if="room.myWord === null" class="write" @submit.prevent="submit">
        <input
          ref="inputEl"
          v-model="draft"
          class="ink-input"
          maxlength="20"
          :placeholder="mode === 'guess' && !iAmHero ? `${hero?.name} 會寫…` : '落筆寫下答案'"
          autocomplete="off"
          enterkeyhint="send"
        />
        <button class="btn primary" :disabled="!draft.trim()">蓋章</button>
      </form>
      <p v-else class="sent">你寫了「<strong>{{ room.myWord }}</strong>」・等其他人蓋章</p>
    </section>

    <!-- 揭曉 -->
    <section v-else-if="room.phase === 'revealed'" class="stage">
      <header class="q">
        <p class="kicker">第 {{ room.round }} {{ scored ? '題' : '輪' }}揭曉</p>
        <h2 v-if="room.question" class="sm">{{ room.question }}</h2>
      </header>

      <StringWeb :nodes="revealNodes" :edges="revealEdges" :center-id="centerId" @pick="api.claim">
        <template v-if="!centerId">
          <template v-if="room.live?.allSync && room.players.length >= 3 && mode === 'quiz'">
            <span class="big">全員同步</span>
            <span class="accent tiny">每人再 +2</span>
          </template>
          <template v-else-if="livePairs.length">
            <span class="big">{{ livePairs.length }}</span>
            <span class="muted tiny">條紅線</span>
          </template>
          <span v-else class="muted tiny">這題沒有線</span>
        </template>
      </StringWeb>

      <p v-if="pending.length" class="nudge">
        {{ pending.join('、') }} 對你牽了線，覺得一樣就點他的印章回應
      </p>
      <p v-else-if="mode === 'guess' && iAmHero" class="hint">意思接近的答案，點他的印章就算猜中</p>
      <p v-else-if="mode !== 'guess'" class="hint">覺得某人跟你意思一樣？點他的印章牽一條線，雙方都牽才算</p>

      <div class="nextrow">
        <button class="btn primary" :class="{ dim: me?.ready }" @click="api.next()">
          {{ me?.ready ? '等其他人…' : isLast ? '看默契網 →' : scored ? '下一題 →' : '下一輪 →' }}
          <span class="tally">{{ readyCount }}/{{ onlineCount }}</span>
        </button>
      </div>
    </section>

    <!-- 作答紀錄 -->
    <details v-if="room.history.length && !done && room.phase !== 'waiting'" class="log">
      <summary>{{ mode === 'chain' ? '詞鏈' : '作答紀錄' }}（{{ room.history.length }}）</summary>
      <ol>
        <li v-for="h in [...room.history].reverse()" :key="h.n" :class="{ hit: h.pairs.length }">
          <span class="n">{{ h.n }}</span>
          <div class="body">
            <span v-if="h.q" class="hq">{{ h.q }}<template v-if="h.protagonist">（主角：{{ nameOf(h.protagonist) }}）</template></span>
            <span class="ws">
              <span v-for="p in room.players" :key="p.id" :title="p.name">{{ h.words[p.id] || '—' }}</span>
            </span>
          </div>
          <span v-if="h.pairs.length" class="tag">{{ h.pairs.length }} 線</span>
        </li>
      </ol>
    </details>
  </div>
</template>

<style scoped>
.room {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.code {
  font-family: var(--serif);
  font-size: 18px;
  letter-spacing: 0.14em;
}
.meta {
  flex: 1;
}
.small {
  font-size: 13px;
}
.tiny {
  font-size: 12px;
  display: block;
}
.accent {
  color: var(--accent);
}

.stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.q {
  text-align: center;
  max-width: 560px;
}
.kicker {
  margin: 0;
  font-size: 13px;
  color: var(--accent);
  font-weight: 700;
  letter-spacing: 0.06em;
}
.q h2 {
  font-size: clamp(24px, 6vw, 34px);
  margin-top: 6px;
}
.q h2.sm {
  font-size: clamp(20px, 5vw, 26px);
}
.chips {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.chip {
  font-family: var(--serif);
  font-weight: 700;
  font-size: 20px;
  padding: 2px 14px;
  border-bottom: 2px solid var(--thread);
}
.count {
  font-family: var(--serif);
  font-weight: 700;
  font-size: clamp(34px, 9vw, 52px);
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.count.low,
.count-inline.low {
  color: var(--thread);
}
.count-inline {
  margin: -8px 0 0;
  font-family: var(--serif);
  font-weight: 700;
}
.big {
  font-family: var(--serif);
  font-weight: 700;
  font-size: clamp(22px, 6vw, 40px);
  line-height: 1.1;
  color: var(--thread);
  display: block;
}

.write {
  display: flex;
  gap: 10px;
  width: 100%;
  max-width: 440px;
  align-items: flex-end;
}
.ink-input {
  flex: 1;
  min-width: 0;
  border: 0;
  border-bottom: 2px solid var(--ink);
  background: transparent;
  font-family: var(--serif);
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  padding: 8px 4px;
  outline: none;
  border-radius: 0;
}
.ink-input:focus {
  border-bottom-color: var(--accent);
}
.ink-input::placeholder {
  color: var(--ink-soft);
  opacity: 0.6;
  font-weight: 400;
}
.sent {
  color: var(--ink-soft);
}
.sent strong {
  color: var(--thread);
  font-family: var(--serif);
}
.hint,
.nudge {
  margin: 0;
  font-size: 14px;
  text-align: center;
  color: var(--ink-soft);
}
.nudge {
  color: var(--accent);
  font-weight: 700;
  animation: pulse 1.6s ease-in-out infinite;
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
.nextrow {
  margin-top: 10px;
}
.tally {
  font-size: 12px;
  opacity: 0.75;
  font-weight: 400;
}
.btn.dim {
  opacity: 0.7;
}

.log {
  margin-top: 8px;
  border-top: 1px dashed var(--line);
  padding-top: 10px;
}
.log summary {
  cursor: pointer;
  font-weight: 600;
  color: var(--ink-soft);
  font-size: 14px;
}
.log ol {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
  display: grid;
  gap: 4px;
}
.log li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line);
}
.log li.hit .ws {
  color: var(--thread);
}
.n {
  font-size: 12px;
  color: var(--ink-soft);
  width: 22px;
}
.body {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.hq {
  font-size: 13px;
  color: var(--ink-soft);
}
.ws {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  font-weight: 600;
}
.tag {
  font-size: 12px;
  color: var(--thread);
  font-weight: 700;
}
</style>
