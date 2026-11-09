<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, connect, net } from './net'
import { cycleTheme, theme } from './theme'
import HomeView from './components/HomeView.vue'
import RoomView from './components/RoomView.vue'
import RecordsView from './components/RecordsView.vue'

const page = ref<'home' | 'records'>('home')
const themeLabel = computed(
  () => ({ system: '跟隨系統', light: '淺色', dark: '夜間' })[theme.value],
)

onMounted(() => {
  const code = api.pendingRoomFromUrl()
  // 有暱稱又帶房號連結：連上後自動加入
  if (code && net.name) api.setPendingRoom(code)
  connect()
})

function goHome() {
  page.value = 'home'
}
</script>

<template>
  <header class="top">
    <div class="wrap bar">
      <a class="logo" href="./" @click.prevent="goHome">
        <span class="seal">犀</span>
        <span class="logo-name">靈犀</span>
        <span class="logo-sub hide-sm">Lingxi · 默契派對</span>
      </a>
      <nav>
        <button
          class="btn ghost"
          :class="{ active: page === 'records' }"
          @click="page = page === 'records' ? 'home' : 'records'"
        >
          我的紀錄
        </button>
        <button class="btn ghost" :title="'外觀：' + themeLabel" @click="cycleTheme">
          <span v-if="theme === 'dark'">☾</span>
          <span v-else-if="theme === 'light'">☀</span>
          <span v-else>◐</span>
          <span class="hide-sm">{{ themeLabel }}</span>
        </button>
      </nav>
    </div>
  </header>

  <main class="wrap main">
    <RecordsView v-if="page === 'records'" @back="goHome" />
    <RoomView v-else-if="net.room" :room="net.room" />
    <HomeView v-else />
  </main>

  <footer class="wrap foot muted">
    <div class="foot-left">
      <span>靈犀：心有靈犀一點通</span>
      <span v-if="!net.connected" class="offline">● 連線中…</span>
    </div>
    <a
      class="studio"
      href="https://tiramisunn1919.github.io"
      target="_blank"
      rel="noopener"
      aria-label="由緹拉米蘇 Tiramisu Web Studio 製作（開啟工作室網站）"
    >
      <img src="/brand/tiramisu-icon.webp" alt="" width="36" height="36" loading="lazy" />
      <div>
        <span class="made">Made by</span>
        <span class="studio-name">緹拉米蘇 <span class="studio-en">Tiramisu Web Studio</span></span>
      </div>
    </a>
  </footer>

  <div v-if="net.error" class="toast">{{ net.error }}</div>
</template>

<style scoped>
.top {
  border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--bg) 85%, transparent);
  backdrop-filter: blur(8px);
  position: sticky;
  top: 0;
  z-index: 10;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 56px;
}
.logo {
  display: flex;
  align-items: center;
  gap: 10px;
  font-family: var(--serif);
  font-weight: 700;
  font-size: 20px;
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
}
.logo-name {
  letter-spacing: 0.08em;
}
.logo-sub {
  font-family: var(--sans);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--ink-soft);
  padding-left: 10px;
  border-left: 1px solid var(--line-strong);
}
.seal {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--thread);
  color: var(--thread-ink);
  font-size: 17px;
  transform: rotate(-4deg);
}
nav {
  display: flex;
  gap: 4px;
}
nav .active {
  color: var(--accent);
}
.main {
  flex: 1;
  padding-top: 24px;
  padding-bottom: 40px;
}
.foot {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
  font-size: 13px;
  padding-top: 16px;
  padding-bottom: 24px;
  border-top: 1px solid var(--line);
}
.foot-left {
  display: flex;
  gap: 12px;
}
/* 緹拉米蘇工作室署名：樣式比照 tiramisu_SPA 頁尾 */
.studio {
  --cocoa: #4f1d08;
  color: inherit;
  text-decoration: none;
  border-radius: 10px;
  padding: 4px 8px 4px 4px;
  transition: background 0.15s;
  display: flex;
  align-items: center;
  gap: 10px;
}
:root[data-theme='dark'] .studio {
  --cocoa: #e2c2a6;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) .studio {
    --cocoa: #e2c2a6;
  }
}
.studio:hover {
  background: var(--surface-2);
}
.studio:hover .studio-name {
  text-decoration: underline;
  text-underline-offset: 3px;
}
.studio img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}
.studio > div {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}
.made {
  font-size: 11px;
  letter-spacing: 0.08em;
}
.studio-name {
  color: var(--cocoa);
  font-weight: 800;
  font-size: 15px;
  letter-spacing: 0.1em;
}
.studio-en {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  opacity: 0.75;
  margin-left: 4px;
}
.offline {
  color: var(--accent);
}
@media (max-width: 420px) {
  .hide-sm {
    display: none;
  }
}
</style>
