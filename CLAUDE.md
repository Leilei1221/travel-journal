# travel-journal

自助旅遊記錄網站：後臺規劃、前臺展示、可匯出 A5 旅遊小書。

**最高指導文件：[PLAN.md](PLAN.md)** — 所有開發決策以此為準；技術架構、資料模型、隱私規則、風格憲章、分階段計畫都在裡面。決策若有變更，直接更新 PLAN.md。

## 基礎設施

- Supabase 專案：`travel-journal`（project id：`xifaxliaarxxmvuqcpav`，region：ap-northeast-1）
  - URL：`https://xifaxliaarxxmvuqcpav.supabase.co`
  - ⚠️ 同帳號下另一個專案「Leilei1221's Project」是奶貓日記，**不要動它**
- Schema 鏡像：`supabase/migrations/`（線上資料庫為真相來源；改 schema 時用 MCP `apply_migration` 並同步新增鏡像檔）
- 照片 bucket：`photos`（公開讀取、登入者寫入）
- Keep-alive：`.github/workflows/keep-alive.yml` 每 3 天 ping REST API（需設 repo secrets `SUPABASE_URL`、`SUPABASE_ANON_KEY`）

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

## 進度

- Phase 1：✅ 建表＋RLS ✅ 後臺登入 ✅ 航班/住宿/交通卡片手動輸入 ✅ 照片上傳（前端壓縮）✅ GitHub repo＋keep-alive
  - 追加：✅ 住宿卡 Google Maps 連結（place_id 定位/名稱地址搜尋）✅ 住宿依入住日排序 ✅ 記帳（expenses，僅本人可見）✅ 航班轉乘方式/票種/航司下拉 ✅ 記帳付款方式
- Phase 2（本階段）：✅ 前臺首頁（Hero＋拍立得卡片＋關於我/小貼士；旅行地圖/裝備佔位）✅ 旅程內頁（主題色＋四頁籤，行程安排含 Maps 按鈕）
  - 待辦：GitHub Pages 開啟（使用者確認版面後）、Google Places 住宿/景點抓取（§9）
- Phase 3 起：見 PLAN.md §9
