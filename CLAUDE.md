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

- `index.html` — 前臺（GitHub Pages 根頁面；Phase 2 實作，含 noindex）
- `admin/` — 後臺單頁應用（純 HTML/CSS/JS，無建置步驟；supabase-js 走 CDN ESM）
- `supabase/migrations/` — schema 記錄

## 鐵則（摘自 PLAN.md §4）

1. 訂位代號、訂單編號等個資只進 `*_private` 表（RLS 僅本人），前臺查詢永不撈取
2. Gemini 金鑰只放 Edge Function 環境變數，絕不進前端程式碼
3. 前臺半公開 = noindex + 不做密碼鎖（維持 FB 分享預覽）
4. AI 遊記只產草稿，必經人工確認才發布

## 進度

- Phase 1（本階段）：✅ 建表＋RLS ✅ 後臺登入 ✅ 航班/住宿/交通卡片手動輸入 ✅ 照片上傳（前端壓縮）
  - 追加：✅ 住宿卡 Google Maps 連結（place_id 定位/名稱地址搜尋）✅ 住宿依入住日排序 ✅ 記帳（expenses，僅本人可見）✅ 航班轉乘方式/票種/航司下拉
  - 待使用者完成：建立 Supabase Auth 使用者、推上 GitHub、設定 keep-alive secrets、建入馬爾地夫＋普吉島行前資料
- Phase 2 起：見 PLAN.md §9
