-- 0013_ti_plans_coverage_fields.sql — 旅平險第 3 批：ti_plans 補保障比較欄位
-- 已以 MCP apply_migration（名稱：ti_plans_coverage_fields）套用至線上資料庫
--
-- 第 3 批改做「保障比較表」不做保費試算（意外險費率為政府統一標準，比不出差別）；
-- ti_rate_bands 保留不刪、暫不使用。
-- data_updated_at＝資料整理日：既有 touch_updated_at 函式寫死 updated_at 欄位名，
-- ti_plans 無該欄位，故照同模式另建 touch_data_updated_at。

create or replace function public.touch_data_updated_at()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  new.data_updated_at = now();
  return new;
end $$;

alter table public.ti_plans
  add column legal_infectious boolean not null default false,
  add column emergency_rescue_amount numeric,
  add column trip_cancel boolean not null default false,
  add column enroll_url text,
  add column data_updated_at timestamptz not null default now();

create trigger ti_plans_touch before update on public.ti_plans
  for each row execute function public.touch_data_updated_at();
