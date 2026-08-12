-- Phase 9: repairs. Per section 80 ("Integrate with: clients, orders,
-- garment_units, payments"), modelled as order_type = 'repair' on the
-- existing offline-capable orders table rather than a new table -- see
-- docs/POLYSTER.md's Phase 9 status notes for the full field-by-field
-- mapping (quoted/final amount -> price_total_minor/price_adjustment_minor,
-- description -> the order's single unit, received/collected -> the
-- 'measured'/'picked_up' stages it already has).
begin;

alter table orders
  add column garment_unit_id uuid references garment_units(id) on delete set null;

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%order_type%'
      and pg_get_constraintdef(oid) not like '%repair%'
  loop
    execute format('alter table orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table orders add constraint orders_order_type_check
  check (order_type in ('tailor_made', 'rental', 'purchase', 'pre_order', 'repair'));

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%stage%'
      and pg_get_constraintdef(oid) not like '%assessing%'
  loop
    execute format('alter table orders drop constraint %I', c.conname);
  end loop;
end $$;

alter table orders add constraint orders_stage_check
  check (stage in (
    'measured', 'in_progress', 'ready', 'picked_up', 'returned', 'cancelled',
    'assessing', 'approved', 'repairing'
  ));

-- order_stage_history's own from_stage/to_stage checks need the same three
-- values, or a repair's stage changes fail to write their own history row.
do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'order_stage_history'::regclass
      and contype = 'c'
      and (pg_get_constraintdef(oid) like '%from_stage%' or pg_get_constraintdef(oid) like '%to_stage%')
      and pg_get_constraintdef(oid) not like '%assessing%'
  loop
    execute format('alter table order_stage_history drop constraint %I', c.conname);
  end loop;
end $$;

alter table order_stage_history add constraint order_stage_history_from_stage_check
  check (from_stage in (
    'measured', 'in_progress', 'ready', 'picked_up', 'returned', 'cancelled',
    'assessing', 'approved', 'repairing'
  ));
alter table order_stage_history add constraint order_stage_history_to_stage_check
  check (to_stage in (
    'measured', 'in_progress', 'ready', 'picked_up', 'returned', 'cancelled',
    'assessing', 'approved', 'repairing'
  ));

commit;
