# Specification

建立可部署到 GitHub + Vercel 的競賽 Web App。老師用 Android 瀏覽器掃描學生的實體方向圖卡，現場不需本機伺服器、原生 App 或 Plickers。繁體中文、手機優先、投影友善；影像只在裝置處理，不上傳、不儲存。

## M1.1 實作契約

### 評分與設定

- 單場競賽，示範資料含四位虛構選手、三位評審；後三位已完成，第一位可走完整流程。Demo/seed 允許初始調整設定，正式活動必須先替換名單並清空示範 scores/rounds。
- 評審五項 rubric：音準 25、節奏 20、歌唱技巧 20、情感表達 20、舞台表現 15。每項 0 至上限，UI 支援一位小數，API 驗證數值與上限並自行合計 total；不接受客戶端指定總分。
- 每位評審每位選手只一筆評分，重送覆蓋五項及 total。管理者可查看明細。評審平均 = 已送出 total 的算術平均；缺任何必要評審或舊資料缺 rubric 時結果待完成。
- A/B/C/D 預設 100/85/70/55；管理者可在首次開票或評審送分前調整各項 0–100 分。分數設定同步到掃描與列印 UI，變更後須重新列印。觀眾平均只以已收集的唯一 ID 票數為分母。
- 總分 = 評審平均 × w/100 + 觀眾平均 × (100-w)/100。單一滑桿 w 為 0–100 整數，兩側合計永遠 100%；預設 70/30，presets 為 100/0、70/30、50/50、30/70、0/100。
- 首次開票或評審送分即鎖定權重。管理者須二次確認解鎖，再明確確認新權重會重新計算所有未公布結果；套用後重新鎖定。解鎖及變更皆記 event log，確認綁定 revision，其他人改資料後須重新確認。
- 有權重的項目須完成才能排名：評審全數具五項評分；觀眾至少一票且鎖票。100/0 可略過觀眾，0/100 可略過評審；空輪次沒有觀眾平均。
- 只在顯示時取兩位小數；排名使用未取顯示小數的結果，同分並列（1,1,3）。

### 投票生命週期

- 全場最多一輪 open，切換演出前先鎖票。同 round 同 marker ID 僅一票，新穩定答案覆蓋舊答案；鎖票後拒絕修改。
- 正式公布前，管理者可選選手執行「重新開票／清除本輪」。二次確認後建立全新 round ID，清空該選手既有觀眾票；其他選手的票和評審評分保留。退休 round ID 不得重用，舊裝置延遲送票被拒絕；相機換輪重置穩定計數。
- reset/reopen 在同一資料庫交易移除舊 round/votes projections 並記錄事件。新輪可重新投票、再鎖票。
- 所有必要評分完成且沒有 open round 才能正式公布。公布凍結寫入與重開；管理者須先二次確認取消公布，才可重新開票或確認調整權重。取消公布本身不清票、不解鎖權重。

### 圖卡與掃描

- `/cards` 可指定 1–40 張，預設 20；卡 01–40 對應 marker ID 0–39。黑白、高對比，每張有 ID、四邊清楚的 A/B/C/D；A4 直式每頁 4 張，1/20/40 張分別印 1/5/10 頁，支援 browser Print-to-PDF。
- 使用 js-aruco2 `ARUCO_MIP_36h12`；A 上、B 左、C 下、D 右。順時針 0/90/180/270° 分別 A/B/C/D；偏離直角超過 25° 或 hamming error 非零不採計。
- 每個 camera frame 先按 markerId 去重，每 ID 最多推進一次。連續 3 幀相同答案才採計；同幀方向衝突或消失重置該 ID 計數，其他 ID 不受影響。
- 可擴充至 100：調整 `src/lib/card-config.ts` 的上限、新增 SQL marker_id constraint migration、擴充固定字典 fixtures，重跑 generator 與測試；目前只開放並驗證 40 張。

### 驗證與持久化

- Next.js / TypeScript，Supabase relational projections + snapshot + Realtime，5 秒輪詢重連。API 使用 revision compare-and-swap 在單一交易更新快照、分項、票與事件。
- 正式管理流程使用 server-only `ADMIN_PASSWORD`。`/admin`、`/scan` 密碼登入後共用 HttpOnly session cookie，SameSite=Strict、production Secure、8 小時期限。資料庫只存隨機 session token 的 SHA-256 digest；登出刪除伺服器 session，舊 cookie 立即無效。改密碼會使舊 session 無效。
- 不保留 ADMIN_TOKEN 相容層。原始管理密碼不進 URL、localStorage、sessionStorage 或 client bundle。管理 API 須有效 session；評審僅用獨立高熵 token，只能覆蓋自己的評分，過期／撤銷即拒絕。API 阻擋跨來源寫入。
- 所有表 RLS；公開只可讀 competitions snapshot，不可讀評審 token 或管理 session、直接寫表或呼叫 save RPC。事件不記敏感 token 或密碼。
- Migration 002 保留 M1 總分，舊 rubric 為 null 並要求重送，不能推造五項分數；拒絕直接升級已公布的舊活動，需先明確取消公布。詳見 DEPLOYMENT。
- Demo 僅同瀏覽器分頁同步，localStorage key 為 `ltjh-competition-v2`，不走管理登入；不是正式權限或跨裝置模式。無離線寫入佇列。
- Android 真機可靠度及 Supabase/Vercel 雲端部署須另行驗收，不以合成 decoder 或 viewport 測試代替。
