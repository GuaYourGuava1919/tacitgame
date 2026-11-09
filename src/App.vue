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
        <span>靈犀</span>
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
    <span>靈犀：心有靈犀一點通</span>
    <span v-if="!net.connected" class="offline">● 連線中…</span>
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
  font-weight: 900;
  font-size: 20px;
  color: var(--ink);
  text-decoration: none;
}
.seal {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--accent);
  color: var(--accent-ink);
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
  font-size: 13px;
  padding-top: 16px;
  padding-bottom: 24px;
  border-top: 1px solid var(--line);
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
