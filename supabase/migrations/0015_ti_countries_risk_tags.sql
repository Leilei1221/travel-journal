-- 國家風險標記：逗號分隔的 risk_type，對應 ti_risk_advice.risk_type
-- 已於 2026-07-09 以 MCP apply_migration 套用至線上（migration name: ti_countries_risk_tags）
-- 颱風季不綁國家（由台灣出發日期 5–11 月判斷），故不寫入任何國家
alter table public.ti_countries add column risk_tags text;

-- 種子標記（2026-07-09 以 MCP execute_sql 寫入）：
--   新加坡＝傳染病、泰國＝傳染病、馬爾地夫＝離島醫療,傳染病、加拿大＝歐美醫療
