<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue'
import { api, MODES, net } from '../net'
import StringWeb, { type WebEdge, type WebNode } from './StringWeb.vue'

const urlCode = api.pendingRoomFromUrl()
const name = ref(net.name)
const code = ref(urlCode)

const nameOk = computed(() => name.value.trim().length > 0)
const codeOk = computed(() => /^\d{6}$/.test(code.value.trim()))
const nameInput = ref<HTMLInputElement | null>(null)

function need(): boolean {
  if (!nameOk.value) {
    nameInput.value?.focus()
    return false
  }
  api.setName(name.value)
  return true
}
function create() {
  if (need()) api.create('quiz')
}
function join() {
  if (codeOk.value && need()) api.join(code.value)
}
function random() {
  if (need()) api.random()
}

// 首頁示範：每幾秒換一題，紅線重新牽一次
const demos = [
  { q: '夜市必吃的一樣東西', w: ['雞排', '雞排', '臭豆腐', '雞排'], pairs: [[0, 1], [1, 3], [0, 3]] },
  { q: '一說到夏天，想到什麼？', w: ['西瓜', '海邊', '西瓜', '冷氣'], pairs: [[0, 2]] },
  { q: '荒島上只能帶一樣東西', w: ['刀', '手機', '打火機', '小刀'], pairs: [[0, 3]] },
]
const names = ['阿明', '小花', '小樹', '雨']
const step = ref(0)
const loop = window.setInterval(() => step.value++, 5200)
onUnmounted(() => clearInterval(loop))
const demo = computed(() => demos[step.value % demos.length])
const demoNodes = computed<WebNode[]>(() =>
  names.map((name, i) => ({
    id: String(i),
    name,
    word: demo.value.w[i],
    state: 'inked',
    hit: demo.value.pairs.some((p) => p.includes(i)),
  })),
)
const demoEdges = computed<WebEdge[]>(() =>
  demo.value.pairs.map(([a, b], i) => ({
    a: String(a),
    b: String(b),
    kind: 'fresh',
    delay: 500 + i * 350,
    key: `${step.value}-${a}-${b}`,
  })),
)

const stats = [
  { n: '210 題', t: '內建題庫', d: '7 種主題，也能自己出題' },
  { n: '8 人', t: '一間房最多', d: '分享連結，到齊就能開' },
  { n: '3 種', t: '玩法', d: '主打默契問答，結算看默契網' },
]

const scoring = [
  { k: '+1', t: '牽上一條紅線', d: '你和誰答得一樣，你們之間就牽起一條紅線，各得 1 分。' },
  { k: '≈', t: '意思一樣也算', d: '「腳踏車」和「單車」？點對方的印章牽線，雙方都牽就算。' },
  { k: '+2', t: '全員同步', d: '三人以上全部答得一樣，紅線連成一圈，每人再加 2 分。' },
]
</script>

<template>
  <div class="home">
  <section class="hero">
    <div class="copy">
      <p class="pill"><span class="dot" />默契問答・猜你會說・2 到 8 人・免費</p>
      <h1>你懂我，<br /><span class="mark">我懂你</span>嗎？</h1>
      <p class="muted lead">同一個問題，大家各自作答。答得一樣的人之間會牽起一條紅線，一局下來，織成你們專屬的默契網。</p>
    </div>

    <figure class="demo" aria-label="遊戲示意">
      <p class="dq">
        <Transition name="fade" mode="out-in"><span :key="step">{{ demo.q }}</span></Transition>
      </p>
      <StringWeb :nodes="demoNodes" :edges="demoEdges" compact>
        <span class="dn">{{ demo.pairs.length }}</span>
        <span class="muted dl">條紅線</span>
      </StringWeb>
    </figure>
  </section>

  <section class="stats">
    <div v-for="s in stats" :key="s.n" class="card stat">
      <strong>{{ s.n }}</strong>
      <span class="st-t">{{ s.t }}</span>
      <span class="muted st-d">{{ s.d }}</span>
    </div>
  </section>

  <section class="card panel">
    <div v-if="net.matching" class="matching">
      <div class="pulse" />
      <h3>正在幫你找玩伴…</h3>
      <p class="muted">配對成功會直接開始一局 10 題的默契問答</p>
      <button class="btn" @click="api.cancelRandom()">取消</button>
    </div>

    <template v-else>
      <label class="name">
        <span class="label">先取個暱稱</span>
        <input
          ref="nameInput"
          v-model="name"
          class="input"
          maxlength="12"
          placeholder="例如：小樹"
          @change="api.setName(name)"
        />
      </label>

      <div class="actions">
        <div class="act">
          <h3>開一間房</h3>
          <p class="muted small">進房後再選模式、題庫、自訂題目</p>
          <button class="btn primary block" :disabled="!net.connected" @click="create">
            建立房間
          </button>
        </div>
        <div class="act">
          <h3>有房號？</h3>
          <p class="muted small">輸入朋友給你的 6 位數</p>
          <form class="join" @submit.prevent="join">
            <input
              v-model="code"
              class="input code"
              inputmode="numeric"
              maxlength="6"
              placeholder="000000"
            />
            <button class="btn" :disabled="!codeOk || !net.connected">加入</button>
          </form>
        </div>
      </div>

      <button class="link" :disabled="!net.connected" @click="random">
        沒有朋友在線？隨機找一個人玩 →
      </button>
    </template>
  </section>

  <section class="modes">
    <p class="eyebrow">01 / Modes</p>
    <h2>三種玩法</h2>
    <div class="grid">
      <article v-for="(m, i) in MODES" :key="m.id" class="mode" :class="{ main: i === 0 }">
        <span v-if="i === 0" class="badge">主打</span>
        <span class="num">0{{ i + 1 }}</span>
        <h3>{{ m.name }}</h3>
        <p class="short">{{ m.short }}</p>
        <p class="muted small">{{ m.desc }}</p>
      </article>
    </div>
  </section>

  <section class="scoring">
    <p class="eyebrow">02 / Scoring</p>
    <h2>怎麼得分</h2>
    <div class="rows">
      <div v-for="s in scoring" :key="s.t" class="row">
        <span class="k">{{ s.k }}</span>
        <div>
          <strong>{{ s.t }}</strong>
          <p class="muted small">{{ s.d }}</p>
        </div>
      </div>
    </div>
    <p class="muted small note">
      題庫有 210 題、7 種主題，也可以在房間裡自己出題，例如只有你們才懂的題目。
    </p>
  </section>
  </div>
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 24px;
  align-items: center;
  padding: 16px 0 28px;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 18px;
  padding: 5px 14px;
  border: 1px solid var(--line-strong);
  border-radius: 999px;
  background: var(--surface);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-body);
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
  margin-bottom: 20px;
}
.stat {
  display: flex;
  flex-direction: column;
  padding: 18px 20px;
}
.stat strong {
  font-size: 28px;
  font-weight: 700;
  color: var(--accent);
  line-height: 1.2;
}
.st-t {
  font-weight: 700;
  font-size: 14px;
  margin-top: 4px;
}
.st-d {
  font-size: 12px;
}
.num {
  display: block;
  font-weight: 600;
  font-size: 13px;
  color: var(--accent);
  margin-bottom: 6px;
}
.eyebrow + h2 {
  margin-top: 8px;
}
.hero h1 {
  font-size: clamp(34px, 8vw, 52px);
}
.lead {
  margin: 14px 0 0;
}
.demo {
  margin: 0;
  text-align: center;
}
.dq {
  margin: 0;
  font-family: var(--serif);
  font-weight: 400;
  font-size: 18px;
  min-height: 1.6em;
}
.dn {
  display: block;
  font-family: var(--serif);
  font-weight: 400;
  font-size: 40px;
  line-height: 1;
  color: var(--thread);
}
.dl {
  font-size: 12px;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.small {
  font-size: 13px;
}
.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}
.act {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
}
.act h3 {
  font-size: 18px;
}
.act p {
  margin: 2px 0 12px;
  flex: 1;
}
.join {
  display: flex;
  gap: 8px;
}
.code {
  letter-spacing: 0.25em;
  text-align: center;
  min-width: 0;
  padding: 10px;
}
.link {
  border: 0;
  background: none;
  color: var(--ink-soft);
  text-decoration: underline;
  text-underline-offset: 3px;
  align-self: center;
  font-size: 14px;
}
.link:hover {
  color: var(--accent);
}
.matching {
  text-align: center;
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.matching p {
  margin: 0 0 8px;
}
.pulse {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  animation: pulse 1.2s infinite;
  margin-bottom: 8px;
}
@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 50%, transparent);
  }
  100% {
    box-shadow: 0 0 0 18px transparent;
  }
}

.modes,
.scoring {
  margin-top: 40px;
}
h2 {
  font-size: 22px;
  margin-bottom: 14px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}
.mode {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 16px;
}
.mode.main {
  border-color: var(--accent);
  box-shadow: var(--shadow);
}
.badge {
  position: absolute;
  top: -10px;
  right: 12px;
  background: var(--accent);
  color: var(--accent-ink);
  font-size: 12px;
  font-weight: 700;
  padding: 1px 10px;
  border-radius: 999px;
}
.mode h3 {
  font-size: 19px;
}
.short {
  font-weight: 600;
  margin: 4px 0;
  font-size: 14px;
}
.mode p.small {
  margin: 0;
}
.rows {
  display: grid;
  gap: 10px;
}
.row {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}
.row p {
  margin: 2px 0 0;
}
.k {
  flex: none;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: var(--serif);
  font-weight: 400;
  font-size: 18px;
}
.note {
  margin-top: 16px;
}

@media (max-width: 640px) {
  /* 手機：主要動作（取暱稱、建立/加入房間）往前排，不用滑過示意動畫和數據卡 */
  .home {
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .hero {
    display: contents;
  }
  .copy {
    order: 1;
    padding-top: 4px;
  }
  .panel {
    order: 2;
  }
  .demo {
    order: 3;
  }
  .stats {
    order: 4;
    margin-bottom: 0;
  }
  .modes {
    order: 5;
  }
  .scoring {
    order: 6;
  }
  .modes,
  .scoring {
    margin-top: 10px;
  }
  .hero h1 {
    font-size: 36px;
  }
  .lead {
    margin-top: 10px;
  }
  .grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 480px) {
  .stats {
    gap: 8px;
  }
  .stat {
    padding: 12px;
  }
  .stat strong {
    font-size: 21px;
  }
  .st-t {
    font-size: 12px;
  }
  .st-d {
    display: none;
  }
  .actions {
    grid-template-columns: 1fr;
  }
}
</style>
