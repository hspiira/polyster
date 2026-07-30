Cloth Tailoring & Rental Tracker PWA
Stack Options

Prepared for Ahum, July 30, 2026
Follows pwa-research-notes.md (architecture: RxDB + Supabase) and pwa-schema-and-screens.md (data model and screens). This document picks the concrete tools that implement that architecture.


1. Frontend framework -- the one real open fork

Everything else in this document has a fairly clear recommendation. This one is a genuine trade-off worth your input rather than a default I should just pick.

Svelte -- compiles components to plain JavaScript at build time rather than shipping a runtime framework, which produces the smallest bundle of the options compared (roughly 7KB in one head-to-head benchmark, versus Preact's build coming in noticeably larger in the same comparison, though I'd treat that specific Preact figure as benchmark-dependent rather than a fixed rule -- bundle size varies a lot with how a project is set up). Given the earlier research finding that offline-first apps for low-connectivity users benefit directly from a smaller initial download (the Starbucks/Twitter Lite case studies), Svelte is the stronger technical fit. Trade-off: smaller ecosystem than React, fewer tutorials, fewer developers available if you ever want to hand this to someone else to maintain or extend.

Preact -- a 3KB-core React-compatible library. Slightly larger runtime than Svelte but a much bigger ecosystem (most React tutorials, libraries, and AI coding help apply directly, since the API is nearly identical to React). Reasonable middle ground if long-term maintainability by someone other than me matters more than shaving a few extra kilobytes off the download.

Plain vanilla JS (no framework) -- smallest possible footprint for very simple pages, but this app has enough interactive state (staff PIN sessions, live-updating dashboards, forms with conditional fields) that hand-rolling that without a framework tends to get messy fast. Not recommended here.

My lean: Preact, specifically because you or whoever helps you maintain this later will have an easier time finding help, examples, and AI coding assistance for a React-shaped API than for Svelte's more specialized syntax -- and the bundle size difference in practice, once real app code and RxDB are added, is smaller than the isolated framework benchmark suggests. But this is genuinely your call to make, not mine.

Sources:
- Preact or Svelte? An Embedded Widget Use Case -- Sentry Engineering (https://sentry.engineering/blog/preact-or-svelte-an-embedded-widget-use-case/)
- JS framework build-size comparison, GitHub (https://github.com/MarioVieilledent/js-framework-comparison) -- raw benchmark repo, numbers are context-dependent


2. Build tooling -- settled

Vite, regardless of which framework is chosen above -- it has official templates for vanilla, Preact, Svelte, React, and others, so this decision doesn't depend on section 1.

vite-plugin-pwa handles manifest and service worker generation, built on top of Google's Workbox library. Default mode (generateSW) auto-generates a complete service worker from configuration, which is enough for this app's needs -- no need for the more manual injectManifest mode unless custom service worker logic comes up later.

Sources:
- vite-plugin-pwa Workbox integration -- official docs (https://vite-pwa-org.netlify.app/workbox/)


3. Local data layer -- settled, with one schema addition to flag

RxDB, as decided in the research doc, using the Dexie.js-based RxStorage adapter -- this is the free option and is explicitly recommended by RxDB's own docs as the right default for projects at this scale. There's a faster, smaller "premium IndexedDB" storage adapter RxDB sells for production use (their docs claim up to 36% smaller build size and better read/write performance), but I could not find specific pricing in this research -- worth checking rxdb.info/premium directly if performance ever becomes a real issue, but not something to pay for up front on a guess.

Schema addition required for replication to work: every table that syncs through the RxDB-Supabase plugin needs a _modified timestamp column (so the replication protocol can detect what changed) and a _deleted boolean flag for soft deletes (rows can't just be hard-deleted from Supabase, since other devices may not have replicated that deletion yet). This applies to every table in pwa-schema-and-screens.md except the append-only ones like payments, where thinking through whether soft-delete matters is worth a moment -- a mistaken payment entry might be better corrected by voiding/reversing it than deleting it outright anyway, which the _deleted flag handles naturally.

Sources:
- RxStorage Dexie.js -- official RxDB docs (https://rxdb.info/rx-storage-dexie.html)
- RxStorage IndexedDB (premium) -- official RxDB docs (https://rxdb.info/rx-storage-indexeddb.html)
- Supabase Replication Plugin for RxDB -- official RxDB docs (https://rxdb.info/replication-supabase.html)


4. Backend -- settled (from research doc)

Supabase: Postgres database, Auth (used for the one-account-per-shop login underneath the PIN layer), Realtime (powers the live sync), and Storage (for catalogue item photos in phase 2 -- confirmed as part of the same platform, no separate service needed for image hosting).


5. Styling

Tailwind CSS -- utility classes written directly in markup, and its build step removes any class not actually used, so it doesn't bloat the bundle despite the large utility library it draws from. Widely documented, works with any of the frontend options in section 1. This is a mild preference rather than a hard technical requirement -- plain hand-written CSS would also work fine at this app's scale -- but Tailwind tends to be faster to build consistent mobile-first layouts with, which matters given every screen here needs to work well on a phone.


6. Hosting -- settled

Cloudflare Pages over Vercel or Netlify. The deciding factors: unlimited bandwidth on the free tier (Vercel and Netlify both cap free bandwidth at 100GB/month, after which overage billing kicks in), and one of the fastest global CDN footprints among the three, which matters directly for initial load speed in the lower-connectivity conditions this app is designed around. The unlimited-bandwidth point also removes a real risk: a free-tier app that unexpectedly goes viral or gets heavy use shouldn't be able to generate a surprise bill on a hosting platform with usage-based overages.

Sources:
- Static site hosting comparison 2026 (https://blog.vibecoder.me/vercel-vs-netlify-vs-cloudflare-pages) -- blog source, cross-checked against multiple similar comparisons in this search, all agreeing on the bandwidth/CDN points above


7. Settled stack summary

- Build tool: Vite
- Frontend framework: Preact recommended, Svelte as the leaner alternative -- your call (section 1)
- PWA tooling: vite-plugin-pwa (Workbox-based)
- Local data: RxDB with Dexie.js storage adapter (free tier)
- Backend: Supabase (Postgres, Auth, Realtime, Storage)
- Styling: Tailwind CSS
- Hosting: Cloudflare Pages

Open question before scaffolding starts: Preact or Svelte (section 1). Everything else here is ready to build against.
