-- Phase 10: NORTH//FOUND garment passport (section 34, 68). A garment's
-- public_token is the bearer of access to its passport page -- never the
-- row's own uuid (section 30, 68). Anonymous visitors get NO direct table
-- grant on garment_units or anything it joins to; the only door in is the
-- garment_passport() function below, which returns just the fields section
-- 34 actually needs and nothing a customer, staff member, or payment would
-- be identifiable from (section 68). This mirrors current_shop_id()'s own
-- security definer pattern from 0001_init.sql, applied at the anonymous
-- boundary instead of the authenticated-tenant one.
begin;

alter table garment_units
  add column public_token text not null default encode(gen_random_bytes(16), 'hex') unique;

create or replace function garment_passport(p_token text)
returns table (
  shop_name text,
  shop_logo_url text,
  shop_country text,
  product_name text,
  product_brand text,
  variant_size text,
  variant_colour text,
  serial_number text,
  collection_name text,
  collection_tagline text,
  collection_story text,
  collection_cover_image_url text,
  collection_production_limit integer,
  batch_number text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    s.name,
    s.logo_url,
    s.country,
    p.name,
    p.brand,
    pv.size,
    pv.colour,
    gu.serial_number,
    c.name,
    c.tagline,
    c.story,
    c.cover_image_url,
    c.production_limit,
    pb.batch_number
  from public.garment_units gu
  join public.shops s on s.id = gu.shop_id
  join public.product_variants pv on pv.id = gu.product_variant_id
  join public.products p on p.id = pv.product_id
  left join public.collections c on c.id = p.collection_id
  left join public.production_batches pb on pb.id = gu.production_batch_id
  where gu.public_token = p_token
    and exists (
      select 1 from public.tenant_features tf
      where tf.shop_id = gu.shop_id
        and tf.feature_key = 'garment_passport'
        and tf.enabled = true
    )
$$;

revoke execute on function garment_passport(text) from public;
grant execute on function garment_passport(text) to anon, authenticated;

commit;
