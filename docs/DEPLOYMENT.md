# Vercel + Supabase

## 資料庫

在新 Supabase project 的 SQL Editor 依序執行 `supabase/migrations/001_initial.sql`、`supabase/seed.sql`，各執行一次。Migration 包含 competitions、contestants、judges、judge_tokens、judge_scores、audience_rounds、audience_votes、events、settings、RLS、atomic RPC、Realtime publication。

MVP 是單場活動，競賽 ID 固定 `luodong-live`。seed 是虛構名單及分數，不包含存取代碼。要換真實名單，先修改 `src/lib/mock.ts`、清空 scores/rounds，執行 `node scripts/generate-assets.mjs`，再對空專案執行 seed；ID 應固定且唯一。活動中不可重跑 seed。

## 環境變數

Vercel 匯入 repository，framework 選 Next.js、Node.js 24.x、build command `npm run build`。在 Settings → Environment Variables 設定：

| 名稱 | 值／來源 | 可進瀏覽器 |
|---|---|---|
| `NEXT_PUBLIC_DATA_MODE` | `supabase`；不填或 `demo` 為本機示範 | 是 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | 是 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon JWT / publishable key | 是 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role JWT / server secret key | **否** |
| `ADMIN_TOKEN` | 自行產生至少 32 隨機 bytes 的長代碼 | **否** |

Production / Preview 使用獨立 project 和代碼。修改 `NEXT_PUBLIC_*` 後需重新部署。本機 remote 模式可複製 `.env.example` 為 `.env.local` 後填值。service role key 不得加 `NEXT_PUBLIC_` 或提交到 Git。缺設定時報錯，不會偷偷切回 demo。

## 操作代碼

控制台與掃描手機展開頁面上方「操作代碼」，輸入 `ADMIN_TOKEN`。MVP 掃描老師使用管理員權限。代碼存於本分頁 sessionStorage，以 HTTPS Authorization header 傳送，不放 URL。

評審使用獨立隨機代碼，資料庫只存 SHA-256 digest。自行產生高熵代碼後，在 SQL Editor 替換 placeholders 執行：

```sql
insert into public.judge_tokens(token_hash, competition_id, judge_id, expires_at)
values (
  encode(sha256(convert_to('REPLACE_WITH_LONG_RANDOM_JUDGE_TOKEN', 'UTF8')), 'hex'),
  'luodong-live', 'j1', '2026-12-31T12:00:00Z'
);
```

將原始代碼私下交給評審；expires_at 設為活動結束時間。j1/j2/j3 為音樂老師／社團老師／特邀評審。`/judge` 選擇對應身分，填入代碼；伺服器會阻擋用 j1 token 修改 j2 分數。過期或 revoked=true 的代碼拒絕操作。管理員代碼可改全部分數，僅交給活動管理員。

## 一致性與同步

- `competitions.state` 是公開快照，包含名單、個別評審分數、匿名圖卡票和暫定成績。這些資料視為公開活動資訊，不得放入敏感資料或 token。
- 瀏覽器用 anon key 訂閱 Postgres Changes；收到變更後重讀快照。斷線時每 5 秒輪詢，狀態列顯示連線狀態。
- API 驗證 token、action、鎖票與公布狀態，呼叫 `save_competition` RPC。revision compare-and-swap 在同一交易更新快照、normalized tables、events；競爭失敗重讀重試，最多五次。先完成鎖票的交易阻擋後續票。
- 所有表啟用 RLS；anon/authenticated 僅可讀 competition snapshot，不能直接寫票、讀 token 或呼叫寫入 RPC。服務角色只在伺服器。
- Demo 使用 localStorage、storage events、Web Locks，只同步同瀏覽器分頁。舊瀏覽器未支援 Web Locks 時，不保證同時操作原子性。
- 無離線寫入佇列；送票失敗顯示錯誤並停掃，網路恢復後重啟並重掃。

官方參考：[Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes)、[Next.js 部署](https://nextjs.org/docs/app/getting-started/deploying)。

## 部署後驗收

1. 桌機 `/display`、Android HTTPS `/admin` 與 `/scan`，確認都不是 DEMO MODE。
2. 修改權重，確認即時更新（Realtime 斷線時 5 秒輪詢）。
3. 開票並掃卡；重掃不加票，轉卡改答案，兩台掃不同 ID 不得掉票。
4. 各評審送分；未帶 token 或 j1 改 j2 應拒絕。
5. 控制台鎖票後手機不能再改；全部必要項目完成後公布，重新整理應保留結果。
6. 中斷網路後新增票應報錯，恢復後重啟相機。

自動化不會連線你的 Supabase 或替你部署。雲端 WebSocket、跨裝置與實機 HTTPS 相機仍需驗收。
