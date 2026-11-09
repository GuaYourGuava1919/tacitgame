import { ref } from 'vue'
import { save, type Mode, type RoomView } from './net'
import { summarize } from './stats'

export interface GameRecord {
  id: string
  date: number
  mode: Mode
  category: string
  /** 默契指數 0–100；同詞聯想為 -1 */
  index: number
  outcome: 'finished' | 'success' | 'capped'
  ranking: { name: string; score: number; me: boolean }[]
  rounds: { n: number; q: string; words: { name: string; word: string }[]; hits: number }[]
}

const KEY = 'lx.records.v2'

function load(): GameRecord[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

export const records = ref<GameRecord[]>(load())

export function saveGame(room: RoomView) {
  if (!['finished', 'success', 'capped'].includes(room.phase)) return
  const id = `${room.code}-${room.gameId}`
  if (records.value.some((r) => r.id === id)) return
  const mode = room.settings.mode
  const s = summarize(mode, room.players, room.history)
  const rec: GameRecord = {
    id,
    date: Date.now(),
    mode,
    category: room.categoryName,
    index: mode === 'chain' ? -1 : s.index,
    outcome: room.phase as GameRecord['outcome'],
    ranking: s.ranking.map((p) => ({ name: p.name, score: p.score, me: p.id === room.you })),
    rounds: room.history.map((h) => ({
      n: h.n,
      q: h.q,
      hits: h.pairs.length,
      words: room.players.map((p) => ({ name: p.name, word: h.words[p.id] ?? '' })),
    })),
  }
  records.value = [rec, ...records.value].slice(0, 100)
  save(KEY, JSON.stringify(records.value))
}

export function clearRecords() {
  records.value = []
  save(KEY, '[]')
}
