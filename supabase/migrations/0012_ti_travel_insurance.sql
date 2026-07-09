-- 0012_ti_travel_insurance.sql — 旅平險投保決策儀表板資料表（ti_ 前綴）
-- 已以 MCP apply_migration（名稱：ti_travel_insurance）套用至線上資料庫
--
-- 7 張表：保險 3（ti_insurers / ti_plans / ti_rate_bands）
--        ＋國家基本 1（ti_countries）＋簽證 1（ti_country_visa）
--        ＋風險/健康/文化 3（ti_country_risk / ti_country_health / ti_country_culture）
-- RLS 一律「僅本人」（同 expenses / *_private 慣例）：無 trip_id 可掛公開旅程模式，
-- 屬後臺決策用資料；日後若前臺要公開國家資訊，再另加 select policy。
-- updated_at 重用 public.touch_updated_at；FK 一律 on delete cascade。

-- ── 保險類 ──────────────────────────────────────────────
create table public.ti_insurers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name text not null,
  official_url text,
  quote_page_url text,
  note text,
  created_at timestamptz not null default now()
);

create table public.ti_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  insurer_id uuid not null references public.ti_insurers(id) on delete cascade,
  plan_name text not null,
  accident_coverage numeric,
  medical_coverage numeric,
  overseas_illness boolean not null default false,
  flight_delay boolean not null default false,
  baggage boolean not null default false,
  emergency_rescue boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create table public.ti_rate_bands (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  insurer_id uuid not null references public.ti_insurers(id) on delete cascade,
  plan_id uuid not null references public.ti_plans(id) on delete cascade,
  days_min integer,
  days_max integer,
  age_min integer,
  age_max integer,
  region text,
  premium_estimate numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 國家基本 ────────────────────────────────────────────
create table public.ti_countries (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  name_zh text not null,
  name_en text,
  region text,
  timezone text,
  voltage text,
  plug_type text,
  emergency_phone text,
  currency text,
  created_at timestamptz not null default now()
);

-- ── 簽證 ────────────────────────────────────────────────
create table public.ti_country_visa (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  country_id uuid not null references public.ti_countries(id) on delete cascade,
  visa_type text,
  visa_category text,
  visa_free_days integer,
  apply_url text,
  official_fee text,
  fee_warning text,
  apply_window_hours integer,
  processing_time text,
  required_docs text,
  official_source_url text,
  warning_note text,
  data_status text,
  mofa_query_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── 風險 / 健康 / 文化 ──────────────────────────────────
create table public.ti_country_risk (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  country_id uuid not null references public.ti_countries(id) on delete cascade,
  mofa_alert_level text,
  mofa_alert_note text,
  cdc_epidemic_level text,
  cdc_note text,
  security_note text,
  source_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ti_country_health (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  country_id uuid not null references public.ti_countries(id) on delete cascade,
  disease_name text not null,
  vaccine_suggested boolean not null default false,
  prevention_note text,
  created_at timestamptz not null default now()
);

create table public.ti_country_culture (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  country_id uuid not null references public.ti_countries(id) on delete cascade,
  topic text,
  title text,
  description text,
  active_period text,
  created_at timestamptz not null default now()
);

-- ── updated_at 觸發器（重用 public.touch_updated_at）────────
create trigger ti_rate_bands_touch before update on public.ti_rate_bands
  for each row execute function public.touch_updated_at();
create trigger ti_country_visa_touch before update on public.ti_country_visa
  for each row execute function public.touch_updated_at();
create trigger ti_country_risk_touch before update on public.ti_country_risk
  for each row execute function public.touch_updated_at();

-- ── RLS：全部啟用，僅本人全權限 ─────────────────────────
alter table public.ti_insurers enable row level security;
alter table public.ti_plans enable row level security;
alter table public.ti_rate_bands enable row level security;
alter table public.ti_countries enable row level security;
alter table public.ti_country_visa enable row level security;
alter table public.ti_country_risk enable row level security;
alter table public.ti_country_health enable row level security;
alter table public.ti_country_culture enable row level security;

create policy ti_insurers_all on public.ti_insurers for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ti_plans_all on public.ti_plans for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ti_rate_bands_all on public.ti_rate_bands for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ti_countries_all on public.ti_countries for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ti_country_visa_all on public.ti_country_visa for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ti_country_risk_all on public.ti_country_risk for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ti_country_health_all on public.ti_country_health for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy ti_country_culture_all on public.ti_country_culture for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
