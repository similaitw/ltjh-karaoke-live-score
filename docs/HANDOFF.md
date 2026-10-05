# M1.1 Review fixes 交接 — issue #37

## 分支與範圍

- 接續 #36 / PR #1；目前 `chat2code/issue-37` 基底為 `chat2code/issue-36`（93e0a35）。只處理 M1.1 review fixes。
- 已讀 [PR #1 Codex Review](https://github.com/similaitw/ltjh-karaoke-live-score/pull/1#discussion_r4181382850)：同 frame 同 ID 重複 detection 不得加速穩定。
- Runner 負責 commit / push / 建立 **base=`chat2code/issue-36`** 的 stacked PR。不要對 main 開平行 PR、不要先合併 PR #1、不要 auto-merge。本次 agent 未執行這些 Git/GitHub 寫入操作。

## 已修項目與檔案

1. `src/lib/markers.ts`：先以 markerId 去重，每幀每 ID 最多累積一次；方向衝突重置，消失後也重新累積三幀。`tests/markers.test.ts` 含重複三份、跨三幀、衝突順序與重新出現 regression；固定 fixtures 驗 40 張 × 4 方向。
2. `src/lib/domain.ts`、`mock.ts`、`/admin`、`/scan`、`/cards`、seed：A/B/C/D 統一 100/85/70/55。管理者可於首次開票／評審送分前調整四個值，開始後鎖定；列印卡顯示目前設定。
3. `/judge` 五項 rubric：音準 25／節奏 20／歌唱技巧 20／情感表達 20／舞台表現 15，自動合計且各項限值。每評審每選手更新覆蓋，管理頁可展開分項與總分；0/100 提示並略過評審流程。
4. `src/lib/card-config.ts` 集中上限 40、預設 20、每頁 4 張；`/cards` 指定 1–40，CSS 2×2 A4 黑白高對比。generator 與 `public/cards/0.svg`–`39.svg` 同步；要擴充 100 另增 SQL constraint migration、fixtures 並重建資產。
5. `src/lib/session.ts`、`api/admin/session/route.ts`、`components/admin-session.tsx`：server-only ADMIN_PASSWORD、管理登入／登出、8 小時 HttpOnly/SameSite=Strict cookie、production Secure。DB 保存隨機 token digest，登出撤銷並使複製 cookie 失效，改密碼使舊 session 失效。`/admin`、`/scan` 共用 session；評審維持獨立 token，不保留 ADMIN_TOKEN 相容層。API 防跨來源寫入，明確評審 token 不因管理 cookie 升權。
6. `domain.ts`、管理 UI、RPC：二次確認重開／清除本輪，以新 round ID 取代舊輪並清空票，退休 ID 防重用，拒絕延遲舊票；相機換輪重新初始化。公布後不可重開，先確認取消公布才可修改。事件不含敏感 token。
7. 五組 presets 100/0、70/30、50/50、30/70、0/100 及單滑桿；開始後鎖定。確認解鎖、確認新權重重新計算、套用後再鎖，記事件；確認綁定 revision，過期須重新確認。
8. `supabase/migrations/002_review_fixes.sql`：追加 rubric/total、settings、admin_sessions、40 卡 constraint、原子重開投影及既有 snapshot 升級。保留 RLS/RPC 權限。舊總分保留，缺 rubric 標 null 待重送，不偽造分項；已公布舊活動需先取消公布。001 不改寫。
9. `scripts/check-client-bundle.mjs` 與 build script：檢查 `.next/static` 不含 ADMIN_PASSWORD 參照或當次注入的密碼值；不輸出密碼內容。README、SPEC、TASKS、DEPLOYMENT、MARKER_SPIKE、ANDROID_TESTING 已同步。

## 本次驗證結果

2026-10-05，Windows 本機，未讀取／使用真實雲端憑證。

| 指令 | 結果 |
|---|---|
| `npm test` | **211 passed**，4 個檔案；domain、40×4 decoder、duplicate regression、API/session、PGlite PostgreSQL migrations／transaction／RLS／既有 M1 升級 |
| `npm run lint` | **通過** |
| `npm run typecheck` | **通過** |
| `npm run build` | **通過**；六個產品頁、兩個動態 API；當次環境注入假的唯一 ADMIN_PASSWORD，34 個 client assets 洩漏檢查通過 |
| `npm run test:e2e` | **12 passed**；Chromium 桌面與 Pixel 7 viewport 各 6 項 |

E2E 覆蓋跨分頁完整 demo、五項上限／合計／重送與管理明細、權重 presets／鎖定／確認解鎖、A/B/C/D 設定、確認重開與再次鎖票、公布／取消公布、相機拒絕權限、合成 video 多卡及離頁停機、六路由無橫向溢出、1/20/40 張 PDF 各 1/5/10 頁。

管理 session API 測試涵蓋未登入拒寫、錯密碼、登入成功可寫、HttpOnly/Secure/SameSite、登出後重放舊 cookie 拒絕、偽造／過期／改密碼、cross-origin、舊 token 拒絕、評審身分限制。API 用隔離的 Supabase mock；SQL migration/RLS 在 PGlite 真 PostgreSQL 執行。這些不是正式雲端登入 E2E。

首輪 E2E 發現 `getByRole("status")` 同時匹配新增的總分 output 與儲存訊息，已收斂定位器並全套重跑通過。Windows sandbox 再現 Playwright 關閉 npm 啟動的 webServer 停滯；結束本次 server 後，以獨立 `node node_modules/next/dist/bin/next start --hostname 127.0.0.1` 啟動並由 E2E reuse，完整指令結束碼 0。這是測試啟停環境限制。

## 部署注意

- 新專案：001 → 002 → seed。既有 M1：先停止寫入、備份、必要時明確取消公布，再套 002 與新版部署，所有裝置重新整理；**不重跑 seed**。詳見 DEPLOYMENT。
- 正式活動清除虛構 demo scores/rounds，設定 ADMIN_PASSWORD、Supabase server key 與各評審獨立 token；不得使用 demo 作權限保護。
- Demo localStorage 改 `ltjh-competition-v2`，舊 v1 示範資料不自動帶入；正式資料由 002 升級。

## 仍待外部驗收

1. **Android 真機**：Chrome / Samsung Internet 的 HTTPS 權限、鏡頭切換、40 張新四卡版在光線／距離／旋轉／透視下的辨識、多份同 ID 衝突、重開後重掃、背景停機。FPS、耗電／發熱未量測。Pixel 7 viewport 與合成 video 不代表實機可靠度，依 ANDROID_TESTING 記錄。
2. **Supabase / Vercel 真雲端**：實際套 migration、部署、跨裝置 Realtime／輪詢／同時寫入、真 HTTPS 管理登入／共用 session／登出撤銷／密碼輪替、評審 token、RLS、重開延遲票與網路中斷恢復。未執行雲端部署，不宣稱通過。
3. 單場 40 卡；掃描老師共用管理權限，尚無獨立 scanner role。公開快照含個別 rubric 與匿名票，勿放敏感個資；無離線寫入佇列，多台改同卡以最後成功交易為準。
4. Decoder 仍在主執行緒，寬上限 960px，每次掃描／同步完成後間隔 140ms；若 Android 不可靠，依 MARKER_SPIKE 記錄後更換 browser-compatible decoder，不依賴 Plickers。
