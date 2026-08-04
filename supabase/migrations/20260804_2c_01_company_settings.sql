-- Phase 2C, migration 1 of 4
-- Supplier identity and tax configuration. One row, admin-editable.
-- Nothing here is hardcoded in the application: a GSTIN change or a new
-- invoice series is an edit, not a deployment.
create table public.company_settings (
  id                    uuid primary key default gen_random_uuid(),
  singleton             boolean not null default true check (singleton),
  legal_name            text,
  trade_name            text,
  address_line1         text,
  address_line2         text,
  city                  text,
  state_name            text,
  state_code            text check (state_code ~ '^[0-9]{2}$'),
  pincode               text,
  gstin                 text check (gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$'),
  pan                   text,
  phone                 text,
  email                 text,
  website               text,
  bank_name             text,
  bank_account_no       text,
  bank_ifsc             text,
  bank_branch           text,
  signatory_name        text,
  signatory_designation text,
  default_gst_rate      numeric(5,2) not null default 18,
  invoice_terms         text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- One row, forever. log_activity() writes new.id into a uuid column, which is
-- why the key is a uuid and the single-row rule is a separate flag.
create unique index company_settings_singleton on public.company_settings (singleton);
insert into public.company_settings default values;

alter table public.company_settings enable row level security;
create policy company_settings_select on public.company_settings for select using (is_active_member());
create policy company_settings_update on public.company_settings for update using (is_admin()) with check (is_admin());

create trigger company_settings_updated before update on public.company_settings
  for each row execute function set_updated_at();
create trigger company_settings_audit after update on public.company_settings
  for each row execute function log_activity();

-- Per-client GST switch. Deliberately a switch, not a rule about the word
-- "school": the reason is recorded so an auditor can be answered years later.
alter table public.companies
  add column gst_applicable boolean not null default true,
  add column gst_exemption_reason text;

create table public.hsn_codes (
  code        text primary key check (code ~ '^[0-9]{4,8}$'),
  description text not null,
  gst_rate    numeric(5,2) not null default 18,
  created_at  timestamptz not null default now()
);

alter table public.hsn_codes enable row level security;
create policy hsn_codes_select on public.hsn_codes for select using (is_active_member());
create policy hsn_codes_write on public.hsn_codes for all using (is_admin()) with check (is_admin());
