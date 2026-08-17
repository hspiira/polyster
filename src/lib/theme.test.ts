import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  THEME_STORAGE_KEY,
  applyTheme,
  forceTheme,
  readPreference,
  resolve,
  savePreference,
  startTheme,
  watchSystemTheme,
} from './theme'

let systemPrefersDark = false
let listeners: (() => void)[] = []
let metaContent: string | null = null
let hasMeta = true

function stubEnvironment() {
  listeners = []
  const root = { dataset: {} as Record<string, string> }

  vi.stubGlobal('matchMedia', () => ({
    get matches() {
      return systemPrefersDark
    },
    addEventListener: (_: string, fn: () => void) => listeners.push(fn),
    removeEventListener: (_: string, fn: () => void) => {
      listeners = listeners.filter((l) => l !== fn)
    },
  }))

  vi.stubGlobal('document', {
    documentElement: root,
    querySelector: () =>
      hasMeta ? { setAttribute: (_: string, value: string) => void (metaContent = value) } : null,
  })

  vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => ' #0f1e52 ' }))
  return root
}

let root: { dataset: Record<string, string> }

beforeEach(() => {
  systemPrefersDark = false
  metaContent = null
  hasMeta = true
  localStorage.clear()
  root = stubEnvironment()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('readPreference', () => {
  it('follows the system when nothing has been chosen', () => {
    expect(readPreference()).toBe('system')
  })

  it('reads a stored choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    expect(readPreference()).toBe('dark')
  })

  it('falls back to system on a value it does not recognise', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'sepia')
    expect(readPreference()).toBe('system')
  })
})

describe('resolve', () => {
  it('takes an explicit choice over the system', () => {
    systemPrefersDark = true
    expect(resolve('light')).toBe('light')
    systemPrefersDark = false
    expect(resolve('dark')).toBe('dark')
  })

  it('follows the system when set to system', () => {
    systemPrefersDark = true
    expect(resolve('system')).toBe('dark')
    systemPrefersDark = false
    expect(resolve('system')).toBe('light')
  })
})

describe('applyTheme', () => {
  it('writes the resolved theme onto the root element', () => {
    applyTheme('dark')
    expect(root.dataset.theme).toBe('dark')
    applyTheme('light')
    expect(root.dataset.theme).toBe('light')
  })

  /* theme.css is the only file that decides a colour, so the status bar is
     read back out of it rather than repeated here. */
  it('syncs the status-bar colour from the stylesheet', () => {
    applyTheme('dark')
    expect(metaContent).toBe('#0f1e52')
  })

  it('does not throw when the page has no theme-color meta', () => {
    hasMeta = false
    expect(() => applyTheme('dark')).not.toThrow()
  })
})

describe('savePreference', () => {
  it('stores an explicit choice and applies it', () => {
    expect(savePreference('dark')).toBe('dark')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(root.dataset.theme).toBe('dark')
  })

  /* "System" is the absence of a choice, so it clears rather than storing a
     third value the inline bootstrap in index.html would have to know about. */
  it('clears the stored choice when going back to system', () => {
    savePreference('dark')
    systemPrefersDark = false
    expect(savePreference('system')).toBe('light')
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull()
  })

  it('still applies the theme when storage is blocked', () => {
    const original = globalThis.localStorage
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new Error('blocked')
        },
        removeItem: () => {
          throw new Error('blocked')
        },
      },
    })

    expect(savePreference('dark')).toBe('dark')
    expect(root.dataset.theme).toBe('dark')

    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: original })
  })
})

describe('watchSystemTheme', () => {
  it('follows the system while the preference is system', () => {
    watchSystemTheme()
    systemPrefersDark = true
    listeners.forEach((fn) => fn())
    expect(root.dataset.theme).toBe('dark')
  })

  /* The reason the preference is re-read rather than closed over: a pinned
     choice must survive the system changing under it. */
  it('leaves a pinned choice alone when the system changes', () => {
    savePreference('light')
    watchSystemTheme()
    systemPrefersDark = true
    listeners.forEach((fn) => fn())
    expect(root.dataset.theme).toBe('light')
  })

  it('stops listening once unsubscribed', () => {
    const stop = watchSystemTheme()
    stop()
    expect(listeners).toHaveLength(0)
  })
})

describe('startTheme', () => {
  it('applies the stored preference immediately', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    startTheme()
    expect(root.dataset.theme).toBe('dark')
  })

  it('returns a working unsubscribe', () => {
    startTheme()()
    expect(listeners).toHaveLength(0)
  })
})

describe('forceTheme', () => {
  it('pins the document dark whatever the preference says', () => {
    savePreference('light')
    forceTheme('dark')
    expect(root.dataset.theme).toBe('dark')
  })

  it('ignores applyTheme while forced', () => {
    forceTheme('dark')
    applyTheme('light')
    expect(root.dataset.theme).toBe('dark')
  })

  // The entry flow is fixed dark, but a system flip mid-signup must not repaint
  // the document light underneath it.
  it('survives a system theme change while forced', () => {
    savePreference('system')
    forceTheme('dark')
    systemPrefersDark = false
    const stop = watchSystemTheme()
    listeners.forEach((fn) => fn())
    expect(root.dataset.theme).toBe('dark')
    stop()
  })

  it('restores the stored preference when released', () => {
    savePreference('light')
    const release = forceTheme('dark')
    release()
    expect(root.dataset.theme).toBe('light')
  })

  it('restores to the system theme when the preference is system', () => {
    systemPrefersDark = true
    savePreference('system')
    const release = forceTheme('dark')
    release()
    expect(root.dataset.theme).toBe('dark')
    systemPrefersDark = false
    applyTheme('system')
    expect(root.dataset.theme).toBe('light')
  })

  it('still reports the real preference to callers while forced', () => {
    savePreference('light')
    forceTheme('dark')
    expect(applyTheme(readPreference())).toBe('light')
  })

  it('syncs the status-bar colour, so it cannot stay light behind a dark screen', () => {
    metaContent = null
    forceTheme('dark')
    expect(metaContent).toBe('#0f1e52')
  })
})
