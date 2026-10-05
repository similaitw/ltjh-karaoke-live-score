# Vercel + Supabase

## 資料庫與 M1 升級

新 Supabase project 依序執行以下 SQL，各一次：

1. `supabase/migrations/001_initial.sql`
2. `supabase/migrations/002_review_fixes.sql`
3. `supabase/seed.sql`

包含 competitions、contestants、judges、judge_tokens、judge_scores、audience_rounds、audience_votes、events、settings、admin_sessions、RLS、atomic RPC 及 Realtime publication。

既有 M1 專案只套用 002，不重跑 001 或 seed。升級前停止所有操作頁面寫入並備份；若已公布，先在舊版控制台明確取消公布再升級（002 會拒絕已公布的舊快照，以免默默改變成績）。Migration 與新版部署在同一維護時段完成，完成後所有裝置重新整理，避免舊版 API/頁面繼續寫舊格式。

002 將觀眾預設更新為 100/85/70/55，保留原評審 total、票與輪次。舊評審資料沒有可還原的五項 rubric，因此標記 null、顯示「舊資料待補五項評分」；有評審權重時需各評審重新送出五項才能公布。既有開始活動的設定保持鎖定；不要將總分推算成虛構分項。`judge_scores.value` 保留相容欄位，`total` 為 generated column，rubric 上限與加總受 SQL constraint 保護。

單場競賽 ID 固定 `luodong-live`。seed 是虛構名單及成績，不含代碼。正式活動先修改 `src/lib/mock.ts` 名單、清空 scores/rounds、確認 started/weightsLocked=false，再執行 generator 並對空專案 seed；ID 固定且唯一。活動中不可重跑 seed。

## 環境變數

Vercel 匯入 repository，Next.js、Node.js 24.x、build command `npm run build`。

| 名稱 | 值／來源 | 可進瀏覽器 |
|---|---|---|
| `NEXT_PUBLIC_DATA_MODE` | `supabase`；未填或 `demo` 為本機示範 | 是 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL | 是 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon / publishable key | 是 |
| `SUPABASE_SERVICE_ROLE_KEY` | server service role key | **否** |
| `ADMIN_PASSWORD` | 管理者自訂的強密碼 | **否** |

Production / Preview 使用獨立 project 和密碼。`NEXT_PUBLIC_*` 變更後重新 build/deploy；server-only 值不得加 public 前綴、放入 next.config 的 env 或提交到 Git。本機正式模式可由管理者填 `.env.local`，範本見 `.env.example`。缺設定會報錯，不會自動切回 demo。

## 管理密碼與 session

- `/admin` 輸入密碼登入；`/scan` 共用同站 session，未登入時也提供登入表單。登出按鈕可撤銷目前 session。
- `POST /api/admin/session` 驗證 server-only `ADMIN_PASSWORD`，產生 32 random bytes token；DB `admin_sessions` 只保存 SHA-256 digest、到期時間與密碼版本摘要。
- Cookie `ltjh_admin` 為 HttpOnly、SameSite=Strict、Path=/，8 小時期限；production 為 Secure。正式網站需 HTTPS。本機 localhost 僅供測試。
- `GET /api/admin/session` 檢查登入，`DELETE` 刪除伺服器紀錄並清 cookie；複製的舊 cookie 亦失效。密碼更換後舊 session 不再有效，需重新登入。過期 session 不可使用，可定期以 service role 刪除過期紀錄。
- 原始密碼僅在登入 HTTPS request body 傳送，不放 URL 或任何瀏覽器儲存空間；client bundle 不包含密碼。Build 自動掃描 `.next/static`，且不在 log 輸出密碼內容。
- **未保留 ADMIN_TOKEN 相容層**；設定舊 ADMIN_TOKEN 也不會授予管理權限。掃描員目前共用管理權限，沒有獨立 scanner role。
- Demo 明確免登入且只寫本機資料，不能作為正式活動權限保護。

## 評審獨立代碼

每位評審使用至少 32 random bytes 的高熵 token；DB 僅存 SHA-256 digest，不與管理密碼共用。管理者自行產生並私下交給各評審，在 SQL Editor 替換 placeholders：

```sql
insert into public.judge_tokens(token_hash, competition_id, judge_id, expires_at)
values (
  encode(sha256(convert_to('REPLACE_WITH_LONG_RANDOM_JUDGE_TOKEN', 'UTF8')), 'hex'),
  'luodong-live', 'j1', '2026-12-31T12:00:00Z'
);
```

expires_at 設活動結束時間。j1/j2/j3 為示範三位評審。`/judge` 選對應身分，在「操作代碼」填 token（本分頁 sessionStorage），以 Authorization Bearer 傳送；不放 URL。伺服器僅允許該 token 修改自己的 rubric。過期或 revoked=true 拒絕；同時帶管理 cookie 也不提升評審 token 權限。

## 一致性與同步

- 公開 `competitions.state` 包含名單、個別五項評分、總分、匿名圖卡票、操作事件與暫定成績；不得放敏感資料或 token。
- 瀏覽器 anon key 訂閱 Postgres Changes，變更後重讀；斷線每 5 秒輪詢。
- API 驗證 session／評審 token、action、鎖票／公布狀態，RPC 以 revision compare-and-swap 原子更新快照、projections、events；競爭失敗最多重試五次。
- 重開票使用新 ID、同交易刪除舊輪及票、保留退休 ID 防重用。延遲票與舊輪請求被拒絕。重開、取消公布、解鎖與重算確認綁定當下 revision；確認過期需取消後重新操作，不能靜默重試套用確認。
- 全表 RLS，anon/authenticated 只讀快照；不可直接寫、讀 judge_tokens/admin_sessions 或呼叫 save RPC。服務角色只在伺服器，事件不含敏感代碼。
- Demo 使用 localStorage/Web Locks，只同步同瀏覽器；未支援 Web Locks 的舊瀏覽器不保證同時操作原子性。正式模式無離線佇列，失敗停掃後須重新掃描。

## 部署後驗收（待真雲端）

1. 桌面與 Android HTTPS 頁面確認不是 DEMO MODE；錯誤密碼拒絕、正確密碼登入，`/admin` 與 `/scan` 共用狀態，檢查 cookie 屬性及登出後舊 cookie 拒絕寫入。
2. 開賽前調分數／權重，確認跨裝置更新；開賽鎖定。二次確認解鎖及重算有事件且其他頁面同步。
3. 評審五項、上限、更新覆蓋；未登入管理寫入、評審改他人分數、直接表/RPC 寫入都拒絕。
4. 兩台掃不同 ID 不掉票；鎖票→確認重開→票歸零→舊輪延遲票拒絕→重掃再鎖。
5. 全部完成才公布；公布不能重開，取消公布需明確確認。重新整理保留狀態。
6. 驗證 Realtime 重連、斷網後錯誤與恢復，依 ANDROID_TESTING 實測 HTTPS 相機。

本次不使用雲端憑證、不執行部署；以上仍待驗收。
