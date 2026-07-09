-- 風險→建議保障 規則表（旅平險建議用；僅本人可見，比照 expenses 慣例）
-- 已於 2026-07-09 以 MCP apply_migration 套用至線上（migration name: ti_risk_advice）
create table public.ti_risk_advice (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id),
  risk_type    text not null,        -- 風險類型
  trigger_note text,                 -- 觸發條件說明
  advice_title text not null,        -- 建議加強的保障
  advice_plain text,                 -- 白話說明
  created_at   timestamptz not null default now()
);

alter table public.ti_risk_advice enable row level security;

-- RLS 僅本人：讀寫皆限 owner（與 expenses 同款）
create policy ti_risk_advice_owner on public.ti_risk_advice
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 種子資料：7 筆風險→建議規則（2026-07-09 以 MCP execute_sql 寫入，owner 為站主帳號）
-- 傳染病／離島醫療／申根／歐美醫療／戰亂治安／颱風季／氣候
