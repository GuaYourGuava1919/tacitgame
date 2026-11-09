# 紅線挑戰：線上默契派對遊戲

2 到 8 人一起回答同一題，看看誰跟誰最有默契。

## 玩法

| 模式 | 說明 |
|---|---|
| **默契問答**（主打） | 大家回答同一題。每跟一個人答得一樣，兩人各 +1；三人以上全員同步，每人再 +2 |
| **猜你會說** | 每題輪流一位主角作答，其他人猜主角會寫什麼。猜中的人 +1，主角每被猜中一次 +1 |
| **同詞聯想** | 不計分的小模式：順著上一輪的詞聯想，直到全員寫出同一個詞 |

- **意思一樣也算：** 答案不同時，兩人都按「跟我意思一樣」就算對上。猜你會說由主角決定算不算猜中。
- **房主開局：** 房主在大廳選模式、題庫（7 類 210 題＋綜合）、題數（5 到 20）、作答時間（20、40、60 秒），按開始才開局。
- **自己出題：** 在大廳加題目，會優先抽到。開局前其他人看不到題目內容。
- **結算：** 顯示默契指數（對上組數 / 可能組數）、排行榜、最有默契的組合、最神同步的一題。
- **隨機配對：** 跟陌生人直接開一局 10 題的雙人默契問答。

## 開發

```bash
npm install
npm run dev        # 同時啟動 Vite（前端）與 server/index.js（WebSocket :8787）
```

## 部署

紅線挑戰需要一個**常駐的 Node 伺服器**（WebSocket 即時連線）。GitHub Pages、Vercel 這類靜態／serverless 主機**跑不了遊戲伺服器**，只能放前端。

### 做法 A：全部放 Render（最簡單）

1. 到 [Render](https://render.com) → **New → Blueprint** → 選這個 repo（會讀 `render.yaml`）
2. 部署完的網址就能直接玩，網頁與 `/ws` 在同一個服務

### 做法 B：前端留在 Vercel，伺服器放 Render

1. 依做法 A 把服務部署到 Render，記下網址，例如 `https://lingxi.onrender.com`
2. Vercel 專案 → **Settings → Environment Variables** 新增
   `VITE_WS_URL` = `wss://lingxi.onrender.com/ws`
3. 在 Vercel **重新部署**（環境變數是建置時寫進前端的）

> Render 免費方案閒置約 15 分鐘會休眠，之後第一次連線要等 30–60 秒喚醒；網頁會顯示「連不上遊戲伺服器」並自動重試。

### 監控流量

- **Logs**：伺服器每 5 分鐘印一行 `[stats]`，內容有線上人數、房間數、這 5 分鐘送出的流量（ws／靜態分開算）、啟動以來的累計量和峰值人數。沒有人在線時不印。
- **`/stats`**：回傳 JSON 格式的即時數字。網址是 `https://你的網址/stats?token=STATS_TOKEN`，token 到 Render 服務的 **Environment** 分頁查看。沒有設定 token 時，只有本機（`http://localhost:8787/stats`）看得到。
- 這些數字存在記憶體裡，伺服器重啟或休眠後會歸零。每月的累計流量請看 Render 的 Billing / Usage 頁面。

### 部署在子路徑（例如 GitHub Pages 的 `/tacitgame/`）

建置時加上 `BASE_PATH=/tacitgame/`，並同樣設定 `VITE_WS_URL`。

### 自己的主機

```bash
npm run build
PORT=8787 npm start   # 同一個 port 同時提供網頁與 /ws
```

## 結構

- `server/index.js`：房間、大廳設定、自訂題、回合、配對計分、隨機配對
- `server/questions.js`：題庫，直接編輯陣列即可增減
- `src/components/`：首頁、大廳、遊戲中、結算、我的紀錄
- `src/stats.ts`：默契指數與獎項計算
