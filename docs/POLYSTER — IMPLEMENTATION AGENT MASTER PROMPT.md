# POLYSTER — IMPLEMENTATION AGENT MASTER PROMPT

You are working on the existing **Polyster** repository

You are **not starting a new project**.

You are extending the existing implementation into a production-ready, multi-tenant tailoring and apparel business operating system.

The existing application is the source of truth. **Inspect the repository before making architectural decisions or modifying code.**

---

## 1. PRIMARY OBJECTIVE

Evolve Polyster from its current tailoring/rental tracker into a:

> **Multi-tenant, offline-first tailoring and apparel business operating system.**

It must support different businesses using the same application and database.

Examples:

- Traditional tailor
- Dressmaker
- Rental business
- Apparel manufacturer
- Clothing brand
- Corporate uniform supplier
- NORTH//FOUND

The architecture must remain generic.

### Critical principle

> **Polyster is the product. NORTH//FOUND is a tenant.**

NORTH//FOUND-specific functionality must be implemented as optional capabilities/configuration on top of generic Polyster functionality.

Do **not** create a NORTH//FOUND-specific fork.

Do **not** hardcode NORTH//FOUND into business logic.

Never write patterns such as:

```ts
if (shop.name === "NORTH//FOUND")
```

or:

```ts
if (tenant === "northfound")
```

Instead use:

- tenant configuration
- feature flags
- business type
- generic domain models
- optional modules
- tenant branding/settings

---

# 2. FIRST ACTION — AUDIT THE EXISTING REPOSITORY

Before changing anything, inspect:

```text
README.md
docs/ARCHITECTURE.md
docs/DESIGN_SYSTEM.md
docs/IMPLEMENTATION_PLAN.md
docs/pwa-schema-and-screens.md
src/
supabase/
migrations/
tests/
package.json
```

Also inspect:

- current RxDB schemas
- current Supabase schema
- existing migrations
- RLS policies
- replication configuration
- write layer
- authentication
- routing
- existing screens
- existing tests
- seed/fixture mechanisms

Do not assume the architecture from this prompt is more accurate than the code.

If the repository differs from this specification, determine the smallest safe change required to move it toward the target architecture.

---

# 3. DO NOT REBUILD THE APPLICATION

Preserve the existing technology stack unless there is a concrete technical reason not to.

Current architecture includes:

```text
Preact
Vite
Tailwind
RxDB
Dexie
Supabase
Postgres
Supabase Auth
Supabase Realtime
Cloudflare Pages
```

Preserve the existing local-first architecture.

The intended data flow remains:

UI

↓

RxDB

↓

local IndexedDB/Dexie

↓

Supabase replication

↓

Postgres

The UI must not become dependent on synchronous network requests.

---

# 4. EXISTING ARCHITECTURAL INVARIANTS

These rules are mandatory.

## 4.1 Local-first

Business operations must work offline whenever technically possible.

Examples:

- create customer
- create order
- record payment
- change order stage
- record expense
- create product
- record inventory movement
- create production batch

must not require an active internet connection.

---

## 4.2 Centralised writes

All UI mutations must go through the existing write abstraction.

Do NOT introduce direct UI mutations such as:

```ts
supabase.from(...).insert(...)
```

from components.

Use:

```text
UI
 ↓
write layer
 ↓
RxDB
 ↓
replication
 ↓
Supabase
```

Inspect the existing write implementation and extend it rather than creating a parallel mutation architecture.

---

## 4.3 Tenant isolation

Every tenant-owned record must be scoped to a tenant/shop.

The existing tenant identifier appears to be `shop_id`.

Preserve that concept.

Do not introduce a second competing tenant identity.

Every new tenant-owned table must have:

```text
shop_id
```

where appropriate.

---

## 4.4 Database security

Tenant isolation must be enforced at the Postgres/RLS layer.

Do not rely solely on:

```ts
WHERE shop_id = currentShop
```

in frontend code.

The database must prevent cross-tenant access.

---

## 4.5 Money

Continue using integer minor units for monetary values.

Do not introduce floating-point money.

For example:

```text
UGX 25,000
```

must continue using the repository's established money representation.

---

## 4.6 Soft deletion

Follow the existing RxDB/Supabase replication deletion mechanism.

Do not invent a second deletion mechanism without a strong reason.

---

# 5. IMPORTANT: VERIFY BEFORE EXPANDING

The existing application documentation indicates that some infrastructure paths may not yet be fully verified.

Therefore the first implementation phase must verify:

### Supabase

- authentication
- database connectivity
- migrations
- RLS
- replication
- Realtime

### Offline

- offline create
- offline update
- reconnect
- replication

### Multi-tenancy

Create at least:

```text
Tenant A
Tenant B
```

Verify Tenant A cannot:

- read Tenant B clients
- read Tenant B orders
- read Tenant B payments
- read Tenant B expenses
- read Tenant B inventory
- read Tenant B products
- read Tenant B production
- read Tenant B reports

Test this at the database level.

Do not proceed as if tenant isolation is correct merely because the frontend filters records.

---

# 6. IMPLEMENTATION STRATEGY

Work incrementally.

Implement in this order:

```text
PHASE 0
Infrastructure verification

PHASE 1
Tenant configuration

PHASE 2
Catalogue

PHASE 3
Suppliers + Materials

PHASE 4
Inventory

PHASE 5
Production

PHASE 6
Collections

PHASE 7
Pre-orders + Corporate orders

PHASE 8
Individual garment identity

PHASE 9
Repairs

PHASE 10
Garment passport / QR

PHASE 11
Advanced reporting

PHASE 12
Permissions
```

Do not implement everything in one enormous change.

After every phase:

1. run tests
2. run typecheck
3. run build
4. inspect migration correctness
5. inspect RLS
6. verify existing functionality
7. fix regressions
8. only then proceed

---

# 7. PHASE 1 — MULTI-TENANT CONFIGURATION

Add a generic tenant settings mechanism.

The existing `shops` table remains the tenant.

Add a settings model if one does not already exist:

```text
shop_settings
```

Potential fields:

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

Do not duplicate fields already represented correctly in existing tables.

---

# 8. BUSINESS TYPES

Support configurable business types:

```text
tailor
rental
apparel_brand
corporate_supplier
hybrid
```

Business type should affect:

- onboarding
- default features
- navigation
- suggested workflows

It must NOT become a hard security boundary.

A tailor may still sell products.

An apparel brand may still accept custom orders.

---

# 9. FEATURE FLAGS

Implement tenant-level feature configuration.

Suggested model:

```text
tenant_features
```

with:

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

Feature flags control:

- UI visibility
- navigation
- optional workflows
- onboarding

They must NOT be the sole security mechanism.

---

# 10. GENERIC PRODUCT CATALOGUE

Add a generic catalogue.

Models:

```text
products
product_categories
product_variants
```

Products should support:

```text
id
shop_id
name
description
category_id
product_type
brand
active
created_at
updated_at
```

Variants:

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

Possible product types:

```text
garment
accessory
service
rental
custom
```

Respect existing conventions if the repository already has equivalent models.

Do not duplicate existing concepts.

---

# 11. SKU RULES

SKU uniqueness should normally be tenant-scoped.

For example:

```sql
UNIQUE(shop_id, sku)
```

not globally unique unless there is a specific reason.

The application should support:

- manually entered SKU
- configurable/generated SKU

Do not hardcode NORTH//FOUND SKU formats.

---

# 12. SUPPLIERS

Add a generic:

```text
suppliers
```

supporting:

- fabric
- buttons
- zippers
- labels
- packaging
- outsourced production
- other materials

Tenant scoped.

---

# 13. MATERIALS

Add:

```text
materials
```

supporting:

```text
fabric
thread
button
zipper
label
packaging
other
```

Optional fabric metadata:

```text
composition
gsm
width
colour
pattern
supplier_reference
```

These fields should remain optional so ordinary tailoring businesses are not forced into apparel-manufacturing complexity.

---

# 14. INVENTORY

Do NOT implement inventory as only:

```text
quantity_on_hand
```

Use a ledger.

Suggested:

```text
inventory_items
inventory_movements
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

Every inventory quantity change must have a movement record.

An adjustment must record:

```text
who
when
quantity
reason
```

Inventory must remain tenant scoped.

---

# 15. PRODUCTION

Add generic:

```text
production_batches
production_batch_costs
```

A batch should support:

```text
batch_number
product
planned_quantity
produced_quantity
accepted_quantity
rejected_quantity
status
started_at
completed_at
notes
created_by
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

# 16. PRODUCTION COSTING

Track:

```text
materials
labour
transport
packaging
labels
quality_control
other
```

Use integer minor units.

Calculate:

```text
total production cost
usable units
cost per unit
```

Do not confuse:

```text
customer balance
```

with:

```text
production cost
```

or:

```text
profit
```

---

# 17. COLLECTIONS

Add generic:

```text
collections
```

supporting:

```text
name
code
description
status
release_date
cover_image_url
```

Products may optionally belong to collections.

Possible statuses:

```text
draft
planned
active
sold_out
archived
```

Do not make collections a NORTH//FOUND-only concept.

---

# 18. NORTH//FOUND-SPECIFIC EXTENSIONS

NORTH//FOUND must use the generic collection/product/production/inventory architecture.

Do NOT create separate tables such as:

```text
northfound_collections
northfound_products
northfound_batches
```

unless a genuinely generic domain requirement exists that applies to other tenants too.

NORTH//FOUND may enable:

```text
collections
production
inventory
garment_identity
garment_passport
pre_orders
corporate_orders
repairs
```

---

# 19. NORTH//FOUND COLLECTION METADATA

If coordinates/story/limited-production concepts are needed, implement them generically as optional collection metadata.

Potential fields:

```text
latitude
longitude
coordinate_label
story
tagline
production_limit
```

Do not hardcode values into application logic.

Seed NORTH//FOUND with:

```text
FOUND 001
FOUND 002
OFFICE 001
TRANSIT 001
```

Example:

```text
FOUND 002
KEEP GOING.

08.13° N
32.58° E
```

These are tenant data, not application constants.

---

# 20. INDIVIDUAL GARMENTS

Implement a generic optional:

```text
garment_units
```

This is useful for businesses that want to track individual garments rather than only SKU quantities.

Fields may include:

```text
id
shop_id
product_variant_id
production_batch_id
serial_number
status
customer_id
sold_at
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

The database identity must remain a UUID.

The serial number is a human/business identifier.

---

# 21. NORTH//FOUND GARMENT NUMBERING

NORTH//FOUND may display:

```text
F002-B01-017
```

meaning:

```text
FOUND 002
Batch 01
Garment 017
```

Do not make this format mandatory for other tenants.

---

# 22. PRE-ORDERS

Prefer extending the existing order model with:

```text
order_type = pre_order
```

rather than creating an entirely separate payment/order architecture.

Pre-orders should support:

```text
customer
product/variant
quantity
deposit
expected fulfilment date
status
```

Reuse existing payments.

---

# 23. CORPORATE ORDERS

Support generic corporate customers.

The existing client model should be extended where possible rather than replaced.

Support:

```text
individual
corporate
organisation
```

Corporate orders may include:

```text
organisation name
contact person
purchase order reference
```

Again, reuse existing order/payment functionality.

---

# 24. REPAIRS

Add a generic repairs module.

Potential model:

```text
repairs
```

Support:

```text
client
order
garment_unit
description
status
quoted_amount_minor
final_amount_minor
received_at
ready_at
collected_at
created_by
```

Statuses:

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

This should work for:

- ordinary tailors
- rental businesses
- apparel brands
- NORTH//FOUND

---

# 25. NORTH//FOUND GARMENT PASSPORT

Implement this as an optional feature:

```text
garment_passport
```

A garment may have a QR code leading to a public-safe page.

Example information:

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

Do NOT expose:

- customer phone
- address
- payment information
- private notes
- internal database IDs

Use a public token rather than exposing UUIDs directly.

---

# 26. REPORTING

Maintain the existing reporting architecture.

Add generic reports for:

```text
Revenue
Expenses
Outstanding balances
Orders
Payments
Sales
Product performance
Inventory
Production
```

Optional NORTH//FOUND-style reporting:

```text
Collection performance
Sell-through
Units produced
Units sold
Units remaining
Production cost
Gross profit
Repair history
Garment ownership
```

Calculations should work offline wherever possible.

---

# 27. DASHBOARD

The dashboard should be modular.

Core:

```text
Orders due
Orders in progress
Orders ready
Outstanding balances
Today's revenue
Today's expenses
```

Optional:

```text
Low stock
Active production
Production due
Collection performance
Pre-orders
Repairs
```

Do not create a separate dashboard implementation for NORTH//FOUND.

Use feature configuration to determine which widgets appear.

---

# 28. UI REQUIREMENTS

Every new module requires:

- list screen
- search/filter
- create
- edit where appropriate
- detail view
- loading state
- empty state
- error state
- offline behaviour
- mobile-friendly layout

Follow the existing design system.

Do not introduce a competing component library or visual language without necessity.

The application is designed for phone-first operational use.

---

# 29. RXDB REQUIREMENTS

For every new synced table:

1. Add TypeScript type
2. Add RxDB schema
3. Add appropriate indexes
4. Add collection
5. Add replication configuration
6. Add write-layer functions
7. Add tests
8. Add migration/versioning where required

IMPORTANT:

Inspect the current RxDB schema implementation before adding fields.

Do not blindly add internal synchronization fields that RxDB reserves.

Follow the existing repository conventions.

---

# 30. SUPABASE REQUIREMENTS

For every new tenant-owned table:

1. migration
2. primary key
3. `shop_id`
4. timestamps
5. indexes
6. RLS
7. tenant policies
8. constraints
9. appropriate foreign keys
10. replication compatibility

RLS must be tested with multiple tenants.

---

# 31. TENANT-SCOPED UNIQUENESS

Prefer:

```sql
UNIQUE(shop_id, sku)
```

rather than:

```sql
UNIQUE(sku)
```

Similarly:

```sql
UNIQUE(shop_id, batch_number)
```

rather than globally unique batch numbers.

Business identifiers should normally belong to a tenant namespace.

---

# 32. SEED DATA

Create reusable tenant fixtures.

Suggested structure:

```text
src/dev/fixtures/
    base.ts
    tailor.ts
    rental.ts
    northfound.ts
```

Do not create random disconnected records.

Relationships must be internally consistent.

For example:

If an order is fully paid:

```text
sum(payments) = order total
```

If a rental is returned:

```text
returned status
+
appropriate return timestamp
```

If inventory decreases:

```text
corresponding inventory movement exists
```

---

# 33. REQUIRED TENANT FIXTURES

At minimum create:

## Generic Tailor

Include:

- clients
- measurements
- custom orders
- partial payments
- full payments
- overdue orders
- completed orders
- expenses
- sales
- staff

## Rental Business

Include:

- catalogue
- rental products
- reservations
- rental orders
- deposits
- returns
- damage
- refunds
- inventory

## NORTH//FOUND

Include:

- collections
- products
- variants
- SKUs
- materials
- suppliers
- production batches
- production costs
- inventory
- pre-orders
- corporate orders
- repairs
- individual garment units
- garment ownership
- garment passport data

---

# 34. EDGE CASE SEED DATA

Ensure the fixture contains:

- client with no order
- client with many orders
- unpaid order
- partially paid order
- fully paid order
- refunded payment
- voided payment
- discount
- cancelled order
- overdue order
- ready order
- rental deposit
- returned rental
- damaged rental
- walk-in sale
- expense
- low stock
- inventory adjustment
- production rejection
- pre-order
- corporate order
- repair
- limited-edition garment
- sold garment
- available garment
- garment under repair
- identical product names across different tenants
- identical customer names across different tenants

The last two are intentional multi-tenancy tests.

---

# 35. TESTING

Do not consider a feature complete because the UI renders.

Every phase must include appropriate:

### Unit tests

Business rules and calculations.

### Schema tests

RxDB/Postgres validation.

### Write tests

Mutation behaviour.

### RLS tests

Tenant isolation.

### Integration tests

Replication where practical.

### UI tests

Critical workflows.

---

# 36. REQUIRED RLS TESTS

Create at least:

```text
Tenant A
Tenant B
```

Test:

```text
Tenant A → own clients        ALLOW
Tenant A → Tenant B clients  DENY

Tenant A → own orders         ALLOW
Tenant A → Tenant B orders    DENY

Tenant A → own payments       ALLOW
Tenant A → Tenant B payments  DENY

Tenant A → own inventory      ALLOW
Tenant A → Tenant B inventory DENY

Tenant A → own products       ALLOW
Tenant A → Tenant B products  DENY

Tenant A → own production     ALLOW
Tenant A → Tenant B production DENY
```

Also test aggregate/reporting views.

---

# 37. CONFLICT HANDLING

Do not invent a conflict-resolution strategy without inspecting the existing replication implementation.

Determine how the current application behaves when:

```text
Device A changes record offline
Device B changes same record offline
Both reconnect
```

Document the behaviour.

If deterministic conflict handling is missing, implement the smallest safe strategy appropriate to the existing architecture.

---

# 38. MIGRATIONS

Never rewrite existing production migrations simply to make development easier.

Create sequential migrations.

Inspect the latest migration number first.

Potential future migrations:

```text
tenant_settings
tenant_features
catalogue
suppliers_materials
inventory
production
collections
garment_units
repairs
measurement_history
```

Use the actual repository migration numbering.

---

# 39. BACKWARD COMPATIBILITY

Existing users/data must continue to work.

Existing:

```text
clients
measurements
orders
payments
sales
expenses
```

must not be broken by the new modules.

Existing screens should remain functional unless there is a clear UX improvement.

If a schema changes, provide a migration.

---

# 40. DO NOT OVERENGINEER

Do not introduce:

- microservices
- unnecessary backend APIs
- event buses
- Kubernetes
- GraphQL
- unnecessary state-management libraries
- duplicate database layers
- separate NORTH//FOUND application
- complex RBAC before it is required

The current architecture is deliberately lightweight.

Keep it that way.

---

# 41. DOCUMENTATION

When implementing a new major capability, update the relevant project documentation.

At minimum document:

- database model
- tenant behaviour
- feature flag
- offline behaviour
- sync behaviour
- RLS
- seed data
- important business rules

Do not allow the code and documentation to diverge.

---

# 42. DEVELOPMENT WORKFLOW

For each phase:

### Step 1

Inspect current implementation.

### Step 2

State what already exists and what must change.

### Step 3

Design the smallest compatible implementation.

### Step 4

Implement database migration.

### Step 5

Implement RLS.

### Step 6

Implement TypeScript models.

### Step 7

Implement RxDB schema/collection.

### Step 8

Implement replication.

### Step 9

Implement write layer.

### Step 10

Implement UI.

### Step 11

Implement seed data.

### Step 12

Implement tests.

### Step 13

Run:

```bash
pnpm verify
```

### Step 14

Fix all failures.

### Step 15

Review for tenant leakage and offline regressions.

### Step 16

Only then move to the next phase.

---

# 43. AGENT OUTPUT AFTER EACH PHASE

After completing a phase, provide:

```text
PHASE COMPLETED

Implemented:
- ...
- ...
- ...

Database:
- migrations
- tables
- indexes
- RLS

Frontend:
- screens
- components

RxDB:
- collections
- schemas

Writes:
- ...

Tests:
- ...

Verification:
- typecheck: PASS/FAIL
- tests: PASS/FAIL
- build: PASS/FAIL

Known limitations:
- ...

Next recommended phase:
- ...
```

Do not claim something is verified if it was not actually tested.

---

# 44. PRIORITY ORDER

When forced to choose between features, prioritize:

```text
1. Data integrity
2. Tenant isolation
3. Offline reliability
4. Synchronization
5. Existing functionality
6. Core business workflows
7. Reporting
8. UX polish
9. NORTH//FOUND-specific enhancements
```

NORTH//FOUND branding must never take priority over the underlying generic architecture.

---

# 45. FINAL PRODUCT MODEL

The target architecture is:

```text
                         POLYSTER
                            │
                    MULTI-TENANT CORE
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
       TAILOR             RENTAL          APPAREL
          │                 │                 │
       features          features          features
                                             │
                                      NORTH//FOUND
                                        tenant
                                             │
                           ┌─────────────────┼────────────────┐
                           │                 │                │
                       Collections      Garments         Passport
                           │                 │                │
                       FOUND 002         F002-B01-017       QR
```

The goal is NOT:

> Build an application for NORTH//FOUND.

The goal is:

> **Build Polyster so well that NORTH//FOUND becomes an excellent tenant of it.**

---

# 46. FINAL ACCEPTANCE CRITERIA

The implementation is successful when the same running Polyster application can simultaneously support:

### Traditional Tailor

```text
Customers
Measurements
Custom Orders
Payments
Expenses
Reports
```

### Rental Business

```text
Catalogue
Rental Inventory
Reservations
Deposits
Returns
Damage
Refunds
```

### NORTH//FOUND

```text
Customers
Orders
Catalogue
Collections
Suppliers
Materials
Inventory
Production
Production Costing
Pre-orders
Corporate Orders
Repairs
Individual Garments
Garment Identity
Garment Passport
Collection Reporting
```

with:

```text
one codebase
one application
one database
one authentication architecture
tenant isolation
offline-first operation
synchronization
```

and without NORTH//FOUND-specific logic leaking into the generic domain.

---

# 47. START HERE

Do not immediately implement all phases.

Your first task is:

## PHASE 0 — AUDIT AND VERIFY

1. Inspect the existing repository.
2. Identify the current architecture.
3. Identify what from this specification already exists.
4. Identify gaps.
5. Run the existing test suite.
6. Run typecheck.
7. Run production build.
8. Verify Supabase configuration.
9. Verify RLS.
10. Create two test tenants.
11. Test tenant isolation.
12. Test offline writes.
13. Test synchronization.
14. Test existing workflows.

Then produce a concise implementation report.

**Do not modify unrelated code during the audit.**

After the audit, implement **Phase 1 only**.

Do not proceed to Phase 2 until Phase 1 passes verification.

The existing repository is the foundation. **Extend it; do not replace it.**
