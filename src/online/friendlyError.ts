/** Maps common Postgres error codes to messages a shop owner can act on. */
export function friendlyError(error: { code?: string; message: string }): Error {
  if (error.code === '23505') {
    return new Error('That value is already used by another record in this shop.')
  }
  return new Error(error.message)
}
