# ltjh-karaoke-live-score

卡拉之聲 LIVE｜羅東國中卡拉社。Next.js / TypeScript 即時評分、方向圖卡投票與投影大螢幕。學生只需要紙卡；老師用 HTTPS 網頁開相機，影像僅在裝置處理。

## 啟動

Node.js 22.18+ 或 24 LTS、npm。

```powershell
npm ci
npm run dev
```

開啟 http://localhost:3000。預設 demo 無須資料庫或登入，同瀏覽器分頁同步；正式跨裝置使用需設定 Supabase 與 server-only `ADMIN_PASSWORD`，詳見 [部署文件](docs/DEPLOYMENT.md)。

## 五分鐘 demo

1. `/admin`：林語晴尚未評分，其他三位已有虛構成績。設定 A/B/C/D（預設 100/85/70/55）與權重，按「開放觀眾投票」。開票或首次評審送分後設定鎖定。
2. `/judge`：依序選三位評審，填音準 25、節奏 20、歌唱技巧 20、情感表達 20、舞台表現 15，自動合計 100；重送覆蓋原評分。0/100 模式可略過。
3. `/cards`：指定 1–40 張（預設 20），A4 每頁 4 張；每人拿不同 ID，將答案字母朝上。
4. `/scan`：啟動相機、分區掃描。同卡每幀只算一次，連續三幀穩定才入票；可轉卡或人工改票。無相機可按「加入 20 張示範票」（直接產生票，不是 decoder 驗證）。
5. 確認鎖票，在 `/display` 看成績。公布前可在 `/admin` 二次確認「重新開票／清除本輪」，清空該選手舊票並重掃。必要項目完成後公布；取消公布、權重解鎖與重新計算均須明確確認。

正式模式 `/admin` 密碼登入後，`/scan` 共用 session，提供登出；不必逐頁貼管理 token。評審使用自己的高熵 token，與管理密碼分開。五組權重為 100/0、70/30、50/50、30/70、0/100，另有單一自訂滑桿。

Demo 存於 localStorage `ltjh-competition-v2`；需重設時關閉其他 demo 分頁，刪除此 key 後重新整理。M1 舊 v1 demo 不自動帶入。正式活動不重跑 seed，單輪清票使用確認後重開票。

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

Build 包含 public client assets 密碼洩漏檢查。若要重現注入測試，可只在本次 build 的環境將 `ADMIN_PASSWORD` 設為假的唯一測試字串；檢查程式不輸出密碼值，也不讀 `.env` 檔案。

E2E 啟動 production build，涵蓋桌面與 Pixel 7 viewport、跨分頁、rubric、改票／重開／鎖票／公布、1/20/40 張列印 PDF、相機權限與合成 video。Viewport 不等於 Android 真機；管理登入 API 使用隔離的資料庫 mock 測試，SQL/RLS 使用 PGlite PostgreSQL。

`node scripts/generate-assets.mjs` 重建 40 張 SVG 與 demo seed；不可對 live 活動重跑 seed。所有示範人名及成績皆為虛構。不依賴 Plickers。

- [評分規格](docs/SPEC.md)
- [Vercel + Supabase](docs/DEPLOYMENT.md)
- [Android 驗收](docs/ANDROID_TESTING.md)
- [Marker spike](docs/MARKER_SPIKE.md)
- [交接與測試結果](docs/HANDOFF.md)
