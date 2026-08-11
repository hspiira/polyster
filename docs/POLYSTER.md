# POLYSTER
## Multi-Tenant Tailoring & Apparel Business Operating System
### Implementation Specification

**Version:** 1.0  
**Date:** 11 August 2026  
**Implementation target:** Existing `hspiira/polyster` repository  
**Primary tenant for advanced validation:** NORTH//FOUND  
**Architecture:** Multi-tenant, offline-first PWA

**Status key used throughout this document:** ✅ Done · 🔄 In progress · ⬜ Not started · ⛔ Blocked (external input needed)
A status line appears under each Phase heading (§71–§83) and is updated as work actually lands — never marked ✅ ahead of verification.

---

# 1. Executive Decision

Polyster shall be developed as a **generic multi-tenant tailoring and apparel business operating system**.

It must support:

1. Traditional tailoring businesses
2. Clothing/rental businesses
3. Small apparel manufacturers
4. Fashion brands
5. Corporate clothing suppliers
6. NORTH//FOUND as an advanced tenant

NORTH//FOUND is **not a separate application**.

It is a tenant whose feature configuration enables additional modules.

The implementation must never contain logic such as:

```ts
if (shop.name === "NORTH//FOUND")
```

or:

```ts
if (tenant === "northfound")
```

NORTH//FOUND capabilities must be represented through:

- tenant feature configuration
- generic data models
- optional modules
- tenant branding/settings
- configurable workflows

---

# 2. Product Positioning

Polyster should evolve from:

> Tailor & Rental Tracker

into:

> **Tailoring & Apparel Business Operating System**

The core problem Polyster solves is managing the operational lifecycle of clothing businesses:

```text
Customer
   ↓
Measurement
   ↓
Order
   ↓
Production / Rental / Sale
   ↓
Payment
   ↓
Fulfilment
   ↓
Customer history
```

For apparel businesses, the lifecycle expands:

```text
Supplier
   ↓
Material
   ↓
Product
   ↓
Production Batch
   ↓
Inventory
   ↓
Order
   ↓
Customer
```

For NORTH//FOUND:

```text
Collection
   ↓
Product
   ↓
Production Batch
   ↓
Individual Garment
   ↓
Customer
   ↓
Garment Passport
   ↓
Repair / Lifecycle
```

---

# 3. Existing Architecture — Preserve

The current architecture is:

```text
Preact + Vite
       ↓
     RxDB
       ↓
 IndexedDB/Dexie
       ↓
Supabase replication
       ↓
Postgres + RLS
```

The application is explicitly local-first. UI reads and writes should continue to use RxDB rather than directly calling Supabase. Supabase is the synchronization backend, not the UI's synchronous data source.

Preserve:

- Preact
- Vite
- Tailwind
- RxDB
- Dexie
- Supabase
- Postgres
- Supabase Auth
- Supabase Realtime
- Cloudflare Pages
- existing write abstraction
- existing replication architecture
- existing money representation in integer minor units
- existing soft-delete/sync model

Do not introduce a custom backend unless a future requirement genuinely cannot be implemented safely with the current architecture.

---

# 4. Current-State Audit

The current schema already contains:

```text
shops
staff
clients
measurement_fields
measurement_profiles

orders
order_units
payments
order_stage_history

message_logs
sales
expenses
```

The current order model supports:

```text
tailor_made
rental
purchase
```

and stages:

```text
measured
in_progress
ready
picked_up
returned
cancelled
```

The current payment model supports:

```text
cash
mobile_money
bank
other
```

and:

```text
payment
refund
```

The current system also supports:

- partial payments
- payment voiding
- rental deposits
- refunds
- order adjustments
- stage history
- configurable measurement fields
- expenses
- walk-in sales

These should remain part of the core product.

---

# 5. Current-State Issues to Address

## 5.1 Tenant isolation has not been fully verified

This is the highest-priority issue.

The architecture correctly uses `shop_id` and Postgres RLS, but the repository documentation explicitly states that tenant isolation has not yet been verified against Supabase.

Before major feature development:

### Required tests

Create at least two tenants:

```text
Tenant A
Tenant B
```

Tenant A must never be able to:

- read Tenant B clients
- read Tenant B orders
- read Tenant B payments
- read Tenant B expenses
- modify Tenant B records
- delete Tenant B records
- access Tenant B balances
- access Tenant B inventory
- access Tenant B catalogue
- access Tenant B production
- access Tenant B settings

This must be tested at the **database/RLS level**, not merely in the UI.

---

# 6. Tenant Architecture

The existing `shops` table remains the tenant.

Conceptually:

```text
Shop
 ├── Staff
 ├── Clients
 ├── Orders
 ├── Products
 ├── Inventory
 ├── Production
 ├── Finance
 └── Settings
```

Every business record must have a clear tenant boundary.

Preferred pattern:

```text
shop_id UUID NOT NULL
```

directly on tenant-owned tables.

Do not depend unnecessarily on indirect joins to determine tenant ownership.

---

# 7. Tenant Settings

Add:

```text
shop_settings
```

Suggested fields:

```text
id
shop_id
business_type
display_name
logo_url
currency
country
timezone
address
phone
email
website
created_at
updated_at
```

`shops` remains the tenant identity.

`shop_settings` contains configurable presentation/business behaviour.

---

# 8. Business Type

Create a configurable business type.

Initial values:

```text
tailor
rental
apparel_brand
corporate_supplier
hybrid
```

Do not use business type as a hard permission boundary.

A tailor may still sell products.

An apparel brand may still accept custom orders.

Business type should influence defaults, navigation, onboarding and recommendations, not prevent valid operations.

---

# 9. Feature Flags / Modules

Create tenant-level feature configuration.

Recommended model:

```text
tenant_features
```

Fields:

```text
id
shop_id
feature_key
enabled
created_at
updated_at
```

Initial feature keys:

```text
customers
measurements
orders
payments
expenses
sales
rentals
catalogue
inventory
suppliers
production
pre_orders
corporate_orders
collections
repairs
garment_identity
garment_passport
```

Example ordinary tailor:

```text
customers        true
measurements     true
orders           true
payments         true
expenses         true
sales            true
rentals          false
catalogue        false
inventory        false
suppliers        false
production       false
pre_orders       false
corporate_orders false
collections      false
repairs          true
garment_identity false
garment_passport false
```

Example NORTH//FOUND:

```text
customers         true
measurements      true
orders            true
payments          true
expenses          true
sales             true
rentals           false
catalogue         true
inventory         true
suppliers         true
production        true
pre_orders        true
corporate_orders  true
collections       true
repairs           true
garment_identity  true
garment_passport  true
```

---

## 9.1 Feature Flag Runtime Behaviour

Feature flags are configuration, not destructive operations.

When a tenant feature is disabled:

1. Do not delete or modify existing feature data.
2. Remove the feature from normal navigation and UI entry points.
3. Prevent creation of new records belonging to the disabled feature.
4. Prevent mutations to feature-specific records where appropriate.
5. Preserve historical records and reporting data.
6. Direct navigation to disabled functionality must be handled gracefully.
7. Existing cached/local data must not be deleted solely because the feature was disabled.
8. The server/database must remain authoritative for feature state.

### Offline behaviour

Because Polyster is offline-first, feature configuration may be temporarily stale on a disconnected device.

If a feature is enabled locally but disabled remotely:

```text
Device offline
      ↓
Local feature state = enabled
      ↓
User performs operation
      ↓
Operation stored locally / queued for sync
      ↓
Device reconnects
      ↓
Server validates current tenant feature state
      ↓
Feature disabled
      ↓
Mutation rejected
      ↓
Client records a sync failure
```

The client must not silently discard the operation.

The user should receive a clear explanation that the feature has been disabled and that the pending operation could not be synchronized.

### Re-enabling

If the feature is later enabled:

```text
feature = OFF
        ↓
feature = ON
```

the existing data must become available again according to the user's permissions.

Feature toggling must therefore be reversible and non-destructive.

### Feature state changes

The system should distinguish:

```text
enabled
disabled
```

from:

```text
data deleted
```

Disabling a feature is a configuration change, not a data lifecycle operation.

### UI vs security

Hiding a feature from navigation is not a security mechanism.

Feature-specific writes must be validated by the appropriate server/database layer.

User permissions must be evaluated separately from tenant feature availability.

For example:

```text
Tenant feature:
production = ON

User A:
production.create = ALLOW

User B:
production.create = DENY
```

A user cannot gain access merely because the tenant has enabled the feature.

Conversely, a user cannot use a feature that the tenant has disabled even if their individual permission would otherwise allow it.

---

## 9.2 Feature Lifecycle, Versioning and Rollback

Feature flags control feature availability. They do not control data existence.

Disabling a feature must never delete, archive, migrate, or otherwise invalidate existing tenant data.

### Feature states

For operational purposes, a tenant feature has two states:

```text
ENABLED
DISABLED
```

#### ENABLED

The tenant may use the feature subject to user permissions.

```text
Create     ✓
Read       ✓
Update     ✓
Delete     ✓
Reports    ✓
```

#### DISABLED

The feature is unavailable for new operational activity.

```text
Create     ✗
Read       ✓
Update     ✗
Delete     ✗
Reports    ✓
```

Existing records should remain accessible as historical/read-only data where appropriate.

The UI should clearly indicate that the feature is currently disabled rather than making existing data appear to have been deleted.

### Re-enabling

Feature disabling is reversible.

When a feature is re-enabled:

```text
DISABLED
   ↓
ENABLED
```

existing data becomes operational again subject to current user permissions and business rules.

No data migration should be required solely because a feature was temporarily disabled.

### Feature configuration version

Tenant feature configuration must have a version that changes whenever feature configuration changes.

Example:

```text
tenant_config_version = 41
```

After changing a feature:

```text
tenant_config_version = 42
```

Devices must be able to detect that their locally cached feature configuration is stale.

This is particularly important for offline devices.

### Feature change audit

Feature state changes must be auditable.

Record at minimum:

```text
shop_id
feature_key
previous_state
new_state
changed_by
changed_at
reason
```

The current state belongs in `tenant_features`.

Historical state changes belong in a feature/configuration audit table.

Do not implement full event sourcing solely for feature configuration.

### Offline feature state

Polyster is offline-first, so a disconnected device may temporarily have stale feature configuration.

Example:

```text
Server:
production = DISABLED

Device:
production = ENABLED
```

If the device is offline, it may temporarily allow a local operation based on its cached configuration.

When the operation synchronizes, the server must validate the current tenant feature state.

If the feature is disabled:

```text
local operation
      ↓
sync attempted
      ↓
server rejects mutation
      ↓
operation marked as rejected
      ↓
user receives clear explanation
```

The operation must not be silently discarded.

The implementation should reuse the existing mutation/sync error handling.

### Direct access

Disabling a feature must not rely solely on hiding navigation.

If a user attempts to access a disabled feature through:

* a bookmarked URL
* browser history
* a deep link
* manually constructed route

the application must display an appropriate disabled-feature state.

It must not expose operational functionality simply because the route exists.

### Historical data

Existing data created before a feature was disabled must remain valid.

For example:

```text
production = DISABLED

Existing production batches:
- FOUND-001
- FOUND-002
- FOUND-003
```

The batches remain stored and available for historical viewing/reporting.

The system must not interpret:

```text
feature disabled
```

as:

```text
feature data deleted
```

### Legacy data

When a new feature flag is introduced for an existing tenant, existing records belonging to that module must be treated as legacy data.

The migration must not delete or hide those records merely because the tenant's new feature flag defaults to disabled.

The implementation must explicitly define the initial feature state for existing tenants.

Recommended default:

```text
Existing functionality:
    enabled

New optional functionality:
    disabled unless explicitly enabled
```

This prevents an application upgrade from unexpectedly removing access to functionality that an existing tenant was already using.

### Feature deletion

Disabling a feature and deleting its data are separate operations.

The feature flag must never be used as a mechanism for data deletion.

Any future destructive data operation must have its own explicit workflow, authorization, confirmation, audit trail, and migration strategy.

---

# 10. Important Feature-Flag Rule

Feature flags are for:

- navigation
- UI visibility
- optional workflows
- onboarding
- tenant configuration

They are **not** the sole security mechanism.

Database RLS must still enforce tenant isolation.

A disabled feature must also be handled safely at the data/write layer.

---

# 11. Staff and Permissions

The current staff model should remain compatible with the existing PIN-based workflow.

Current model:

```text
owner
staff
```

PIN currently serves attribution rather than being a true security boundary. This is explicitly documented in the current architecture.

For now, preserve that behaviour.

However, extend the model toward:

```text
owner
manager
staff
```

with future permission support.

Do not implement full individual Supabase accounts in this phase.

Future permissions may include:

```text
orders.create
orders.edit
orders.cancel
payments.create
payments.refund
inventory.view
inventory.adjust
production.manage
expenses.create
reports.view
staff.manage
settings.manage
```

---

# 12. Core Domain: Customers

Retain:

```text
clients
```

Add only fields that are genuinely useful:

```text
email
address
customer_type
preferred_contact_method
```

Potential customer types:

```text
individual
corporate
organisation
```

Do not collect unnecessary personal information.

---

# 13. Measurement System

Retain the existing configurable measurement-field model.

This is important for multi-tenancy because different businesses require different measurements.

Examples:

Tailor:

```text
Chest
Waist
Shoulder
Sleeve
Trouser Length
```

Dressmaker:

```text
Bust
Waist
Hip
Shoulder
Dress Length
Armhole
```

Uniform supplier:

```text
Chest
Waist
Height
Shoulder
Sleeve
```

The existing `measurement_fields` model should remain the configuration mechanism.

---

# 14. Measurement History

Current measurement profiles are effectively one profile per client.

Introduce versioning in a future migration.

Target:

```text
measurement_profiles
```

with:

```text
id
client_id
version
values
measured_at
measured_by
is_current
created_at
updated_at
```

Do not destroy historical measurements when a client is remeasured.

Example:

```text
John

Measurement #1
January 2026

Measurement #2
August 2026

Measurement #3
March 2027
```

Order units must continue to snapshot the measurements used at the time of the order.

The existing order-unit measurement snapshot must remain immutable.

---

# 15. Orders

Retain the existing order concept.

Current types:

```text
tailor_made
rental
purchase
```

Add only where required:

```text
pre_order
corporate
repair
```

Do not immediately create separate order systems for each.

Use a common order model with type-specific metadata where appropriate.

---

# 16. Order Lifecycle

The generic workflow should support:

```text
created
measured
in_progress
ready
picked_up
returned
cancelled
```

For future product orders:

```text
placed
confirmed
processing
ready
fulfilled
cancelled
```

For repairs:

```text
requested
received
assessing
repairing
ready
collected
cancelled
```

Do not create a single massive enum containing every possible stage for every domain.

Instead, distinguish:

```text
order_type
workflow/status
```

or use domain-specific lifecycle models where necessary.

---

# 17. Product Catalogue

Introduce a generic product catalogue.

### `products`

```text
id
shop_id
name
description
category_id
brand
active
product_type
created_at
updated_at
```

### `product_variants`

```text
id
product_id
sku
size
colour
price_minor
cost_minor
active
created_at
updated_at
```

Product type examples:

```text
garment
accessory
service
rental
custom
```

A tailor can use:

```text
Men's Suit
```

An apparel brand can use:

```text
Heavyweight Tee
```

A rental business can use:

```text
Black Tuxedo
```

---

# 18. Categories

Add:

```text
product_categories
```

Examples:

```text
Shirts
Trousers
Dresses
Suits
Uniforms
Accessories
Outerwear
Rental
Services
```

Categories belong to a tenant.

---

# 19. SKU System

Every product variant should support a SKU.

Example:

```text
N-F001-TEE-BLK-L
```

But the application must not require NORTH//FOUND's SKU format.

Normal tenant:

```text
TSH-001-L-BLK
```

NORTH//FOUND:

```text
F002-TEE-BLK-L
```

Allow manual SKU entry and optionally generate SKUs from tenant configuration.

---

# 20. Collections

Collections are optional.

Create:

```text
collections
```

Fields:

```text
id
shop_id
name
code
description
status
release_date
cover_image_url
created_at
updated_at
```

Possible statuses:

```text
draft
planned
active
sold_out
archived
```

Products can optionally belong to a collection.

---

# 21. NORTH//FOUND Collection Extensions

NORTH//FOUND should use the generic collection model with optional fields:

```text
latitude
longitude
coordinate_label
story
tagline
production_limit
```

Example:

```text
FOUND 002
KEEP GOING

08.13° N
32.58° E
```

The coordinate system is a **NORTH//FOUND brand capability**, not a required Polyster concept.

---

# 22. Production Batches

Introduce:

```text
production_batches
```

Fields:

```text
id
shop_id
product_id
batch_number
planned_quantity
produced_quantity
accepted_quantity
rejected_quantity
status
started_at
completed_at
notes
created_by
created_at
updated_at
```

Statuses:

```text
planned
materials_ready
in_production
quality_control
completed
cancelled
```

---

# 23. Batch Costing

A production batch should eventually capture actual cost.

Create:

```text
production_batch_costs
```

Fields:

```text
id
batch_id
cost_type
description
amount_minor
currency
created_at
```

Cost types:

```text
materials
labour
transport
packaging
labels
quality_control
other
```

Example:

```text
Fabric              1,850,000
Tailoring             900,000
Labels                 120,000
Packaging              250,000
Transport               80,000
QC                      50,000
```

Then calculate:

```text
total_batch_cost
usable_units
cost_per_unit
```

Do not permanently store calculated values unless there is a performance requirement.

---

# 24. Materials

Create:

```text
materials
```

Fields:

```text
id
shop_id
name
description
material_type
unit
quantity_on_hand
reorder_level
unit_cost_minor
currency
supplier_id
active
created_at
updated_at
```

Material types:

```text
fabric
thread
button
zipper
label
packaging
other
```

---

# 25. Material Specifications

For fabrics, support optional:

```text
composition
gsm
width
colour
pattern
supplier_reference
```

This is particularly useful to NORTH//FOUND.

Example:

```text
280 GSM Combed Cotton
100% Cotton
Black
```

But these fields must remain optional for ordinary tailoring businesses.

---

# 26. Suppliers

Create:

```text
suppliers
```

Fields:

```text
id
shop_id
name
phone
email
address
notes
active
created_at
updated_at
```

A supplier may provide:

- fabric
- buttons
- zippers
- packaging
- outsourced manufacturing

---

# 27. Inventory Architecture

Do not implement inventory as a single mutable quantity.

Use an inventory ledger.

Create:

```text
inventory_items
inventory_movements
```

Inventory item:

```text
id
shop_id
item_type
product_variant_id?
material_id?
quantity
unit
```

Movement:

```text
id
shop_id
inventory_item_id
movement_type
quantity
reference_type
reference_id
notes
created_by
created_at
```

Movement types:

```text
purchase
production
sale
order_reservation
order_fulfilment
return
damage
loss
adjustment
sample
repair
```

---

# 28. Inventory Invariant

Never allow arbitrary stock changes without recording a movement.

A stock adjustment must have:

```text
reason
staff member
timestamp
quantity change
```

This makes inventory auditable.

---

# 29. Finished Garments

Generic apparel businesses may track stock at variant level.

NORTH//FOUND can optionally track **individual garments**.

Create:

```text
garment_units
```

Fields:

```text
id
shop_id
product_variant_id
production_batch_id
serial_number
status
customer_id?
sold_at?
created_at
updated_at
```

Statuses:

```text
produced
available
reserved
sold
returned
repair
retired
lost
damaged
```

---

# 30. NORTH//FOUND Garment Numbering

For NORTH//FOUND:

```text
N//F

FOUND 002
F002-B01

017/050

KEEP GOING.
```

The actual database identity should remain a UUID.

The displayed serial number is a business identifier.

Example:

```text
F002-B01-017
```

Do not use this as the database primary key.

---

# 31. Pre-Orders

Create:

```text
pre_orders
```

or represent them through the existing order system with an explicit order type.

Preferred initial approach:

Use the existing `orders` table with:

```text
order_type = pre_order
```

and link the order to:

```text
product_variant
collection
production_batch?
```

This avoids unnecessary duplication.

A pre-order must support:

```text
quantity
deposit
customer
expected_fulfilment_date
status
```

---

# 32. Corporate Orders

Corporate orders should be generic.

Example:

```text
Company
   ↓
Corporate Order
   ↓
100 Shirts
50 Trousers
```

Add:

```text
customer_type = corporate
```

and optionally:

```text
organisation_name
purchase_order_reference
contact_person
```

NORTH//FOUND can use this for its Office collection.

---

# 33. Repairs

Create a generic repair module.

```text
repairs
```

Fields:

```text
id
shop_id
client_id
order_id?
garment_unit_id?
description
status
quoted_amount_minor
final_amount_minor
received_at
ready_at?
collected_at?
created_by
created_at
updated_at
```

Repair status:

```text
requested
received
assessing
approved
repairing
ready
collected
cancelled
```

A normal tailor might use this for:

> Replace trouser zipper.

NORTH//FOUND can use:

> Repair FOUND 002 garment F002-B01-017.

---

# 34. NORTH//FOUND Garment Passport

This is an optional feature.

A garment may expose a public-safe digital identity through a QR code.

Example:

```text
NORTH//FOUND

FOUND 002
KEEP GOING

Garment 017 / 050

280 GSM Combed Cotton

Made in Kampala

Collection:
FOUND 002

Production Batch:
F002-B01
```

The public page must not expose:

- customer's phone number
- address
- private notes
- payment information
- staff information

The QR token must not simply expose the internal UUID.

Use a public identifier/token.

---

# 35. Customer Wardrobe

NORTH//FOUND-specific UI:

```text
My NORTH//FOUND

FOUND 001
Origin Tee
017/050

FOUND 002
Heavyweight Tee
031/050
```

This can be generated from `garment_units` linked to customers.

Do not make this a separate duplicate ownership database.

---

# 36. Finance

Retain:

```text
payments
sales
expenses
```

The existing system correctly uses integer minor units for money and distinguishes payments/refunds.

Do not introduce floating-point money calculations.

All monetary values must remain integer minor units.

---

# 37. Product Profitability

Add reporting that combines:

```text
revenue
-
cost of goods
-
allocated production costs
```

For a production batch:

```text
Revenue
Production Cost
Gross Profit
Margin %
```

Do not label this "net profit" because operating expenses may not yet be allocated.

---

# 38. Order Profitability

Eventually calculate:

```text
Order Revenue
- Product/Production Cost
- Applicable direct costs
= Gross Profit
```

Keep this separate from the existing order balance.

**Balance = money owed by customer.**

**Profit = commercial performance.**

Never conflate the two.

---

# 39. Dashboard

The dashboard should be modular.

Core widgets:

```text
Orders due today
Orders in progress
Orders ready
Outstanding balances
Today's revenue
Today's expenses
```

Optional inventory widgets:

```text
Low stock
Recent stock movements
```

Optional production widgets:

```text
Active batches
Production due
QC failures
```

NORTH//FOUND widgets:

```text
Active collection
Units produced
Units sold
Units remaining
Pre-orders
Batch revenue
Batch cost
Gross profit
Repairs
```

The dashboard should choose widgets based on tenant-enabled features.

---

# 40. Navigation

Core navigation:

```text
Dashboard
Clients
Orders
Payments
Reports
Settings
```

When catalogue is enabled:

```text
Catalogue
```

When inventory is enabled:

```text
Inventory
```

When production is enabled:

```text
Production
```

When collections are enabled:

```text
Collections
```

When repairs are enabled:

```text
Repairs
```

Do not display irrelevant modules to tenants.

---

# 41. NORTH//FOUND Navigation

Example:

```text
Dashboard

Customers
Orders

Catalogue
Collections
Production
Inventory

Repairs

Reports

Settings
```

The labels should remain generic.

Do not create a separate NORTH//FOUND navigation implementation.

---

# 42. Reports

Core:

```text
Revenue
Expenses
Outstanding balances
Orders
Payments
Sales
```

Catalogue:

```text
Product sales
Product performance
```

Inventory:

```text
Stock on hand
Stock movements
Low stock
```

Production:

```text
Batch performance
Production cost
Defect rate
Yield
```

NORTH//FOUND:

```text
Collection performance
Sell-through
Limited-edition inventory
Garment ownership
Repair history
```

---

# 43. Data Relationships

Target relationship:

```text
SHOP
 │
 ├── STAFF
 ├── CLIENTS
 │    └── MEASUREMENTS
 │
 ├── ORDERS
 │    ├── ORDER_UNITS
 │    ├── PAYMENTS
 │    └── STAGE_HISTORY
 │
 ├── PRODUCTS
 │    └── VARIANTS
 │
 ├── COLLECTIONS
 │    └── PRODUCTS
 │
 ├── PRODUCTION_BATCHES
 │    ├── BATCH_COSTS
 │    └── GARMENT_UNITS
 │
 ├── MATERIALS
 │    └── SUPPLIERS
 │
 ├── INVENTORY
 │    └── MOVEMENTS
 │
 ├── REPAIRS
 │
 ├── SALES
 │
 └── EXPENSES
```

---

# 44. Database Migration Strategy

Do not modify the original migration.

Create sequential migrations.

Suggested:

```text
0007_tenant_settings.sql
0008_products_catalogue.sql
0009_collections.sql
0010_suppliers_materials.sql
0011_inventory.sql
0012_production.sql
0013_garment_units.sql
0014_repairs.sql
0015_preorders_and_corporate.sql
0016_tenant_features.sql
0017_measurement_history.sql
0018_rls_audit_and_indexes.sql
```

Names may be adjusted to match the repository's actual latest migration number.

The agent must inspect existing migrations before choosing the final numbers.

---

# 45. RxDB Requirement

Every synced Postgres table requires a corresponding RxDB collection schema.

Do not copy `_modified` into RxDB schemas.

Do not copy `_deleted` as a user-defined schema property.

This is explicitly documented in the existing repository and is important because RxDB validation rejects `_modified`.

Every new synced collection must include:

- TypeScript document interface
- RxDB schema
- indexes
- schema version
- migration strategy if modifying existing collections
- database collection registration
- replication configuration
- write helpers
- tests

---

# 46. Write Layer

All mutations must continue to go through the existing centralised write layer.

Do not introduce:

```ts
supabase.from(...).insert(...)
```

directly from UI components.

UI:

```text
Component
   ↓
write function
   ↓
RxDB
   ↓
replication
   ↓
Supabase
```

This is a core architectural invariant.

---

# 47. Offline Behaviour

Every newly introduced module must work offline.

For example:

A tailor should be able to:

```text
Create customer
Create order
Record payment
Change stage
Create sale
Record expense
```

without internet.

An apparel business should also be able to:

```text
Create production batch
Record inventory movement
Record stock adjustment
Create pre-order
```

offline.

The UI must never block on network availability.

---

# 48. Sync Verification

Before calling the implementation complete:

### Test A

Device 1:

```text
Create customer
```

Device 2:

```text
Customer appears
```

### Test B

Device 2:

```text
Create order
```

Device 1:

```text
Order appears
```

### Test C

Device 1 offline:

```text
Create order
Record payment
```

Reconnect.

Supabase receives both.

### Test D

Two devices modify the same record offline.

Document and test the actual conflict behaviour.

Do not claim conflict resolution is supported until tested.

---

# 49. RLS Test Matrix

At minimum:

| Test | Expected |
|---|---|
| Tenant A reads own clients | Allowed |
| Tenant A reads Tenant B clients | Denied |
| Tenant A creates client | Allowed |
| Tenant A creates client with Tenant B shop_id | Denied |
| Tenant A reads own orders | Allowed |
| Tenant A reads Tenant B orders | Denied |
| Tenant A reads own payments | Allowed |
| Tenant A reads Tenant B payments | Denied |
| Tenant A reads own inventory | Allowed |
| Tenant A reads Tenant B inventory | Denied |
| Tenant A reads own production | Allowed |
| Tenant A reads Tenant B production | Denied |
| Tenant A reads own reports | Allowed |
| Tenant A reads Tenant B reports | Denied |

Also explicitly test:

```text
order_balances
```

because the existing architecture identifies the view as a potential tenant-isolation risk and uses `security_invoker`.

---

# 50. Seed Architecture

Replace the idea of a single generic seed with **tenant fixtures**.

Create:

```text
src/dev/fixtures/
```

Suggested:

```text
base.ts
tailor.ts
rental.ts
northfound.ts
```

The seed engine should be reusable.

Example:

```ts
seedTenant({
  type: 'tailor',
  ...
})
```

or:

```ts
seedNorthFound()
```

Do not create completely separate seed logic for every tenant.

---

# 51. Tenant 1 — Generic Tailor Fixture

Example:

```text
Ahum Tailoring
```

Data:

```text
4 staff
40 clients
60 orders
40 measurement profiles
80 order units
100 payments
200 stage history records
50 message logs
30 sales
30 expenses
```

Include:

- custom suits
- shirts
- dresses
- alterations
- partial payments
- completed orders
- overdue orders
- cancelled orders
- different payment methods

---

# 52. Tenant 2 — Rental Fixture

Example:

```text
Kampala Formal Rentals
```

Include:

```text
catalogue
rental products
inventory
clients
rental orders
deposits
returns
late returns
damage charges
refunds
```

Test:

```text
Available
Reserved
Rented
Returned
Damaged
```

---

# 53. Tenant 3 — NORTH//FOUND Fixture

Create:

### Collections

```text
FOUND 001 — ORIGIN
FOUND 002 — KEEP GOING
OFFICE 001 — ARRIVAL
TRANSIT 001 — BETWEEN PLACES
```

### Products

```text
Heavyweight Tee
Overshirt
Oxford Shirt
Tailored Trouser
Merino Polo
Waxed Canvas Jacket
Canvas Tote
Cap
```

### Variants

Multiple:

```text
sizes
colours
SKUs
prices
```

### Production batches

Include:

```text
completed batch
active batch
planned batch
batch with rejected units
```

### Customers

Create realistic customer profiles.

### Orders

Include:

```text
purchase
pre-order
corporate
custom
```

### Inventory

Include:

```text
cotton
labels
packaging
finished garments
```

### Garment units

At least:

```text
50 units across multiple batches
```

Some:

```text
available
reserved
sold
repair
damaged
```

### Repairs

At least:

```text
requested
repairing
ready
completed
```

---

# 54. Seed Edge Cases

The seed data must deliberately contain:

1. Client with no order
2. Client with many orders
3. Unpaid order
4. Partially paid order
5. Fully paid order
6. Refunded payment
7. Voided payment
8. Discount
9. Damage charge
10. Cancelled order
11. Overdue order
12. Ready order
13. Rental deposit
14. Returned rental
15. Damaged rental
16. Walk-in sale
17. Zero-value giveaway sale
18. Expense in every category
19. Low inventory
20. Stock adjustment
21. Production rejection
22. Pre-order
23. Corporate order
24. Repair
25. NORTH//FOUND limited garment
26. Garment with customer ownership
27. Garment without customer ownership
28. Multiple collection products
29. Cross-tenant identical product names
30. Cross-tenant identical client names

The last two are important for proving that the application does not accidentally use globally unique business values where only tenant uniqueness is required.

---

## 54.1 Feature Flag Edge Cases

The test fixtures must include:

1. A tenant with a feature enabled and active data.
2. A tenant with the same feature disabled but no existing data.
3. A tenant with the feature disabled but existing historical data created before the feature was disabled.
4. A tenant with a newly introduced feature disabled while legacy records already exist.
5. A feature being re-enabled after previously being disabled.
6. An offline device with stale feature configuration attempting to create a record after the server has disabled the feature.
7. A user attempting to access a disabled feature through a direct URL.
8. A feature being disabled while existing records are still referenced by orders, reports, inventory, or other modules.
9. A feature configuration change increasing the tenant configuration version.
10. An audit record being created for every feature state change.

Expected behaviour:

```text
Disabled feature
    ↓
Existing data preserved
    ↓
Existing data readable
    ↓
New writes blocked
    ↓
Historical reporting preserved
    ↓
Re-enable
    ↓
Normal functionality restored
```

No feature toggle may cause unintended data deletion or cross-tenant exposure.

These edge cases exercise the runtime and lifecycle rules defined in §9.1 (Feature Flag Runtime Behaviour) and §9.2 (Feature Lifecycle, Versioning and Rollback).

---

# 55. Test Data Rule

Do not use:

```text
John
John
John
```

with random meaningless values.

Use coherent datasets.

For example:

```text
Client
Order
Payment
Stage History
Message
```

must tell a consistent story.

If an order is fully paid:

```text
payments
```

must actually sum to the order's amount.

If a rental is returned:

```text
returned_at
```

must be populated.

If a deposit is refunded:

```text
deposit_refunded_at
```

must be populated.

Seed data must obey the same business invariants as real data.

---

# 56. UI Requirements

Every new module must include:

1. List screen
2. Search/filter
3. Create form
4. Edit form where appropriate
5. Detail screen
6. Empty state
7. Loading state
8. Error state
9. Offline behaviour
10. Mobile-friendly layout

Do not build desktop-only screens.

The existing project is intentionally designed around one-handed phone use.

---

# 57. Catalogue UI

Required:

```text
Catalogue
 ├── Products
 ├── Categories
 └── Variants
```

Product detail:

```text
Product
Description
Images
Variants
Price
Cost
Inventory
Production batches
Sales
```

---

# 58. Production UI

Required:

```text
Production
 ├── Active
 ├── Planned
 ├── Completed
 └── Batches
```

Batch detail:

```text
Product
Batch number
Planned
Produced
Accepted
Rejected
Materials
Costs
QC
Units
```

---

# 59. Inventory UI

Required:

```text
Inventory
 ├── Finished goods
 ├── Materials
 ├── Low stock
 └── Movements
```

Stock detail:

```text
Current quantity
Movement history
Cost
Supplier
Related production
Related orders
```

---

# 60. Collection UI

For tenants with collections:

```text
Collections
```

Collection detail:

```text
Collection name
Story
Release date
Products
Units produced
Units sold
Revenue
```

For NORTH//FOUND:

```text
FOUND 002

KEEP GOING.

08.13° N
32.58° E

50 produced
37 sold
11 available
2 rejected
```

---

# 61. Repair UI

```text
Repairs

Requested
Received
Assessing
Repairing
Ready
Collected
```

Repair detail:

```text
Customer
Garment
Issue
Quoted cost
Final cost
Timeline
Notes
```

---

# 62. Reports UI

Reports must be generated locally from RxDB wherever possible.

Do not make the dashboard dependent on a network-only Supabase query.

The current architecture intentionally computes balances locally because the application must remain functional offline. Preserve that principle.

---

# 63. Search

Search should be tenant-scoped.

Search targets may include:

```text
client name
phone
order reference
SKU
product name
batch number
garment serial
```

Never perform a global search across tenants.

---

# 64. Auditability

Sensitive financial/inventory actions should retain attribution.

At minimum:

```text
created_by
recorded_by
updated_by
voided_by
```

where applicable.

Inventory adjustments must record:

```text
who
when
why
amount
```

Production QC must record:

```text
who
when
accepted/rejected
reason
```

---

# 65. Data Invariants

Implement database constraints wherever practical.

Examples:

```text
quantity > 0
amount_minor > 0
shop_id NOT NULL
```

Unique constraints should normally be tenant-scoped.

Example:

```text
UNIQUE(shop_id, sku)
```

not:

```text
UNIQUE(sku)
```

unless there is a deliberate global reason.

Likewise:

```text
UNIQUE(shop_id, batch_number)
```

rather than globally unique batch numbers.

---

# 66. Soft Deletes

Continue using the existing replication-compatible soft-delete approach.

Do not physically delete synced business records from the client.

For records that should disappear from active UI:

```text
_deleted
```

through the existing mechanism.

Do not invent a second soft-delete mechanism such as:

```text
is_deleted
```

unless there is a specific domain requirement.

---

# 67. Photos and Storage

The existing architecture reserves Supabase Storage for catalogue photos.

Implement:

```text
product images
collection cover images
```

before implementing customer-uploaded images.

For NORTH//FOUND later:

```text
garment passport imagery
collection photography
```

Do not store large binary images inside Postgres or RxDB documents.

---

# 68. Public Garment Passport Security

If implemented:

```text
public garment token
```

must resolve to a safe public page.

Do not expose internal database IDs as the public URL identifier.

Do not expose customer identity unless explicitly intended.

The public endpoint should reveal only product/garment information approved by the tenant.

---

# 69. Testing Strategy

Every feature requires:

### Unit tests

Business calculations.

### Schema tests

RxDB validation.

### Write tests

Mutation behaviour.

### Integration tests

RxDB + replication where possible.

### RLS tests

Tenant isolation.

### UI tests

Critical workflows.

---

# 70. Required Regression Tests

Existing tests must continue passing.

Run:

```bash
pnpm verify
```

before every milestone.

The repository currently reports:

```text
typecheck
tests
production build
```

as part of verification.

Do not remove existing tests to make the new implementation pass.

---

# 71. Phase 0 — Foundation Verification

### Priority: P0

**Status: 🔄 In progress** — local checks, live tenant-isolation/RLS checks, and offline/mobile-layout/PWA-prerequisite checks all done against a real (eu-central-1) Supabase project and a real mobile-emulated browser. Remaining gap: replication/Realtime/reconnect/multi-device sync all need a Supabase-account-linked shop, which needs phone-OTP sign-in — no SMS provider is configured on this project yet. That is the one open item blocking full Phase 0 exit.

Before adding major functionality:

- ✅ Run existing tests — `pnpm verify` (typecheck + 273 tests across 19 files + production build), all passing, 2026-08-11
- ✅ Verify Supabase connection — live project reachable (PostgREST, Auth Admin API, direct DB via session pooler), 2026-08-11
- ✅ Create two tenants — two real shops created live via the Admin API + magic-link session flow (phone-OTP sign-in path itself not yet exercised — see note below), 2026-08-11
- 🔄 Verify authentication — a real Supabase Auth user + session correctly authenticates against PostgREST/RLS (`auth.uid()` resolves, `current_shop_id()` resolves correctly per tenant). The app's actual phone-OTP sign-in path (`src/lib/auth.ts`) has **not** been exercised — no SMS provider configured yet.
- ✅ Verify RLS — `pnpm verify:rls` structural check passing (was failing on a bug in the check itself — see below, now fixed), **and** a live two-tenant RLS test matrix run over the real PostgREST path: 17/17 checks passed (own-data reads, cross-tenant reads denied, cross-tenant insert/update/delete all rejected or no-op), 2026-08-11
- ✅ Verify `order_balances` — confirmed in the same live test: Tenant A could read its own `order_balances` row, denied Tenant B's
- ⛔ Verify replication — blocked: requires a shop connected to a Supabase account, which requires phone-OTP sign-in (`src/lib/auth.ts`); no SMS provider configured yet on this project
- ⛔ Verify Realtime — same blocker as replication
- ✅ Test offline writes — driven live in a real (mobile-emulated) browser: created a client with the browser context's network forced offline (`context.setOffline(true)`), save succeeded with no errors and no UI blocking, 2026-08-11
- ✅ Test offline persistence — confirmed the offline-created record survives a full browser process restart (real IndexedDB persistence, not in-memory-only)
- ⛔ Test reconnect — same OTP blocker as replication (nothing to reconnect without a cloud-linked shop)
- ⛔ Test multi-device sync — same OTP blocker
- ⛔ Test conflict behaviour — same OTP blocker
- 🔄 Test PWA installation — technical prerequisites confirmed against the production build (`pnpm preview`): service worker registers and activates, `manifest.webmanifest` is valid (`display: standalone`, correct `start_url`, 3 icons). The actual "Add to Home Screen" device flow still needs a real phone.
- ✅ Test mobile layout — confirmed correct with full mobile device emulation (touch + mobile user-agent, not just a narrow viewport): bottom tab nav renders correctly, forms and empty states are usable one-handed. Note: viewport width alone is not sufficient to trigger the mobile layout in this app — a narrow desktop-UA browser window renders the desktop sidebar layout instead.

**Bug found and fixed during this phase:** `scripts/verify-rls.mjs` checked `order_balances`'s `security_invoker` reloption against the literal string `'security_invoker=true'`, but Postgres stores the reloption verbatim as written in the DDL (`security_invoker=on` in this migration), not canonicalized to `true`/`false`. The check was a false failure, not a real schema problem — fixed to match any truthy boolean spelling (`on`/`true`/`yes`/`1`).

**Exit condition:**

The existing product works reliably against real Supabase infrastructure. **Partially met** — auth/RLS/tenant-isolation confirmed live; offline writes, persistence, mobile layout, and PWA prerequisites confirmed against the real app. Only replication/Realtime/reconnect/multi-device sync remain, blocked on phone-OTP not being configured yet (see blocked items above).

---

# 72. Phase 1 — Tenant Configuration

### Priority: P0

**Status: ✅ Done.** Implemented and verified 2026-08-11: migration `0008_tenant_configuration.sql` applied and RLS-tested live (structural check + a two-tenant isolation test on `tenant_features` and the new `shops` columns, 5/5 passed). Both development tenants seeded and confirmed live in a real browser (correct `business_type`, all 17 feature flags read back exactly right for each persona).

**Found and fixed while wiring this up:** the app has two parallel shell implementations (`screens/Shell.tsx` for phone, `web/WebShell.tsx` for desktop/mouse, chosen by pointer type in `lib/platform.ts`) that must each register the same routes. The new `/settings/features` route and the feature-aware nav filtering were only added to the phone shell at first; `web/WebShell.tsx` and `web/Sidebar.tsx` needed the same additions. Also found and fixed: the dev-tenant seed helper initially created a shop with no staff row, and `entryState.ts` requires both to count a shop as "provisioned" — without a staff row the app bounced back to onboarding instead of opening the seeded shop.

**Deviation from this section's literal text:** no separate `shop_settings` table was created. `shops` already carried tenant-config fields directly (`currency`, `country`, `address`, `lock_after_minutes`), so `business_type`, `logo_url`, `timezone`, `email`, `website` were added as columns on `shops` instead, matching the existing convention rather than splitting config across two tables. `display_name` and a generic `phone` were skipped as duplicates of the existing `name` and `whatsapp_number`.

Implement:

```text
shop_settings   -- done as columns on shops, not a separate table (see above)
tenant_features -- done: table + RLS + RxDB collection + replication
business_type   -- done: column on shops, enum tailor/rental/apparel_brand/corporate_supplier/hybrid
```

Add:

- ✅ feature loading — `src/db/features.ts` (`resolveFeatureFlags`, `observeFeatureFlags`)
- ✅ feature caching in RxDB — `tenant_features` is a synced RxDB collection like any other
- ✅ feature-aware navigation — Settings hides "Measurement fields" when `measurements` is off; the Money hub and desktop rail hide Sales/Expenses when their flags are off
- 🔄 tenant branding — `logo_url` etc. are captured in Shop details, but nothing in the UI renders a shop's logo yet
- ✅ tenant configuration screen — Shop details extended (business type + presentation fields), new "Modules" screen for feature toggles

✅ **Create two development tenants (Generic Tailor, NORTH//FOUND) — done.** `src/dev/fixtures/` (`base.ts`, `tailor.ts`, `northfound.ts`), matching the `seedTenant()`/`seedNorthFound()` shape suggested in section 50. Dev-only console access via `window.__polyster` (wired in `main.tsx`, tree-shaken out of production builds — confirmed absent from the built bundle). Scoped to exactly what this phase needs (a correctly configured shop per persona); the full realistic datasets in sections 50-55 (40 clients, 60 orders, etc.) remain future work, not built as a side effect here.

---

# 73. Phase 2 — Catalogue

### Priority: P0

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Implement:

```text
products
product_categories
product_variants
```

Features:

- CRUD
- SKU
- price
- cost
- variants
- active/inactive
- images
- search

This is the foundation for both ordinary apparel businesses and NORTH//FOUND.

---

# 74. Phase 3 — Suppliers & Materials

### Priority: P1

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Implement:

```text
suppliers
materials
```

Support:

- fabric
- thread
- buttons
- zippers
- labels
- packaging

---

# 75. Phase 4 — Inventory

### Priority: P1

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Implement:

```text
inventory_items
inventory_movements
```

Support:

- purchases
- production
- sales
- damage
- loss
- adjustments
- samples
- returns

---

# 76. Phase 5 — Production

### Priority: P1

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Implement:

```text
production_batches
production_batch_costs
```

Support:

- planning
- production
- QC
- rejected units
- actual costs
- yield
- cost per unit

---

# 77. Phase 6 — Collections

### Priority: P1

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Implement:

```text
collections
```

Make the module generic.

Then configure NORTH//FOUND:

```text
FOUND 001
FOUND 002
OFFICE 001
TRANSIT 001
```

---

# 78. Phase 7 — Pre-Orders & Corporate

### Priority: P1

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Add:

```text
pre_order
corporate
```

to the appropriate existing order architecture.

Do not duplicate payment/order logic.

---

# 79. Phase 8 — Garment Identity

### Priority: P2

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Implement:

```text
garment_units
```

Initially generic.

NORTH//FOUND uses:

```text
F002-B01-017
```

Other tenants may use:

```text
UNIFORM-2027-00017
```

or not use individual identities at all.

---

# 80. Phase 9 — Repairs

### Priority: P2

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Implement:

```text
repairs
```

Integrate with:

```text
clients
orders
garment_units
payments
```

---

# 81. Phase 10 — NORTH//FOUND Passport

### Priority: P2

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Implement:

```text
garment public token
QR code
public garment page
```

Only enable this feature for tenants that have it turned on.

---

# 82. Phase 11 — Advanced Reporting

### Priority: P2

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Implement:

```text
batch profitability
product profitability
collection performance
inventory valuation
customer lifetime value
repair metrics
```

Keep calculations transparent.

---

# 83. Phase 12 — Permissions

### Priority: P3

**Status: ⬜ Not started** — blocked behind Phase 0 exit condition.

Only after the operational model is stable.

Introduce:

```text
owner
manager
staff
```

and granular permissions.

Do not disrupt the existing PIN workflow during earlier phases.

---

# 84. NORTH//FOUND Configuration

The development seed should configure NORTH//FOUND as:

```text
business_type:
apparel_brand
```

Features:

```text
customers
measurements
orders
payments
expenses
sales
catalogue
inventory
suppliers
production
pre_orders
corporate_orders
collections
repairs
garment_identity
garment_passport
```

Disabled:

```text
rentals
```

unless later required.

---

# 85. NORTH//FOUND Brand Data

Seed:

### Collection

```text
FOUND 001
ORIGIN

00.31° N
32.58° E

BEGIN.
```

### Collection

```text
FOUND 002
KEEP GOING

08.13° N
32.58° E

KEEP GOING.
```

### Collection

```text
OFFICE 001
ARRIVAL
```

### Collection

```text
TRANSIT 001
BETWEEN PLACES
```

These are seed records, not hardcoded application concepts.

---

# 86. NORTH//FOUND Product Example

```text
Product:
Heavyweight Tee

Collection:
FOUND 002

Material:
280 GSM Combed Cotton

Colours:
Midnight Black
Bone

Sizes:
M
L
XL
XXL
```

Example SKU:

```text
F002-TEE-BLK-L
```

Example batch:

```text
F002-B01
```

Example garment:

```text
F002-B01-017
```

---

# 87. Implementation Rules for the Agent

The implementing agent must:

### Rule 1

Read:

```text
README.md
docs/ARCHITECTURE.md
docs/DESIGN_SYSTEM.md
docs/IMPLEMENTATION_PLAN.md
docs/pwa-schema-and-screens.md
```

before modifying architecture.

The repository explicitly identifies these documents as the design record.

### Rule 2

Inspect all existing migrations before adding migrations.

### Rule 3

Inspect existing RxDB schemas before adding schemas.

### Rule 4

Do not bypass `src/db/writes.ts`.

### Rule 5

Do not introduce direct UI → Supabase writes.

### Rule 6

Every new synced table must exist in:

```text
Postgres
RxDB
replication
writes
tests
```

### Rule 7

Every tenant-owned table must have an RLS policy.

### Rule 8

Never use tenant names as business logic.

### Rule 9

Do not break offline functionality.

### Rule 10

Do not remove existing features to make room for new ones.

---

# 88. Definition of Done

A feature is not complete merely because the UI works.

It is complete only when:

```text
Database
    ✓ migration

RLS
    ✓ tenant isolation

RxDB
    ✓ schema

Replication
    ✓ configured

Writes
    ✓ local-first mutation

UI
    ✓ mobile

Offline
    ✓ works without network

Tests
    ✓ unit
    ✓ integration where applicable

Seed
    ✓ realistic fixtures

Verification
    ✓ pnpm verify
```

---

# 89. Final Acceptance Test

The final application must support these three tenants simultaneously:

## Tenant A — Traditional Tailor

Can:

```text
Create customer
Take measurements
Create custom order
Track stages
Take payment
Record expense
Send WhatsApp message
View reports
```

and does not see apparel-brand modules unless enabled.

---

## Tenant B — Rental Business

Can:

```text
Manage catalogue
Manage rental stock
Create rental
Take deposit
Track return
Record damage
Refund deposit
```

---

## Tenant C — NORTH//FOUND

Can:

```text
Manage customers
Manage products
Manage collections
Manage materials
Manage suppliers
Create production batches
Track inventory
Track production cost
Accept pre-orders
Process corporate orders
Track individual garments
Track repairs
Generate garment identity
View collection performance
```

All three tenants use:

```text
same application
same database
same codebase
same authentication architecture
```

while remaining completely isolated from each other.

---

# 90. Strategic Product Boundary

Do not attempt to build every possible ERP feature.

Polyster's core should remain:

```text
CUSTOMERS
ORDERS
PAYMENTS
PRODUCTS
INVENTORY
PRODUCTION
```

Everything else supports these.

NORTH//FOUND demonstrates the upper end of the platform's capabilities without dictating the architecture for every tenant.

The ultimate architecture should therefore look like:

```text
                         POLYSTER
                            │
                    MULTI-TENANT CORE
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       TAILOR             RENTAL          APPAREL
          │                 │                 │
       modules            modules          modules
                                             │
                                             │
                                      NORTH//FOUND
                                      configuration
                                             │
                           ┌─────────────────┼────────────────┐
                           │                 │                │
                       Collections      Garments         Passport
                           │                 │                │
                       FOUND 001         F002-B01-017       QR
```

**The principle is simple:**

> Build generic capabilities into Polyster.  
> Configure NORTH//FOUND to use the capabilities more deeply.

That gives you a product you can eventually sell to other tailoring and apparel businesses while allowing NORTH//FOUND to act as the first sophisticated real-world tenant and test environment.