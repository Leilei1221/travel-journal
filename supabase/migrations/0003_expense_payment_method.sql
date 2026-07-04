-- 0003_expense_payment_method.sql — 記帳加付款方式欄位
-- 已以 MCP apply_migration（名稱：expense_payment_method）套用至線上資料庫

alter table public.expenses
  add column payment_method text; -- 現金/信用卡/轉帳/行動支付/其他
