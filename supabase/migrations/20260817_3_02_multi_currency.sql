-- Currency on the commercial records, but never on the tax figures.
--
-- An Indian GST tax invoice is denominated in INR. Where a supply is billed in
-- a foreign currency the invoice must still show the INR value tax was computed
-- on, at a stated rate. So currency is not a display toggle: inquiries, orders,
-- quotations and R&D budgets carry a currency, and the tax columns on invoices
-- stay INR whatever the parent order is priced in.
--
-- Nothing here converts a stored amount. Each amount stays in the currency it
-- was agreed in, and the rate is recorded per document as a person entered it.
-- A rate fetched from an API would silently restate the value of documents
-- already issued, which is exactly what an assessment cannot tolerate.

create type public.currency_code as enum ('INR', 'USD', 'EUR', 'JPY', 'CNY');

-- Existing rows become INR, which is not a guess: every record to date is
-- domestic.
alter table public.inquiries    add column if not exists currency public.currency_code not null default 'INR';
alter table public.orders       add column if not exists currency public.currency_code not null default 'INR';
alter table public.rnd_projects add column if not exists currency public.currency_code not null default 'INR';
alter table public.rnd_expenses add column if not exists currency public.currency_code not null default 'INR';

comment on column public.orders.currency is
  'Currency the order was agreed in. Inherited from the inquiry; tax documents still compute in INR.';

alter table public.company_settings
  add column if not exists default_currency public.currency_code not null default 'INR';

-- Nullable, and only meaningful when the parent order is not INR. `base_currency`
-- records what the rate converts FROM, so a document stays readable years later
-- without inferring anything from the order it came off.
alter table public.invoices
  add column if not exists exchange_rate numeric(12,6),
  add column if not exists base_currency public.currency_code;

comment on column public.invoices.exchange_rate is
  'Units of INR per one unit of base_currency, as entered by a person on this document. Never fetched, never recalculated.';

-- Both or neither: a rate without its currency cannot be interpreted, and a
-- currency without a rate cannot be checked against the INR tax figures.
alter table public.invoices
  drop constraint if exists invoices_exchange_rate_pair;
alter table public.invoices
  add constraint invoices_exchange_rate_pair check (
    (exchange_rate is null and base_currency is null)
    or (exchange_rate is not null and base_currency is not null and exchange_rate > 0)
  );

/*
 * RLS: no new policies. Postgres RLS grants at row level, so these columns are
 * already covered by the existing policies on each table — a user who can read
 * an order can read its currency, and one who cannot read the row cannot read
 * any column of it. Adding column-level grants here would loosen nothing and
 * would give a false impression that the columns were separately protected.
 */

/*
 * Verification — run after applying.
 *
 *   select currency, count(*) from public.orders group by currency;
 *   select currency, count(*) from public.inquiries group by currency;
 *
 * Pass condition: every existing row reads INR and no other value appears.
 */
