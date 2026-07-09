# travel-journal

自助旅遊記錄網站：後臺規劃、前臺展示、可匯出 A5 旅遊小書。

**最高指導文件：[PLAN.md](PLAN.md)** — 所有開發決策以此為準；技術架構、資料模型、隱私規則、風格憲章、分階段計畫都在裡面。決策若有變更，直接更新 PLAN.md。

## 基礎設施

- Supabase 專案：`travel-journal`（project id：`xifaxliaarxxmvuqcpav`，region：ap-northeast-1）
  - URL：`https://xifaxliaarxxmvuqcpav.supabase.co`
  - ⚠️ 同帳號下另一個專案「Leilei1221's Project」是奶貓日記，**不要動它**
- Schema 鏡像：`supabase/migrations/`（線上資料庫為真相來源；改 schema 時用 MCP `apply_migration` 並同步新增鏡像檔）
- 照片 bucket：`photos`（公開讀取、登入者寫入）
- Keep-alive：`.github/workflows/keep-alive.yml` 每 3 天 ping REST API（repo secrets `SUPABASE_URL`、`SUPABASE_ANON_KEY` 已設定）
- 前臺網址：https://leilei1221.github.io/travel-journal/ （GitHub Pages，main 分支根目錄，push 即自動部署）

## 目錄結構

- `index.html` — 前臺首頁「Lei's Go!」（含 noindex；Hero＋拍立得卡片＋功能區塊）
- `trip.html` — 旅程內頁（per-trip 主題色＋四頁籤：故事/行程/照片/筆記）
- `assets/` — 前臺樣式與 JS（front.css 手帳感樣式；front-client.js 唯讀 client）
- `admin/` — 後臺單頁應用（純 HTML/CSS/JS，無建置步驟；supabase-js 走 CDN ESM）
- `supabase/migrations/` — schema 記錄
- `design:reference-mockup.png` — 前臺版面參考圖（不進版控亦可，僅設計參考）

## 鐵則（摘自 PLAN.md §4）

1. 訂位代號、訂單編號等個資只進 `*_private` 表（RLS 僅本人），前臺查詢永不撈取
2. Gemini 金鑰只放 Edge Function 環境變數，絕不進前端程式碼
3. 前臺半公開 = noindex + 不做密碼鎖（維持 FB 分享預覽）
4. AI 遊記只產草稿，必經人工確認才發布

## 快取版本控制（重要）

前臺與後臺的 CSS/JS 皆以 `?v=N` 版本參數載入（`front.css`、`admin.css`、所有 JS module import 與入口 script）。**改動 CSS/JS 後務必同步遞增版本號**（目前 v13），否則使用者瀏覽器會在 GitHub Pages 10 分鐘快取內載到舊檔造成「改了沒反應」。

## 進度

- Phase 1：✅ 建表＋RLS ✅ 後臺登入 ✅ 航班/住宿/交通卡片手動輸入 ✅ 照片上傳（前端壓縮）✅ GitHub repo＋keep-alive
  - 追加：✅ 住宿卡 Google Maps 連結（place_id 定位/名稱地址搜尋）✅ 住宿依入住日排序 ✅ 記帳（expenses，僅本人可見）✅ 航班轉乘方式/票種/航司下拉 ✅ 記帳付款方式
- Phase 2（本階段）：✅ 前臺首頁（Hero＋拍立得卡片＋關於我/小貼士；旅行地圖佔位）✅ 旅程內頁（主題色＋四頁籤，行程安排含 Maps 按鈕）✅ 手繪插畫背景＋遮罩變數 ✅ 住宿/航班公開時機控制（RLS 層，行程安全）
  - ✅ GitHub Pages 上線（2026-07-04）
  - 追加：✅ 後臺文章管理（posts：行前情報/每日遊記→前臺旅程故事；旅程總結→旅行筆記）✅ 照片上傳後可編輯說明/日期/住宿關聯 ✅ 住宿介紹照片（photos.stay_id，公開時機跟隨住宿）✅ 首頁旅行地圖（travel-map.webp＋燈箱，手機雙指縮放；更新地圖＝覆蓋 assets/img/travel-map.png 後重轉 webp）
  - 追加：✅ 照片打卡位置（location_name＋GPS 座標，後臺「用目前位置打卡」；前臺照片牆 📍 Maps 連結）
  - 待辦：Google Places 住宿/景點抓取（§9）
- Phase 3：✅ Edge Function `gemini-draft`（金鑰只在函式環境變數、驗證登入、鏡像檔 `supabase/functions/gemini-draft/index.ts`）✅ AI 遊記草稿＋歷史行程回填（後臺文章頁籤「AI 草稿助手」，產出填入表單為草稿、原文存 ai_draft）✅ FB 貼文產生器（自動附前臺連結，複製貼上發文）✅ 旅程專屬背景插畫（mode: background 用 gemini-2.5-flash-image 依目的地＋主題色生成；後臺旅程編輯「生成→預覽→套用」，存 Storage backgrounds/{tripId}.webp＋trips.bg_image_url；前臺以 --bg-image CSS 變數覆寫，未設定用預設 bg-doodle）
- 修補：✅ AI 功能失敗一律於按鈕旁顯示紅底錯誤訊息（不再只靠可能捲出畫面的 toast）✅ 封面照改縮圖挑選器（保留貼網址進階）✅ 照片牆重整（排除住宿/文章關聯照，依打卡地點分組、精選 1–2 張＋收合，配圖直接顯示於文章內）✅ 全站 CSS/JS 加 ?v= 版本參數解決快取
- Phase 4：✅ 航班狀態查詢（後臺航班卡「查航班狀態」開 Google 即時航班資訊，零 API 費用）✅ A5 PDF 小書（`book.html?id=`＋book.css/book.js：154×216mm 含 3mm 出血、封面/行程/遊記/照片牆 2×2/封底、段落級自動分頁；後臺旅程卡「📖 小書」開啟，瀏覽器「另存為 PDF、邊界無、含背景圖形」匯出）✅ Gmail 異動信解析流程（見下）
- Phase 4 追加：✅ 後臺頂部天氣卡（`admin/js/weather.js`，Open-Meteo 免金鑰；瀏覽器定位優先，被拒則顯示城市輸入框改用 geocoding API）
  - ✅ 記帳拍收據辨識（`gemini-draft` Edge Function `receipt` mode，Gemini Vision 解析收據圖片回傳 JSON；前端壓縮至 1200px→base64→呼叫→預填記帳表單，仍需人工確認才儲存；**已部署 version 3**）
  - ✅ 行程規劃 → **每日時間軸改版**（`assets/js/day-timeline.js` 後臺前臺共用）：依旅程起訖日拆第 1 天…第 N 天，後臺加景點用「第 N 天」下拉自動帶入 `item_date`；每天航班（依 depart_time 本地日期）＋住宿（依 check_in）**即時讀原表落位、不複製**，改原表自動同步；相鄰景點「🚇 前往下一站」大眾運輸連結；前臺空白日隱藏。表 `itinerary_items`（migration 0010 已套用）
  - ✅ 小書圖文穿插（方案 A 段落錨點 `photos.post_paragraph`，migration 0011 已套用）＋手帳拼貼版式（見 PLAN §8）
  - ✅ 旅平險投保決策儀表板資料表（`ti_` 前綴 8 張，migration 0012 已套用）：保險 `ti_insurers`/`ti_plans`/`ti_rate_bands`＋國家 `ti_countries`＋簽證 `ti_country_visa`＋風險/健康/文化 `ti_country_risk`/`ti_country_health`/`ti_country_culture`；RLS 一律僅本人（同 expenses 模式，無 trip_id 不掛公開旅程）；`ti_rate_bands`/`ti_country_visa`/`ti_country_risk` 掛 `touch_updated_at`
    - 第 2 批：✅ 後臺「旅平險」頁籤（`admin/js/insurance.js`，不需選旅程）：查詢表單（國家多選 chip＋出發/回程日＋出生年→旅程天數/年齡）＋每國簽證卡片（`data_status` 已建檔/verified 才顯示完整資訊：official_fee 大字＋fee_warning、唯一官方 apply_url、必備文件/特別提醒、申請時機——apply_window_hours 有值依出發日回推「最早 M/D 可申請」，無值直接顯示 warning_note 建議；旅程天數超過 visa_free_days 顯紅字警告）；未建檔/查無一律「尚未建檔請查外交部」＋mofa_query_url，絕不臆測＋簽證分類總覽（visa_category 分組，選到的加粗）
    - 第 3 批：✅ 保障比較表（原訂保費試算改比保障——意外險費率為政府統一標準比不出差別；migration 0013 已套用：`ti_plans` 補 `legal_infectious`/`emergency_rescue_amount`/`trip_cancel`/`enroll_url`/`data_updated_at`，新觸發器函式 `touch_data_updated_at`；`ti_rate_bands` 保留暫不用）：旅平險頁籤「保障比較」區塊，各家一欄橫向比較（金額欄 N 萬/—、布林 ✓綠/✗灰、法定傳染病列琥珀底醒目、唯一 enroll_url 投保連結、表尾資料整理日；無資料顯示「尚無保險方案資料」不編造）＋固定顯示 2026/4 旅遊不便險新制提醒與免責句。風險/健康/文化區塊待後續批次（之後可能加 ti_risk_advice 表做「風險→建議保障」）

## Gmail 航班異動信解析（Phase 4 操作程序，非程式碼）

出發前 1–3 天，使用者對 Claude 說「**幫我掃描航空公司異動通知信**」即可。流程（依 PLAN.md §5 半自動決策）：
1. 用 Gmail 連接器搜尋近期來自航空公司（訂票平臺）的信件：關鍵字如 schedule change、時間變更、flight change、航班號
2. 比對信中航班資訊與 `flights` 表現有起降時間
3. **列出差異、經使用者確認後**，才以 MCP 更新 flights 資料（絕不自動改）
