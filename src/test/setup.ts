/**
 * RxDB's Dexie storage needs IndexedDB, which Node does not have. fake-indexeddb
 * provides an in-memory implementation good enough to exercise the real storage
 * adapter -- which matters, because the point of these tests is to run the same
 * code path the browser runs, not a mock of it.
 */
import 'fake-indexeddb/auto'
