Cloth Tailoring & Rental Tracker PWA
Data Schema & Screen Design

Prepared for Ahum, July 30, 2026
Follows pwa-research-notes.md -- architecture decided there: RxDB (local-first) syncing to Supabase (Postgres + realtime + auth).

Revised July 30: this is one product for cloth tailoring/rental businesses generally, not two custom builds. Every shop that adopts it is a tenant on the same schema and the same app. What differs between shops -- rentals vs. no rentals, suit measurements vs. dress measurements, solo owner vs. owner-plus-staff -- is configuration each shop sets for itself, not a fork in the design. The two people this was originally scoped around are simply the first two shops using it, referred to generically below (Shop A, Shop B) only where a concrete example is useful.

This is a design document, not code. Field lists below describe intent (name, type, purpose); the actual SQL migration comes at build time.

> **Correction, 2026-07-30 (build time).** Two things in this document did not survive contact with the implementation. Both are corrected inline below and carried into ARCHITECTURE.md, which is the current record:
>
> 1. **Balances are computed client-side, not read from the Postgres view.** See section 2, `order_balances`.
> 2. **`_modified` and `_deleted` are Postgres columns only.** They are not declared in the RxDB schemas. See pwa-stack-options.md section 3 for the corrected version of that claim.
>
> Where this document and ARCHITECTURE.md disagree, ARCHITECTURE.md wins. This one stays as the record of the original design reasoning.


1. Design principles behind the schema

One schema, any number of shops, kept apart by shop_id. Every shop using this app reads the same tables. What differs between shops is data, not structure -- driven by an order_type flag on each order and a configurable measurement-field list per shop, not separate tables or separate app versions per shop.

Money is derived, not stored redundantly. An order's outstanding balance is always price_total minus the sum of its payments, computed on read, rather than a stored "balance" column that could drift out of sync with reality if a payment is edited or deleted.

*Corrected at build time:* the original wording said "computed on read (a Postgres view)". The view exists and is still the right thing server-side, but the app does not read it. RxDB replicates tables, not views, so reading the view would put a network call on the order detail screen -- the screen most likely to be open with no connectivity. The app derives the same figure from the already-replicated payments, in `src/db/balances.ts`. The principle is unchanged; only where the arithmetic happens changed.

Auth is shop-level, PIN is attribution-level. Each shop gets one real Supabase account (used for Row Level Security). Staff PINs sit on top as an app-level "who's using the device right now" layer -- convenient for showing who marked an order ready, but it is a UX/attribution feature, not a hard security boundary between staff members. Worth being clear-eyed about that distinction: anyone who can unlock the device can act as any staff member whose PIN they know. If real per-person security ever matters (e.g. preventing one employee from seeing another's actions), that would need individual Supabase accounts per staff member instead -- flagging this now so it's a conscious choice, not an oversight.

Solo and multi-staff shops use the exact same model. A shop with one owner and no staff is just a shop with one row in the staff table. Nothing about the schema treats "solo" as a special case.


2. Tables

shops
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| name | text | the shop's own name, e.g. "Shop A" in these notes |
| whatsapp_number | text | for the wa.me links |
| supabase_auth_user_id | uuid | the one shared login this shop's app instance authenticates as |
| created_at | timestamp | |

Note: an earlier draft of this table included a business_type field ("tailoring_rental" vs "ladies_kids") to describe each shop's focus. Removed -- it did nothing structurally, since order_type (below) already captures what a given order actually is, order by order. A shop doesn't need to declare a fixed "type" up front; it can simply place tailor-made orders, rental orders, or straight sale orders in any mix.

staff
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| shop_id | uuid, FK -> shops | |
| name | text | |
| pin_hash | text | never store the raw PIN |
| role | text | "owner" or "staff" -- currently informational, not used to restrict actions in v1 |
| active | boolean | soft-disable a staff member without deleting their history |
| created_at | timestamp | |

clients
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| shop_id | uuid, FK -> shops | |
| name | text | |
| phone | text | used to build wa.me links |
| notes | text, nullable | free text |
| created_at | timestamp | |

measurement_fields (per-shop configuration)
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| shop_id | uuid, FK -> shops | |
| label | text | e.g. "Chest", "Bust", "Inseam" |
| unit | text | e.g. "in", "cm" |
| display_order | integer | controls form field ordering |

This is the mechanism that lets one shop show chest/waist/shoulder/sleeve fields while another shows bust/waist/hip/length -- each shop defines its own list once in Settings, and every measurement form after that reads from it. No code change needed to adjust fields later, and no assumption baked in about what kind of garments a given shop handles.

measurement_profiles
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| client_id | uuid, FK -> clients | |
| values | jsonb | { field_id: value } pairs, matching that shop's measurement_fields |
| updated_at | timestamp | |
| updated_by | uuid, FK -> staff, nullable | attribution only |

Using jsonb here (rather than one row per field) keeps this simple and avoids a join table, since the field list is small and shop-specific. Trade-off: slightly less queryable at the database level (e.g. "find all clients with chest > 42" would need a jsonb query, not a plain WHERE clause) -- not a concern for this use case, but worth knowing if reporting needs grow later.

orders
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| shop_id | uuid, FK -> shops | |
| client_id | uuid, FK -> clients | |
| order_type | text | "tailor_made", "rental", or "purchase" |
| item_description | text | e.g. "Navy 3-piece suit" |
| stage | text | "measured", "in_progress", "ready", "picked_up", "returned" |
| price_total | numeric | |
| pickup_due_date | date | |
| return_due_date | date, nullable | only meaningful when order_type = "rental" |
| catalogue_item_id | uuid, FK -> catalogue_items, nullable | phase 2 -- see section 6. Null for tailor_made orders (bespoke, no stock item involved); set for rental/purchase orders placed against a stock item. |
| notes | text, nullable | |
| created_by | uuid, FK -> staff | |
| created_at | timestamp | |
| updated_at | timestamp | |

The "returned" stage only applies to rentals; the app simply won't show that button for tailor_made or purchase orders. This is a UI-level filter on one shared stage list, not a separate workflow to maintain -- a shop that never does rentals just never sees that stage in practice.

payments
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| order_id | uuid, FK -> orders | |
| amount | numeric | |
| payment_date | timestamp | |
| method | text | "cash", "mobile_money", "bank", "other" |
| recorded_by | uuid, FK -> staff, nullable | attribution only |
| notes | text, nullable | |

order_balances (Postgres view, not a table)
Computed as price_total - COALESCE(SUM(payments.amount), 0) per order. Nothing writes to this directly.

*Corrected at build time.* Two changes:

- **Server-side only.** The original "joined for convenience wherever a balance needs to be displayed" is not how the app uses it, for the offline reason given in section 1. The view is for reporting and ad-hoc SQL; the UI uses `src/db/balances.ts`, which applies the same two rules (soft-deleted payments excluded, no payments means zero rather than null) and is unit-tested against them.
- **`security_invoker = on` is required on the view.** A Postgres view runs with its owner's privileges by default, and the migration is run from the SQL editor as a role that bypasses RLS. Without that setting the underlying orders/payments policies are not applied to the caller, and any authenticated shop can read every other shop's balances through the view. This is a tenant-isolation hole, not a tuning detail, and it is why the Phase 0 checklist tests isolation against the view specifically and not only against the base tables.

Optional, worth flagging but not required for v1: an order_stage_history table (order_id, from_stage, to_stage, changed_by, changed_at) would give a full audit trail of who advanced an order through which stage and when. Cheap to add now, awkward to retrofit later if it turns out to matter (e.g. resolving a "who told the client it was ready" dispute). Worth a quick decision before building rather than adding after the fact.


3. Row Level Security approach

Every table except shops carries shop_id (directly or via a join to orders/clients). RLS policies restrict all reads/writes to rows where shop_id matches the currently authenticated Supabase user's shop -- since each shop authenticates as its own single Supabase account, this cleanly guarantees no shop using the app can ever see or accidentally modify another shop's data, without the app itself needing to enforce that boundary in application code.


4. Catalogue module -- designed now, built in phase 2

Decided July 30: core order/client/payment tracking ships first and gets used for real before the catalogue is added, so v1 stays small and testable. But the catalogue's data shape is designed now, alongside orders, so the order table above already includes the field it needs (catalogue_item_id) rather than requiring a schema rework later.

Scope: the catalogue applies only to rental and purchase-from-stock orders. Tailor-made orders stay exactly as designed -- bespoke, one order, one garment, no catalogue involved.

Stock model confirmed: shops typically hold multiples of the same design/size (e.g. three identical navy suits, size 40R), not one-of-a-kind pieces. So the catalogue tracks item types with a quantity count, not individual physical garments. This is simpler to enter and maintain than tracking each piece separately, at the cost of not distinguishing, say, "suit #2 has a small stain" from "suit #1" -- a reasonable trade-off given how the stock actually works, and one that can be added later (e.g. a serial/tag number field) without changing this overall shape if it turns out to matter.

catalogue_items
| Field | Type | Notes |
|---|---|---|
| id | uuid, PK | |
| shop_id | uuid, FK -> shops | |
| name | text | e.g. "Navy 3-piece suit" |
| category | text | e.g. "Suit", "Gown", "Kids wear" -- free text, shop-defined |
| size | text | |
| photo_url | text, nullable | stored via Supabase Storage, which is already part of the chosen backend |
| listing_type | text | "rental", "sale", or "both" |
| rental_price | numeric, nullable | |
| sale_price | numeric, nullable | |
| quantity_total | integer | how many the shop owns of this exact item/size |
| condition_notes | text, nullable | |
| active | boolean | soft-hide retired items without deleting rental history |
| created_at | timestamp | |

Availability logic (computed, not stored): for a rental order type, availability over a given date window = quantity_total minus the count of other active rental orders on this catalogue_item_id whose pickup_due_date/return_due_date ranges overlap that window. This means the app can answer "do we have one free for these dates" even for advance bookings, not just "is one free right now." For purchase orders, the item simply leaves stock -- quantity_total decrements permanently (or a running quantity_sold count is kept and subtracted, whichever proves easier to reconcile against physical stock counts in practice).

Sources: this section is original design work, not sourced from external research -- flagging that plainly, since most of the rest of this document cites specific sources and this section doesn't.


5. Screens

Every shop gets the same screen set; differences are driven entirely by shop config (measurement_fields) and order_type (rental fields/stage only appear where relevant), never by a separate app build.

v1 screens:

1. Staff picker ("Who's working?") -- shown after the shop-level login, a row of staff names/avatars, tap + enter PIN. Sets who gets attributed to actions for this session. Skippable/single-tap for a shop with only one active staff member.

2. Dashboard -- the first real screen. Sections: "Due today," "Due this week," "Overdue balances," and a quick count of orders by stage (e.g. "3 ready for pickup," "5 in progress"). This is the in-app replacement for push notifications decided in the research doc -- fully computed from local/synced data, no network dependency to see it.

3. Clients -- searchable list, "+ New client" button. Tapping a client opens client detail.

4. Client detail -- measurement profile (form fields pulled from that shop's measurement_fields config, editable in place) above a list of that client's past and current orders, each tappable into order detail. "+ New order for this client" button.

5. New/edit order -- client (pre-filled if coming from client detail, otherwise searchable picker), order type, item description, price, pickup date, return date (only shown if order type is rental), notes. In v1, item_description stays free text; phase 2 adds the option to pick from the catalogue instead (see below).

6. Order detail -- the most-used screen day to day. Stage shown as a row of buttons/steps, current stage highlighted, tap the next one to advance (e.g. "Measured" -> tap "In progress"). Payment section: running balance at the top, list of payments made, "+ Add payment" button. "Message client on WhatsApp" button that builds a wa.me link with stage-appropriate pre-filled text (e.g. a ready-for-pickup message when stage = ready, or a balance reminder if overdue and unpaid).

7. Reports (light, v1) -- total collected this week/month, count of outstanding balances and their total, count of orders by stage. Not a full analytics suite -- just enough for a shop owner to sanity-check the week at a glance.

8. Settings -- shop name and WhatsApp number, measurement field list (add/reorder/remove), staff list and PIN management, "Export backup" (from the research doc's data-safety recommendation).

Phase 2 screens (catalogue):

9. Catalogue -- searchable/filterable grid of catalogue items (photo, name, size, price, "X of Y available" for the selected dates), "+ New item" button. Tapping an item opens item detail.

10. Catalogue item detail -- photo, details, availability by date, rental/edit history, "+ New rental order" / "+ New sale order" button that opens the order form pre-filled with this item.

11. New/edit order (phase 2 update) -- gains a "pick from catalogue" option alongside free text, which pre-fills item description, price, and checks availability for the chosen dates before letting the order be saved.

12. Settings addition -- catalogue item management (add/edit items, upload photos, retire items).


6. What's intentionally deferred

Not in this schema/screen set, flagged for a later pass if needed: order_stage_history audit trail (pending a decision), and automated WhatsApp reminders (Option B from the research doc -- confirmed on the roadmap, not v1). The rental/stock inventory gap raised earlier is no longer deferred -- it's designed in section 4 above and scheduled for phase 2, right after v1 core tracking is in real use.
