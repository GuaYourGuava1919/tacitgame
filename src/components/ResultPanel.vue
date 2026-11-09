<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, type RoomView } from '../net'
import { aggregateEdges, summarize, verdict } from '../stats'
import { exportWebImage } from '../exportWeb'
import StringWeb, { type WebEdge, type WebNode } from './StringWeb.vue'

const props = defineProps<{ room: RoomView }>()

const mode = computed(() => props.room.settings.mode)
const sum = computed(() => summarize(mode.value, props.room.players, props.room.history))
const edges = computed(() => aggregateEdges(props.room.history))
const webEdges = computed<WebEdge[]>(() =>
  edges.value.map((e, i) => ({ ...e, kind: 'final', delay: 200 + i * 180 })),
)
const webNodes = computed<WebNode[]>(() =>
  props.room.players.map((p) => ({
    id: p.id,
    name: p.name,
    me: p.id === props.room.you,
    state: 'inked',
    tag: mode.value === 'chain' ? undefined : `${p.score} 分`,
  })),
)
const saving = ref(false)
async function saveImage() {
  saving.value = true
  try {
    await exportWebImage({
      title: mode.value === 'chain' ? '想到一起了' : '我們的默契網',
      subtitle: `紅線挑戰・${mode.value === 'guess' ? '猜你會說' : mode.value === 'chain' ? '同詞聯想' : '默契問答'}${mode.value === 'chain' ? '' : '・' + props.room.categoryName}`,
      index: mode.value === 'chain' ? null : sum.value.index,
      verdict: mode.value === 'chain' ? chainWord.value : verdict(sum.value.index),
      players: props.room.players.map((p) => ({
        id: p.id,
        name: p.name,
        score: mode.value === 'chain' ? undefined : p.score,
      })),
      edges: edges.value,
    })
  } finally {
    saving.value = false
  }
}
const last = computed(() => props.room.history[props.room.history.length - 1])
const chainWord = computed(() =>
  last.value ? [...new Set(Object.values(last.value.words))].join(' ≈ ') : '',
)
const medals = ['🥇', '🥈', '🥉']
const bestWord = computed(() => {
  const r = sum.value.bestRound
  if (!r) return ''
  const [a] = r.pairs[0]
  return r.words[a]
})
</script>

<template>
  <section class="card result">
    <!-- 同詞聯想 -->
    <template v-if="room.phase === 'success'">
      <StringWeb :nodes="webNodes" :edges="webEdges" compact>
        <div class="stamp">合</div>
      </StringWeb>
      <h2>想到一起了！</h2>
      <p class="big-word">{{ chainWord }}</p>
      <p class="muted">用了 {{ room.history.length }} 輪</p>
    </template>
    <template v-else-if="room.phase === 'capped'">
      <h2>已到 {{ room.total }} 輪上限</h2>
      <p class="muted">這次沒對上，整條詞鏈都存進紀錄了。</p>
    </template>

    <!-- 問答 / 猜你會說 -->
    <template v-else>
      <p class="muted small">{{ mode === 'guess' ? '猜你會說' : '默契問答' }}・{{ room.categoryName }}・{{ room.history.length }} 題</p>
      <StringWeb :nodes="webNodes" :edges="webEdges">
        <span class="pct">{{ sum.index }}<small>%</small></span>
        <span class="muted tiny">默契指數</span>
      </StringWeb>
      <p class="muted small">{{ sum.matched }} / {{ sum.possible }} 條線牽上了・越常對上線越粗</p>
      <h2>{{ verdict(sum.index) }}</h2>

      <ol class="rank">
        <li v-for="(p, i) in sum.ranking" :key="p.id" :class="{ me: p.id === room.you }">
          <span class="pos">{{ medals[i] ?? i + 1 }}</span>
          <span class="nm">{{ p.name }}</span>
          <strong>{{ p.score }} 分</strong>
        </li>
      </ol>

      <div class="awards">
        <div v-if="sum.bestPair" class="award">
          <span class="muted small">最有默契的組合</span>
          <strong>{{ sum.bestPair.names[0] }} ⇄ {{ sum.bestPair.names[1] }}</strong>
          <span class="muted small">對上 {{ sum.bestPair.count }} 次</span>
        </div>
        <div v-if="sum.bestRound" class="award">
          <span class="muted small">最神同步的一題</span>
          <strong>{{ sum.bestRound.q }}</strong>
          <span class="muted small">「{{ bestWord }}」・{{ sum.bestRound.pairs.length }} 組對上</span>
        </div>
      </div>
    </template>

    <div class="btns">
      <button class="btn primary" @click="api.lobby()">回大廳再玩一局</button>
      <button class="btn" :disabled="saving" @click="saveImage">{{ saving ? '產生中…' : '存成圖片分享' }}</button>
      <button class="btn" @click="api.leave()">離開</button>
    </div>
  </section>
</template>

<style scoped>
.result {
  text-align: center;
}
.small {
  font-size: 13px;
}
h2 {
  font-size: 24px;
  margin: 6px 0 16px;
}
.tiny {
  font-size: 12px;
  display: block;
}
.meter {
  width: 140px;
  height: 140px;
  margin: 12px auto 8px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  position: relative;
}
.meter::after {
  content: '';
  position: absolute;
  inset: 13px;
  border-radius: 50%;
  background: var(--surface);
}
.pct {
  font-family: var(--serif);
  font-weight: 400;
  font-size: clamp(32px, 9vw, 52px);
  line-height: 1;
  display: block;
}
.pct small {
  font-size: 16px;
}
.rank {
  list-style: none;
  padding: 0;
  margin: 0 auto;
  max-width: 360px;
  display: grid;
  gap: 6px;
}
.rank li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  border-radius: 10px;
  background: var(--surface-2);
  text-align: left;
}
.rank li.me {
  outline: 2px solid var(--accent);
}
.pos {
  width: 28px;
  text-align: center;
}
.nm {
  flex: 1;
  font-weight: 600;
}
.awards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 10px;
  margin-top: 18px;
}
.award {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px;
  border-radius: 12px;
  border: 1px dashed var(--accent);
}
.award strong {
  font-family: var(--serif);
  font-size: 17px;
}
.btns {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 20px;
}
.stamp {
  width: 72px;
  height: 72px;
  margin: 4px auto 12px;
  border: 3px solid var(--thread);
  color: var(--thread);
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-family: var(--serif);
  font-weight: 400;
  font-size: 40px;
  transform: rotate(-8deg);
  animation: stamp 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) both;
}
@keyframes stamp {
  from {
    transform: rotate(-8deg) scale(2.2);
    opacity: 0;
  }
}
.big-word {
  font-family: var(--serif);
  font-size: 34px;
  font-weight: 400;
  color: var(--thread);
  margin: 8px 0 0;
}
</style>
