-- 0020_add_credit_fields_to_sale_share_view.sql
-- Adds credit_status, credit_amount_paid, credit_due_date, and
-- customer name to the public sale_share_view so the shareable receipt
-- can show credit/payment details to the customer.

-- ── 1. Drop old view (must recreate — cannot ALTER VIEW to add columns) ──
drop view if exists public.sale_share_view;

-- ── 2. Create new view with all public-safe fields ──
create or replace view public.sale_share_view as
select
  s.id,
  s.shop_id,
  s.share_token,
  s.sale_ref,
  s.created_at,
  s.subtotal,
  s.discount_amount,
  s.tax_amount,
  s.total,
  s.payment_method,
  s.credit_status,
  s.credit_amount_paid,
  s.credit_due_date,
  s.notes,                                  -- public notes (e.g. "thanks for shopping!")
  s.voided_at,
  c.name as customer_name                   -- only the name; phone/email are internal
from public.sales s
left join public.customers c on c.id = s.customer_id
where s.sharing_enabled = true and s.share_token is not null;

revoke select on public.sale_share_view from anon;
grant select on public.sale_share_view to anon;
