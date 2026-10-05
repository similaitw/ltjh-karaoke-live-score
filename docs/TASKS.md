# Tasks

## Current Task

### M0/M1

### M0 Bootstrap
- 建立 Next.js/TypeScript 專案。
- 建立 README、AGENTS.md、docs/SPEC.md、docs/TASKS.md、docs/HANDOFF.md。
- 建立主要路由骨架：/, /admin, /judge, /scan, /display, /cards。
- 建立 scoring domain model 與 unit tests。
- 建立權重滑桿（100/0 到 0/100）及 presets。
- 建立 mock competition data，讓所有頁面可走完整 demo flow。
- Vercel build 可通過。

### M1 Browser marker scanning spike + MVP
先完成「掃卡可行性」再深入其他功能：
1. 實作 browser camera permission / camera selection。
2. 在 Android-compatible browser 做多 marker 偵測。
3. 正確讀 marker ID 與 0/90/180/270 方向。
4. 累積掃描、去重、修改答案、完成鎖票。
5. 建立至少 20 張測試圖卡並用可重現 fixture / synthetic image 測試 decoder。
6. 實機無法自動 CI 驗證的部分，在 docs/ANDROID_TESTING.md 列出最短測試步驟與已知限制。
7. 若第一個 marker library 在實作中證實 Android/browser 不可靠，不可硬撐；記錄原因並換另一個 browser-compatible 方案。最終不得把 Plickers App 當依賴。

### Supabase / realtime
- schema 至少包含 competitions, contestants, judges/tokens, judge_scores, audience_rounds/votes, events/settings。
- 使用 migration / SQL 檔納入 repo。
- display 與控制台可即時同步。
- 提供清楚的 Vercel + Supabase 環境變數設定文件。
