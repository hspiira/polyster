---
name: run-polyster
description: Run, launch, or screenshot the Polyster PWA in a real browser to verify UI changes visually. Use when asked to run/start the app, take screenshots, check a screen renders, verify a redesign, or reproduce a visual bug. Drives headless Chromium via .claude/skills/run-polyster/driver.mjs.
---

# Run Polyster

Offline-first Preact + Vite PWA. No backend needed to run it: with no
Supabase env vars it starts in `local_only` mode and stores everything in
IndexedDB, so a browser is all you need.

**Nothing here is checkable from the code alone.** This app renders two
entirely different shells from the same routes, its rows are sized by
tokens that compose in non-obvious ways, and `pnpm verify` renders no
pixels. Screenshot it.

Paths are relative to the repo root.

## Prerequisites

Chromium is not installed by default. Once per machine:

```bash
pnpm install
npx playwright install chromium
```

`playwright` is already a devDependency. macOS needs no extra system
packages; on a Linux container add what Chromium links against with
`npx playwright install-deps chromium`.

## Run (agent path)

Start the dev server, then drive it:

```bash
pnpm dev &
until curl -sf http://localhost:5173 >/dev/null; do sleep 1; done
node .claude/skills/run-polyster/driver.mjs
```

That sets up a shop, adds a client, and writes both shells × both themes
across the main routes to `.screenshots/` (gitignored). **Open the PNGs
and look at them** — a driver that exits 0 has proved nothing about
layout.

Narrow it while iterating:

```bash
# just the screens you changed
node .claude/skills/run-polyster/driver.mjs /settings /settings/features

# one shell, one theme
node .claude/skills/run-polyster/driver.mjs /clients --platform=phone --theme=dark
```

Flags: `--platform=phone|web|both` · `--theme=light|dark|both` ·
`--out=DIR` · `--url=URL` · `--shop=` · `--staff=` · `--no-client`.

The driver exits non-zero if the page logged a console error, and prints
the deduplicated list.

Stop the server by port — `pnpm dev &` backgrounds npm, not Vite, so
killing `$!` leaves the port held:

```bash
lsof -ti:5173 -sTCP:LISTEN | xargs -r kill
```

## Run (human path)

`pnpm dev`, open http://localhost:5173. The service worker is off in dev
on purpose (it caches hard enough to look like a code bug); turn it on
only to test install/offline behaviour with `VITE_PWA_DEV=1 pnpm dev`,
and clear site data afterwards.

## Gotchas

- **The shell is chosen by pointer type, not viewport width.**
  `src/lib/platform.ts` reads `(pointer: fine)`: fine → the desktop
  `WebShell`, coarse → the phone `Shell`. A 390px Playwright context
  *without* touch emulation still renders the desktop rail, squeezing
  content to ~175px and truncating every label — which looks exactly
  like a CSS bug you did not write. The driver uses
  `devices['Pixel 7']` to get `hasTouch`/`isMobile`. Resizing the
  viewport alone will never switch shells.

- **There is no seed button.** The README's "Seed sample shop data"
  belonged to an entry flow that has been replaced. The driver walks the
  real signup: *Set up my shop* → two text fields → *Start taking
  orders*. `src/dev/fixtures/` exists but is not wired to any UI.

- **`input[type="text"]` matches nothing.** The app's inputs carry no
  `type` attribute, so the attribute selector finds zero elements even
  though `el.type` reads `"text"`. Use `input:not([type="search"])`.

- **Each browser context starts with an empty IndexedDB**, so every
  context re-runs setup. Two contexts (phone + web) means two shops.
  That is why the driver sets up per context rather than once.

- **The driver must live inside the repo.** Node resolves `playwright`
  by walking up to `./node_modules`; a copy in `/tmp` dies with
  `ERR_MODULE_NOT_FOUND`.

- **Theme is a `data-theme` attribute on `<html>`**, bootstrapped inline
  in `index.html` and stored under `polyster.theme`. There are no
  `dark:` utilities, so forcing the attribute is the only way to shoot
  dark mode. `prefers-color-scheme` alone will not do it.

- **Vite drifts off 5173** if the port is taken (`strictPort` applies
  only when `PORT` is set). Pass `--url=` if so.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Dev server not answering at …` | The driver's own check. Start `pnpm dev`, or pass `--url=`. |
| `ERR_MODULE_NOT_FOUND: playwright` | Running a copy outside the repo. Run it at its committed path. |
| `browserType.launch: Executable doesn't exist` | `npx playwright install chromium` |
| `locator.fill: Timeout` on setup | Selector drift in the entry flow. Dump `await page.locator('body').innerText()` and re-read the step. |
| Phone screenshots show a sidebar | Touch emulation lost. See the pointer gotcha above. |
| `EADDRINUSE` on `pnpm dev` | `lsof -ti:5173 -sTCP:LISTEN \| xargs -r kill` |

## Test

`pnpm verify` (typecheck + 426 unit tests + production build). It covers
no screen-level rendering — see `docs/ARCHITECTURE.md` §11. Green here
says nothing about how a screen looks.
