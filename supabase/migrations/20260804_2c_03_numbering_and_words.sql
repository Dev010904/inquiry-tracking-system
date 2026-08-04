-- Phase 2C, migration 3 of 4 — numbering, amount in words, immutability.

-- Indian financial year label, e.g. 2026-27 for any date from 01 Apr 2026.
create or replace function public.fy_label(d date)
returns text language sql immutable as $$
  select case when extract(month from d) >= 4
    then to_char(d,'YYYY') || '-' || to_char((d + interval '1 year'),'YY')
    else to_char((d - interval '1 year'),'YYYY') || '-' || to_char(d,'YY')
  end;
$$;

create or replace function public.words_below_100(n int)
returns text language plpgsql immutable as $$
declare
  ones text[] := array['One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten',
    'Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  tens text[] := array['','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
begin
  if n <= 0 then return ''; end if;
  if n < 20 then return ones[n]; end if;
  if n % 10 = 0 then return tens[n/10]; end if;
  return tens[n/10] || ' ' || ones[n % 10];
end $$;

-- Rupees in words, Indian numbering (crore / lakh). Printed on every invoice.
create or replace function public.amount_in_words(amt numeric)
returns text language plpgsql immutable as $$
declare
  rupees bigint; paise int; out_ text := ''; part int;
begin
  rupees := floor(abs(amt))::bigint;
  paise  := round((abs(amt) - floor(abs(amt))) * 100)::int;
  if rupees = 0 then out_ := 'Zero '; end if;

  part := (rupees / 10000000)::int;
  if part > 0 then out_ := out_ || public.words_below_100(part) || ' Crore '; rupees := rupees % 10000000; end if;
  part := (rupees / 100000)::int;
  if part > 0 then out_ := out_ || public.words_below_100(part) || ' Lakh '; rupees := rupees % 100000; end if;
  part := (rupees / 1000)::int;
  if part > 0 then out_ := out_ || public.words_below_100(part) || ' Thousand '; rupees := rupees % 1000; end if;
  part := (rupees / 100)::int;
  if part > 0 then out_ := out_ || public.words_below_100(part) || ' Hundred '; rupees := rupees % 100; end if;
  if rupees > 0 then
    if out_ <> '' then out_ := out_ || 'and '; end if;
    out_ := out_ || public.words_below_100(rupees::int) || ' ';
  end if;

  out_ := 'Rupees ' || btrim(regexp_replace(out_, '\s+', ' ', 'g'));
  if paise > 0 then out_ := out_ || ' and ' || public.words_below_100(paise) || ' Paise'; end if;
  return out_ || ' Only';
end $$;

-- Allocates the next number in a series, gaplessly, inside the caller's
-- transaction. The row lock means two people clicking Issue at the same
-- moment queue rather than collide.
create or replace function public.allocate_document_number(p_doc_type public.document_type, p_date date)
returns table (out_fy text, out_seq integer, out_doc_no text)
language plpgsql security definer set search_path to 'public' as $$
declare
  v_fy text := public.fy_label(p_date); v_prefix text; v_next int;
begin
  select prefix into v_prefix from public.document_series where doc_type = p_doc_type;
  if v_prefix is null then raise exception 'No series configured for %', p_doc_type; end if;

  insert into public.document_counters as dc (doc_type, fy, last_number)
  values (p_doc_type, v_fy, 0) on conflict (doc_type, fy) do nothing;

  update public.document_counters as dc
     set last_number = dc.last_number + 1
   where dc.doc_type = p_doc_type and dc.fy = v_fy
  returning dc.last_number into v_next;

  out_fy := v_fy;
  out_seq := v_next;
  out_doc_no := v_prefix || '/' || v_fy || '/' || lpad(v_next::text, 4, '0');
  return next;
end $$;

-- An issued document is immutable. This trigger is the guarantee; the RLS
-- policy is only the first line of defence.
create or replace function public.guard_issued_document()
returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'A document that has been issued cannot be deleted. Cancel it, or raise a credit note.';
    end if;
    return old;
  end if;

  if old.status = 'issued' then
    -- Only cancellation may touch an issued document.
    if new.status = 'cancelled'
       and new.doc_no is not distinct from old.doc_no
       and new.grand_total is not distinct from old.grand_total
       and new.taxable_value is not distinct from old.taxable_value then
      return new;
    end if;
    raise exception 'An issued document cannot be changed. Raise a credit or debit note instead.';
  end if;

  if old.status = 'cancelled' and new.status <> 'cancelled' then
    raise exception 'A cancelled document cannot be reinstated.';
  end if;

  return new;
end $$;

create trigger invoices_guard_issued before update or delete on public.invoices
  for each row execute function public.guard_issued_document();

create or replace function public.guard_issued_document_lines()
returns trigger language plpgsql as $$
declare st public.document_status;
begin
  select status into st from public.invoices where id = coalesce(new.invoice_id, old.invoice_id);
  if st is not null and st <> 'draft' then
    raise exception 'The lines of an issued document cannot be changed.';
  end if;
  return coalesce(new, old);
end $$;

create trigger invoice_lines_guard before insert or update or delete on public.invoice_lines
  for each row execute function public.guard_issued_document_lines();
