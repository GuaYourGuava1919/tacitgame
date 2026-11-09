import { reactive } from 'vue'

export type Phase = 'waiting' | 'writing' | 'revealed' | 'finished' | 'success' | 'capped'
export type Mode = 'quiz' | 'guess' | 'chain'

export const MODES: { id: Mode; name: string; short: string; desc: string }[] = [
  {
    id: 'quiz',
    name: '默契問答',
    short: '同一題，看誰跟誰想得一樣',
    desc: '大家回答同一題。每跟一個人答得一樣就 +1 分，全員同步再加分。',
  },
  {
    id: 'guess',
    name: '猜你會說',
    short: '輪流當主角，大家猜他會寫什麼',
    desc: '每題一位主角作答，其他人猜主角會寫什麼。猜中的人和主角各 +1。',
  },
  {
    id: 'chain',
    name: '同詞聯想',
    short: '順著上一輪的詞，直到想到一起',
    desc: '自由聯想的小模式，沒有計分。全員寫出同一個詞就完成。',
  },
]

export const QUIZ_CATEGORIES = [
  { id: 'mix', name: '綜合' },
  { id: 'warmup', name: '暖身' },
  { id: 'food', name: '美食' },
  { id: 'life', name: '生活日常' },
  { id: 'travel', name: '旅行與地方' },
  { id: 'imagine', name: '腦洞想像' },
  { id: 'memory', name: '童年回憶' },
  { id: 'close', name: '我們之間' },
]

export interface PlayerView {
  id: string
  name: string
  connected: boolean
  score: number
  submitted: boolean
  ready: boolean
}

export interface RoundRecord {
  n: number
  q: string
  words: Record<string, string>
  pairs: [string, string][]
  points: Record<string, number>
  protagonist?: string
  allSync?: boolean
}

export interface Settings {
  mode: Mode
  category: string
  total: number
  timer: number
}

export interface RoomView {
  code: string
  hostId: string
  settings: Settings
  categoryName: string
  phase: Phase
  round: number
  total: number
  deadline: number
  serverNow: number
  gameId: number
  question: string
  protagonist: string
  custom: { id: string; text: string | null; mine: boolean; by: string }[]
  players: PlayerView[]
  myWord: string | null
  words: Record<string, string> | null
  claims: Record<string, string[]>
  live: { pairs: [string, string][]; points: Record<string, number>; allSync: boolean } | null
  history: RoundRecord[]
  you: string
}

function storage(key: string, fallback = ''): string {
  try {
    return localStorage.getItem(key) ?? fallback
  } catch {
    return fallback
  }
}
export function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* 無痕模式等情況，忽略 */
  }
}

function getClientId() {
  let id = storage('lx.clientId')
  if (!id) {
    id = crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
    save('lx.clientId', id)
  }
  return id
}

export const net = reactive({
  connected: false,
  room: null as RoomView | null,
  clockOffset: 0,
  matching: false,
  error: '',
  name: storage('lx.name'),
  clientId: getClientId(),
})

let ws: WebSocket | null = null
let wantRoom = ''
let retry = 0
let errorTimer = 0

function showError(msg: string) {
  net.error = msg
  clearTimeout(errorTimer)
  errorTimer = window.setTimeout(() => (net.error = ''), 3500)
}

function raw(msg: object) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
}

export function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  ws = new WebSocket(`${proto}://${location.host}/ws`)
  ws.onopen = () => {
    net.connected = true
    retry = 0
    raw({ type: 'hello', clientId: net.clientId })
    if (wantRoom) raw({ type: 'join', code: wantRoom, name: net.name })
  }
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data)
    if (msg.type === 'state') {
      const room = msg.room as RoomView
      net.clockOffset = room.serverNow - Date.now()
      net.room = room
      net.matching = false
      wantRoom = room.code
      syncUrl(room.code)
    } else if (msg.type === 'error') {
      showError(msg.message)
      if (!net.room) {
        wantRoom = ''
        syncUrl('')
      }
    } else if (msg.type === 'matching') {
      net.matching = true
    } else if (msg.type === 'left') {
      net.room = null
      wantRoom = ''
      syncUrl('')
    }
  }
  ws.onclose = () => {
    net.connected = false
    ws = null
    setTimeout(connect, Math.min(1000 * 2 ** retry++, 8000))
  }
}

function syncUrl(code: string) {
  const url = new URL(location.href)
  if (code) url.searchParams.set('room', code)
  else url.searchParams.delete('room')
  history.replaceState(null, '', url)
}

export const api = {
  setName(name: string) {
    net.name = name.trim().slice(0, 12)
    save('lx.name', net.name)
  },
  create(mode: Mode) {
    raw({ type: 'create', name: net.name, mode })
  },
  join(code: string) {
    wantRoom = code.trim()
    raw({ type: 'join', code: wantRoom, name: net.name })
  },
  random() {
    net.matching = true
    raw({ type: 'random', name: net.name })
  },
  cancelRandom() {
    net.matching = false
    raw({ type: 'cancelRandom' })
  },
  leave() {
    wantRoom = ''
    raw({ type: 'leave' })
    net.room = null
    syncUrl('')
  },
  settings(s: Partial<Settings>) {
    raw({ type: 'settings', settings: s })
  },
  addQuestion(text: string) {
    raw({ type: 'addQuestion', text })
  },
  removeQuestion(id: string) {
    raw({ type: 'removeQuestion', id })
  },
  start() {
    raw({ type: 'start' })
  },
  submit(word: string) {
    raw({ type: 'submit', word })
  },
  claim(target: string) {
    raw({ type: 'claim', target })
  },
  next() {
    raw({ type: 'next' })
  },
  lobby() {
    raw({ type: 'lobby' })
  },
  pendingRoomFromUrl(): string {
    return new URLSearchParams(location.search).get('room') ?? ''
  },
  setPendingRoom(code: string) {
    wantRoom = code
  },
}
