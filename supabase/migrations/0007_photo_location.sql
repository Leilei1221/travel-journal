-- 0007_photo_location.sql — 照片打卡位置（美食記）
-- 已以 MCP apply_migration（名稱：photo_location）套用至線上資料庫
--
-- location_name：地點名稱（例：巷口豆花店）；lat/lng：GPS 座標（後臺「打卡」按鈕取得）
-- 前臺照片牆顯示 📍 地點連結：有座標用座標精準定位，否則用名稱搜尋 Google Maps
-- RLS 不變（沿用 0006 的 photos_select）

alter table public.photos
  add column location_name text,
  add column lat double precision,
  add column lng double precision;
