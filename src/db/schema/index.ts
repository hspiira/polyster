/* RxDB schemas mirroring the Postgres tables, split by aggregate. Never declare
   `_modified` here: dev-mode rejects it, so it breaks dev while build stays green. */
export * from './shop'
export * from './features'
export * from './staff'
export * from './clients'
export * from './measurements'
export * from './orders'
export * from './orderUnits'
export * from './payments'
export * from './messages'
export * from './sales'
export * from './expenses'
