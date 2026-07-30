-- Lets an authenticated user create their own shop row, tied to their own
-- auth.uid(). Supersedes the "shops has no insert policy" reasoning in
-- 0001_init.sql -- see ARCHITECTURE.md section 4 and D14 for why.
--
-- The existing `unique` constraint on supabase_auth_user_id already caps
-- this at one shop per account; the `with check` caps it at your own.

create policy "shop creates its own row" on shops
  for insert to authenticated
  with check (supabase_auth_user_id = (select auth.uid()));
