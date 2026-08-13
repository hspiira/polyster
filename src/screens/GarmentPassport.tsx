/* The public garment passport (§34, §68), mounted outside <App/>. A visitor
   scanning a QR code has no session, so this touches no provider, db or router. */
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
    <div class="min-h-svh bg-page px-4 py-10">
      <div class="mx-auto max-w-md">
        {passport === undefined && !error && (
          <p class="text-center text-sm text-content-muted">Loading...</p>
        )}

        {error && (
          <Card>
            <p class="text-sm text-content-muted">{error}</p>
          </Card>
        )}

        {passport === null && !error && (
          <Card>
            <p class="text-sm text-content-muted">
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
              <span class="text-sm font-semibold tracking-wide text-content-muted uppercase">
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
                  <h1 class="text-xl font-bold text-content">{passport.productName}</h1>
                  {(passport.variantSize || passport.variantColour) && (
                    <p class="text-sm text-content-muted">
                      {[passport.variantSize, passport.variantColour].filter(Boolean).join(' / ')}
                    </p>
                  )}
                </div>

                <p class="font-mono text-xs tracking-wide text-content-subtle">
                  {passport.serialNumber}
                </p>

                {passport.collectionName && (
                  <div class="border-t border-line pt-3">
                    <p class="text-sm font-semibold text-content">
                      {passport.collectionName}
                    </p>
                    {passport.collectionTagline && (
                      <p class="text-xs tracking-wide text-content-subtle uppercase">
                        {passport.collectionTagline}
                      </p>
                    )}
                    {passport.collectionProductionLimit && (
                      <p class="mt-1 text-xs text-content-muted">
                        One of {passport.collectionProductionLimit}
                      </p>
                    )}
                  </div>
                )}

                {passport.collectionStory && (
                  <p class="text-sm text-content-muted">{passport.collectionStory}</p>
                )}

                {(passport.batchNumber || passport.shopCountry) && (
                  <div class="border-t border-line pt-3 text-xs text-content-muted">
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
