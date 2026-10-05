# Specification

建立一個可直接部署到 **GitHub + Vercel** 的 Web App，現場不需本機伺服器、不需安裝 Android App。學生沒有手機或平板，觀眾使用「實體方向圖卡」投票；老師用 Android 手機瀏覽器開相機掃描，全場票數即時進入競賽系統。

產品語言：繁體中文（台灣用語），手機優先、投影大螢幕友善。

### 技術方向
- Next.js + TypeScript。
- Vercel 部署。
- Supabase 作資料庫與即時同步（若第一階段尚未接 Supabase，先建立乾淨 adapter 並提供 local/dev fallback；正式部署前完成 Supabase）。
- 手機相機使用瀏覽器 `getUserMedia()`，不做原生 App。
- 圖卡採可辨識 ID + 旋轉方向的 fiducial marker（AprilTag / ArUco 或同類方案）。請先做技術 spike，選擇真正能在 Android Chrome / Samsung Internet 類現代瀏覽器中工作的方案；允許 WASM，但不得要求本機安裝 OpenCV。
- 相機影像預設只在瀏覽器端處理，不上傳影像到伺服器、不儲存照片。
- 不依賴 Plickers App 或 Plickers API。
