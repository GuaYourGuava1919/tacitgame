// 紅線挑戰壓力測試：模擬多間房同時遊玩
//
// 用法：
//   npm run loadtest -- --rooms 50 --duration 60
//   node scripts/loadtest.mjs --url wss://你的網址/ws --rooms 10 --pace human --token xxx
//
// 參數：
//   --url       WebSocket 位址（預設 ws://localhost:8787/ws）
//   --rooms     房間數，每房 8 人（預設 20）
//   --players   每房人數 2–8（預設 8）
//   --mode      quiz | guess | chain | mix（預設 mix，平均分配）
//   --pace      fast（機器人速度，測極限）| human（接近真人節奏）（預設 fast）
//   --duration  測試秒數（預設 60）
//   --ramp      幾秒內把所有房間開好（預設 5）
//   --token     伺服器的 STATS_TOKEN，結束時讀 /stats
import WebSocket from 'ws'

// ---------- 參數 ----------

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]?.startsWith('--') ? 'true' : arr[i + 1]])
    return acc
  }, []),
)
const URL_ = args.url ?? 'ws://localhost:8787/ws'
const ROOMS = Number(args.rooms ?? 20)
const PER = Math.min(8, Math.max(2, Number(args.players ?? 8)))
const MODE = args.mode ?? 'mix'
const PACE = args.pace ?? 'fast'
const DURATION = Number(args.duration ?? 60) * 1000
const RAMP = Number(args.ramp ?? 5) * 1000
const TOKEN = args.token ?? ''

if (!['quiz', 'guess', 'chain', 'mix'].includes(MODE)) throw new Error(`未知模式 ${MODE}`)
if (!['fast', 'human'].includes(PACE)) throw new Error(`未知節奏 ${PACE}`)

/** 各動作的延遲（毫秒）[min, max] */
const DELAY =
  PACE === 'human'
    ? { submit: [4000, 18000], claim: [2000, 8000], next: [8000, 20000], lobby: [3000, 8000], timer: 20 }
    : { submit: [300, 2000], claim: [200, 800], next: [800, 2000], lobby: [300, 800], timer: 20 }

const WORDS = ['貓', '狗', '海', '山', '紅色', '藍色', '咖啡', '奶茶', '火鍋', '夏天']
const rnd = ([a, b]) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]

// ---------- 統計 ----------

const s = {
  sent: 0,
  recv: 0,
  recvBytes: 0,
  maxMsg: 0,
  errors: 0,
  errorMsgs: new Map(),
  disconnects: 0,
  games: 0,
  rounds: 0,
  /** 送出動作到收到下一份 state 的時間 */
  lat: [],
  winSent: 0,
  winRecvBytes: 0,
}
let stopping = false
const allPlayers = []

function percentile(sorted, p) {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
}

// ---------- 玩家 ----------

function createPlayer(id, name) {
  const ws = new WebSocket(URL_)
  const p = { id, name, ws, room: null, pendingAt: 0, done: new Set(), onState: null, opened: null }
  p.opened = new Promise((ok, fail) => {
    ws.once('open', ok)
    ws.once('error', fail)
  })
  p.send = (msg, measure = true) => {
    if (stopping || ws.readyState !== WebSocket.OPEN) return
    s.sent++
    s.winSent++
    if (measure && !p.pendingAt) p.pendingAt = performance.now()
    ws.send(JSON.stringify(msg))
  }
  /** 同一個時間點的動作只做一次 */
  p.once = (key, fn, delay) => {
    if (p.done.has(key)) return
    p.done.add(key)
    setTimeout(() => !stopping && fn(), rnd(delay))
  }
  ws.on('open', () => ws.send(JSON.stringify({ type: 'hello', clientId: id })))
  ws.on('message', (raw) => {
    s.recv++
    s.recvBytes += raw.length
    s.winRecvBytes += raw.length
    if (raw.length > s.maxMsg) s.maxMsg = raw.length
    const msg = JSON.parse(raw)
    if (msg.type === 'error') {
      s.errors++
      s.errorMsgs.set(msg.message, (s.errorMsgs.get(msg.message) ?? 0) + 1)
    }
    if (msg.type !== 'state') return
    if (p.pendingAt) {
      s.lat.push(performance.now() - p.pendingAt)
      p.pendingAt = 0
    }
    p.room = msg.room
    p.onState?.(msg.room)
  })
  ws.on('close', () => {
    if (!stopping) s.disconnects++
  })
  allPlayers.push(p)
  return p
}

/** 每個玩家收到狀態後要做什麼 */
function brain(p, isHost) {
  return (room) => {
    const me = room.players.find((x) => x.id === p.id)
    if (!me) return
    const key = `${room.gameId}:${room.round}`

    if (room.phase === 'writing' && !me.submitted) {
      p.once(`w${key}`, () => p.send({ type: 'submit', word: pick(WORDS) }), DELAY.submit)
    }
    if (room.phase === 'revealed' && !me.ready) {
      // 偶爾認可別人「意思一樣」
      if (Math.random() < 0.4) {
        p.once(`c${key}`, () => {
          const others = room.players.filter((x) => x.id !== p.id)
          // 伺服器會忽略不合法的認可（例如猜你會說的非主角），所以不列入延遲
          if (others.length) p.send({ type: 'claim', target: pick(others).id }, false)
        }, DELAY.claim)
      }
      p.once(`n${key}`, () => p.send({ type: 'next' }), DELAY.next)
    }
    if (isHost && ['finished', 'success', 'capped'].includes(room.phase)) {
      p.once(`l${room.gameId}`, () => {
        s.games++
        p.send({ type: 'lobby' })
      }, DELAY.lobby)
    }
    if (isHost && room.phase === 'waiting' && room.players.filter((x) => x.connected).length >= PER) {
      p.once(`s${room.gameId}`, () => {
        p.send({ type: 'settings', settings: { total: 10, timer: DELAY.timer } }, false)
        setTimeout(() => p.send({ type: 'start' }), 200)
      }, DELAY.lobby)
    }
    if (room.phase === 'writing' && isHost) p.once(`r${key}`, () => s.rounds++, [0, 0])
  }
}

async function makeRoom(r) {
  const mode = MODE === 'mix' ? ['quiz', 'guess', 'chain'][r % 3] : MODE
  const tag = `lt${process.pid}-${r}`
  const host = createPlayer(`${tag}-0`, `房主${r}`)
  await host.opened
  const code = await new Promise((ok) => {
    host.onState = (room) => ok(room.code)
    host.send({ type: 'create', name: host.name, mode }, false)
  })
  host.onState = brain(host, true)
  const guests = []
  for (let i = 1; i < PER; i++) {
    const g = createPlayer(`${tag}-${i}`, `玩家${i}`)
    g.onState = brain(g, false)
    guests.push(g.opened.then(() => g.send({ type: 'join', code, name: g.name }, false)))
  }
  await Promise.all(guests)
  host.onState(host.room) // 人齊了就觸發開局
}

// ---------- 執行 ----------

const total = ROOMS * PER
console.log(`紅線挑戰壓測 → ${URL_}`)
console.log(`  ${ROOMS} 房 × ${PER} 人 = ${total} 人，模式 ${MODE}，節奏 ${PACE}，${DURATION / 1000} 秒\n`)

const t0 = Date.now()
const ramps = []
for (let r = 0; r < ROOMS; r++) {
  ramps.push(
    new Promise((ok) => setTimeout(ok, (RAMP * r) / ROOMS)).then(() =>
      makeRoom(r).catch((e) => {
        s.errors++
        s.errorMsgs.set(`開房失敗：${e.message}`, (s.errorMsgs.get(`開房失敗：${e.message}`) ?? 0) + 1)
      }),
    ),
  )
}
await Promise.all(ramps)
const online = allPlayers.filter((p) => p.ws.readyState === WebSocket.OPEN).length
console.log(`開房完成（${((Date.now() - t0) / 1000).toFixed(1)} 秒），在線 ${online}/${total}\n`)

// 每 5 秒印一次進度
const tick = setInterval(() => {
  const sorted = [...s.lat].sort((a, b) => a - b)
  const sec = ((Date.now() - t0) / 1000).toFixed(0).padStart(4)
  console.log(
    `${sec}s | 送出 ${(s.winSent / 5).toFixed(0).padStart(4)} 則/秒` +
      ` | 收到 ${(s.winRecvBytes / 5 / 1e6).toFixed(2)} MB/秒` +
      ` | 延遲 p50 ${percentile(sorted, 50).toFixed(0)}ms p95 ${percentile(sorted, 95).toFixed(0)}ms` +
      ` | 回合 ${s.rounds} | 錯誤 ${s.errors} 斷線 ${s.disconnects}`,
  )
  s.winSent = 0
  s.winRecvBytes = 0
}, 5000)

await new Promise((ok) => setTimeout(ok, DURATION))
stopping = true
clearInterval(tick)

// ---------- 結果 ----------

const secs = (Date.now() - t0) / 1000
const sorted = [...s.lat].sort((a, b) => a - b)
console.log('\n===== 結果 =====')
console.log(`玩家          ${total} 人（${ROOMS} 房）`)
console.log(`時間          ${secs.toFixed(0)} 秒，完成 ${s.rounds} 回合、${s.games} 局`)
console.log(`送出訊息      ${s.sent} 則（${(s.sent / secs).toFixed(0)} 則/秒，每人每分 ${((s.sent / total / secs) * 60).toFixed(1)} 則）`)
console.log(`收到狀態      ${s.recv} 則，${(s.recvBytes / 1e6).toFixed(1)} MB（單則最大 ${(s.maxMsg / 1024).toFixed(1)} KB）`)
console.log(`每人流量      ${((s.recvBytes / total / secs) * 3600 / 1e6).toFixed(1)} MB/小時`)
console.log(
  `回應延遲      p50 ${percentile(sorted, 50).toFixed(0)}ms / p95 ${percentile(sorted, 95).toFixed(0)}ms / p99 ${percentile(sorted, 99).toFixed(0)}ms / 最大 ${(sorted.at(-1) ?? 0).toFixed(0)}ms`,
)
console.log(`錯誤 / 斷線   ${s.errors} / ${s.disconnects}`)
for (const [m, n] of s.errorMsgs) console.log(`  - ${m} ×${n}`)

// 讀伺服器的 /stats
try {
  const u = new URL(URL_.replace(/^ws/, 'http'))
  u.pathname = '/stats'
  if (TOKEN) u.searchParams.set('token', TOKEN)
  const res = await fetch(u)
  if (res.ok) {
    const st = await res.json()
    console.log(`\n伺服器 /stats：線上 ${st.online}、房間 ${st.rooms}、峰值 ${st.peakOnline}、啟動以來送出 ${st.sinceStart.totalOutMB} MB、記憶體 ${st.memoryMB} MB`)
  } else {
    console.log(`\n（讀不到 /stats：HTTP ${res.status}，遠端伺服器請加 --token）`)
  }
} catch (e) {
  console.log(`\n（讀不到 /stats：${e.message}）`)
}

for (const p of allPlayers) p.ws.close()
setTimeout(() => process.exit(0), 300)
