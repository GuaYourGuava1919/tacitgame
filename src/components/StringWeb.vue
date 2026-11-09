<script setup lang="ts">
import { computed } from 'vue'
import { asset } from '../asset'

export interface WebNode {
  id: string
  name: string
  /** 名字下方的第二行（答案或分數） */
  word?: string | null
  /** 小字補充（分數、+N） */
  tag?: string
  state?: 'idle' | 'inked' | 'off'
  me?: boolean
  clickable?: boolean
  /** 我已經對這個人牽了線 */
  active?: boolean
  hit?: boolean
}

export interface WebEdge {
  a: string
  b: string
  kind: 'past' | 'fresh' | 'claim' | 'final'
  weight?: number
  delay?: number
  key?: string
}

const props = withDefaults(
  defineProps<{
    nodes: WebNode[]
    edges?: WebEdge[]
    /** 放在圓心的節點（猜你會說的主角） */
    centerId?: string
    /** 0–1，圓環計時；null 表示不顯示 */
    progress?: number | null
    compact?: boolean
  }>(),
  { edges: () => [], centerId: '', progress: null, compact: false },
)

const emit = defineEmits<{ pick: [id: string] }>()

const C = 200
// 每張網各自一個濾鏡 id（同頁可能有多張網）
const fid = `rough-${Math.random().toString(36).slice(2, 8)}`
const VB = { x: -90, y: -80, w: 580, h: 560 }

function hash(s: string) {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.codePointAt(0)!) | 0
  return Math.abs(h)
}

const ring = computed(() => {
  const n = props.nodes.filter((x) => x.id !== props.centerId).length
  return n > 5 ? 150 : 138
})

const placed = computed(() => {
  const outer = props.nodes.filter((n) => n.id !== props.centerId)
  const count = outer.length
  const start = count === 2 ? 180 : -90
  const R = ring.value
  const list = outer.map((node, i) => {
    const deg = start + (i * 360) / Math.max(count, 1)
    const rad = (deg * Math.PI) / 180
    const ux = Math.cos(rad)
    const uy = Math.sin(rad)
    return { node, x: C + R * ux, y: C + R * uy, ux, uy, center: false }
  })
  const cn = props.nodes.find((n) => n.id === props.centerId)
  if (cn) list.push({ node: cn, x: C, y: C, ux: 0, uy: 1, center: true })
  return list
})

const pos = computed(() => {
  const m = new Map<string, { x: number; y: number }>()
  for (const p of placed.value) m.set(p.node.id, { x: p.x, y: p.y })
  return m
})

function edgePath(e: WebEdge) {
  const A = pos.value.get(e.a)
  const B = pos.value.get(e.b)
  if (!A || !B) return ''
  const mx = (A.x + B.x) / 2
  const my = (A.y + B.y) / 2
  // 往圓心彎，再加一點隨機下垂，像真的線
  const pull = 0.32
  let cx = mx + (C - mx) * pull
  let cy = my + (C - my) * pull
  const dx = B.x - A.x
  const dy = B.y - A.y
  const len = Math.hypot(dx, dy) || 1
  let sag = ((hash(e.a + e.b) % 30) - 15) * 0.8
  // 對角的兩人：線會穿過圓心文字，改成大幅彎開
  const dMid = Math.hypot(mx - C, my - C)
  if (dMid < 50) sag = (hash(e.a + e.b) % 2 ? 1 : -1) * (95 - dMid)
  cx += (-dy / len) * sag
  cy += (dx / len) * sag + 6
  return `M${A.x.toFixed(1)},${A.y.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${B.x.toFixed(1)},${B.y.toFixed(1)}`
}

const drawn = computed(() =>
  props.edges
    .map((e, i) => ({ ...e, d: edgePath(e), k: e.key ?? `${e.kind}-${e.a}-${e.b}-${i}` }))
    .filter((e) => e.d),
)

/** 文字放在節點外側 */
function label(p: (typeof placed.value)[number]) {
  if (p.center) return { x: p.x, y: p.y + 48, anchor: 'middle', dir: 'down' as const }
  const off = 46
  const x = p.x + p.ux * off
  const y = p.y + p.uy * off
  if (p.uy < -0.6) return { x, y: y - 4, anchor: 'middle', dir: 'up' as const }
  if (p.uy > 0.6) return { x, y: y + 2, anchor: 'middle', dir: 'down' as const }
  return { x, y, anchor: p.ux > 0 ? 'start' : 'end', dir: 'side' as const }
}

const short = (w: string, n = 7) => ([...w].length > n ? [...w].slice(0, n - 1).join('') + '…' : w)
const tilt = (id: string) => (hash(id) % 11) - 5

function strokeWidth(e: WebEdge) {
  const w = e.weight ?? 1
  if (e.kind === 'past') return 2 + w * 0.8
  if (e.kind === 'final') return 3 + w * 1.8
  if (e.kind === 'claim') return 2.6
  return 5
}
</script>

<template>
  <div class="web" :class="{ compact }">
    <svg :viewBox="`${VB.x} ${VB.y} ${VB.w} ${VB.h}`" role="img" aria-label="默契網">
      <!-- 圓環：同時是計時器 -->
      <circle :cx="C" :cy="C" :r="ring" class="ring" />
      <circle
        v-if="progress !== null"
        :cx="C"
        :cy="C"
        :r="ring"
        class="ring-progress"
        :class="{ low: progress < 0.2 }"
        pathLength="1"
        :style="{ strokeDashoffset: 1 - progress }"
        :transform="`rotate(-90 ${C} ${C})`"
      />

      <defs>
        <!-- 讓紅線有手繪的微微抖動，並在下緣加深色，像一條真的繩子 -->
        <filter :id="fid" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="4" xChannelSelector="R" yChannelSelector="G" result="wobbly" />
          <feDropShadow dx="0" dy="1.4" stdDeviation="0.5" class="cord-shadow" />
        </filter>
      </defs>

      <!-- 紅線 -->
      <g :filter="`url(#${fid})`">
      <path
        v-for="e in drawn"
        :key="e.k"
        :d="e.d"
        class="thread"
        :class="e.kind"
        pathLength="1"
        :style="{ strokeWidth: strokeWidth(e), animationDelay: `${e.delay ?? 0}ms` }"
      />
      </g>

      <!-- 印章 -->
      <g
        v-for="p in placed"
        :key="p.node.id"
        class="node"
        :class="[
          p.node.state ?? 'idle',
          { me: p.node.me, clickable: p.node.clickable, active: p.node.active, hit: p.node.hit, center: p.center },
        ]"
        :style="{ transform: `translate(${p.x}px, ${p.y}px)` }"
        @click="p.node.clickable && emit('pick', p.node.id)"
      >
        <circle v-if="p.node.me" r="33" class="me-disc" />
        <circle v-if="p.node.clickable" r="37" class="halo" />
        <g :transform="`rotate(${tilt(p.node.id)}) scale(${p.center ? 1.25 : 1})`">
          <!-- 水彩爪印印章（public/brand/seal.webp） -->
          <image :href="asset('brand/seal.webp')" x="-30" y="-30" width="60" height="60" class="seal-img" />
        </g>
        <title>{{ p.node.name }}{{ p.node.word ? `：${p.node.word}` : '' }}</title>
      </g>

      <!-- 文字 -->
      <g v-for="p in placed" :key="'l' + p.node.id" class="label" :style="{ transform: `translate(${label(p).x}px, ${label(p).y}px)` }">
        <template v-if="label(p).dir === 'up'">
          <text :text-anchor="label(p).anchor" class="nm" :y="p.node.word ? -30 : 0">
            {{ short(p.node.name, 6) }}{{ p.node.me ? '（你）' : '' }}<tspan v-if="p.node.tag" class="tag"> {{ p.node.tag }}</tspan>
          </text>
          <text v-if="p.node.word" :text-anchor="label(p).anchor" class="wd" :class="{ hit: p.node.hit }">{{ short(p.node.word) }}</text>
        </template>
        <template v-else-if="label(p).dir === 'down'">
          <text :text-anchor="label(p).anchor" class="nm" y="12">
            {{ short(p.node.name, 6) }}{{ p.node.me ? '（你）' : '' }}<tspan v-if="p.node.tag" class="tag"> {{ p.node.tag }}</tspan>
          </text>
          <text v-if="p.node.word" :text-anchor="label(p).anchor" class="wd" :class="{ hit: p.node.hit }" y="42">{{ short(p.node.word) }}</text>
        </template>
        <template v-else>
          <text :text-anchor="label(p).anchor" class="nm" :y="p.node.word ? -10 : 5">
            {{ short(p.node.name, 6) }}{{ p.node.me ? '（你）' : '' }}<tspan v-if="p.node.tag" class="tag"> {{ p.node.tag }}</tspan>
          </text>
          <text v-if="p.node.word" :text-anchor="label(p).anchor" class="wd" :class="{ hit: p.node.hit }" y="20">{{ short(p.node.word) }}</text>
        </template>
      </g>
    </svg>

    <div v-if="$slots.default" class="center">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.web {
  position: relative;
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  aspect-ratio: 580 / 560;
}
.web.compact {
  max-width: 380px;
}
svg {
  width: 100%;
  height: 100%;
  overflow: visible;
  display: block;
}
.center {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: 34%;
  text-align: center;
  pointer-events: none;
}

.ring {
  fill: none;
  stroke: var(--line-strong);
  stroke-width: 2;
  stroke-dasharray: 1 9;
  stroke-linecap: round;
}
.ring-progress {
  fill: none;
  stroke: var(--peach);
  stroke-width: 5;
  stroke-linecap: round;
  stroke-dasharray: 1 1;
  transition: stroke-dashoffset 0.25s linear;
  opacity: 0.8;
}
.ring-progress.low {
  stroke: var(--thread);
  opacity: 1;
}
.cord-shadow {
  flood-color: var(--thread-deep);
  flood-opacity: 0.55;
}

.thread {
  fill: none;
  stroke: var(--thread);
  stroke-linecap: round;
}
.thread.past {
  opacity: 0.25;
}
.thread.final {
  opacity: 0.85;
  stroke-dasharray: 1 1;
  stroke-dashoffset: 1;
  animation: draw 1.2s ease-out forwards;
}
.thread.fresh {
  stroke-dasharray: 1 1;
  stroke-dashoffset: 1;
  animation: draw 0.9s cubic-bezier(0.6, 0, 0.3, 1) forwards;
}
.thread.claim {
  stroke-dasharray: 0.02 0.03;
  opacity: 0.75;
  animation: crawl 1.6s linear infinite;
}
@keyframes draw {
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes crawl {
  to {
    stroke-dashoffset: -0.1;
  }
}

.node {
  transition: transform 0.6s cubic-bezier(0.3, 1.3, 0.5, 1);
}
.node.clickable {
  cursor: pointer;
}
.halo {
  fill: none;
  stroke: var(--thread);
  stroke-width: 1.5;
  stroke-dasharray: 3 4;
  opacity: 0.5;
  animation: spin 8s linear infinite;
  transform-origin: 0 0;
}
.node.active .halo {
  stroke-dasharray: none;
  opacity: 1;
  stroke-width: 2.5;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.me-disc {
  fill: var(--ladyfinger);
  opacity: 0.55;
}
/* 還沒作答：褪色，像還沒沾印泥 */
.seal-img {
  filter: grayscale(0.85) opacity(0.45);
  transition: filter 0.35s;
}
.node.inked .seal-img,
.node.hit .seal-img {
  filter: none;
}
.node.hit .seal-img {
  filter: drop-shadow(0 0 6px color-mix(in srgb, var(--thread) 55%, transparent));
}
.node.inked > g {
  animation: stamp 0.35s cubic-bezier(0.2, 1.6, 0.4, 1);
}
@keyframes stamp {
  0% {
    scale: 1.5;
  }
  100% {
    scale: 1;
  }
}
.node.off {
  opacity: 0.4;
}
.node.off .seal-img {
  filter: grayscale(1) opacity(0.5);
}
.node.off .seal {
  stroke-dasharray: 4 4;
}
.node.me .seal {
  stroke-width: 4;
}

.label {
  transition: transform 0.6s cubic-bezier(0.3, 1.3, 0.5, 1);
  pointer-events: none;
}
.nm {
  fill: var(--ink-body);
  font-size: 15px;
  font-weight: 600;
}
.tag {
  fill: var(--thread);
  font-weight: 800;
}
.wd {
  fill: var(--ink);
  font-family: var(--serif);
  font-weight: 400;
  font-size: 24px;
}
.web.compact .nm {
  font-size: 21px;
}
.web.compact .wd {
  font-size: 28px;
}
@media (max-width: 520px) {
  .web .nm,
  .web.compact .nm {
    font-size: 21px;
  }
  .web .wd,
  .web.compact .wd {
    font-size: 29px;
  }
}
.wd.hit {
  fill: var(--thread);
}
</style>
