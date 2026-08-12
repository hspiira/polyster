-- Phase 12: permissions (sections 11, 83). 'manager' sits between the
-- original two roles; permission_overrides holds per-person exceptions to
-- their role's defaults (src/lib/permissions.ts has the actual rule table --
-- this stays a database concern only insofar as replicated data needs a
-- column and a widened check, same as every other role/stage enum change in
-- this project).
begin;

do $$
declare
  c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'staff'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%role%'
      and pg_get_constraintdef(oid) not like '%manager%'
  loop
    execute format('alter table staff drop constraint %I', c.conname);
  end loop;
end $$;

alter table staff add constraint staff_role_check
  check (role in ('owner', 'manager', 'staff'));

alter table staff add column permission_overrides jsonb;

commit;
