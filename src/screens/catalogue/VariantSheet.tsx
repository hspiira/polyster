/* One sheet for both adding and editing a variant. They were two components
   with the same seven fields, the same validation and the same buttons. */
import { useEffect, useState } from 'preact/hooks'
import { Button, ErrorNote, Field, Input, Sheet } from '../../components/ui'
import { useCurrentShop } from '../../state/ShopProvider'
import {
  createProductVariant,
  updateProductVariant,
  type ProductVariant,
} from '../../online/catalogue'

interface VariantDraft {
  sku: string
  size: string
  colour: string
  price: string
  cost: string
}

function draftFrom(variant?: ProductVariant): VariantDraft {
  if (!variant) return { sku: '', size: '', colour: '', price: '0', cost: '0' }
  return {
    sku: variant.sku,
    size: variant.size ?? '',
    colour: variant.colour ?? '',
    price: String(variant.price_minor),
    cost: String(variant.cost_minor),
  }
}

function toMinor(value: string): number {
  return Math.max(0, Math.round(Number(value) || 0))
}

export function VariantSheet({
  open,
  productId,
  variant,
  onClose,
  onSaved,
}: {
  open: boolean
  productId: string
  /** Absent means this is a new variant. */
  variant?: ProductVariant
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const [draft, setDraft] = useState<VariantDraft>(() => draftFrom(variant))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setDraft(draftFrom(variant))
    setError(null)
  }, [variant, open])

  const set = (patch: Partial<VariantDraft>) => setDraft((current) => ({ ...current, ...patch }))

  async function submit(event: Event) {
    event.preventDefault()
    if (!draft.sku.trim()) {
      setError('Give the variant a SKU.')
      return
    }

    setSaving(true)
    setError(null)
    const fields = {
      sku: draft.sku,
      size: draft.size,
      colour: draft.colour,
      price_minor: toMinor(draft.price),
      cost_minor: toMinor(draft.cost),
    }
    try {
      if (variant) await updateProductVariant(variant.id, fields)
      else await createProductVariant(shop.id, productId, fields)
      onClose()
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this variant.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title={variant ? 'Edit variant' : 'New variant'} onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="SKU">
          <Input
            autofocus
            value={draft.sku}
            onInput={(e) => set({ sku: (e.target as HTMLInputElement).value })}
          />
        </Field>

        <div class="flex gap-3">
          <div class="flex-1">
            <Field label="Size" hint="Optional.">
              <Input
                value={draft.size}
                onInput={(e) => set({ size: (e.target as HTMLInputElement).value })}
              />
            </Field>
          </div>
          <div class="flex-1">
            <Field label="Colour" hint="Optional.">
              <Input
                value={draft.colour}
                onInput={(e) => set({ colour: (e.target as HTMLInputElement).value })}
              />
            </Field>
          </div>
        </div>

        <div class="flex gap-3">
          <div class="flex-1">
            <Field label="Price (minor units)">
              <Input
                type="number"
                inputmode="numeric"
                value={draft.price}
                onInput={(e) => set({ price: (e.target as HTMLInputElement).value })}
              />
            </Field>
          </div>
          <div class="flex-1">
            <Field label="Cost (minor units)" hint="Optional.">
              <Input
                type="number"
                inputmode="numeric"
                value={draft.cost}
                onInput={(e) => set({ cost: (e.target as HTMLInputElement).value })}
              />
            </Field>
          </div>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save variant'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
