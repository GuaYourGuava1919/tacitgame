// 把整局的默契網畫成一張 PNG，方便分享到社群
export interface ExportInput {
  title: string
  subtitle: string
  index: number | null
  verdict: string
  players: { id: string; name: string; score?: number }[]
  edges: { a: string; b: string; weight: number }[]
}

const W = 1080
const H = 1350

export async function exportWebImage(input: ExportInput) {
  try {
    await document.fonts?.ready
  } catch {
    /* ignore */
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')!
  const serif = `'Noto Serif TC', 'Songti TC', serif`
  const sans = `'Noto Sans TC', system-ui, sans-serif`
  const red = '#b4472e'
  const ink = '#4f1d08'
  const soft = '#856a57'

  // 紙張底色＋細紋
  ctx.fillStyle = '#f9f5e8'
  ctx.fillRect(0, 0, W, H)
  ctx.globalAlpha = 0.05
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? '#000' : '#8a6a40'
    ctx.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5)
  }
  ctx.globalAlpha = 1

  ctx.textAlign = 'center'
  ctx.fillStyle = red
  ctx.font = `700 34px ${sans}`
  ctx.fillText(input.subtitle, W / 2, 120)
  ctx.fillStyle = ink
  ctx.font = `900 76px ${serif}`
  ctx.fillText(input.title, W / 2, 210)

  const cx = W / 2
  const cy = 680
  const R = 330
  const n = input.players.length
  const start = n === 2 ? Math.PI : -Math.PI / 2
  const pos = new Map<string, { x: number; y: number; ux: number; uy: number }>()
  input.players.forEach((p, i) => {
    const a = start + (i * 2 * Math.PI) / n
    pos.set(p.id, { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), ux: Math.cos(a), uy: Math.sin(a) })
  })

  ctx.setLineDash([4, 14])
  ctx.strokeStyle = '#dcc9ac'
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.arc(cx, cy, R, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])

  // 紅線
  ctx.strokeStyle = red
  ctx.lineCap = 'round'
  for (const e of input.edges) {
    const A = pos.get(e.a)
    const B = pos.get(e.b)
    if (!A || !B) continue
    const mx = (A.x + B.x) / 2
    const my = (A.y + B.y) / 2
    ctx.globalAlpha = 0.85
    ctx.lineWidth = 4 + e.weight * 3.5
    ctx.beginPath()
    ctx.moveTo(A.x, A.y)
    ctx.quadraticCurveTo(mx + (cx - mx) * 0.32, my + (cy - my) * 0.32 + 14, B.x, B.y)
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // 印章與名字
  for (const p of input.players) {
    const P = pos.get(p.id)!
    ctx.save()
    ctx.translate(P.x, P.y)
    ctx.rotate(((p.id.length * 7) % 14 - 7) * (Math.PI / 180))
    ctx.fillStyle = red
    roundRect(ctx, -50, -50, 100, 100, 20)
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = `900 56px ${serif}`
    ctx.textBaseline = 'middle'
    ctx.fillText([...p.name][0] ?? '?', 0, 4)
    ctx.restore()

    ctx.textBaseline = 'alphabetic'
    const lx = P.x + P.ux * 92
    const ly = P.y + P.uy * 92
    ctx.textAlign = Math.abs(P.ux) < 0.4 ? 'center' : P.ux > 0 ? 'left' : 'right'
    ctx.fillStyle = ink
    ctx.font = `700 34px ${sans}`
    const yy = P.uy < -0.6 ? ly - 30 : P.uy > 0.6 ? ly + 30 : ly + 6
    ctx.fillText(p.name, lx, yy)
    if (p.score !== undefined) {
      ctx.fillStyle = red
      ctx.font = `700 28px ${sans}`
      ctx.fillText(`${p.score} 分`, lx, yy + 38)
    }
  }

  ctx.textAlign = 'center'
  if (input.index !== null) {
    ctx.fillStyle = ink
    ctx.font = `900 120px ${serif}`
    ctx.fillText(`${input.index}%`, cx, cy + 30)
    ctx.fillStyle = soft
    ctx.font = `500 30px ${sans}`
    ctx.fillText('默契指數', cx, cy + 80)
  }

  ctx.fillStyle = ink
  ctx.font = `900 54px ${serif}`
  ctx.fillText(input.verdict, W / 2, 1170)
  ctx.fillStyle = soft
  ctx.font = `500 28px ${sans}`
  ctx.fillText('靈犀・線上默契派對遊戲', W / 2, 1260)

  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) return
  const file = new File([blob], 'lingxi-web.png', { type: 'image/png' })
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: '我們的默契網' })
      return
    }
  } catch {
    /* 取消分享就改下載 */
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'lingxi-web.png'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}
