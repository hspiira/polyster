/**
 * Shop details: what things are, not a column of inputs asking what they
 * should be. Each row opens a sheet holding that one value.
 */
import { useState } from 'preact/hooks'
import {
  Card,
  ChoiceSheet,
  ErrorNote,
  RowList,
  Screen,
  SectionTitle,
  SettingRow,
  TextFieldSheet,
} from '../../ui'
import {
  IconAlert,
  IconClock,
  IconLayers,
  IconMoney,
  IconReceipt,
  IconSettings,
  IconTag,
  IconWhatsApp,
} from '../../components/icons'
import { useShop } from '../../state/ShopProvider'
import { updateShop } from '../../db/writes'
import { toWaNumber } from '../../lib/whatsapp'
import { BUSINESS_TYPES, type BusinessType } from '../../db/schema'
import { useBack } from '../../hooks/useBack'

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  tailor: 'Tailor',
  rental: 'Rental',
  apparel_brand: 'Apparel brand',
  corporate_supplier: 'Corporate supplier',
  hybrid: 'Hybrid',
}

/** Fixed choices: a mistyped number locks the till at an interval nobody chose. */
const LOCK_OPTIONS = [
  { value: '0', label: 'Never' },
  { value: '1', label: '1 minute' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
] as const

function lockLabel(minutes: number): string {
  return LOCK_OPTIONS.find((option) => option.value === String(minutes))?.label ?? `${minutes} min`
}

function isValidCurrencyCode(code: string): boolean {
  try {
    new Intl.NumberFormat('en-UG', { style: 'currency', currency: code }).format(0)
    return true
  } catch {
    return false
  }
}

/** Which row's sheet is open. */
type Editing =
  | 'name'
  | 'whatsapp'
  | 'currency'
  | 'lock'
  | 'business_type'
  | 'email'
  | 'website'
  | 'timezone'
  | 'logo'
  | null

export function ShopSettings() {
  const back = useBack()
  const { db, shop } = useShop()
  const [editing, setEditing] = useState<Editing>(null)
  const [error, setError] = useState<string | null>(null)

  if (!shop) {
    return (
      <Screen title="Shop details" back={back}>
        <Card>
          <p class="text-sm text-content-muted">
            The shop record has not reached this device yet. It arrives with the first sync.
          </p>
        </Card>
      </Screen>
    )
  }

  const shopId = shop.id
  const close = () => setEditing(null)

  async function save(patch: Parameters<typeof updateShop>[2]) {
    setError(null)
    try {
      await updateShop(db, shopId, patch)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    }
  }

  const numberLooksWrong = Boolean(shop.whatsapp_number) && toWaNumber(shop.whatsapp_number) === null

  return (
    <Screen title="Shop details" back={back} width="wide">
      <div class="lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <section>
          <SectionTitle>Identity</SectionTitle>
          <Card padded={false}>
            <RowList>
              <li>
                <SettingRow
                  icon={<IconSettings size={20} />}
                  label="Name"
                  value={shop.name}
                  onClick={() => setEditing('name')}
                />
              </li>
              <li>
                <SettingRow
                  icon={<IconWhatsApp size={20} />}
                  label="WhatsApp"
                  value={shop.whatsapp_number ?? 'Not set'}
                  tone={numberLooksWrong ? 'danger' : 'accent'}
                  onClick={() => setEditing('whatsapp')}
                />
              </li>
              <li>
                <SettingRow
                  icon={<IconTag size={20} />}
                  label="Business type"
                  value={BUSINESS_TYPE_LABELS[shop.business_type ?? 'tailor']}
                  onClick={() => setEditing('business_type')}
                />
              </li>
            </RowList>
          </Card>
          {numberLooksWrong && (
            <p class="mt-2 px-1 text-xs text-danger">
              WhatsApp may not recognise this number.
            </p>
          )}
        </section>

        <div class="mt-section space-y-section lg:mt-0">
          <section>
            <SectionTitle>Behaviour</SectionTitle>
            <Card padded={false}>
              <RowList>
                <li>
                  <SettingRow
                    icon={<IconMoney size={20} />}
                    label="Currency"
                    value={shop.currency}
                    onClick={() => setEditing('currency')}
                  />
                </li>
                <li>
                  <SettingRow
                    icon={<IconClock size={20} />}
                    label="Lock after"
                    value={lockLabel(shop.lock_after_minutes)}
                    onClick={() => setEditing('lock')}
                  />
                </li>
              </RowList>
            </Card>
          </section>

          <section>
            <SectionTitle>Optional</SectionTitle>
            <Card padded={false}>
              <RowList>
                <li>
                  <SettingRow
                    icon={<IconReceipt size={20} />}
                    label="Email"
                    value={shop.email ?? 'Not set'}
                    onClick={() => setEditing('email')}
                  />
                </li>
                <li>
                  <SettingRow
                    icon={<IconLayers size={20} />}
                    label="Website"
                    value={shop.website ?? 'Not set'}
                    onClick={() => setEditing('website')}
                  />
                </li>
                <li>
                  <SettingRow
                    icon={<IconClock size={20} />}
                    label="Timezone"
                    value={shop.timezone ?? 'Not set'}
                    onClick={() => setEditing('timezone')}
                  />
                </li>
                <li>
                  <SettingRow
                    icon={<IconAlert size={20} />}
                    label="Logo URL"
                    value={shop.logo_url ? 'Set' : 'Not set'}
                    onClick={() => setEditing('logo')}
                  />
                </li>
              </RowList>
            </Card>
          </section>
        </div>
      </div>

      {error && (
        <div class="mt-section">
          <ErrorNote>{error}</ErrorNote>
        </div>
      )}

      <TextFieldSheet
        open={editing === 'name'}
        title="Shop name"
        label="Name"
        hint="Appears on every message you send."
        value={shop.name}
        validate={(v) => (v.trim() ? null : 'A name is needed.')}
        onSave={(v) => save({ name: v })}
        onClose={close}
      />
      <TextFieldSheet
        open={editing === 'whatsapp'}
        title="WhatsApp number"
        label="Number"
        type="tel"
        value={shop.whatsapp_number ?? ''}
        onSave={(v) => save({ whatsapp_number: v })}
        onClose={close}
      />
      <TextFieldSheet
        open={editing === 'currency'}
        title="Currency"
        label="ISO 4217 code"
        hint="Only affects new orders. Existing ones keep theirs."
        placeholder="UGX"
        value={shop.currency}
        validate={(v) =>
          isValidCurrencyCode(v.trim().toUpperCase()) ? null : 'Not a code this device recognises.'
        }
        onSave={(v) => save({ currency: v.trim().toUpperCase() })}
        onClose={close}
      />
      <TextFieldSheet
        open={editing === 'email'}
        title="Email"
        label="Email"
        type="email"
        value={shop.email ?? ''}
        onSave={(v) => save({ email: v })}
        onClose={close}
      />
      <TextFieldSheet
        open={editing === 'website'}
        title="Website"
        label="Website"
        type="url"
        value={shop.website ?? ''}
        onSave={(v) => save({ website: v })}
        onClose={close}
      />
      <TextFieldSheet
        open={editing === 'timezone'}
        title="Timezone"
        label="IANA name"
        placeholder="Africa/Kampala"
        value={shop.timezone ?? ''}
        onSave={(v) => save({ timezone: v })}
        onClose={close}
      />
      <TextFieldSheet
        open={editing === 'logo'}
        title="Logo URL"
        label="URL"
        type="url"
        value={shop.logo_url ?? ''}
        onSave={(v) => save({ logo_url: v })}
        onClose={close}
      />

      <ChoiceSheet
        open={editing === 'business_type'}
        title="Business type"
        value={shop.business_type ?? 'tailor'}
        options={BUSINESS_TYPES.map((value) => ({ value, label: BUSINESS_TYPE_LABELS[value] }))}
        onChoose={(value) => void save({ business_type: value })}
        onClose={close}
      />
      <ChoiceSheet
        open={editing === 'lock'}
        title="Lock after"
        value={String(shop.lock_after_minutes)}
        options={LOCK_OPTIONS}
        onChoose={(value) => void save({ lock_after_minutes: Number(value) })}
        onClose={close}
      />
    </Screen>
  )
}
