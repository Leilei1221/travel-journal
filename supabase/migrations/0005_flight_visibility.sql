-- 0005_flight_visibility.sql — 航班前臺顯示控制（行程安全）
-- 已以 MCP apply_migration（名稱：flight_visibility）套用至線上資料庫
-- 與 0004 住宿同一套邏輯：RLS 層過濾，直接呼叫 API 也拿不到未公開航班。

alter table public.flights
  add column visibility text not null default 'after_departure'
  check (visibility in ('after_departure', 'public', 'hidden'));
-- after_departure＝起飛時間過後自動公開（預設；無起飛時間則持續隱藏）
-- public         ＝立即公開（想提前公告時手動選）
-- hidden         ＝永不公開

drop policy flights_select on public.flights;

create policy flights_select on public.flights for select using (
  owner_id = auth.uid()
  or (
    exists (select 1 from public.trips t where t.id = trip_id and t.is_public)
    and (
      visibility = 'public'
      or (visibility = 'after_departure' and depart_time is not null and depart_time < now())
    )
  )
);
