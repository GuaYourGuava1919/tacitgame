<script setup lang="ts">
import { MODES } from '../net'
import { clearRecords, records, type GameRecord } from '../records'

defineEmits<{ back: [] }>()

function fmt(ts: number) {
  return new Date(ts).toLocaleString('zh-TW', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const modeName = (r: GameRecord) => MODES.find((m) => m.id === r.mode)?.name ?? ''

function headline(r: GameRecord) {
  if (r.mode !== 'chain') return `默契 ${r.index}%`
  if (r.outcome !== 'success') return '未對上'
  const last = r.rounds[r.rounds.length - 1]
  return [...new Set(last.words.map((w) => w.word))].join(' ≈ ')
}

function clearAll() {
  if (confirm('清除所有紀錄？')) clearRecords()
}
</script>

<template>
  <div class="head">
    <h2>我的紀錄</h2>
    <button class="btn ghost" @click="$emit('back')">← 返回</button>
  </div>
  <p class="muted small">紀錄只存在這個瀏覽器裡。</p>

  <p v-if="!records.length" class="card empty muted">還沒有完成的對局，去開一局吧！</p>

  <details v-for="r in records" :key="r.id" class="card rec">
    <summary>
      <span class="hl">{{ headline(r) }}</span>
      <span class="muted small">
        {{ modeName(r) }}<template v-if="r.mode !== 'chain'">・{{ r.category }}</template>・{{ r.rounds.length }}
        {{ r.mode === 'chain' ? '輪' : '題' }}・{{ fmt(r.date) }}
      </span>
      <span class="rank small">
        <span v-for="p in r.ranking" :key="p.name" :class="{ me: p.me }">
          {{ p.name }}<template v-if="r.mode !== 'chain'"> {{ p.score }}</template>
        </span>
      </span>
    </summary>
    <ol>
      <li v-for="h in r.rounds" :key="h.n" :class="{ hit: h.hits }">
        <span class="n">{{ h.n }}</span>
        <div>
          <span v-if="h.q" class="q">{{ h.q }}</span>
          <span class="ws">
            <span v-for="w in h.words" :key="w.name" :title="w.name">{{ w.word || '—' }}</span>
          </span>
        </div>
      </li>
    </ol>
  </details>

  <button v-if="records.length" class="btn ghost clear" @click="clearAll">清除紀錄</button>
</template>

<style scoped>
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.small {
  font-size: 13px;
}
.empty {
  text-align: center;
}
.rec {
  margin-bottom: 10px;
  padding: 14px 18px;
}
summary {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.hl {
  font-family: var(--serif);
  font-weight: 700;
  font-size: 20px;
  color: var(--accent);
}
.rank {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.rank .me {
  font-weight: 700;
}
ol {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: grid;
  gap: 6px;
}
li {
  display: flex;
  gap: 10px;
}
li.hit .ws {
  color: var(--accent);
}
.n {
  width: 22px;
  color: var(--ink-soft);
  font-size: 12px;
  padding-top: 2px;
}
.q {
  display: block;
  font-size: 13px;
  color: var(--ink-soft);
}
.ws {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 14px;
  font-weight: 600;
}
.clear {
  display: block;
  margin: 12px auto 0;
}
</style>
