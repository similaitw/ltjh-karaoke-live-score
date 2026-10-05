# Browser marker spike

採 [js-aruco2 2.0.0](https://github.com/damianofalcioni/js-aruco2)，字典 `ARUCO_MIP_36h12`，登錄 ID 0–39。純 JS detector 與 SVG generator，不需原生 OpenCV、WASM runtime 或 Plickers，版本由 lockfile 鎖定。

先完成 decoder fixtures，再接 scoring/UI。40 卡 × 四方向、20 卡同框通過完整 RGBA decoder；瀏覽器 E2E 另走 video/canvas 多卡流程。這些證據支持瀏覽器可執行性，**不能宣稱 Android 現場可靠度已通過**。

目前未遇到需更換 library 的可重現 decoder/browser 故障，因此未替換。若 Android 實測持續誤碼、方向顛倒、凍結或效能無法使用，記錄裝置、瀏覽器、光線、尺寸、距離與 fixture，停止沿用方案，評估 browser WASM AprilTag 或 OpenCV.js ArUco，重跑相同驗收。字典更換必須重印圖卡。

## 契約

- ID 0–39 = 卡 01–40；每位觀眾唯一 ID，同 ID 複印無法區分。
- 正向 A 在上；順時針旋轉 0/90/180/270° 分別 A/B/C/D。
- 四邊字母為 A 上、B 左、C 下、D 右，轉卡讓所選字母朝上。
- 方向由 canonical corner 0 → 1 計算；偏離最近直角超過 25° 不計。
- 只接受 hammingDistance=0；遮擋、模糊時不猜測。
- 同 ID 同答案連續三個 frame 才採計。每次 update 先按 ID 去重；同幀方向衝突會重置該 ID 的累積，與 detection 順序無關；消失或改方向也重置。
- `(roundId, markerId)` 去重；鎖票前新穩定答案覆蓋舊答案。兩台掃同卡時最後成功交易為準。

## 重現與效能

`npm test` 將字典 fixture 渲染成 RGBA，實際執行 grayscale、threshold、contours、homography、dictionary decode；驗證 ID、四方向、多卡、空白、範圍與穩定性。`npm run test:e2e` 將 SVG 畫入 captureStream，經相機元件驗證多卡與離頁停機。

`node scripts/generate-assets.mjs` 產生 `public/cards/0.svg`–`39.svg`；`/cards` 可指定 1–40 張，加 ID、四邊答案與分數（預設 100/85/70/55）；A4 預設每頁 4 張，1/20/40 張的 PDF 頁數為 1/5/10。

影像寬上限 960px，每次辨識及同步完成後等待 140ms；不堆積幀或請求。純 JS 在主執行緒執行，真機 FPS、發熱與辨識距離待測。全班可分區靠近掃，不要求同時入鏡。無人臉辨識、影像上傳或影像保存。
