-- Fixes a Phase 2 gap surfaced by Phase 6's live testing: Supabase Storage's
-- own API needs a SELECT policy to locate an object before it will update or
-- delete it. A public bucket only grants anonymous read of the public URL --
-- not authenticated visibility into storage.objects -- so without this,
-- deleteProductImage() silently no-ops even for the owning shop.
begin;

create policy "product images: shop scoped select" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'product-images'
    and (storage.foldername(name))[1] = (select current_shop_id())::text
  );

commit;
