/* Field shapes reused across schemas. 36 fits a cuid2 and a legacy uuid. */
export const idField = { type: 'string' as const, maxLength: 36 }
