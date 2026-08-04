-- Phase 2C, migration 2 of 4
-- Six document types. Only three of them carry tax.
create type public.document_type as enum
  ('proforma','tax_invoice','bill_of_supply','delivery_challan','credit_note','debit_note');
create type public.document_status as enum ('draft','issued','cancelled');

create table public.document_series (
  doc_type    public.document_type primary key,
  prefix      text not null,
  next_number integer not null default 1 check (next_number > 0),
  updated_at  timestamptz not null default now()
);

insert into public.document_series (doc_type, prefix) values
  ('proforma','PI'), ('tax_invoice','INV'), ('bill_of_supply','BOS'),
  ('delivery_challan','DC'), ('credit_note','CN'), ('debit_note','DN');

alter table public.document_series enable row level security;
create policy document_series_select on public.document_series for select using (is_active_member());
create policy document_series_write on public.document_series for all using (is_admin()) with check (is_admin());

-- Gapless per-series, per-financial-year counter. A Postgres sequence is
-- deliberately not used: sequences leave gaps when a transaction rolls back,
-- and a gap in a tax invoice series is the one thing that cannot be repaired.
create table public.document_counters (
  doc_type    public.document_type not null,
  fy          text not null,
  last_number integer not null default 0,
  primary key (doc_type, fy)
);

alter table public.document_counters enable row level security;
create policy document_counters_select on public.document_counters for select using (is_admin());

create table public.invoices (
  id                uuid primary key default gen_random_uuid(),
  doc_type          public.document_type not null,
  status            public.document_status not null default 'draft',
  fy                text,
  seq_number        integer,
  doc_no            text unique,
  doc_date          date not null default current_date,

  order_id          uuid references public.orders(id),
  company_id        uuid not null references public.companies(id),
  parent_invoice_id uuid references public.invoices(id),

  place_of_supply_code text,
  place_of_supply_name text,
  reverse_charge    boolean not null default false,

  -- Snapshots taken at issue. A document must never change because someone
  -- edited the order or the company record three weeks later.
  supplier_snapshot jsonb,
  buyer_snapshot    jsonb,

  taxable_value     numeric(14,2) not null default 0,
  cgst_amount       numeric(14,2) not null default 0,
  sgst_amount       numeric(14,2) not null default 0,
  igst_amount       numeric(14,2) not null default 0,
  total_tax         numeric(14,2) not null default 0,
  round_off         numeric(6,2)  not null default 0,
  grand_total       numeric(14,2) not null default 0,
  amount_in_words   text,

  notes             text,
  terms             text,
  reason            text,

  issued_at         timestamptz,
  issued_by         uuid references public.profiles(id),
  cancelled_at      timestamptz,
  cancel_reason     text,

  created_by        uuid references public.profiles(id),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint issued_has_number check (status <> 'issued' or doc_no is not null),
  constraint note_has_parent check (doc_type not in ('credit_note','debit_note') or parent_invoice_id is not null)
);

create index invoices_order_idx on public.invoices (order_id);
create index invoices_company_idx on public.invoices (company_id);
create index invoices_status_idx on public.invoices (status, doc_date desc);

create table public.invoice_lines (
  id            uuid primary key default gen_random_uuid(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  line_no       integer not null,
  description   text not null,
  hsn_sac       text,
  quantity      numeric(12,3) not null,
  unit          public.item_unit not null default 'nos',
  rate          numeric(14,2) not null,
  taxable_value numeric(14,2) not null,
  gst_rate      numeric(5,2) not null default 0,
  cgst_amount   numeric(14,2) not null default 0,
  sgst_amount   numeric(14,2) not null default 0,
  igst_amount   numeric(14,2) not null default 0,
  line_total    numeric(14,2) not null,
  created_at    timestamptz not null default now(),
  unique (invoice_id, line_no)
);

alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;

create policy invoices_select on public.invoices for select using (is_active_member());
create policy invoices_insert on public.invoices for insert with check (is_active_member());
-- Only drafts may be updated through the API. Issuing and cancelling go
-- through security-definer functions, which is the only path that can change
-- an issued document.
create policy invoices_update on public.invoices for update
  using (is_active_member() and status = 'draft') with check (is_active_member());
create policy invoices_delete on public.invoices for delete using (is_admin() and status = 'draft');

create policy invoice_lines_select on public.invoice_lines for select using (is_active_member());
create policy invoice_lines_write on public.invoice_lines for all
  using (is_active_member() and exists (select 1 from public.invoices i where i.id = invoice_id and i.status = 'draft'))
  with check (is_active_member() and exists (select 1 from public.invoices i where i.id = invoice_id and i.status = 'draft'));

create trigger invoices_updated before update on public.invoices
  for each row execute function set_updated_at();
create trigger invoices_audit after insert or delete or update on public.invoices
  for each row execute function log_activity();
