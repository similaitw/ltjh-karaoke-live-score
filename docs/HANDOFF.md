# M0/M1 交接

## 已實作

- Next.js 16 / React / TypeScript，繁體中文手機優先介面；首頁、控制台、評審、掃描、投影、20 張列印圖卡。
- `src/lib/domain.ts`：評審均分、觀眾均分、0–100 權重、同分並列、缺分狀態、開票／改票／鎖票／公布規則。
- `src/lib/markers.ts`、`src/components/camera-scanner.tsx`：js-aruco2 MIP_36h12，多卡與四方向，三次穩定觀察、ID 白名單、斜向略過，相機授權與切換、離頁／背景停機。
- `src/components/competition-provider.tsx`：demo localStorage/Web Locks，以及 Supabase API、Realtime 訂閱與重連輪詢；明確顯示 demo／連線／錯誤狀態。
- `src/app/api/competition/route.ts`、`src/lib/server.ts`：伺服器 token 驗證、judge 身分限制、action 驗證與樂觀並行重試。
- `supabase/migrations/001_initial.sql`：完整關聯 schema、RLS、受限 RPC、原子快照與 projections、事件紀錄；`supabase/seed.sql`：虛構完整 demo，無代碼。
- `public/cards/0.svg`–`19.svg`，`scripts/generate-assets.mjs` 可重建資產及 seed。獨立固定字典碼 fixture 保障 ID／方向契約。
- `docs/DEPLOYMENT.md`、`docs/MARKER_SPIKE.md`、`docs/ANDROID_TESTING.md` 提供設定、選型依據與最短實機驗收。

## 驗證

- `npm test`：101 項通過，含 20 卡 × 4 方向、多卡同框、domain、API、PGlite 真正 PostgreSQL 引擎的 migration／transaction／RLS。
- `npm run lint`：通過。
- `npm run typecheck`：通過。
- `npm run build`：Next.js production build 通過，六頁及動態 API 產生成功。
- `npm run test:e2e`：6 項通過（桌面 Chromium 與 Pixel 7 viewport 各 3 項）；跨分頁 demo、權重、評審、去重更正、鎖票公布保存、20 張卡、權限拒絕、六路由無橫向溢出、合成 video 讀四卡並離頁停機。
- 初次 E2E 權限測試的 locator 同時匹配 Next.js route announcer，已限定在 main，重跑通過。
- 視覺檢查桌面首頁、手機掃描頁與列印版。修正尾端空白頁後，E2E 確認 20 張卡正好輸出 10 頁 A4。
- 此 Windows sandbox 中 Playwright 自動關閉 npm 啟動的 server 曾停滯，已停止本次啟動的 server。若相同環境重現，可先在另一終端執行 `npm run start` 再跑 E2E（會 reuseExistingServer），測試後自行關閉該 server。

## 剩餘驗收與限制

1. 未使用真 Android 裝置；依 `ANDROID_TESTING.md` 驗 Chrome 和 Samsung Internet 的權限、鏡頭切換、方向、光線、距離、效能。viewport 模擬不是實機結果。
2. 未提供／讀取雲端憑證，因此未執行 Supabase 或 Vercel 雲端部署。需手動套 migration/seed、設定環境與 token，再驗 WebSocket 與跨裝置並行寫入。
3. Decoder 在主執行緒，每輪最多 960px 寬、完成後 140ms 間隔；近距分區掃描。無真機 FPS／發熱測量，若不可靠須記錄並更換 browser-compatible 方案。
4. 單場固定 20 卡；每選手只一輪，鎖票不可重開。無離線佇列；斷線重啟後重掃。多台掃同卡以最後成功寫入答案為準。
5. 名單、個別分數與匿名票快照公開讀取；token 表不可公開。MVP 掃描老師共用管理員權限，尚無獨立 scanner role。

未 commit、push、建立 PR 或修改 GitHub issue。現有 AGENTS.md 保留。
