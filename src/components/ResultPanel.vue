<script setup lang="ts">
import { computed } from 'vue'
import { api, type RoomView } from '../net'
import { summarize, verdict } from '../stats'

const props = defineProps<{ room: RoomView }>()

const mode = computed(() => props.room.settings.mode)
const sum = computed(() => summarize(mode.value, props.room.players, props.room.history))
const meterBg = computed(
  () => `conic-gradient(var(--accent) ${sum.value.index}%, var(--surface-2) 0)`,
)
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
      <div class="stamp">合</div>
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
      <div class="meter" :style="{ background: meterBg }">
        <span class="pct">{{ sum.index }}<small>%</small></span>
      </div>
      <p class="muted small">默契指數（{{ sum.matched }} / {{ sum.possible }} 組對上）</p>
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
  position: relative;
  z-index: 1;
  font-family: var(--serif);
  font-weight: 900;
  font-size: 40px;
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
  border: 3px solid var(--accent);
  color: var(--accent);
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-family: var(--serif);
  font-weight: 900;
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
  font-weight: 900;
  color: var(--accent);
  margin: 8px 0 0;
}
</style>
