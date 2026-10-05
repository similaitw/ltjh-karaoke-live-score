# Tasks

## Current Task

### M1.1 review fixes — issue #37

接續 #36 / PR #1，僅處理 review 與原始規格差異。工作分支 `chat2code/issue-37` 基於 `chat2code/issue-36`；Runner 負責 commit / push 與建立 base=`chat2code/issue-36` 的 stacked PR。不要對 main 開平行 PR，不合併 PR #1，不 auto-merge。

- 修正同 frame 重複 marker ID，方向衝突採安全處理，補去重／三幀／消失重現 regression tests。
- A/B/C/D 預設統一 100/85/70/55，管理者可於開賽前調整。
- 五項評審 rubric、上限、total、覆蓋重送與管理明細，DB / API / snapshot 相容。
- 1–40 張圖卡、預設 20、A4 每頁 4 張，驗證 1/20/40 張。
- ADMIN_PASSWORD server-only 管理登入、共用 HttpOnly session、登出撤銷、client bundle 檢查；評審仍用獨立 token。
- 確認後重新開票／清除本輪；新 round 拒絕舊票；公布後須先確認取消公布，所有重要操作記錄事件。
- 五組權重 presets 和單滑桿；開賽鎖定，確認解鎖及重算，不靜默修改結果。
- 執行 npm test、lint、typecheck、build、test:e2e，保留 RLS/API 驗證，更新 HANDOFF。

## 既有 M0/M1 範圍

已建立 Next.js 六頁、方向圖卡 decoder、demo、Supabase schema/API/realtime 與部署文件。M1.1 不新增無關功能。Android 真機、Supabase/Vercel 真雲端仍待外部驗收，狀態見 HANDOFF。
