/* Field shapes reused across schemas. 36 rather than a cuid2's 24: rows created
   before the switch carry uuids, and both have to keep validating. */
export const idField = { type: 'string' as const, maxLength: 36 }
