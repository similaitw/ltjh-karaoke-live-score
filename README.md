# ltjh-karaoke-live-score

卡拉之聲 LIVE｜羅東國中卡拉社。Next.js / TypeScript 即時評分、方向圖卡投票與投影大螢幕。學生只需要紙卡；老師用 HTTPS 網頁開啟相機，影像僅在裝置處理。

## 啟動

Node.js 22.18+ 或 24 LTS、npm。

```powershell
npm ci
npm run dev
```

開啟 http://localhost:3000。預設為 demo，無須資料庫或代碼；同瀏覽器的分頁自動同步，跨裝置需設定 Supabase。

## 五分鐘 demo

1. `/admin`：林語晴尚未評分，另外三位有虛構示範成績。調整權重，按「開放觀眾投票」。
2. `/judge`：選三位評審，分別送出 0–100 分，可再次更新。
3. `/cards`：列印 20 張圖卡，每人拿不同 ID，將想選的字母朝上。A/B/C/D = 100/80/60/40 分。
4. `/scan`：啟動並允許相機，掃描各區域；同卡去重、轉卡改票，可人工更正。無相機可按「加入 20 張示範票」（直接產生票，不是 decoder 驗證）。
5. 完成並確認鎖票，在 `/display` 另一分頁看即時成績，返回 `/admin` 公布最終成績。

`/` 為首頁。Demo 存於 localStorage `ltjh-competition-v1`；需重設時關閉其他 demo 分頁，在 DevTools Application 刪除此 key，再重新整理。正式模式沒有重設按鈕。

## 驗證

```powershell
npm test
npm run lint
npm run typecheck
npm run build
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.playwright'
npx playwright install chromium
npm run test:e2e
```

E2E 自動啟動正式 build。測試桌面與 Pixel 7 viewport、跨分頁、改票、鎖票、公布、相機拒絕權限、合成 video 多卡解碼。Viewport 模擬不等於 Android 實機驗收。

`node scripts/generate-assets.mjs` 重建 20 張 SVG 與 demo seed；不可對 live 活動重跑 seed。所有示範人名及分數為虛構資料。不依賴 Plickers。

- [評分規格](docs/SPEC.md)
- [Vercel + Supabase](docs/DEPLOYMENT.md)
- [Android 驗收](docs/ANDROID_TESTING.md)
- [Marker spike](docs/MARKER_SPIKE.md)
- [交接](docs/HANDOFF.md)
