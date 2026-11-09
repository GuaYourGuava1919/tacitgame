// 紅線挑戰 — 即時房間伺服器（記憶體內狀態，單一程序）
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'
import { CATEGORY_LIST, drawQuestions } from './questions.js'

// 預設 8787：避開常見的 3000/3001（Nuxt、Next 等開發伺服器）
const PORT = Number(process.env.PORT) || 8787
const MAX_PLAYERS = 8
const MAX_CHAIN_ROUNDS = 300
const MAX_CUSTOM = 40
const TIMERS = [20, 40, 60]
const TOTALS = [5, 10, 15, 20]
const MODES = ['quiz', 'guess', 'chain']
const DIST = resolve(fileURLToPath(new URL('../dist', import.meta.url)))
const ROOM_IDLE_MS = 30 * 60 * 1000

/** @type {Map<string, Room>} */
const rooms = new Map()
/** clientId -> ws */
const sockets = new Map()
/** 隨機配對佇列 */
let matchQueue = []

// ---------- 流量統計（記憶體內，重啟歸零） ----------

const STATS_TOKEN = process.env.STATS_TOKEN || ''
const STATS_LOG_MS = 5 * 60 * 1000
const newCounters = () => ({ wsOutBytes: 0, wsOutMsgs: 0, wsInBytes: 0, wsInMsgs: 0, httpOutBytes: 0, httpReqs: 0 })
const stats = {
  startedAt: Date.now(),
  total: newCounters(),
  /** 上次寫 log 之後的累計 */
  window: newCounters(),
  peakPlayers: 0,
}
function count(field, n) {
  stats.total[field] += n
  stats.window[field] += n
}
const mb = (b) => (b / 1e6).toFixed(2)

// ---------- 工具 ----------

function makeCode() {
  let code
  do {
    code = String(Math.floor(100000 + Math.random() * 900000))
  } while (rooms.has(code))
  return code
}

/** 比對用：全形轉半形、去空白標點、小寫 */
export function normalizeWord(w) {
  return String(w ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, '')
}

const cleanName = (n) => String(n ?? '').trim().slice(0, 12) || '旅人'
const cleanWord = (w) => String(w ?? '').trim().slice(0, 20)
const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`)

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function send(clientId, msg) {
  const ws = sockets.get(clientId)
  if (ws && ws.readyState === ws.OPEN) {
    const data = JSON.stringify(msg)
    count('wsOutBytes', Buffer.byteLength(data))
    count('wsOutMsgs', 1)
    ws.send(data)
  }
}

// ---------- 房間 ----------

/**
 * @typedef {{ id: string, name: string, connected: boolean, score: number }} Player
 * @typedef {{
 *   n: number, q: string, words: Record<string,string>,
 *   pairs: [string,string][], points: Record<string,number>,
 *   protagonist?: string, allSync?: boolean
 * }} RoundRecord
 */
class Room {
  constructor(hostId, opts = {}) {
    this.code = makeCode()
    this.hostId = hostId
    this.settings = {
      mode: MODES.includes(opts.mode) ? opts.mode : 'quiz',
      category: 'mix',
      total: 10,
      timer: 40,
    }
    /** @type {Player[]} */
    this.players = []
    /** @type {{ id: string, text: string, by: string }[]} */
    this.custom = []
    /** 'waiting' | 'writing' | 'revealed' | 'finished' | 'success' | 'capped' */
    this.phase = 'waiting'
    this.round = 0
    this.deadline = 0
    this.question = ''
    this.protagonist = ''
    /** @type {string[]} */
    this.deck = []
    /** @type {Record<string,string>} */
    this.submissions = {}
    /** 揭曉後「我覺得跟你意思一樣」：from -> to[] */
    /** @type {Record<string,string[]>} */
    this.claims = {}
    /** @type {Set<string>} */
    this.ready = new Set()
    /** @type {RoundRecord[]} */
    this.history = []
    this.gameId = 0
    this.timeout = null
    this.hostTimer = null
    this.lastActive = Date.now()
    this.qid = 0
    rooms.set(this.code, this)
  }

  get mode() {
    return this.settings.mode
  }

  has(id) {
    return this.players.some((p) => p.id === id)
  }

  get connected() {
    return this.players.filter((p) => p.connected)
  }

  touch() {
    this.lastActive = Date.now()
  }

  /** 房主離開就立刻換人；只是斷線則等 15 秒（可能只是重新整理） */
  ensureHost() {
    const host = this.players.find((p) => p.id === this.hostId)
    if (!host) {
      const next = this.connected[0] ?? this.players[0]
      if (next) this.hostId = next.id
      return
    }
    if (host.connected) {
      clearTimeout(this.hostTimer)
      this.hostTimer = null
      return
    }
    if (this.hostTimer) return
    this.hostTimer = setTimeout(() => {
      this.hostTimer = null
      const h = this.players.find((p) => p.id === this.hostId)
      const next = this.connected[0]
      if ((!h || !h.connected) && next && rooms.has(this.code)) {
        this.hostId = next.id
        this.broadcast()
      }
    }, 15000)
  }

  // ----- 大廳 -----

  join(id, name) {
    const existing = this.players.find((p) => p.id === id)
    if (existing) {
      existing.connected = true
      existing.name = name
    } else {
      if (this.phase !== 'waiting') return '遊戲進行中，等這局結束再加入'
      if (this.players.length >= MAX_PLAYERS) return '房間已滿'
      this.players.push({ id, name, connected: true, score: 0 })
    }
    this.ensureHost()
    this.touch()
    this.broadcast()
    return null
  }

  /** explicit=true 表示按了離開；否則只是斷線（可能只是重新整理） */
  leave(id, explicit = false) {
    const p = this.players.find((x) => x.id === id)
    if (!p) return
    if (this.phase === 'waiting' && explicit) {
      this.players = this.players.filter((x) => x.id !== id)
      this.custom = this.custom.filter((q) => q.by !== id)
    } else {
      p.connected = false
      // 斷線的人視為已準備，避免卡住
      if (this.phase === 'revealed') this.checkReady()
    }
    if (!this.players.length) {
      this.destroy()
      return
    }
    this.ensureHost()
    this.touch()
    this.broadcast()
  }

  destroy() {
    clearTimeout(this.timeout)
    clearTimeout(this.hostTimer)
    rooms.delete(this.code)
  }

  updateSettings(id, s) {
    if (id !== this.hostId || this.phase !== 'waiting') return
    if (MODES.includes(s.mode)) this.settings.mode = s.mode
    if (CATEGORY_LIST.some((c) => c.id === s.category)) this.settings.category = s.category
    if (TOTALS.includes(s.total)) this.settings.total = s.total
    if (TIMERS.includes(s.timer)) this.settings.timer = s.timer
    this.touch()
    this.broadcast()
  }

  addQuestion(id, text) {
    if (this.phase !== 'waiting' || !this.has(id)) return
    const t = String(text ?? '').trim().slice(0, 40)
    if (!t || this.custom.length >= MAX_CUSTOM) return
    if (this.custom.some((q) => q.text === t)) return
    this.custom.push({ id: `c${++this.qid}`, text: t, by: id })
    this.touch()
    this.broadcast()
  }

  removeQuestion(id, qid) {
    if (this.phase !== 'waiting') return
    this.custom = this.custom.filter(
      (q) => !(q.id === qid && (q.by === id || id === this.hostId)),
    )
    this.broadcast()
  }

  start(id) {
    if (id !== this.hostId || this.phase !== 'waiting') return
    // 大廳裡斷線的人不帶進遊戲
    this.players = this.players.filter((p) => p.connected)
    if (this.players.length < 2) return
    this.gameId++
    this.history = []
    this.round = 0
    for (const p of this.players) p.score = 0
    if (this.mode !== 'chain') {
      const total = this.settings.total
      const mine = shuffle(this.custom.map((q) => q.text))
      const bank = drawQuestions(this.settings.category, total + mine.length)
      this.deck = [...new Set([...mine, ...bank])].slice(0, total)
    }
    this.nextRound()
  }

  // ----- 回合 -----

  nextRound() {
    clearTimeout(this.timeout)
    this.round++
    this.phase = 'writing'
    this.submissions = {}
    this.claims = {}
    this.ready = new Set()
    this.question = this.mode === 'chain' ? '' : this.deck[this.round - 1]
    this.protagonist =
      this.mode === 'guess'
        ? this.players[(this.round - 1) % this.players.length].id
        : ''
    const ms = this.settings.timer * 1000
    this.deadline = Date.now() + ms
    this.timeout = setTimeout(() => this.reveal(), ms + 300)
    this.broadcast()
  }

  submit(id, word) {
    if (this.phase !== 'writing' || !this.has(id)) return
    if (this.submissions[id] !== undefined) return // 送出後不可修改
    const w = cleanWord(word)
    if (!w) return
    this.submissions[id] = w
    this.touch()
    const waiting = this.connected.some((p) => this.submissions[p.id] === undefined)
    if (!waiting) this.reveal()
    else this.broadcast()
  }

  reveal() {
    if (this.phase !== 'writing') return
    clearTimeout(this.timeout)
    this.phase = 'revealed'
    this.touch()
    // 同詞聯想：全員一字不差直接成功
    if (this.mode === 'chain') {
      const r = this.scoreRound()
      if (r.allSync) {
        this.finalizeRound()
        this.phase = 'success'
      }
    }
    this.broadcast()
  }

  words() {
    const w = {}
    for (const p of this.players) w[p.id] = this.submissions[p.id] ?? ''
    return w
  }

  /** 哪些組合可以配對（猜你會說只算主角和猜的人） */
  candidatePairs() {
    const ids = this.players.map((p) => p.id)
    const pairs = []
    if (this.mode === 'guess') {
      for (const id of ids) if (id !== this.protagonist) pairs.push([this.protagonist, id])
    } else {
      for (let i = 0; i < ids.length; i++)
        for (let j = i + 1; j < ids.length; j++) pairs.push([ids[i], ids[j]])
    }
    return pairs
  }

  isExact(a, b) {
    const w = this.submissions
    return !!w[a] && !!w[b] && normalizeWord(w[a]) === normalizeWord(w[b])
  }

  isMatched(a, b) {
    if (!this.submissions[a] || !this.submissions[b]) return false
    if (this.isExact(a, b)) return true
    const ca = this.claims[a] ?? []
    const cb = this.claims[b] ?? []
    if (this.mode === 'guess') {
      // 主角說了算
      const guesser = a === this.protagonist ? b : a
      return (this.claims[this.protagonist] ?? []).includes(guesser)
    }
    return ca.includes(b) && cb.includes(a)
  }

  /** 本回合目前的配對與得分（揭曉階段即時預覽） */
  scoreRound() {
    const pairs = this.candidatePairs().filter(([a, b]) => this.isMatched(a, b))
    const points = {}
    for (const p of this.players) points[p.id] = 0
    for (const [a, b] of pairs) {
      points[a]++
      points[b]++
    }
    const n = this.players.length
    const allSync =
      this.mode !== 'guess' && n >= 2 && pairs.length === this.candidatePairs().length
    if (allSync && n >= 3 && this.mode === 'quiz') {
      for (const p of this.players) points[p.id] += 2 // 全員同步獎勵
    }
    return { pairs, points, allSync }
  }

  claim(id, target) {
    if (this.phase !== 'revealed' || !this.has(id) || id === target) return
    if (!this.has(target)) return
    if (!this.submissions[id] || !this.submissions[target]) return
    if (this.isExact(id, target)) return
    if (this.mode === 'guess' && id !== this.protagonist) return
    const list = this.claims[id] ?? []
    this.claims[id] = list.includes(target)
      ? list.filter((x) => x !== target)
      : [...list, target]
    this.touch()
    // 同詞聯想：大家都互相認可就成功
    if (this.mode === 'chain' && this.scoreRound().allSync) {
      this.finalizeRound()
      this.phase = 'success'
    }
    this.broadcast()
  }

  next(id) {
    if (this.phase !== 'revealed' || !this.has(id)) return
    if (this.ready.has(id)) this.ready.delete(id)
    else this.ready.add(id)
    this.touch()
    if (!this.checkReady()) this.broadcast()
  }

  /** 所有在線的人都準備好就進下一題；回傳是否已推進 */
  checkReady() {
    const online = this.connected
    if (!online.length || !online.every((p) => this.ready.has(p.id))) return false
    this.finalizeRound()
    if (this.mode === 'chain') {
      if (this.round >= MAX_CHAIN_ROUNDS) {
        this.phase = 'capped'
        this.broadcast()
      } else this.nextRound()
    } else if (this.round >= this.deck.length) {
      this.phase = 'finished'
      this.broadcast()
    } else {
      this.nextRound()
    }
    return true
  }

  finalizeRound() {
    if (this.history.some((h) => h.n === this.round)) return
    const { pairs, points, allSync } = this.scoreRound()
    if (this.mode !== 'chain') {
      for (const p of this.players) p.score += points[p.id] ?? 0
    }
    this.history.push({
      n: this.round,
      q: this.question,
      words: this.words(),
      pairs,
      points: this.mode === 'chain' ? {} : points,
      allSync,
      ...(this.protagonist ? { protagonist: this.protagonist } : {}),
    })
  }

  backToLobby(id) {
    if (!this.has(id)) return
    if (!['finished', 'success', 'capped'].includes(this.phase)) return
    clearTimeout(this.timeout)
    const used = new Set(this.deck)
    this.custom = this.custom.filter((q) => !used.has(q.text))
    this.phase = 'waiting'
    this.round = 0
    this.history = []
    for (const p of this.players) p.score = 0
    this.players = this.players.filter((p) => p.connected)
    this.ensureHost()
    this.broadcast()
  }

  // ----- 輸出 -----

  snapshot(forId) {
    const writing = this.phase === 'writing'
    const live = this.phase === 'revealed' ? this.scoreRound() : null
    return {
      code: this.code,
      hostId: this.hostId,
      settings: this.settings,
      categoryName:
        CATEGORY_LIST.find((c) => c.id === this.settings.category)?.name ?? '',
      phase: this.phase,
      round: this.round,
      total: this.mode === 'chain' ? MAX_CHAIN_ROUNDS : this.deck.length,
      deadline: this.deadline,
      serverNow: Date.now(),
      gameId: this.gameId,
      question: this.question,
      protagonist: this.protagonist,
      custom: this.custom.map((q) => ({
        id: q.id,
        // 大廳裡只看得到自己出的題，開局才揭曉
        text: q.by === forId ? q.text : null,
        mine: q.by === forId,
        by: this.players.find((p) => p.id === q.by)?.name ?? '',
      })),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        score: p.score,
        submitted: this.submissions[p.id] !== undefined,
        ready: this.ready.has(p.id),
      })),
      myWord: writing ? (this.submissions[forId] ?? null) : null,
      words: this.phase === 'revealed' ? this.words() : null,
      claims: this.phase === 'revealed' ? this.claims : {},
      live: live && { pairs: live.pairs, points: live.points, allSync: live.allSync },
      history: this.history,
      you: forId,
    }
  }

  broadcast() {
    for (const p of this.players) send(p.id, { type: 'state', room: this.snapshot(p.id) })
  }
}

// ---------- 隨機配對：兩人默契問答，自動開始 ----------

function enqueue(clientId, name) {
  matchQueue = matchQueue.filter((q) => q.clientId !== clientId && sockets.has(q.clientId))
  const partner = matchQueue.shift()
  if (!partner) {
    matchQueue.push({ clientId, name })
    send(clientId, { type: 'matching' })
    return
  }
  const room = new Room(partner.clientId, { mode: 'quiz' })
  for (const c of [partner, { clientId, name }]) {
    sockets.get(c.clientId).roomCode = room.code
    room.join(c.clientId, c.name)
  }
  room.start(partner.clientId)
}

const dequeue = (clientId) => {
  matchQueue = matchQueue.filter((q) => q.clientId !== clientId)
}

// ---------- 靜態檔案（正式環境） ----------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x')
    const urlPath = decodeURIComponent(url.pathname)
    if (urlPath === '/stats') {
      handleStats(req, res, url)
      return
    }
    count('httpReqs', 1)
    let file = normalize(join(DIST, urlPath))
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end()
      return
    }
    let info = await stat(file).catch(() => null)
    if (!info || info.isDirectory()) {
      file = join(DIST, 'index.html')
      info = await stat(file).catch(() => null)
    }
    if (!info) {
      res
        .writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
        .end('紅線挑戰伺服器運作中。開發時請用 npm run dev 開啟前端。')
      return
    }
    const body = await readFile(file)
    count('httpOutBytes', body.length)
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
    res.end(body)
  } catch {
    res.writeHead(500).end()
  }
})

// ---------- WebSocket ----------

const wss = new WebSocketServer({ server, path: '/ws' })

wss.on('connection', (ws) => {
  /** @type {string|null} */
  let clientId = null

  ws.on('message', (raw) => {
    count('wsInBytes', raw.length)
    count('wsInMsgs', 1)
    let msg
    try {
      msg = JSON.parse(String(raw))
    } catch {
      return
    }
    if (!msg || typeof msg.type !== 'string') return

    if (msg.type === 'hello') {
      clientId = String(msg.clientId ?? '').slice(0, 64)
      if (!clientId) return
      const old = sockets.get(clientId)
      if (old && old !== ws) old.close()
      sockets.set(clientId, ws)
      return
    }
    if (!clientId) return
    const room = ws.roomCode ? rooms.get(ws.roomCode) : null

    switch (msg.type) {
      case 'create': {
        if (room) room.leave(clientId, true)
        dequeue(clientId)
        const r = new Room(clientId, { mode: msg.mode })
        ws.roomCode = r.code
        r.join(clientId, cleanName(msg.name))
        break
      }
      case 'join': {
        const target = rooms.get(String(msg.code ?? '').trim())
        if (!target) {
          send(clientId, { type: 'error', message: '找不到這個房間' })
          break
        }
        if (room && room !== target) room.leave(clientId, true)
        dequeue(clientId)
        const err = target.join(clientId, cleanName(msg.name))
        if (err) send(clientId, { type: 'error', message: err })
        else ws.roomCode = target.code
        break
      }
      case 'random':
        if (room) room.leave(clientId, true)
        ws.roomCode = null
        enqueue(clientId, cleanName(msg.name))
        break
      case 'cancelRandom':
        dequeue(clientId)
        break
      case 'leave':
        if (room) room.leave(clientId, true)
        ws.roomCode = null
        send(clientId, { type: 'left' })
        break
      case 'settings':
        room?.updateSettings(clientId, msg.settings ?? {})
        break
      case 'addQuestion':
        room?.addQuestion(clientId, msg.text)
        break
      case 'removeQuestion':
        room?.removeQuestion(clientId, msg.id)
        break
      case 'start':
        room?.start(clientId)
        break
      case 'submit':
        room?.submit(clientId, msg.word)
        break
      case 'claim':
        room?.claim(clientId, String(msg.target ?? ''))
        break
      case 'next':
        room?.next(clientId)
        break
      case 'lobby':
        room?.backToLobby(clientId)
        break
    }
  })

  ws.on('close', () => {
    if (!clientId || sockets.get(clientId) !== ws) return
    sockets.delete(clientId)
    dequeue(clientId)
    const room = ws.roomCode ? rooms.get(ws.roomCode) : null
    room?.leave(clientId)
  })
})

// 清掉閒置房間
setInterval(() => {
  const now = Date.now()
  for (const room of rooms.values()) {
    const idle = now - room.lastActive
    if ((!room.connected.length && idle > ROOM_IDLE_MS / 6) || idle > ROOM_IDLE_MS) {
      room.destroy()
    }
  }
}, 60 * 1000)

// ---------- 統計輸出 ----------

function liveCounts() {
  let playing = 0
  const modes = { quiz: 0, guess: 0, chain: 0 }
  for (const room of rooms.values()) {
    playing += room.connected.length
    modes[room.mode]++
  }
  return { online: sockets.size, playing, rooms: rooms.size, matching: matchQueue.length, modes }
}

// 每秒取樣一次峰值人數（成本很低）
setInterval(() => {
  stats.peakPlayers = Math.max(stats.peakPlayers, sockets.size)
}, 1000).unref()

/** 沒設 STATS_TOKEN 時只允許本機查看 */
function handleStats(req, res, url) {
  const local = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)
  const ok = STATS_TOKEN ? url.searchParams.get('token') === STATS_TOKEN : local
  if (!ok) {
    res.writeHead(404).end()
    return
  }
  const t = stats.total
  const body = {
    uptimeMin: Math.round((Date.now() - stats.startedAt) / 60000),
    ...liveCounts(),
    peakOnline: stats.peakPlayers,
    sinceStart: {
      ...t,
      wsOutMB: +mb(t.wsOutBytes),
      httpOutMB: +mb(t.httpOutBytes),
      totalOutMB: +mb(t.wsOutBytes + t.httpOutBytes),
    },
    memoryMB: Math.round(process.memoryUsage().rss / 1e6),
  }
  res
    .writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    .end(JSON.stringify(body, null, 2))
}

// 定期寫進 log（Render 的 Logs 分頁看得到）；完全沒動靜時不寫
setInterval(() => {
  const w = stats.window
  const t = stats.total
  const c = liveCounts()
  if (c.online || w.wsInMsgs || w.httpReqs) {
    console.log(
      `[stats] 線上 ${c.online} 人 / ${c.rooms} 房 / 配對中 ${c.matching}` +
        ` | 5分鐘送出 ${mb(w.wsOutBytes + w.httpOutBytes)} MB（ws ${mb(w.wsOutBytes)} / 靜態 ${mb(w.httpOutBytes)}）` +
        ` 收到 ${w.wsInMsgs} 則 | 啟動以來 ${mb(t.wsOutBytes + t.httpOutBytes)} MB，峰值 ${stats.peakPlayers} 人`,
    )
  }
  stats.window = newCounters()
}, STATS_LOG_MS).unref()

server.listen(PORT, () => {
  console.log(`紅線挑戰伺服器：http://localhost:${PORT}  (WebSocket: /ws)`)
})
