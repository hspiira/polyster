/**
 * The public garment passport (sections 34, 68). Mounted standalone in
 * main.tsx, outside <App/> -- an anonymous visitor scanning a QR code has no
 * shop session and no local database, so this must not touch ShopProvider,
 * RxDB, or preact-iso's router. Plain fetch, plain state, plain markup.
 */
import { useEffect, useState } from 'preact/hooks'
import { Card } from '../ui/Surface'
import { getGarmentPassport, type GarmentPassport as GarmentPassportData } from '../online/garmentPassport'

export function GarmentPassport({ token }: { token: string }) {
  const [passport, setPassport] = useState<GarmentPassportData | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getGarmentPassport(token)
      .then((result) => {
        if (!cancelled) setPassport(result)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this garment.')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div class="min-h-svh bg-stone-50 px-4 py-10 dark:bg-stone-950">
      <div class="mx-auto max-w-md">
        {passport === undefined && !error && (
          <p class="text-center text-sm text-stone-500 dark:text-stone-400">Loading...</p>
        )}

        {error && (
          <Card>
            <p class="text-sm text-stone-600 dark:text-stone-300">{error}</p>
          </Card>
        )}

        {passport === null && !error && (
          <Card>
            <p class="text-sm text-stone-600 dark:text-stone-300">
              This link does not point to a garment, or the shop it belongs to has not turned this feature on.
            </p>
          </Card>
        )}

        {passport && (
          <div class="space-y-5">
            <div class="flex items-center justify-center gap-2 text-center">
              {passport.shopLogoUrl ? (
                <img src={passport.shopLogoUrl} alt="" class="h-8 w-8 rounded-full object-cover" />
              ) : null}
              <span class="text-sm font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
                {passport.shopName}
              </span>
            </div>

            {passport.collectionCoverImageUrl && (
              <img
                src={passport.collectionCoverImageUrl}
                alt=""
                class="h-56 w-full rounded-2xl object-cover"
              />
            )}

            <Card>
              <div class="space-y-3 text-center">
                <div>
                  <h1 class="text-xl font-bold text-stone-900 dark:text-stone-50">{passport.productName}</h1>
                  {(passport.variantSize || passport.variantColour) && (
                    <p class="text-sm text-stone-500 dark:text-stone-400">
                      {[passport.variantSize, passport.variantColour].filter(Boolean).join(' / ')}
                    </p>
                  )}
                </div>

                <p class="font-mono text-xs tracking-wide text-stone-400 dark:text-stone-500">
                  {passport.serialNumber}
                </p>

                {passport.collectionName && (
                  <div class="border-t border-stone-100 pt-3 dark:border-stone-800">
                    <p class="text-sm font-semibold text-stone-700 dark:text-stone-200">
                      {passport.collectionName}
                    </p>
                    {passport.collectionTagline && (
                      <p class="text-xs tracking-wide text-stone-400 uppercase dark:text-stone-500">
                        {passport.collectionTagline}
                      </p>
                    )}
                    {passport.collectionProductionLimit && (
                      <p class="mt-1 text-xs text-stone-500 dark:text-stone-400">
                        One of {passport.collectionProductionLimit}
                      </p>
                    )}
                  </div>
                )}

                {passport.collectionStory && (
                  <p class="text-sm text-stone-600 dark:text-stone-300">{passport.collectionStory}</p>
                )}

                {(passport.batchNumber || passport.shopCountry) && (
                  <div class="border-t border-stone-100 pt-3 text-xs text-stone-500 dark:border-stone-800 dark:text-stone-400">
                    {passport.batchNumber && <p>Production batch: {passport.batchNumber}</p>}
                    {passport.shopCountry && <p>Made in {passport.shopCountry}</p>}
                  </div>
                )}
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
