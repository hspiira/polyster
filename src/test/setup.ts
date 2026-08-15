/* RxDB's Dexie storage needs IndexedDB, which Node lacks. fake-indexeddb is
   good enough to exercise the real adapter rather than a mock of it. */
import 'fake-indexeddb/auto'

/* Dexie storage prints a premium ad on the first write of every worker. It is
   gated on a licence hash, not a flag, so dropping the banner is the only way. */
const warn = console.warn.bind(console)
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].includes('RxDB Open Core RxStorage')) return
  warn(...args)
}

/* Deterministic in-memory localStorage, or the remembered-user tests pass
   vacuously. Unconditional: Node's own global is present but unusable. */
const memoryStore = new Map<string, string>()

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  writable: true,
  value: {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => void memoryStore.set(key, String(value)),
    removeItem: (key: string) => void memoryStore.delete(key),
    clear: () => memoryStore.clear(),
    key: (index: number) => [...memoryStore.keys()][index] ?? null,
    get length() {
      return memoryStore.size
    },
  } as Storage,
})
