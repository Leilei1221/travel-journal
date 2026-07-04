-- 0004_stay_visibility.sql — 住宿前臺顯示控制（行程安全）
-- 已以 MCP apply_migration（名稱：stay_visibility）套用至線上資料庫
--
-- 背景：旅程設為公開後，行前就能在前臺看到住宿點，有行程安全疑慮。
-- 解法：住宿逐筆控制公開時機，且在 RLS 層過濾（直接呼叫 API 也拿不到），
--       非僅前端隱藏。

alter table public.stays
  add column visibility text not null default 'after_checkout'
  check (visibility in ('after_checkout', 'public', 'hidden'));
-- after_checkout＝退房日過後自動公開（預設；無退房日則持續隱藏）
-- public       ＝立即公開（想提前公告時手動選）
-- hidden       ＝永不公開

drop policy stays_select on public.stays;

create policy stays_select on public.stays for select using (
  owner_id = auth.uid()
  or (
    exists (select 1 from public.trips t where t.id = trip_id and t.is_public)
    and (
      visibility = 'public'
      or (visibility = 'after_checkout' and check_out is not null and check_out < current_date)
    )
  )
);
