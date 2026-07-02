-- 0001_init.sql — Phase 1 資料模型（PLAN.md §3、§4）
-- 本檔為已套用至 Supabase 專案 travel-journal（xifaxliaarxxmvuqcpav）之 schema 鏡像，
-- 供版本記錄與日後重建使用；線上資料庫為實際真相來源。

-- ── updated_at 自動更新 ──────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── trips：旅程（一切以 Trip 為單位）──────────────────────────
create table public.trips (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  title text not null,
  destination text,
  start_date date,
  end_date date,
  status text not null default 'planning', -- planning / traveling / done
  cover_photo_url text,
  theme jsonb not null default '{"--main": "#7a9e9f", "--paper": "#faf6ee", "--accent": "#e07a5f"}',
  is_public boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();

-- ── flights：航班（公開）＋ flight_private：訂位代號（私人）────
create table public.flights (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  segment_order integer not null default 1,
  airline text,
  flight_no text,
  depart_airport text,
  arrive_airport text,
  depart_time timestamptz,
  arrive_time timestamptz,
  layover_info text,
  notes text,
  created_at timestamptz not null default now()
);

create table public.flight_private (
  flight_id uuid primary key references public.flights(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  booking_ref text,
  private_notes text
);

-- ── stays：住宿（公開）＋ stay_private：訂單編號（私人）────────
create table public.stays (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  name text not null,
  google_place_id text,
  address text,
  lat double precision,
  lng double precision,
  check_in date,
  check_out date,
  notes text,
  created_at timestamptz not null default now()
);

create table public.stay_private (
  stay_id uuid primary key references public.stays(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  order_no text,
  private_notes text
);

-- ── transport_cards：交通卡片（接送/租機車/火車/渡輪…）─────────
create table public.transport_cards (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  card_type text not null default '其他',
  title text not null,
  content text,
  cost_note text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── photos：照片（src_url 預留日後搬遷 R2，搬家只改網址）────────
create table public.photos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  taken_on date,
  src_url text not null,
  storage_path text,
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- ── posts：遊記（行前情報/每日遊記/總結；草稿→發布）────────────
create table public.posts (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  post_type text not null default 'pretrip', -- pretrip / daily / summary
  status text not null default 'draft',      -- draft / published
  title text,
  content text,
  ai_draft text,
  post_date date,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

-- ── RLS（PLAN.md §4：私人欄位限本人，前臺查詢永不撈取）──────────
alter table public.trips enable row level security;
alter table public.flights enable row level security;
alter table public.flight_private enable row level security;
alter table public.stays enable row level security;
alter table public.stay_private enable row level security;
alter table public.transport_cards enable row level security;
alter table public.photos enable row level security;
alter table public.posts enable row level security;

-- trips：本人全權限；公開行程任何人可讀
create policy trips_select on public.trips for select using (is_public or owner_id = auth.uid());
create policy trips_insert on public.trips for insert with check (owner_id = auth.uid());
create policy trips_update on public.trips for update using (owner_id = auth.uid());
create policy trips_delete on public.trips for delete using (owner_id = auth.uid());

-- flights
create policy flights_select on public.flights for select
  using (owner_id = auth.uid() or exists (select 1 from public.trips t where t.id = trip_id and t.is_public));
create policy flights_write  on public.flights for insert with check (owner_id = auth.uid());
create policy flights_update on public.flights for update using (owner_id = auth.uid());
create policy flights_delete on public.flights for delete using (owner_id = auth.uid());

-- flight_private：僅本人
create policy flight_private_all on public.flight_private for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- stays
create policy stays_select on public.stays for select
  using (owner_id = auth.uid() or exists (select 1 from public.trips t where t.id = trip_id and t.is_public));
create policy stays_write  on public.stays for insert with check (owner_id = auth.uid());
create policy stays_update on public.stays for update using (owner_id = auth.uid());
create policy stays_delete on public.stays for delete using (owner_id = auth.uid());

-- stay_private：僅本人
create policy stay_private_all on public.stay_private for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- transport_cards
create policy transport_select on public.transport_cards for select
  using (owner_id = auth.uid() or exists (select 1 from public.trips t where t.id = trip_id and t.is_public));
create policy transport_write  on public.transport_cards for insert with check (owner_id = auth.uid());
create policy transport_update on public.transport_cards for update using (owner_id = auth.uid());
create policy transport_delete on public.transport_cards for delete using (owner_id = auth.uid());

-- photos
create policy photos_select on public.photos for select
  using (owner_id = auth.uid() or exists (select 1 from public.trips t where t.id = trip_id and t.is_public));
create policy photos_write  on public.photos for insert with check (owner_id = auth.uid());
create policy photos_update on public.photos for update using (owner_id = auth.uid());
create policy photos_delete on public.photos for delete using (owner_id = auth.uid());

-- posts：公開行程「已發布」文章任何人可讀；草稿僅本人
create policy posts_select on public.posts for select
  using (owner_id = auth.uid() or (status = 'published' and exists (select 1 from public.trips t where t.id = trip_id and t.is_public)));
create policy posts_write  on public.posts for insert with check (owner_id = auth.uid());
create policy posts_update on public.posts for update using (owner_id = auth.uid());
create policy posts_delete on public.posts for delete using (owner_id = auth.uid());

-- ── Storage：photos bucket（公開讀取、登入者寫入）───────────────
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
  on conflict (id) do nothing;

create policy photos_bucket_read   on storage.objects for select using (bucket_id = 'photos');
create policy photos_bucket_insert on storage.objects for insert to authenticated with check (bucket_id = 'photos');
create policy photos_bucket_update on storage.objects for update to authenticated using (bucket_id = 'photos');
create policy photos_bucket_delete on storage.objects for delete to authenticated using (bucket_id = 'photos');
