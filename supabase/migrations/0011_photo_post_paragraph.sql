-- 0011_photo_post_paragraph.sql — 文章段落錨點（方案 A：圖文穿插）
-- 已以 MCP apply_migration（名稱：photo_post_paragraph）套用至線上資料庫
--
-- 配合既有 photos.post_id（0009）：照片可釘在所屬文章的指定段落之後，
-- 小書與前臺遊記依此把照片放進文字流的對應位置（不再全擠文末）。
-- post_paragraph：0-based 段落索引；null 或 >= 段數＝放在文章結尾。
-- 沒有 post_id 的照片不受影響，仍回退到小書文末拼貼區 / 前臺照片牆。

alter table public.photos
  add column post_paragraph integer;
