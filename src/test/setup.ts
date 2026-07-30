/**
 * RxDB's Dexie storage needs IndexedDB, which Node does not have. fake-indexeddb
 * provides an in-memory implementation good enough to exercise the real storage
 * adapter -- which matters, because the point of these tests is to run the same
 * code path the browser runs, not a mock of it.
 */
import 'fake-indexeddb/auto'

/**
 * A deterministic in-memory localStorage. lib/auth.ts guards every access in a
 * try/catch, so without this the remembered-user tests would pass vacuously.
 *
 * Installed unconditionally: Node 22 exposes an experimental `localStorage`
 * global that is present but unusable unless `--localstorage-file` points
 * somewhere real, so probing for one is not enough.
 */
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
