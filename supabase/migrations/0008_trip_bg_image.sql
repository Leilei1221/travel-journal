-- 0008_trip_bg_image.sql — 旅程專屬背景插畫（Phase 3）
-- 已以 MCP apply_migration（名稱：trip_bg_image）套用至線上資料庫
--
-- 後臺「🎨 生成背景」：gemini-draft Edge Function（mode: background）依
-- 目的地＋主題色生成淡色手繪插畫 → 人工預覽 → 套用（壓成 webp 傳 Storage
-- backgrounds/{tripId}.webp，公開網址存此欄）。前臺內頁有值就換背景，
-- 無值用預設 assets/img/bg-doodle.webp。RLS 不變（trips 既有政策涵蓋）。

alter table public.trips
  add column bg_image_url text;
