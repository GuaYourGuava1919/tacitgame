<script setup lang="ts">
import { computed, ref } from 'vue'
import { api, MODES, QUIZ_CATEGORIES, type RoomView } from '../net'
import StringWeb, { type WebNode } from './StringWeb.vue'

const props = defineProps<{ room: RoomView }>()

const isHost = computed(() => props.room.hostId === props.room.you)
const s = computed(() => props.room.settings)
const online = computed(() => props.room.players.filter((p) => p.connected))
const canStart = computed(() => isHost.value && online.value.length >= 2)
const hostName = computed(() => props.room.players.find((p) => p.id === props.room.hostId)?.name)
const usesQuestions = computed(() => s.value.mode !== 'chain')

const draft = ref('')
const copied = ref(false)

const shareUrl = computed(() => {
  const u = new URL(location.href)
  u.search = `?room=${props.room.code}`
  return u.toString()
})

function addQ() {
  const t = draft.value.trim()
  if (!t) return
  api.addQuestion(t)
  draft.value = ''
}

async function share() {
  const text = `來玩紅線挑戰，測測我們有多少默契！房號 ${props.room.code}`
  try {
    if (navigator.share) {
      await navigator.share({ title: '紅線挑戰', text, url: shareUrl.value })
      return
    }
  } catch {
    /* 取消分享，改用複製 */
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${shareUrl.value}`)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    /* ignore */
  }
}

const myCount = computed(() => props.room.custom.filter((q) => q.mine).length)

const nodes = computed<WebNode[]>(() =>
  props.room.players.map((p) => ({
    id: p.id,
    name: p.name,
    me: p.id === props.room.you,
    state: p.connected ? 'inked' : 'off',
    tag: p.id === props.room.hostId ? '♛' : undefined,
  })),
)
</script>

<template>
  <div class="lobby">
    <section class="invite">
      <StringWeb :nodes="nodes" compact>
        <span class="muted tiny">房號</span>
        <span class="code">{{ room.code }}</span>
        <span class="muted tiny">{{ online.length }} / 8 人</span>
      </StringWeb>
      <button class="btn primary" @click="share">{{ copied ? '已複製連結 ✓' : '分享邀請連結' }}</button>
      <p class="muted small">每來一個人，圓上就多蓋一枚印章</p>
    </section>

    <section class="card">
      <h3>
        遊戲設定
        <span v-if="!isHost" class="muted small">由房主 {{ hostName }} 決定</span>
      </h3>

      <div class="modes">
        <button
          v-for="m in MODES"
          :key="m.id"
          class="mode"
          :class="{ on: s.mode === m.id }"
          :disabled="!isHost"
          @click="api.settings({ mode: m.id })"
        >
          <strong>{{ m.name }}</strong>
          <span>{{ m.short }}</span>
        </button>
      </div>
      <p class="mode-desc muted">{{ MODES.find((m) => m.id === s.mode)?.desc }}</p>

      <template v-if="usesQuestions">
        <span class="label">題庫</span>
        <div class="seg">
          <button
            v-for="c in QUIZ_CATEGORIES"
            :key="c.id"
            class="btn"
            :class="{ on: s.category === c.id }"
            :disabled="!isHost"
            @click="api.settings({ category: c.id })"
          >
            {{ c.name }}
          </button>
        </div>
        <span class="label">題數</span>
        <div class="seg">
          <button
            v-for="t in [5, 10, 15, 20]"
            :key="t"
            class="btn"
            :class="{ on: s.total === t }"
            :disabled="!isHost"
            @click="api.settings({ total: t })"
          >
            {{ t }} 題
          </button>
        </div>
      </template>

      <span class="label">作答時間</span>
      <div class="seg">
        <button
          v-for="t in [20, 40, 60]"
          :key="t"
          class="btn"
          :class="{ on: s.timer === t }"
          :disabled="!isHost"
          @click="api.settings({ timer: t })"
        >
          {{ t }} 秒
        </button>
      </div>
    </section>

    <section v-if="usesQuestions" class="card">
      <h3>自己出題 <span class="muted small">會優先抽到，開局前其他人看不到題目</span></h3>
      <form class="add" @submit.prevent="addQ">
        <input
          v-model="draft"
          class="input"
          maxlength="40"
          placeholder="例如：我們第一次出去玩去哪？"
        />
        <button class="btn" :disabled="!draft.trim()">加入</button>
      </form>
      <ul v-if="room.custom.length" class="qs">
        <li v-for="q in room.custom" :key="q.id">
          <span v-if="q.text">{{ q.text }}</span>
          <span v-else class="muted">🔒 {{ q.by }} 出的神秘題</span>
          <button v-if="q.mine || isHost" class="btn ghost" title="移除" @click="api.removeQuestion(q.id)">✕</button>
        </li>
      </ul>
      <p class="muted small">
        共 {{ room.custom.length }} 題自訂（你出了 {{ myCount }} 題）。不夠的會從題庫補上。
      </p>
    </section>

    <div class="go">
      <button v-if="isHost" class="btn primary big" :disabled="!canStart" @click="api.start()">
        {{ canStart ? '開始遊戲' : '至少要 2 個人' }}
      </button>
      <p v-else class="muted">等房主 {{ hostName }} 開始…</p>
    </div>
  </div>
</template>

<style scoped>
.lobby {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.small {
  font-size: 13px;
  font-weight: 400;
}
h3 {
  font-size: 17px;
  margin-bottom: 12px;
  display: flex;
  align-items: baseline;
  gap: 8px;
  flex-wrap: wrap;
}
.invite {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-align: center;
}
.invite p {
  margin: 0;
}
.tiny {
  font-size: 12px;
  display: block;
}
.code {
  display: block;
  font-family: var(--serif);
  font-weight: 400;
  font-size: clamp(17px, 4.6vw, 24px);
  letter-spacing: 0.04em;
  line-height: 1.2;
}
.people {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.people li {
  padding: 6px 14px;
  border-radius: 999px;
  background: var(--surface-2);
  font-weight: 600;
}
.people li.me {
  background: var(--accent-soft);
  color: var(--accent);
}
.people li.off {
  opacity: 0.45;
}
.modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 14px;
}
.mode {
  text-align: left;
  border: 1.5px solid var(--line);
  background: var(--bg);
  border-radius: 12px;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.mode:disabled {
  cursor: default;
}
.mode strong {
  font-family: var(--serif);
  font-size: 16px;
}
.mode span {
  font-size: 12px;
  color: var(--ink-soft);
  line-height: 1.4;
}
.mode.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.label {
  margin-top: 12px;
}
.seg .btn:disabled {
  opacity: 1;
  cursor: default;
}
.seg .btn:disabled:not(.on) {
  opacity: 0.5;
}
.add {
  display: flex;
  gap: 8px;
}
.qs {
  list-style: none;
  padding: 0;
  margin: 12px 0 0;
  display: grid;
  gap: 4px;
}
.qs li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 4px 6px 12px;
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 14px;
}
/* 開始按鈕黏在畫面底部：設定再長也不用滑到最下面才能開始 */
.go {
  position: sticky;
  bottom: 0;
  z-index: 5;
  text-align: center;
  margin: 0 -20px;
  padding: 14px 20px calc(14px + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--bg) 70%, transparent);
}
.go p {
  margin: 0;
}
.mode-desc {
  margin: -6px 0 4px;
  font-size: 13px;
}
.btn.big {
  padding: 14px 40px;
  font-size: 18px;
}
@media (max-width: 520px) {
  /* 手機：模式改成一排三個小按鈕，說明顯示在下方 */
  .modes {
    gap: 6px;
  }
  .mode {
    align-items: center;
    text-align: center;
    padding: 10px 4px;
  }
  .mode strong {
    font-size: 15px;
  }
  .mode span {
    display: none;
  }
  .seg {
    gap: 6px;
  }
  .seg .btn {
    padding: 8px 11px;
    font-size: 15px;
  }
  .btn.big {
    width: 100%;
  }
}
</style>
