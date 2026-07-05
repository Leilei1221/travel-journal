-- 0009_photo_post_link.sql — 照片關聯文章＋精選標記
-- 已以 MCP apply_migration（名稱：photo_post_link_and_featured）套用至線上資料庫
--
-- post_id：照片配圖至某篇文章（前臺該文章內直接顯示；不再出現在照片牆）
-- is_featured：照片牆依打卡地點分組時，標記為精選者優先顯示（其餘收合）
-- RLS 沿用既有 photos_select（跟隨旅程公開狀態與關聯住宿公開時機）

alter table public.photos
  add column post_id uuid references public.posts(id) on delete set null,
  add column is_featured boolean not null default false;
