<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { api, connect, net } from './net'
import { asset } from './asset'
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
        <img class="logo-img" :src="asset('brand/lingxi-logo.webp')" alt="" width="103" height="32" />
        <span class="logo-name">紅線挑戰</span>
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
    <p v-if="net.failed && !net.connected" class="down" role="alert">
      連不上遊戲伺服器，暫時無法建立或加入房間。會自動重試，請稍候再試。
    </p>
    <RecordsView v-if="page === 'records'" @back="goHome" />
    <RoomView v-else-if="net.room" :room="net.room" />
    <HomeView v-else />
  </main>

  <footer class="wrap foot muted">
    <div class="foot-left">
      <span>紅線挑戰：答得一樣，就牽起一條紅線</span>
      <span v-if="!net.connected" class="offline">● 連線中…</span>
    </div>
    <a
      class="studio"
      href="https://tiramisunn1919.github.io"
      target="_blank"
      rel="noopener"
      aria-label="由緹拉米蘇 Tiramisu Web Studio 製作（開啟工作室網站）"
    >
      <img :src="asset('brand/tiramisu-icon.webp')" alt="" width="36" height="36" loading="lazy" />
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
  min-height: 56px;
  padding-block: 8px;
}
.logo {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  font-family: var(--serif);
  font-weight: 400;
  font-size: 16px;
  line-height: 1.2;
  color: var(--ink);
  text-decoration: none;
  white-space: nowrap;
}
.logo-name {
  letter-spacing: 0.08em;
  white-space: nowrap;
}
.logo-img {
  height: 32px;
  width: auto;
  transition: transform 0.4s var(--ease);
}
.logo:hover .logo-img {
  transform: rotate(-3deg) scale(1.04);
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
  font-family: var(--brand-sans);
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
.down {
  margin: 0 0 16px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1.5px solid var(--accent);
  background: var(--accent-soft);
  color: var(--accent-deep);
  font-size: 14px;
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
