-- Polyster development seed
-- Requires migrations 0001..0020 to have been applied.
--
-- Run `pnpm seed:auth` first. It creates the two accounts matched by email
-- below, which is what makes the seeded shops signable-in.
--
--   owner@northfound.ug           -> NORTH//FOUND
--   owner@mirembetailoring.co.ug  -> Mirembe Tailoring House
--   password: polyster-dev
--
-- Matched by email rather than `order by created_at`, which silently bound the
-- fixtures to whichever two accounts happened to be oldest -- on any project
-- with existing users that is the wrong pair, and the symptom is a successful
-- sign-in to an empty shop.
--
-- Run only against a development/staging project.
begin;

do $$
declare
  north_auth uuid;
  tailor_auth uuid;
begin
  select id into north_auth from auth.users where lower(email) = 'owner@northfound.ug';
  select id into tailor_auth from auth.users where lower(email) = 'owner@mirembetailoring.co.ug';

  if north_auth is null or tailor_auth is null then
    raise exception
      'Seed accounts missing. Run `pnpm seed:auth` first (needs SUPABASE_SERVICE_ROLE_KEY in .env), then re-run this seed.';
  end if;

  -- Clean only the two fixture tenants if they already exist.
  delete from shops
  where name in ('NORTH//FOUND', 'Mirembe Tailoring House');

  -- Tenants
  insert into shops (
    id, name, whatsapp_number, supabase_auth_user_id, currency, country,
    address, lock_after_minutes, business_type, timezone, email, website
  ) values
    (
      '10000000-0000-4000-8000-000000000001',
      'NORTH//FOUND',
      '+256700000001',
      north_auth,
      'UGX',
      'UG',
      'Kampala, Uganda',
      5,
      'apparel_brand',
      'Africa/Kampala',
      'hello@northfound.ug',
      'https://northfound.ug'
    ),
    (
      '10000000-0000-4000-8000-000000000002',
      'Mirembe Tailoring House',
      '+256700000002',
      tailor_auth,
      'UGX',
      'UG',
      'Kampala, Uganda',
      5,
      'tailor',
      'Africa/Kampala',
      'hello@mirembetailoring.co.ug',
      'https://mirembetailoring.co.ug'
    );

  -- Staff. Every PIN is 123456, hashed with lib/pin.ts's own hashPin at the
  -- current DEFAULT_ITERATIONS so the PIN gate can be exercised against seeded
  -- data. Distinct salts, so the hashes differ.
  insert into staff (id, shop_id, name, role, active, pin_hash) values
    ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Amani Okello','owner',true,
      'pbkdf2$sha256$210000$EtTlgjH1pjERBgedXgyo3w==$lLsfBiirjOVxRLt20y4dVvqj8DqPAiR3Mv14Rzix2nw='),
    ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Nadia Kato','manager',true,
      'pbkdf2$sha256$210000$z4No4EpOU0nEfoKF1jmjRg==$CCWEnFk/u7R7xpUQTZ3wvuiIWCC7YRkh4K3vbNkkz1Y='),
    ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Joel Mugisha','staff',true,
      'pbkdf2$sha256$210000$W7ag3NGjXvy8EtYVBuWS7g==$xc/hSRXQR2m2/sUImwpCXQR+URqxWijKSoqMJy2yNgc='),
    ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Miriam Ssemanda','owner',true,
      'pbkdf2$sha256$210000$y9q/URNQe0Rr+J6ujW+bWQ==$/5X6tPTtTkJhXCxIN4HI6KX1NtB14PP5lCWOfCjnuvo='),
    ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','Patrick Walusimbi','staff',true,
      'pbkdf2$sha256$210000$4O/viFycCcH9p1FZ4ScvfQ==$G9ro8285vaFSbsHzBBIL75UKHBk7twBj5Hqrv9WLMPM=');

  -- Explicit feature matrix. Keys omitted by the app fall back to defaults;
  -- writing them all makes this seed useful for feature-toggle tests.
  insert into tenant_features (shop_id, feature_key, enabled)
  select '10000000-0000-4000-8000-000000000001', k, v
  from (values
    ('customers',true),('measurements',true),('orders',true),('payments',true),
    ('expenses',true),('sales',true),('rentals',true),('catalogue',true),
    ('inventory',true),('suppliers',true),('production',true),('pre_orders',true),
    ('corporate_orders',true),('collections',true),('repairs',true),
    ('garment_identity',true),('garment_passport',true)
  ) x(k,v);

  insert into tenant_features (shop_id, feature_key, enabled)
  select '10000000-0000-4000-8000-000000000002', k, v
  from (values
    ('customers',true),('measurements',true),('orders',true),('payments',true),
    ('expenses',true),('sales',true),('rentals',false),('catalogue',false),
    ('inventory',false),('suppliers',false),('production',false),('pre_orders',false),
    ('corporate_orders',false),('collections',false),('repairs',true),
    ('garment_identity',false),('garment_passport',false)
  ) x(k,v);


  -- ---------------- offline-capable core data on both tenants ----------------
  insert into measurement_fields (id,shop_id,label,unit,display_order,field_type,group_label,active) values
    ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Chest','cm',0,'number','Upper body',true),
    ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Waist','cm',1,'number','Torso',true),
    ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Hip','cm',2,'number','Lower body',true),
    ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','Chest','cm',0,'number','Upper body',true),
    ('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','Waist','cm',1,'number','Torso',true);

  insert into clients (id,shop_id,name,phone,notes,created_by) values
    ('41000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Maya Namusoke','+256701240118','Prefers clean, slightly relaxed silhouettes.','20000000-0000-4000-8000-000000000001'),
    ('41000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Daniel Ouma','+256772410229','Corporate client.','20000000-0000-4000-8000-000000000002'),
    ('41000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Sarah Atwine','+256755381440','Prefers neutral colours.','20000000-0000-4000-8000-000000000001'),
    ('41000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','Grace Achieng','+256704665391','Pre-order customer.','20000000-0000-4000-8000-000000000001'),
    ('41000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','John Kato','+256701111222','Prefers two-button jackets.','20000000-0000-4000-8000-000000000004'),
    ('41000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000002','Anita Nakato','+256772333444','Formal office wear.','20000000-0000-4000-8000-000000000004');

  insert into measurement_profiles (id,client_id,values,updated_by) values
    ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
      jsonb_build_object('40000000-0000-4000-8000-000000000001',88,'40000000-0000-4000-8000-000000000002',72,'40000000-0000-4000-8000-000000000003',94),
      '20000000-0000-4000-8000-000000000001'),
    ('42000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000005',
      jsonb_build_object('40000000-0000-4000-8000-000000000004',98,'40000000-0000-4000-8000-000000000005',84),
      '20000000-0000-4000-8000-000000000004');

  insert into product_categories (id,shop_id,name) values
    ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Tops'),
    ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Outerwear'),
    ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','Accessories');

  insert into collections (
    id,shop_id,name,code,description,status,release_date,coordinate_label,
    story,tagline,production_limit
  ) values
    (
      '31000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'FOUND 02','FOUND-02',
      'Second NORTH//FOUND release.',
      'active','2026-08-13','08.13° N',
      'A small-batch collection built around movement, place and persistence.',
      'KEEP GOING.',
      50
    ),
    (
      '31000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      'FOUND 01','FOUND-01',
      'First release archive.',
      'archived','2026-06-01','00.31° N',
      'The beginning of the archive.',
      'FOUND.',
      30
    );

  insert into products (
    id,shop_id,category_id,name,description,brand,product_type,active,collection_id
  ) values
    (
      '32000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'FOUND 02 Overshirt','Structured everyday overshirt.','NORTH//FOUND','garment',true,
      '31000000-0000-4000-8000-000000000001'
    ),
    (
      '32000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'FOUND 02 Tee','Heavyweight cotton tee.','NORTH//FOUND','garment',true,
      '31000000-0000-4000-8000-000000000001'
    ),
    (
      '32000000-0000-4000-8000-000000000003',
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003',
      'FOUND 01 Cap','Embroidered cap.','NORTH//FOUND','accessory',true,
      '31000000-0000-4000-8000-000000000002'
    );

  insert into product_variants (
    id,shop_id,product_id,sku,size,colour,price_minor,cost_minor,active
  ) values
    ('33000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','NF-F02-OS-BLK-M','M','Black',285000,125000,true),
    ('33000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000001','NF-F02-OS-BLK-L','L','Black',285000,125000,true),
    ('33000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002','NF-F02-TEE-BLK-M','M','Black',180000,70000,true),
    ('33000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002','NF-F02-TEE-BLK-L','L','Black',180000,70000,true),
    ('33000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000003','NF-F01-CAP-OS','OS','Black',85000,30000,true);

  -- ---------------- suppliers/materials ----------------
  insert into suppliers (id,shop_id,name,phone,email,address,active) values
    ('34000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Kampala Textiles','+256700100100','sales@kampalatextiles.co.ug','Kampala',true),
    ('34000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','Label & Trim Co.','+256700100200','hello@labeltrim.co.ug','Kampala',true);

  insert into materials (
    id,shop_id,supplier_id,name,description,material_type,unit,quantity_on_hand,
    reorder_level,unit_cost_minor,currency,composition,gsm,width,colour,pattern,
    supplier_reference,active
  ) values
    ('35000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000001',
     'Black heavyweight cotton','Main fabric for FOUND 02.','fabric','metre',42,10,12000,'UGX','100% cotton',320,'150cm','Black','Plain','KT-BLK-320',true),
    ('35000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000002',
     'Woven NORTH//FOUND label','Main neck label.','label','piece',180,50,800,'UGX',null,null,null,'Black','Woven','LBL-NF-01',true),
    ('35000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000002',
     'Black packaging bag','Garment packaging.','packaging','piece',120,30,1200,'UGX',null,null,null,'Black','Plain','PKG-BLK-01',true);

  -- ---------------- production ----------------
  insert into production_batches (
    id,shop_id,product_id,batch_number,planned_quantity,produced_quantity,
    accepted_quantity,rejected_quantity,status,started_at,completed_at,
    notes,rejected_reason,created_by
  ) values
    (
      '36000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000001',
      'F002-B01',20,20,19,1,'completed',
      '2026-08-05T08:00:00+03','2026-08-09T17:30:00+03',
      'First overshirt batch.','One unit had stitching defects.',
      '20000000-0000-4000-8000-000000000002'
    ),
    (
      '36000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '32000000-0000-4000-8000-000000000002',
      'F002-B02',50,28,27,1,'in_production',
      '2026-08-10T08:30:00+03',null,
      'FOUND 02 tee run.','One rejected print.',
      '20000000-0000-4000-8000-000000000002'
    );

  insert into production_batch_costs (shop_id,batch_id,cost_type,description,amount_minor,currency) values
    ('10000000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000001','materials','Cotton fabric',240000,'UGX'),
    ('10000000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000001','labour','Cutting and sewing',310000,'UGX'),
    ('10000000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000001','labels','Woven labels',15200,'UGX'),
    ('10000000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000002','materials','Cotton fabric',420000,'UGX'),
    ('10000000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000002','labour','Printing and sewing',360000,'UGX');

  -- Inventory item rows first; movements drive quantities.
  insert into inventory_items (id,shop_id,item_type,product_variant_id,quantity,unit) values
    ('37000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','product_variant','33000000-0000-4000-8000-000000000001',0,'piece'),
    ('37000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','product_variant','33000000-0000-4000-8000-000000000003',0,'piece');

  insert into inventory_items (id,shop_id,item_type,material_id,quantity,unit) values
    ('37000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','material','35000000-0000-4000-8000-000000000001',0,'metre');

  insert into inventory_movements (
    shop_id,inventory_item_id,movement_type,quantity,reference_type,reference_id,reason,notes,created_by
  ) values
    ('10000000-0000-4000-8000-000000000001','37000000-0000-4000-8000-000000000001','production',19,'production_batch','36000000-0000-4000-8000-000000000001',null,'Accepted overshirts from F002-B01','20000000-0000-4000-8000-000000000002'),
    ('10000000-0000-4000-8000-000000000001','37000000-0000-4000-8000-000000000002','production',27,'production_batch','36000000-0000-4000-8000-000000000002',null,'Accepted tees currently produced','20000000-0000-4000-8000-000000000002'),
    ('10000000-0000-4000-8000-000000000001','37000000-0000-4000-8000-000000000001','sale',-2,'sale',null,null,'Two overshirts sold','20000000-0000-4000-8000-000000000001'),
    ('10000000-0000-4000-8000-000000000001','37000000-0000-4000-8000-000000000001','adjustment',1,null,null,'Stock count correction','Found one additional completed unit','20000000-0000-4000-8000-000000000001');

  -- Individual garment identity
  insert into garment_units (
    id,shop_id,product_variant_id,production_batch_id,serial_number,status,customer_id
  ) values
    ('38000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000001','F002-B01-001','sold',null),
    ('38000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000001','F002-B01-002','available',null),
    ('38000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000001','36000000-0000-4000-8000-000000000001','F002-B01-003','repair','41000000-0000-4000-8000-000000000001'),
    ('38000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000003','36000000-0000-4000-8000-000000000002','F002-B02-001','available',null);

  insert into orders (
    id,shop_id,client_id,order_type,reference,currency,summary,stage,
    price_adjustment_minor,rental_deposit_minor,pickup_due_date,return_due_date,
    customer_type,organisation_name,purchase_order_reference,contact_person,
    expected_fulfilment_date,product_variant_id,collection_id,production_batch_id,
    garment_unit_id,picked_up_at,returned_at,deposit_refunded_at,created_by
  ) values
    (
      '43000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
      'tailor_made','1208-NF001','UGX','FOUND 02 Overshirt','ready',
      0,0,'2026-08-15',null,'individual',null,null,null,null,
      '33000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001',null,null,
      null,null,null,
      '20000000-0000-4000-8000-000000000001'
    ),
    (
      '43000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000002',
      'pre_order','1208-NF002','UGX','FOUND 02 Tee','measured',
      0,0,'2026-08-29',null,'corporate','Kintu & Co.','KCO-2026-081','Daniel Ouma','2026-08-29',
      '33000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000001',null,null,
      null,null,null,
      '20000000-0000-4000-8000-000000000002'
    ),
    (
      '43000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000005',
      'tailor_made','1208-MTH01','UGX','Navy two-piece suit','in_progress',
      0,0,'2026-08-18',null,'individual',null,null,null,null,null,null,null,null,
      null,null,null,
      '20000000-0000-4000-8000-000000000004'
    ),
    -- Rental, taken out and returned: deposit charged on collection and
    -- refunded on return, so the refund path has data behind it.
    (
      '43000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000003',
      'rental','1208-NF003','UGX','Black formal blazer','returned',
      0,250000,'2026-08-08','2026-08-10','individual',null,null,null,null,
      null,null,null,'38000000-0000-4000-8000-000000000002',
      '2026-08-08T10:00:00+03','2026-08-10T17:00:00+03','2026-08-10T17:30:00+03',
      '20000000-0000-4000-8000-000000000003'
    ),
    -- Repair, mid-flight on the assessing/approved/repairing stages, against
    -- the garment unit already sitting in 'repair' status.
    (
      '43000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
      'repair','1208-NF004','UGX','Replace blazer sleeve lining','repairing',
      0,0,'2026-08-16',null,'individual',null,null,null,null,
      null,null,null,'38000000-0000-4000-8000-000000000003',
      null,null,null,
      '20000000-0000-4000-8000-000000000001'
    ),
    (
      '43000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000004',
      'purchase','1208-NF005','UGX','FOUND 01 Cap','picked_up',
      0,0,'2026-08-12',null,'individual',null,null,null,null,
      '33000000-0000-4000-8000-000000000005',null,null,null,
      '2026-08-12T12:00:00+03',null,null,
      '20000000-0000-4000-8000-000000000003'
    ),
    (
      '43000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000006',
      'repair','1208-MTH02','UGX','Trouser hem adjustment','approved',
      0,0,'2026-08-14',null,'individual',null,null,null,null,null,null,null,null,
      null,null,null,
      '20000000-0000-4000-8000-000000000005'
    );

  insert into order_units (
    id,order_id,position,wearer_name,item_description,price_minor,measurements,fabric_source,done,notes
  ) values
    ('44000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001',0,'Maya Namusoke','FOUND 02 Overshirt',285000,
      '{}'::jsonb,'shop',true,'Relaxed fit.'),
    ('44000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000002',0,'Daniel Ouma','FOUND 02 Tee',180000,
      '{}'::jsonb,'shop',false,'Pre-order.'),
    ('44000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000003',0,'John Kato','Navy two-piece suit',850000,
      '{}'::jsonb,'shop',false,'Made to measure.'),
    ('44000000-0000-4000-8000-000000000004','43000000-0000-4000-8000-000000000004',0,'Sarah Atwine','Black formal blazer',120000,
      '{}'::jsonb,'shop',true,'Two-day rental.'),
    ('44000000-0000-4000-8000-000000000005','43000000-0000-4000-8000-000000000005',0,'Maya Namusoke','Blazer sleeve lining replacement',65000,
      '{}'::jsonb,'client',false,'Customer supplied the garment.'),
    ('44000000-0000-4000-8000-000000000006','43000000-0000-4000-8000-000000000006',0,'Grace Achieng','FOUND 01 Cap',85000,
      '{}'::jsonb,'shop',true,'Off the shelf.'),
    ('44000000-0000-4000-8000-000000000007','43000000-0000-4000-8000-000000000007',0,'Anita Nakato','Trouser hem adjustment',35000,
      '{}'::jsonb,'client',false,'Take up 4cm.');

  update orders set price_total_minor = 285000 where id='43000000-0000-4000-8000-000000000001';
  update orders set price_total_minor = 180000 where id='43000000-0000-4000-8000-000000000002';
  update orders set price_total_minor = 850000 where id='43000000-0000-4000-8000-000000000003';

  insert into payments (id,order_id,amount_minor,kind,payment_date,method,reference,recorded_by,notes) values
    ('45000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001',100000,'payment','2026-08-10T10:00:00+03','mobile_money','MPESA-NF-001','20000000-0000-4000-8000-000000000001','Deposit'),
    ('45000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000001',185000,'payment','2026-08-11T16:00:00+03','cash',null,'20000000-0000-4000-8000-000000000001','Balance'),
    ('45000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000002',90000,'payment','2026-08-11T11:00:00+03','mobile_money','MPESA-NF-002','20000000-0000-4000-8000-000000000002','Pre-order deposit'),
    ('45000000-0000-4000-8000-000000000004','43000000-0000-4000-8000-000000000003',425000,'payment','2026-08-09T09:00:00+03','cash',null,'20000000-0000-4000-8000-000000000004','Half deposit'),
    ('45000000-0000-4000-8000-000000000005','43000000-0000-4000-8000-000000000004',120000,'payment','2026-08-08T10:00:00+03','mobile_money','MPESA-NF-003','20000000-0000-4000-8000-000000000003','Rental fee'),
    ('45000000-0000-4000-8000-000000000006','43000000-0000-4000-8000-000000000004',250000,'payment','2026-08-08T10:05:00+03','cash',null,'20000000-0000-4000-8000-000000000003','Refundable deposit'),
    ('45000000-0000-4000-8000-000000000007','43000000-0000-4000-8000-000000000004',250000,'refund','2026-08-10T17:30:00+03','cash',null,'20000000-0000-4000-8000-000000000003','Deposit returned, garment undamaged'),
    ('45000000-0000-4000-8000-000000000008','43000000-0000-4000-8000-000000000005',30000,'payment','2026-08-11T15:00:00+03','mobile_money','MPESA-NF-004','20000000-0000-4000-8000-000000000001','Repair deposit'),
    ('45000000-0000-4000-8000-000000000009','43000000-0000-4000-8000-000000000006',85000,'payment','2026-08-12T12:00:00+03','cash',null,'20000000-0000-4000-8000-000000000003','Paid in full'),
    ('45000000-0000-4000-8000-000000000010','43000000-0000-4000-8000-000000000007',15000,'payment','2026-08-12T09:30:00+03','cash',null,'20000000-0000-4000-8000-000000000005','Deposit on approval');

  insert into order_stage_history (id,order_id,from_stage,to_stage,note,changed_by,changed_at) values
    ('46000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001',null,'measured','Order created','20000000-0000-4000-8000-000000000001','2026-08-08T09:00:00+03'),
    ('46000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000001','measured','in_progress',null,'20000000-0000-4000-8000-000000000003','2026-08-09T10:00:00+03'),
    ('46000000-0000-4000-8000-000000000003','43000000-0000-4000-8000-000000000001','in_progress','ready','Ready for pickup','20000000-0000-4000-8000-000000000003','2026-08-11T15:00:00+03'),
    ('46000000-0000-4000-8000-000000000004','43000000-0000-4000-8000-000000000002',null,'measured','Pre-order received','20000000-0000-4000-8000-000000000002','2026-08-11T11:00:00+03'),
    ('46000000-0000-4000-8000-000000000005','43000000-0000-4000-8000-000000000003',null,'measured','Order created','20000000-0000-4000-8000-000000000004','2026-08-09T09:00:00+03'),
    ('46000000-0000-4000-8000-000000000006','43000000-0000-4000-8000-000000000003','measured','in_progress',null,'20000000-0000-4000-8000-000000000005','2026-08-10T13:00:00+03'),
    ('46000000-0000-4000-8000-000000000007','43000000-0000-4000-8000-000000000004',null,'measured','Rental booked','20000000-0000-4000-8000-000000000003','2026-08-07T14:00:00+03'),
    ('46000000-0000-4000-8000-000000000008','43000000-0000-4000-8000-000000000004','measured','ready',null,'20000000-0000-4000-8000-000000000003','2026-08-08T09:00:00+03'),
    ('46000000-0000-4000-8000-000000000009','43000000-0000-4000-8000-000000000004','ready','picked_up','Deposit taken','20000000-0000-4000-8000-000000000003','2026-08-08T10:00:00+03'),
    ('46000000-0000-4000-8000-000000000010','43000000-0000-4000-8000-000000000004','picked_up','returned','Returned undamaged, deposit refunded','20000000-0000-4000-8000-000000000003','2026-08-10T17:30:00+03'),
    ('46000000-0000-4000-8000-000000000011','43000000-0000-4000-8000-000000000005',null,'assessing','Garment received for assessment','20000000-0000-4000-8000-000000000001','2026-08-11T14:00:00+03'),
    ('46000000-0000-4000-8000-000000000012','43000000-0000-4000-8000-000000000005','assessing','approved','Quote accepted','20000000-0000-4000-8000-000000000001','2026-08-11T15:00:00+03'),
    ('46000000-0000-4000-8000-000000000013','43000000-0000-4000-8000-000000000005','approved','repairing',null,'20000000-0000-4000-8000-000000000003','2026-08-12T08:30:00+03'),
    ('46000000-0000-4000-8000-000000000014','43000000-0000-4000-8000-000000000006',null,'ready','Off-the-shelf purchase','20000000-0000-4000-8000-000000000003','2026-08-12T11:55:00+03'),
    ('46000000-0000-4000-8000-000000000015','43000000-0000-4000-8000-000000000006','ready','picked_up',null,'20000000-0000-4000-8000-000000000003','2026-08-12T12:00:00+03'),
    ('46000000-0000-4000-8000-000000000016','43000000-0000-4000-8000-000000000007',null,'assessing','Trousers received','20000000-0000-4000-8000-000000000005','2026-08-11T16:00:00+03'),
    ('46000000-0000-4000-8000-000000000017','43000000-0000-4000-8000-000000000007','assessing','approved','Quote accepted','20000000-0000-4000-8000-000000000005','2026-08-12T09:30:00+03');

  insert into sales (
    id,shop_id,client_id,item_description,quantity,currency,unit_price_minor,method,reference,sold_at,recorded_by,notes
  ) values
    ('47000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000003','FOUND 01 Cap',2,'UGX',85000,'mobile_money','SALE-NF-001','2026-08-11T14:00:00+03','20000000-0000-4000-8000-000000000003',null),
    ('47000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',null,'Pocket square',3,'UGX',25000,'cash',null,'2026-08-10T16:00:00+03','20000000-0000-4000-8000-000000000004',null),
    ('47000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',null,'FOUND 02 Tee',1,'UGX',180000,'cash',null,'2026-08-02T11:20:00+03','20000000-0000-4000-8000-000000000003',null),
    ('47000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','FOUND 01 Cap',1,'UGX',85000,'mobile_money','SALE-NF-002','2026-08-03T15:40:00+03','20000000-0000-4000-8000-000000000002',null),
    ('47000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001',null,'FOUND 02 Overshirt',1,'UGX',285000,'bank','SALE-NF-003','2026-08-05T10:05:00+03','20000000-0000-4000-8000-000000000001',null),
    ('47000000-0000-4000-8000-000000000006','10000000-0000-4000-8000-000000000001',null,'Tote bag',4,'UGX',35000,'cash',null,'2026-08-06T13:10:00+03','20000000-0000-4000-8000-000000000003',null),
    ('47000000-0000-4000-8000-000000000007','10000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000004','FOUND 01 Cap',3,'UGX',85000,'mobile_money','SALE-NF-004','2026-08-07T09:50:00+03','20000000-0000-4000-8000-000000000003',null),
    ('47000000-0000-4000-8000-000000000008','10000000-0000-4000-8000-000000000001',null,'FOUND 02 Tee',2,'UGX',180000,'cash',null,'2026-08-09T17:25:00+03','20000000-0000-4000-8000-000000000002',null),
    -- Zero-price giveaway: the P&L must count it as a sale worth nothing
    -- rather than skipping the row.
    ('47000000-0000-4000-8000-000000000009','10000000-0000-4000-8000-000000000001',null,'Sample tote bag',1,'UGX',0,'cash',null,'2026-08-10T12:00:00+03','20000000-0000-4000-8000-000000000001','Promotional giveaway.'),
    -- Two rows in the previous month, so period comparison has a baseline.
    ('47000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000001',null,'FOUND 02 Overshirt',1,'UGX',285000,'mobile_money','SALE-NF-005','2026-07-28T14:15:00+03','20000000-0000-4000-8000-000000000001',null),
    ('47000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000006','Pocket square',2,'UGX',25000,'cash',null,'2026-08-04T10:30:00+03','20000000-0000-4000-8000-000000000005',null),
    ('47000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000002',null,'Shirt alteration',1,'UGX',45000,'cash',null,'2026-08-06T16:45:00+03','20000000-0000-4000-8000-000000000004',null),
    ('47000000-0000-4000-8000-000000000013','10000000-0000-4000-8000-000000000002',null,'Pocket square',5,'UGX',25000,'mobile_money','SALE-MTH-001','2026-08-08T11:00:00+03','20000000-0000-4000-8000-000000000005',null),
    ('47000000-0000-4000-8000-000000000014','10000000-0000-4000-8000-000000000002',null,'Kitenge shirt',1,'UGX',120000,'cash',null,'2026-07-30T15:00:00+03','20000000-0000-4000-8000-000000000004',null);

  insert into expenses (
    id,shop_id,category,description,currency,amount_minor,spent_on,recorded_by,notes
  ) values
    ('48000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','materials','Black cotton fabric','UGX',420000,'2026-08-08','20000000-0000-4000-8000-000000000002','FOUND 02'),
    ('48000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','transport','Fabric delivery','UGX',45000,'2026-08-09','20000000-0000-4000-8000-000000000003',null),
    ('48000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','rent','Workshop rent','UGX',600000,'2026-08-01','20000000-0000-4000-8000-000000000004',null);

  insert into message_log (id,client_id,order_id,channel,template,order_stage,sent_at,sent_by) values
    ('49000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001','43000000-0000-4000-8000-000000000001','whatsapp','stage_update','ready','2026-08-11T15:05:00+03','20000000-0000-4000-8000-000000000001'),
    ('49000000-0000-4000-8000-000000000002','41000000-0000-4000-8000-000000000002','43000000-0000-4000-8000-000000000002','whatsapp','balance_reminder','measured','2026-08-11T12:00:00+03','20000000-0000-4000-8000-000000000002');

  -- ---------------- NORTH//FOUND catalogue ----------------
  -- ---------------- Generic-tailor online rows ----------------
  insert into product_categories (id,shop_id,name) values
    ('39000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Formal Wear'),
    ('39000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Accessories');

  insert into products (id,shop_id,category_id,name,description,brand,product_type,active) values
    ('3a000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','39000000-0000-4000-8000-000000000001','Navy Two-Piece Suit','Made-to-measure suit.','Mirembe Tailoring House','custom',true),
    ('3a000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','39000000-0000-4000-8000-000000000002','Pocket Square','Ready-made accessory.','Mirembe Tailoring House','accessory',true);

  insert into product_variants (id,shop_id,product_id,sku,size,colour,price_minor,cost_minor,active) values
    ('3b000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','3a000000-0000-4000-8000-000000000001','MTH-SUIT-NAVY-CUSTOM',null,'Navy',850000,420000,true),
    ('3b000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','3a000000-0000-4000-8000-000000000002','MTH-ACC-PS-01','OS','White',25000,8000,true);

  insert into suppliers (id,shop_id,name,phone,active) values
    ('3c000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','Kampala Suiting Depot','+256700200100',true);

  insert into materials (
    id,shop_id,supplier_id,name,material_type,unit,quantity_on_hand,reorder_level,
    unit_cost_minor,currency,composition,colour,active
  ) values
    ('3d000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','3c000000-0000-4000-8000-000000000001',
     'Navy suiting fabric','fabric','metre',18,5,18000,'UGX','Wool blend','Navy',true);
  -- Legacy/feature-disabled cases are kept in the local edge-case fixture.

end $$;

commit;
