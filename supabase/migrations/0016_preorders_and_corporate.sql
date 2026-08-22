-- Phase 7: pre-orders and corporate orders. Extends the existing `orders`
-- table (sections 31-32) rather than creating new ones -- offline-capable,
-- unlike Phase 2 onward's online-only modules (section 46.1), because
-- section 47 requires "Create pre-order" to work with no connection.
begin;

alter table orders
  add column customer_type text not null default 'individual'
    check (customer_type in ('individual', 'corporate')),
  add column organisation_name text,
  add column purchase_order_reference text,
  add column contact_person text,
  add column expected_fulfilment_date date,
  -- Reserved, not yet written by any UI -- see the matching comment on
  -- OrderDoc in src/db/schema.ts for why (an online picker doesn't belong
  -- in an otherwise fully offline form; Phase 8 revisits this).
  add column product_variant_id text references product_variants(id) on delete set null,
  add column collection_id text references collections(id) on delete set null,
  add column production_batch_id text references production_batches(id) on delete set null;

-- Same "find the real constraint name, don't guess" approach as the stage
-- check in 0005_order_units_and_schema_pass.sql.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%order_type%'
      and pg_get_constraintdef(oid) not like '%pre_order%'
  loop
    execute format('alter table orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table orders add constraint orders_order_type_check
  check (order_type in ('tailor_made', 'rental', 'purchase', 'pre_order'));

commit;
