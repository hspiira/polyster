Cloth Tailoring & Rental Tracker PWA
Implementation Research Notes

Prepared for Ahum, July 30, 2026
Revised July 30 to remove shop-specific framing: this is designed as one generic product for cloth tailoring/rental businesses, used by different shop owners in different ways (solo, or with staff; rental-enabled, or tailoring/sales only), not two custom builds.

A note on sources: several results below came from SEO-style blogs (digitalapplied.com, deepclick.com, precisionaiacademy.com, cssauthor.com, pkgpulse.com, and similar) whose editorial authority I cannot verify. Where a claim matters for a real decision, I have cross-checked it against a primary source (MDN, official docs, GitHub) and noted that separately. Please treat the blog-sourced material as directional, not authoritative.


1. Offline-first PWA architecture

Three layers work together in a well-built offline-first PWA:

A service worker handles the app shell (HTML/CSS/JS) with a cache-first strategy, so the app loads instantly even with no connection. A local database (not the Cache API) holds structured business data. A write queue pattern (often called Background Sync) captures changes made while offline and replays them once a connection returns.

One MDN-verified installability requirement worth knowing before building: a service worker registered at /js/sw.js can only control pages under /js/ by default. Register it from the site root with an explicit scope of '/' or every install will silently fail to intercept requests outside that folder. This is a common real bug, not a hypothetical.

Manifest requirements (confirmed via MDN): name or short_name, a 192px and 512px icon, start_url, and a display mode (e.g. "standalone"), served over HTTPS (or localhost during development). Chromium browsers (Chrome, Edge, Samsung Internet) use this manifest directly for the install prompt.

iOS Safari is the outlier: it ignores most manifest fields for icon/name purposes. Without an apple-touch-icon meta tag and apple-mobile-web-app-title, iOS shows a generic screenshot thumbnail and the raw domain as the app name after install. Since iOS 16.4, install happens via Share -> Add to Home Screen rather than an automatic prompt. Both Android and iPhone users are expected among shop owners using this app, so both need explicit testing, not just Chrome.

Sources:
- Making PWAs installable -- MDN (https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)
- Offline-First PWAs: Service Worker Caching Strategies (https://www.magicbell.com/blog/offline-first-pwas-service-worker-caching-strategies)
- Offline-First PWA Patterns (https://rohitraj.tech/en/notes/pwa-offline-sync)


2. Local data storage: what to actually use

UPDATE (July 30): the requirement changed after this section was first drafted. Some shops using this app run with more than one person needing shared, synced data across devices, not single-device storage. This rules out a plan of plain Dexie.js with no sync layer. See section 9 for the settled recommendation -- this section is kept for the underlying comparison, which is still the right starting point.

Compared three local-storage-only options:

Dexie.js -- a thin, promise-based wrapper around IndexedDB (the browser's built-in database). No server, no sync engine, simple query API. Good fit only when there's one device and one user with no need to reconcile changes from anyone else.

RxDB -- adds real-time reactivity and, critically, built-in multi-device sync with conflict resolution via replication plugins (Supabase, Firestore, GraphQL, CouchDB). Meaningfully heavier to set up than Dexie alone, but this is the piece that solves the multi-staff case.

WatermelonDB -- built for React/React Native, backed by SQLite, scales to very large record counts. Overkill for what will likely be a few thousand orders a year per shop, and sync is a protocol you build yourself rather than a ready plugin.

Original recommendation (superseded): Dexie.js alone, on the assumption of one device per shop. Now superseded -- see section 9.

Sources:
- RxDB alternatives comparison (https://rxdb.info/alternatives.html)
- Dexie.js vs RxDB vs WatermelonDB overview (https://www.pkgpulse.com/blog/tinybase-vs-watermelondb-vs-rxdb-offline-first-databases-2026) -- blog source, directional only
- The Architecture of Local-First Web Development -- Smashing Magazine (https://www.smashingmagazine.com/2026/05/architecture-local-first-web-development/)


3. What similar businesses already use

Commercial tailor-shop software (Orderry, GarmentDesk, ThreadNix, Atelierware, Darziware, and others) converges on the same core feature set already designed independently here: a single order list with status (pending/in progress/ready/paid), a measurement profile per client (sometimes with photos), deposit + balance tracking, and delivery/pickup date scheduling. This is a reasonable sanity check that the data model (Client -> Measurement profile -> Order -> Payments) is not missing an obvious industry-standard piece.

On the rental side, there isn't a widely-used open-source clothing-rental project mature enough to borrow architecture from directly -- results were mostly generic inventory/rental-property platforms or small student projects. Nothing to adopt wholesale here; the general order + deposit + return-date model already in use by the shops this app is built for is the right basis.

Sources:
- Orderry tailor shop software (https://orderry.com/tailor-shop-software/)
- GarmentDesk (https://garmentdesk.com/)
- GitHub rental/inventory-management topic pages (https://github.com/topics/rental-management)


4. Case study lessons (Starbucks, Twitter Lite, Flipkart Lite)

These are well-documented, frequently cited PWA case studies, though the specific figures below come from secondary summaries rather than Starbucks'/Twitter's own engineering blogs, so treat the numbers as approximate rather than exact.

Starbucks built their ordering PWA specifically so customers in low-connectivity or emerging markets could browse the menu and build an order while offline, syncing once a connection returned. Reported results (from secondary sources, not independently verified here): roughly double the daily active users on the PWA versus before, and a PWA size described as over 99% smaller than their native iOS app. Twitter Lite reported a 75% increase in Tweets sent and a 20% drop in bounce rate after launching their offline-capable PWA aimed at users on slow networks. Flipkart and Jumia built lightweight PWAs for the same reason: unreliable mobile networks in their core markets.

The common thread relevant to this project: offline-first isn't just a nice-to-have for spotty wifi, it's the standard pattern for apps built for markets with inconsistent connectivity -- which matches the shop-floor use case here directly. The lesson to carry forward is architectural, not the specific numbers: local writes first, sync/send when connectivity allows, keep the initial load lightweight.

Sources (secondary summaries, approximate figures):
- PWA case studies overview (https://moldstud.com/articles/p-pwa-developer-success-stories-and-case-studies)
- PWA e-commerce examples (https://elogic.co/blog/best-examples-of-progressive-web-apps-pwa-in-retail-and-ecommerce/)


5. Push notifications: what's actually reliable

This is a real constraint, not a detail to gloss over.

Android Chrome: full web push support, works like a native app once installed.

iOS Safari: push notifications only work if the PWA was installed via Share -> Add to Home Screen (not from a regular Safari tab), and only on iOS 16.4+. One blog source claimed EU-region iPhones lost this due to a regulatory change forcing an alternate browser-choice screen -- this could not be independently verified against Apple's own documentation, so treat it as unconfirmed. Only relevant if a shop using this app operates in the EU.

Given this, and given the app is meant to be genuinely offline-capable (no guaranteed connection to even receive a push), the recommendation is to not depend on OS-level push notifications for the core "due today" reminder. An in-app dashboard banner computed from local data (no network required) is more reliable for this use case and works identically on both platforms. Push can be a later enhancement for shops that do have steady connectivity, not a foundation to build on.

Sources:
- PWA iOS Limitations and Safari Support (https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide) -- blog source
- Reliable Push Notifications on PWAs for iOS and Android (https://edana.ch/en/2026/03/19/push-notifications-on-web-applications-pwa-is-it-really-reliable-on-ios-and-android/) -- blog source, EU claim unverified


6. Data safety: the real risk of "local-only"

This is the most important finding from this research, and it changes the earlier recommendation slightly.

Browser-stored data (IndexedDB) is not guaranteed permanent. If the user switches browsers, clears site data, or the OS reclaims storage space under pressure, the data can be deleted with no warning. This is a documented, known limitation of client-side storage generally, not an edge case.

Mitigation options found:
- Manual export/import to JSON is a well-established pattern (confirmed via a maintained open-source library, indexeddb-export-import, and multiple independent implementations) -- essentially a "Backup my data" button that downloads a dated file, and a matching "Restore" button.
- The File System Access API would let the app write directly to a chosen file (e.g. one synced by Google Drive), but it's Chrome-desktop only -- not available on the mobile browsers most shop owners will actually use day to day. Not viable as the primary mechanism here.

Recommendation: build an explicit "Export backup" button from day one (downloads a JSON file the owner can save to Google Drive, email to themselves, or share to WhatsApp), and consider a soft in-app reminder ("last backup: 12 days ago") rather than relying on the browser to keep data safe indefinitely. This is cheap to build and meaningfully reduces the risk of losing months of order/payment history.

Sources:
- indexeddb-export-import (GitHub, maintained library) (https://github.com/Polarisation/indexeddb-export-import)
- The PWA Data Trap -- Scott Kuhl (https://scottkuhl.medium.com/the-pwa-data-trap-5bd94d546348)


7. WhatsApp Business integration

Two genuinely different approaches exist here, with a real architectural trade-off between them.

Option A -- click-to-chat links (wa.me), no backend, no cost, works today
A link in the format https://wa.me/<phone>?text=<url-encoded message> opens a chat in WhatsApp (or WhatsApp Business) with the message pre-filled, ready for a human to review and hit send. No API signup, no per-message cost, no rate limit, and it fits a local-first architecture with zero extra infrastructure. The trade-off: it's not automatic -- a staff member still taps "Send" for each message. For a small shop this is likely fine: an order-detail screen button like "Message client on WhatsApp" that pre-fills "Hi [name], your order is ready for pickup" is a very low-effort, high-value addition.

Option B -- WhatsApp Business Platform (Cloud API), automated, requires a backend
This is Meta's official API for sending messages programmatically without a human tapping send -- e.g. an automatic daily batch of "pickup due tomorrow" reminders. Two real constraints found: it requires a server component (the access token cannot safely live in client-side PWA code, and Meta's API isn't designed for direct browser calls), and it has a real cost model. As of the 2025/2026 pricing change, Meta bills per delivered template message rather than per conversation; utility-category messages (order updates, payment reminders) are priced well below marketing messages, and are free if sent within an active 24-hour window after the customer last messaged the business. This is workable cost-wise for small-shop volume, but it does mean a backend is required purely for this feature.

Recommendation: ship Option A (wa.me links) in v1 -- it's nearly free to add and directly useful. Option B (automated Cloud API sending) stays on the roadmap as a phase 2 decision, revisited once it's clear whether manual-tap sending is actually a bottleneck in practice for shops using this feature heavily.

Sources:
- WhatsApp click-to-chat link format (https://quadlayers.com/how-to-create-a-whatsapp-link-wa-me-with-a-pre-filled-message/)
- WhatsApp Business API Pricing 2026 (https://respond.io/blog/whatsapp-business-api-pricing) -- blog source summarizing Meta's pricing, verify current rates directly with Meta before committing to Option B


8. Multi-user sync architecture

Three real candidates for syncing data across two or more people/devices while staying offline-capable:

PouchDB + CouchDB -- the original local-first-with-sync pairing, purpose-built for exactly this problem since the mid-2010s. PouchDB runs in the browser (on top of IndexedDB), continuously and bidirectionally replicates with a CouchDB server, and keeps working through flaky connections, retrying automatically. Conflict handling is automatic via revision trees when two people edit the same record offline. The catch: someone has to run and maintain a CouchDB server (a small VPS, roughly the cost of a coffee a month, or a self-hosting toolkit like CouchDB Minihosting) -- no fully-managed free-tier equivalent turned up in this research. Most control, most operational responsibility.

Firebase Firestore -- a fully managed database with offline persistence and multi-device sync built in natively, confirmed directly in Firebase's own PWA documentation (not a blog summary). No server to run or maintain. Free tier is generous for a shop this size. Firebase Auth (email/phone + password or PIN-style flows) bolts on cleanly. Conflict handling is simpler than CouchDB's (last-write-wins per document), which is likely fine here since two staff editing the exact same order at the exact same instant is a rare event, not a routine one. Trade-off: data lives in Google's proprietary format, so there's some vendor lock-in if the app ever needed to migrate off it.

RxDB + Supabase -- RxDB (the same local-first engine considered in section 2) with its official Supabase replication plugin, syncing to a real Postgres database via Supabase's realtime layer. Gets an open, portable data format (plain Postgres, exportable/queryable with standard SQL, useful for real reporting later), Supabase's generous free tier (500MB DB, 50,000 monthly active users -- far beyond what a handful of small shops need), and Supabase Auth with row-level security to properly scope each shop's data so no shop using the app can ever see another shop's records even though they all share one app. More setup work than Firestore, but avoids being tied to a single vendor's proprietary database.

Recommendation: RxDB + Supabase. It gives real sync and offline support like Firestore, without a server to babysit like CouchDB, while keeping the data in an open format (Postgres) that's portable if the app ever needs to move providers -- and Supabase's row-level security is a clean way to keep each shop's data properly separated within one shared, multi-tenant app. Firestore remains a reasonable fallback if Supabase setup proves more friction than expected once building starts.

Auth pattern: rather than full email/password accounts (unnecessary friction for staff who'll open this app many times a day), a PIN-based login scoped per shop is a well-established retail/small-business pattern -- each staff member gets a short PIN, the app already knows which shop's data to load, and actions can still be attributed to whoever's logged in if that's ever useful (e.g. "who marked this as picked up"). This layers on top of whichever backend is chosen; it doesn't change the backend decision itself.

Cost note: this is the one place where "simple, no server" is no longer strictly true for multi-staff shops -- Supabase (or Firestore) is a managed cloud service, not something running entirely on-device. In practice it should stay within each provider's free tier at this scale, but it's worth being upfront that this is a dependency on an external service now, not a purely local app. A solo-run shop can still use the exact same architecture in "team of one" mode without anyone needing to think about sync.

Sources:
- PouchDB replication guide (https://pouchdb.com/guides/replication.html)
- Offline-First with CouchDB and PouchDB in 2025 -- Neighbourhoodie (https://neighbourhood.ie/blog/2025/03/26/offline-first-with-couchdb-and-pouchdb-in-2025)
- Use Firebase in a PWA -- official Firebase docs (https://firebase.google.com/docs/web/pwa)
- Access data offline -- official Firestore docs (https://firebase.google.com/docs/firestore/manage-data/enable-offline)
- Supabase Replication Plugin for RxDB -- official RxDB docs (https://rxdb.info/replication-supabase.html)
- Supabase pricing (https://designrevision.com/blog/supabase-pricing) -- blog source summarizing Supabase's own pricing, verify current numbers directly on supabase.com/pricing before committing
- PIN authentication for shared retail devices (https://www.oloid.com/blog/pin-authentication) -- blog source, general pattern only


9. Settled recommendation going into the build

- Product framing: one app, multi-tenant by design. Each shop is a tenant (own data, own settings, own staff), configured differently depending on whether it does rentals, how many staff use it, and what measurements it tracks -- not separate builds per shop.
- Frontend: plain PWA (HTML/CSS/JS, or a light framework) with a manifest and service worker registered at the root with scope '/'.
- Data: RxDB (local-first engine) syncing to Supabase (Postgres + realtime + auth). Every shop runs on this architecture; a solo shop simply never needs a second PIN.
- Auth: PIN-based login per staff member, scoped to their shop via Supabase row-level security, rather than full email/password accounts.
- Backup: an explicit "Export backup" option regardless of the synced backend -- protects against accidental deletion, not just device loss.
- Reminders: in-app "due today / overdue" dashboard section, not OS push notifications, since push reliability on iOS is conditional and offline-by-design apps can't guarantee delivery anyway.
- WhatsApp: wa.me pre-filled links in the order detail view for v1; Cloud API automation deferred as a phase 2 decision (it would reuse the same backend already being built for sync, which lowers the cost of adding it later).
- Icons/install: test on both an Android phone and an iPhone specifically before considering this "done" -- iOS ignores the manifest for branding and needs its own meta tags.

Decisions confirmed (July 30):
- Backend: Supabase/Postgres confirmed over Firestore. Section 8's RxDB + Supabase recommendation is the settled plan, not just a leaning.
- Multi-staff support: built in from the start via the shop/staff/PIN model, so any shop can go from solo to multi-staff at any point with zero re-architecture -- just adding another PIN under that shop.
- WhatsApp: v1 ships with Option A only (wa.me pre-filled links, manual tap to send). Option B (automated Cloud API reminders) is explicitly on the roadmap, not dropped -- revisit once the app is in use and it's clear whether manual sending is actually a bottleneck. Since Option B needs a backend and one is already being built (Supabase) for sync, adding it later is a smaller lift than it would've been in a purely local-only app.
