import { useState } from 'preact/hooks'
import { Segmented } from '../../ui'
import { useCurrentShop } from '../../state/ShopProvider'
import { formatMinor } from '../../lib/money'
import { setProductVariantActive } from '../../db/repo'
import type { ProductVariant } from '../../db/schema'
import { VariantSheet } from './VariantSheet'

const TOGGLE_OPTIONS = [
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
] as const

export function VariantRow({ variant }: { variant: ProductVariant }) {
  const { db, shop } = useCurrentShop()
  const [editing, setEditing] = useState(false)
  const [toggling, setToggling] = useState(false)

  async function toggleActive(value: string) {
    setToggling(true)
    try {
      await setProductVariantActive(db, variant.id, value === 'on')
    } finally {
      setToggling(false)
    }
  }

  return (
    <li class="flex items-center gap-3 px-3 py-2.5">
      <button
        type="button"
        class="min-w-0 flex-1 text-left"
        onClick={() => setEditing(true)}
      >
        <span class="block truncate font-medium">{variant.sku}</span>
        <span class="block truncate text-sm text-content-muted">
          {[variant.size, variant.colour, formatMinor(variant.price_minor, shop.currency)]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </button>
      <Segmented
        value={variant.active ? 'on' : 'off'}
        options={TOGGLE_OPTIONS}
        onChange={(value) => void toggleActive(value)}
        label={`${variant.sku} active`}
      />
      <VariantSheet
        productId={variant.product_id}
        open={editing}
        variant={variant}
        onClose={() => setEditing(false)}
      />
      {toggling && <span class="sr-only">Saving</span>}
    </li>
  )
}
