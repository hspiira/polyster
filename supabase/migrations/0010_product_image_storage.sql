-- Storage bucket for product photos. Storage does not inherit table RLS
-- (docs/IMPLEMENTATION_PLAN.md Phase 2 step 2), so it needs its own policies.
-- Objects are stored as "<shop_id>/<filename>"; policies check that prefix
-- against current_shop_id(). Public read: product photos are meant to be
-- visible to anyone viewing the catalogue, not just the owning shop.
begin;

insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

create policy "product images: shop scoped insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select current_shop_id())::text
  );

create policy "product images: shop scoped update" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select current_shop_id())::text
  );

create policy "product images: shop scoped delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select current_shop_id())::text
  );

commit;
