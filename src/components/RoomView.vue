<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { api, MODES, net, type RoomView } from '../net'
import { saveGame } from '../records'
import LobbyPanel from './LobbyPanel.vue'
import ResultPanel from './ResultPanel.vue'

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
const matched = (a: string, b: string) =>
  !!props.room.live?.pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))
const claimed = (from: string, to: string) => (props.room.claims[from] ?? []).includes(to)

/** 卡片排序：猜你會說時主角在最前，其餘自己優先 */
const cards = computed(() => {
  const list = [...props.room.players]
  const first = mode.value === 'guess' ? props.room.protagonist : you.value
  return list.sort((a, b) => Number(b.id === first) - Number(a.id === first))
})

/** 我能不能對這張卡按「意思一樣」 */
function canClaim(target: string) {
  if (target === you.value) return false
  if (!words.value[you.value] || !words.value[target]) return false
  if (exact(you.value, target)) return false
  if (mode.value === 'guess') return iAmHero.value
  return true
}

function cardStatus(id: string): { text: string; hit: boolean } | null {
  if (mode.value === 'guess') {
    if (id === props.room.protagonist) return { text: '主角', hit: false }
    if (matched(props.room.protagonist, id))
      return { text: exact(props.room.protagonist, id) ? '猜中！' : '主角認可 ✓', hit: true }
    return null
  }
  if (id === you.value) return null
  if (matched(you.value, id)) return { text: exact(you.value, id) ? '跟你一樣！' : '互相認同 ✓', hit: true }
  if (claimed(id, you.value) && !claimed(you.value, id)) return { text: 'TA 覺得跟你一樣', hit: false }
  return null
}

const pairNames = computed(() =>
  (props.room.live?.pairs ?? []).map(([a, b]) => {
    const n = (id: string) => props.room.players.find((p) => p.id === id)?.name ?? '?'
    return `${n(a)} ⇄ ${n(b)}`
  }),
)
const readyCount = computed(() => props.room.players.filter((p) => p.ready).length)
const onlineCount = computed(() => props.room.players.filter((p) => p.connected).length)
const isLast = computed(() => scored.value && props.room.round >= props.room.total)

const nameOf = (id: string) => props.room.players.find((p) => p.id === id)?.name ?? '?'

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
        <template v-if="room.phase !== 'waiting' && scored">・{{ room.round }}/{{ room.total }} 題</template>
        <template v-else-if="room.phase !== 'waiting' && room.round">・第 {{ room.round }} 輪</template>
      </span>
      <button class="btn ghost" @click="leave">離開</button>
    </div>

    <LobbyPanel v-if="room.phase === 'waiting'" :room="room" />

    <ResultPanel v-else-if="done" :room="room" />

    <template v-else>
      <!-- 分數列 -->
      <div v-if="scored" class="board">
        <span
          v-for="p in room.players"
          :key="p.id"
          class="pl"
          :class="{ me: p.id === you, off: !p.connected, hero: p.id === room.protagonist }"
        >
          {{ p.name }} <b>{{ p.score }}</b>
        </span>
      </div>

      <!-- 作答中 -->
      <section v-if="room.phase === 'writing'" class="card">
        <div class="timer">
          <div class="bar" :style="{ transform: `scaleX(${progress})` }" :class="{ low: remaining <= 5 }" />
        </div>

        <div class="prompt">
          <template v-if="mode === 'chain'">
            <template v-if="prev">
              <p class="muted small">從上一輪的詞出發，想一個連起它們的詞</p>
              <div class="chips">
                <span v-for="p in room.players" :key="p.id" class="chip" :class="{ empty: !prev.words[p.id] }">
                  {{ prev.words[p.id] || '（沒送出）' }}
                </span>
              </div>
            </template>
            <p v-else class="muted">第一輪：想到什麼就寫什麼</p>
          </template>
          <template v-else>
            <p class="muted small">
              <template v-if="mode === 'guess'">
                <template v-if="iAmHero">這題你是主角，照你自己的想法答</template>
                <template v-else>猜猜 <b class="accent">{{ hero?.name }}</b> 會怎麼答</template>
              </template>
              <template v-else>猜猜大家會怎麼答</template>
            </p>
            <h2 class="question">{{ room.question }}</h2>
          </template>
        </div>

        <form v-if="room.myWord === null" class="write" @submit.prevent="submit">
          <input
            ref="inputEl"
            v-model="draft"
            class="input big"
            maxlength="20"
            :placeholder="mode === 'guess' && !iAmHero ? `${hero?.name} 會寫…` : '寫下你的答案'"
            autocomplete="off"
            enterkeyhint="send"
          />
          <button class="btn primary" :disabled="!draft.trim()">送出</button>
        </form>
        <div v-else class="sent">你寫了 <strong>{{ room.myWord }}</strong>，等其他人…</div>

        <div class="status">
          <span class="count" :class="{ low: remaining <= 5 }">{{ remaining }}s</span>
          <span v-for="p in room.players" :key="p.id" class="who" :class="{ ok: p.submitted, off: !p.connected }">
            {{ p.submitted ? '✓' : '…' }} {{ p.name }}
          </span>
        </div>
      </section>

      <!-- 揭曉 -->
      <section v-else-if="room.phase === 'revealed'" class="card">
        <p class="muted small center">第 {{ room.round }} {{ scored ? '題' : '輪' }}揭曉</p>
        <h3 v-if="room.question" class="question sm center">{{ room.question }}</h3>

        <div class="cards">
          <div
            v-for="(p, i) in cards"
            :key="p.id"
            class="answer"
            :class="{
              mine: p.id === you,
              hit: cardStatus(p.id)?.hit,
              hero: p.id === room.protagonist,
            }"
            :style="{ animationDelay: `${i * 70}ms` }"
          >
            <div class="top">
              <span class="nm">{{ p.name }}{{ p.id === you ? '（你）' : '' }}</span>
              <span v-if="scored && room.live" class="pts">+{{ room.live.points[p.id] ?? 0 }}</span>
            </div>
            <span class="word" :class="{ empty: !words[p.id] }">{{ words[p.id] || '沒送出' }}</span>
            <span v-if="cardStatus(p.id)" class="st" :class="{ hit: cardStatus(p.id)?.hit }">
              {{ cardStatus(p.id)?.text }}
            </span>
            <button
              v-if="canClaim(p.id)"
              class="claim"
              :class="{ on: claimed(you, p.id) }"
              @click="api.claim(p.id)"
            >
              {{
                mode === 'guess'
                  ? claimed(you, p.id) ? '✓ 算他猜中' : '算他猜中？'
                  : claimed(you, p.id) ? '✓ 我覺得一樣' : '跟我意思一樣？'
              }}
            </button>
          </div>
        </div>

        <p v-if="room.live?.allSync && room.players.length >= 3 && mode === 'quiz'" class="sync">
          ✦ 全員同步！每人再 +2
        </p>
        <p v-else-if="pairNames.length" class="pairs">{{ pairNames.join('　') }}</p>
        <p v-else class="muted center small">
          {{ mode === 'guess' ? '沒人猜中…主角可以認可意思相近的答案' : '這題沒人對上，意思相近可以互相認同' }}
        </p>

        <div class="nextrow">
          <button class="btn primary" :class="{ dim: me?.ready }" @click="api.next()">
            {{ me?.ready ? '等其他人…' : isLast ? '看結果 →' : scored ? '下一題 →' : '下一輪 →' }}
            <span class="tally">{{ readyCount }}/{{ onlineCount }}</span>
          </button>
        </div>
        <p v-if="mode === 'chain'" class="muted small center">所有人都互相認同「意思一樣」就算完成</p>
      </section>
    </template>

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
          <span v-if="h.pairs.length" class="tag">{{ h.pairs.length }} 組</span>
        </li>
      </ol>
    </details>
  </div>
</template>

<style scoped>
.room {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.head {
  display: flex;
  align-items: center;
  gap: 12px;
}
.code {
  font-family: var(--serif);
  font-size: 20px;
  letter-spacing: 0.12em;
}
.meta {
  flex: 1;
}
.small {
  font-size: 13px;
}
.center {
  text-align: center;
}
.accent {
  color: var(--accent);
}

.board {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.pl {
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--surface);
  border: 1px solid var(--line);
  font-size: 14px;
}
.pl b {
  font-family: var(--serif);
  color: var(--accent);
  margin-left: 4px;
}
.pl.me {
  border-color: var(--accent);
}
.pl.hero {
  background: var(--accent-soft);
}
.pl.off {
  opacity: 0.45;
}

.timer {
  height: 4px;
  background: var(--surface-2);
  border-radius: 4px;
  overflow: hidden;
  margin: -4px 0 16px;
}
.timer .bar {
  height: 100%;
  background: var(--ink-soft);
  transform-origin: left;
  transition: transform 0.25s linear;
}
.timer .bar.low {
  background: var(--accent);
}
.prompt {
  text-align: center;
  margin-bottom: 16px;
}
.prompt p {
  margin: 0 0 6px;
}
.question {
  font-size: clamp(22px, 5.5vw, 30px);
  margin: 4px 0;
}
.question.sm {
  font-size: 20px;
  margin-bottom: 14px;
}
.chips {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
}
.chip {
  padding: 6px 16px;
  border-radius: 999px;
  background: var(--surface-2);
  font-weight: 600;
  font-size: 18px;
}
.chip.empty {
  font-weight: 400;
  font-size: 14px;
  color: var(--ink-soft);
}
.write {
  display: flex;
  gap: 8px;
}
.input.big {
  font-size: 20px;
  text-align: center;
}
.sent {
  text-align: center;
  padding: 14px;
  background: var(--ok-soft);
  border-radius: 10px;
}
.status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 14px;
  margin-top: 16px;
  font-size: 14px;
}
.count {
  font-family: var(--serif);
  font-weight: 700;
  font-size: 18px;
  margin-right: auto;
  font-variant-numeric: tabular-nums;
}
.count.low {
  color: var(--accent);
}
.who {
  color: var(--ink-soft);
}
.who.ok {
  color: var(--ok);
}
.who.off {
  text-decoration: line-through;
  opacity: 0.6;
}

.cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 10px;
}
.answer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 10px 10px 12px;
  border-radius: 12px;
  background: var(--surface-2);
  border: 1.5px solid transparent;
  animation: flip 0.4s ease-out both;
}
@keyframes flip {
  from {
    opacity: 0;
    transform: rotateX(70deg);
  }
}
.answer.mine {
  border-color: var(--line);
  background: var(--bg);
}
.answer.hero {
  border-color: var(--ink-soft);
}
.answer.hit {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.top {
  width: 100%;
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: var(--ink-soft);
}
.pts {
  color: var(--accent);
  font-weight: 700;
}
.word {
  font-family: var(--serif);
  font-size: 24px;
  font-weight: 700;
  text-align: center;
  word-break: break-all;
}
.word.empty {
  color: var(--ink-soft);
  font-size: 16px;
  font-weight: 400;
}
.st {
  font-size: 12px;
  color: var(--ink-soft);
}
.st.hit {
  color: var(--accent);
  font-weight: 700;
}
.claim {
  border: 1px dashed var(--ink-soft);
  background: transparent;
  border-radius: 999px;
  padding: 3px 12px;
  font-size: 12px;
  color: var(--ink-soft);
}
.claim.on {
  border-style: solid;
  border-color: var(--accent);
  color: var(--accent);
  font-weight: 700;
}
.sync,
.pairs {
  text-align: center;
  color: var(--accent);
  font-weight: 700;
  margin: 14px 0 0;
}
.sync {
  font-size: 18px;
}
.nextrow {
  display: flex;
  justify-content: center;
  margin-top: 14px;
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
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 16px;
}
.log summary {
  cursor: pointer;
  font-weight: 600;
}
.log ol {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
  display: grid;
  gap: 6px;
}
.log li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-top: 1px solid var(--line);
}
.log li.hit .ws {
  color: var(--accent);
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
  color: var(--accent);
  font-weight: 700;
}
@media (max-width: 480px) {
  .write {
    flex-direction: column;
  }
  .cards {
    grid-template-columns: 1fr 1fr;
  }
}
</style>
