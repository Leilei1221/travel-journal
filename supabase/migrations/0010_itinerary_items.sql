-- 0010_itinerary_items.sql — 行程規劃（務實版）：每日時間線景點/活動
-- 已以 MCP apply_migration（名稱：itinerary_items）套用至線上資料庫
--
-- 與 flights/stays/transport_cards 不同：行程景點無個資疑慮，不需 visibility 欄位，
-- 直接跟隨 trips.is_public（同 transport_cards 模式）
-- google_place_id：供之後接 Google Places 用；lat/lng 供地圖與「導航到下一站」連結

create table public.itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  item_date date,
  time_label text,
  place_name text not null,
  notes text,
  lat double precision,
  lng double precision,
  google_place_id text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.itinerary_items enable row level security;

create policy itinerary_items_select on public.itinerary_items for select
  using (owner_id = auth.uid() or exists (select 1 from public.trips t where t.id = trip_id and t.is_public));
create policy itinerary_items_write  on public.itinerary_items for insert with check (owner_id = auth.uid());
create policy itinerary_items_update on public.itinerary_items for update using (owner_id = auth.uid());
create policy itinerary_items_delete on public.itinerary_items for delete using (owner_id = auth.uid());
