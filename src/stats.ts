import type { Mode, RoundRecord } from './net'

export interface Summary {
  /** 0–100 */
  index: number
  ranking: { id: string; name: string; score: number }[]
  bestPair: { names: [string, string]; count: number } | null
  bestRound: RoundRecord | null
  matched: number
  possible: number
}

export function summarize(
  mode: Mode,
  players: { id: string; name: string; score: number }[],
  history: RoundRecord[],
): Summary {
  const n = players.length
  const perRound = mode === 'guess' ? n - 1 : (n * (n - 1)) / 2
  const possible = perRound * history.length
  const matched = history.reduce((s, h) => s + h.pairs.length, 0)

  const pairCount = new Map<string, number>()
  for (const h of history)
    for (const [a, b] of h.pairs) {
      const k = a < b ? `${a}|${b}` : `${b}|${a}`
      pairCount.set(k, (pairCount.get(k) ?? 0) + 1)
    }
  const nameOf = (id: string) => players.find((p) => p.id === id)?.name ?? '?'
  let bestPair: Summary['bestPair'] = null
  if (n >= 3) {
    for (const [k, count] of pairCount) {
      if (!bestPair || count > bestPair.count) {
        const [a, b] = k.split('|')
        bestPair = { names: [nameOf(a), nameOf(b)], count }
      }
    }
  }

  let bestRound: RoundRecord | null = null
  for (const h of history) {
    if (h.pairs.length && (!bestRound || h.pairs.length > bestRound.pairs.length)) bestRound = h
  }

  return {
    index: possible ? Math.round((matched / possible) * 100) : 0,
    ranking: [...players].sort((a, b) => b.score - a.score),
    bestPair,
    bestRound,
    matched,
    possible,
  }
}

export function verdict(index: number) {
  if (index >= 80) return '心有靈犀，根本是同一顆腦袋'
  if (index >= 60) return '默契十足，很懂彼此'
  if (index >= 40) return '有點默契，再多聊聊'
  if (index >= 20) return '各有想法，也很有趣'
  return '平行宇宙的一群人，下局加油！'
}
