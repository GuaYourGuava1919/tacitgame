<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, MODES, net } from '../net'

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

const demo = [
  { name: '阿明', word: '雞排', hit: true },
  { name: '小花', word: '雞排', hit: true },
  { name: '小樹', word: '臭豆腐', hit: false },
]

const scoring = [
  { k: '+1', t: '每對上一個人', d: '你和誰答得一樣，你們兩個各得 1 分。' },
  { k: '≈', t: '意思一樣也算', d: '「腳踏車」和「單車」？雙方都按認同就算對上。' },
  { k: '+2', t: '全員同步', d: '三人以上全部答得一樣，每人再加 2 分。' },
]
</script>

<template>
  <section class="hero">
    <div class="copy">
      <p class="kicker">線上默契派對遊戲・2 到 8 人</p>
      <h1>你懂我，<br /><em>我懂你</em>嗎？</h1>
      <p class="muted lead">同一個問題，大家各自作答。看看誰跟誰最有默契，誰又是全場最難猜的人。</p>
    </div>

    <figure class="demo" aria-label="遊戲示意">
      <p class="dq">第 3 題・夜市必吃的一樣東西</p>
      <ul>
        <li v-for="d in demo" :key="d.name" :class="{ hit: d.hit }">
          <span class="dn">{{ d.name }}</span>
          <strong>{{ d.word }}</strong>
          <span v-if="d.hit" class="plus">+1</span>
        </li>
      </ul>
      <p class="dfoot">阿明 ⇄ 小花 對上了！</p>
    </figure>
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
    <h2>三種玩法</h2>
    <div class="grid">
      <article v-for="(m, i) in MODES" :key="m.id" class="mode" :class="{ main: i === 0 }">
        <span v-if="i === 0" class="badge">主打</span>
        <h3>{{ m.name }}</h3>
        <p class="short">{{ m.short }}</p>
        <p class="muted small">{{ m.desc }}</p>
      </article>
    </div>
  </section>

  <section class="scoring">
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
</template>

<style scoped>
.hero {
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 24px;
  align-items: center;
  padding: 16px 0 28px;
}
.kicker {
  font-size: 13px;
  color: var(--accent);
  font-weight: 700;
  letter-spacing: 0.08em;
  margin: 0 0 8px;
}
.hero h1 {
  font-size: clamp(34px, 8vw, 52px);
}
.hero em {
  font-style: normal;
  color: var(--accent);
}
.lead {
  margin: 14px 0 0;
}
.demo {
  margin: 0;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: 16px;
  transform: rotate(1.5deg);
}
.dq {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--ink-soft);
}
.demo ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 6px;
}
.demo li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: var(--surface-2);
}
.demo li.hit {
  background: var(--accent-soft);
}
.dn {
  font-size: 13px;
  color: var(--ink-soft);
  width: 36px;
}
.demo strong {
  flex: 1;
  font-family: var(--serif);
}
.plus {
  color: var(--accent);
  font-weight: 700;
  font-size: 14px;
}
.dfoot {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--accent);
  font-weight: 600;
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
  font-weight: 900;
  font-size: 18px;
}
.note {
  margin-top: 16px;
}

@media (max-width: 640px) {
  .hero {
    grid-template-columns: 1fr;
  }
  .demo {
    transform: none;
  }
  .grid {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 480px) {
  .actions {
    grid-template-columns: 1fr;
  }
}
</style>
