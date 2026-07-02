-- 0002_expenses_flight_fields.sql — 記帳功能＋航班欄位擴充
-- 已以 MCP apply_migration（名稱：expenses_and_flight_fields）套用至線上資料庫

-- ── expenses：記帳（僅本人可讀寫，前臺永不撈取）─────────────────
create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips(id) on delete cascade,
  owner_id uuid not null default auth.uid(),
  category text not null default '其他', -- 住宿/機票/餐飲/交通/門票/購物/其他
  title text not null,
  note text,
  amount numeric(12,2) not null,
  currency text not null default 'TWD',
  amount_twd numeric(12,2), -- 臺幣約當（選填、手動填寫，不自動抓匯率）
  spent_on date,
  -- 三個可空外鍵擇一關聯；被關聯項刪除時設 NULL，記帳紀錄不消失
  stay_id uuid references public.stays(id) on delete set null,
  flight_id uuid references public.flights(id) on delete set null,
  transport_card_id uuid references public.transport_cards(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.expenses enable row level security;

create policy expenses_all on public.expenses for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ── flights 擴充：轉乘方式、票種 ────────────────────────────────
alter table public.flights
  add column transfer_type text, -- 直飛/轉機行李直掛/轉機需提領重掛
  add column ticket_type text;   -- 一般/四腿票/境外票/廉航/里程票/其他(自訂文字)
