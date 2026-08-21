import { render } from 'preact'
import './index.css'
import { App } from './app.tsx'
import { GarmentPassport } from './screens/GarmentPassport.tsx'
import { startTheme } from './lib/theme.ts'
import { forgetLayoutOverride } from './lib/platform.ts'

// index.html already set the attribute before first paint; this keeps a
// `system` preference live without a reload.
startTheme()

// The layout picker is gone; release anyone it pinned to the wrong design.
forgetLayoutOverride()

/* A garment passport is public, so it is matched before <App/> mounts and never
   touches the provider or the router the rest of the app assumes. */
const passportMatch = window.location.pathname.match(/^\/passport\/([^/]+)\/?$/)

// Dev-only console tools, never bundled in production. Seed with
// `__polyster.getDatabase().then(db => __polyster.seedAll(db))`, then reload.
if (import.meta.env.DEV) {
  const { getDatabase } = await import('./db/dexie/database.ts')
  const { getSupabase } = await import('./lib/supabaseClient.ts')
  const fixtures = await import('./dev/fixtures/index.ts')
  ;(window as unknown as { __polyster: unknown }).__polyster = { getDatabase, getSupabase, ...fixtures }
}

/* Paint something when the app fails to mount: a throw in the first render
   otherwise leaves a white page. Plain DOM -- whatever broke may be the framework. */
function showFatal(error: unknown): void {
  const root = document.getElementById('app')
  if (!root) return

  const message = error instanceof Error ? error.message : String(error)

  // In development this is nearly always a build-tooling problem rather than a
  // bug in the app, and the first thing to try is not obvious from the error.
  const devHint = import.meta.env.DEV
    ? `<p style="margin:0 0 12px">In development, a stale dependency cache is the usual cause,
         especially just after dependencies or <code>vite.config.ts</code> changed.
         Stop the dev server, run <code>rm -rf node_modules/.vite</code>, and start it again.</p>`
    : `<p style="margin:0 0 12px">Reloading the app is worth trying. Nothing saved on this
         device has been lost.</p>`

  root.innerHTML = `
    <div style="min-height:100svh;display:flex;align-items:center;justify-content:center;
                padding:16px;font-family:system-ui,sans-serif;background:#f9fafb">
      <div style="max-width:32rem;color:#111827">
        <h1 style="margin:0 0 8px;font-size:1.125rem;font-weight:600">The app did not start</h1>
        ${devHint}
        <pre style="overflow-x:auto;border-radius:8px;background:#111827;color:#f3f4f6;
                    padding:12px;font-size:12px;margin:0">${escapeHtml(message)}</pre>
      </div>
    </div>`
}

function escapeHtml(value: string): string {
  const el = document.createElement('div')
  el.textContent = value
  return el.innerHTML
}

const root = document.getElementById('app')

if (!root) {
  // index.html and this file disagree. Nothing to render into.
  document.body.textContent = 'Could not start: no #app element in the page.'
} else {
  try {
    render(passportMatch ? <GarmentPassport token={passportMatch[1]!} /> : <App />, root)
  } catch (error) {
    console.error('[app] failed to mount:', error)
    showFatal(error)
  }

  // A throw in an effect lands here, not the try/catch above. Acted on only if
  // the root is still empty, so a stray error cannot blank a working screen.
  window.addEventListener('error', (event) => {
    if (root.childElementCount === 0) showFatal(event.error ?? event.message)
  })
}
