-- 0006_photo_stay_link.sql — 住宿介紹照片（photos 掛 stay_id）
-- 已以 MCP apply_migration（名稱：photo_stay_link）套用至線上資料庫
--
-- 照片可選擇性關聯到某筆住宿，前臺住宿卡顯示小相簿（設備/地點/周遭環境）。
-- 行程安全：掛在住宿下的照片跟隨該住宿的公開時機（RLS 層過濾），
-- 住宿未公開前，其照片同樣查不到。

alter table public.photos
  add column stay_id uuid references public.stays(id) on delete set null;

drop policy photos_select on public.photos;

create policy photos_select on public.photos for select using (
  owner_id = auth.uid()
  or (
    exists (select 1 from public.trips t where t.id = trip_id and t.is_public)
    and (
      stay_id is null
      or exists (
        select 1 from public.stays s
        where s.id = stay_id
          and (
            s.visibility = 'public'
            or (s.visibility = 'after_checkout' and s.check_out is not null and s.check_out < current_date)
          )
      )
    )
  )
);
