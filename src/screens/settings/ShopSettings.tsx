import { useEffect, useState } from 'preact/hooks'
import { Button, Card, ErrorNote, Field, Input, InfoNote, Screen, Select } from '../../components/ui'
import { useShop } from '../../state/ShopProvider'
import { updateShop } from '../../db/writes'
import { toWaNumber } from '../../lib/whatsapp'
import { BUSINESS_TYPES, type BusinessType } from '../../db/schema'

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  tailor: 'Tailor',
  rental: 'Rental',
  apparel_brand: 'Apparel brand',
  corporate_supplier: 'Corporate supplier',
  hybrid: 'Hybrid',
}

/** In minutes; 0 means never. Fixed choices, not free text -- a mistyped
 *  number here locks the till out at an odd interval nobody chose on purpose. */
const LOCK_OPTIONS = [
  { value: '0', label: 'Never' },
  { value: '1', label: '1 minute' },
  { value: '5', label: '5 minutes' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
] as const

/** Whether a code is one Intl.NumberFormat actually recognises as a currency. */
function isValidCurrencyCode(code: string): boolean {
  try {
    new Intl.NumberFormat('en-UG', { style: 'currency', currency: code }).format(0)
    return true
  } catch {
    return false
  }
}

export function ShopSettings() {
  const { db, shop } = useShop()
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [currency, setCurrency] = useState('')
  const [lockAfterMinutes, setLockAfterMinutes] = useState('5')
  const [businessType, setBusinessType] = useState<BusinessType>('tailor')
  const [logoUrl, setLogoUrl] = useState('')
  const [timezone, setTimezone] = useState('')
  const [email, setEmail] = useState('')
  const [website, setWebsite] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!shop) return
    setName(shop.name)
    setWhatsapp(shop.whatsapp_number ?? '')
    setCurrency(shop.currency)
    setLockAfterMinutes(String(shop.lock_after_minutes))
    setBusinessType(shop.business_type ?? 'tailor')
    setLogoUrl(shop.logo_url ?? '')
    setTimezone(shop.timezone ?? '')
    setEmail(shop.email ?? '')
    setWebsite(shop.website ?? '')
  }, [shop])

  if (!shop) {
    return (
      <Screen title="Shop details" back="/settings">
        <Card>
          <p class="text-sm text-stone-600 dark:text-stone-300">
            The shop record has not reached this device yet. It arrives with the first sync.
          </p>
        </Card>
      </Screen>
    )
  }

  async function save(event: Event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('The shop needs a name -- it appears in every WhatsApp message you send.')
      return
    }
    const trimmedCurrency = currency.trim().toUpperCase()
    if (!isValidCurrencyCode(trimmedCurrency)) {
      setError('Not a currency code this device recognises -- try an ISO 4217 code such as UGX or KES.')
      return
    }

    setSaving(true)
    setError(null)
    try {
      await updateShop(db, shop!.id, {
        name,
        whatsapp_number: whatsapp,
        currency: trimmedCurrency,
        lock_after_minutes: Number(lockAfterMinutes),
        business_type: businessType,
        logo_url: logoUrl,
        timezone,
        email,
        website,
      })
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save.')
    } finally {
      setSaving(false)
    }
  }

  // A warning, not a block. The shop's own number is reference rather than
  // something the app sends to, so an unrecognised format is worth flagging
  // and not worth refusing.
  const numberLooksWrong = whatsapp.trim().length > 0 && toWaNumber(whatsapp) === null

  return (
    <Screen title="Shop details" back="/settings">
      <form onSubmit={save} onInput={() => setSaved(false)} class="space-y-4">
        <Card>
          <div class="space-y-4">
            <Field label="Shop name" hint="Used in the messages sent to clients.">
              <Input value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
            </Field>

            <Field
              label="WhatsApp number"
              hint="Your own number, for reference."
              error={numberLooksWrong ? 'This may not be a number WhatsApp recognises.' : null}
            >
              <Input
                type="tel"
                inputmode="tel"
                value={whatsapp}
                onInput={(e) => setWhatsapp((e.target as HTMLInputElement).value)}
              />
            </Field>

            <Field label="Currency" hint="ISO 4217 code, e.g. UGX, KES, USD. Only affects new orders.">
              <Input
                value={currency}
                placeholder="UGX"
                onInput={(e) => setCurrency((e.target as HTMLInputElement).value)}
              />
            </Field>

            <Field label="Lock after" hint="How long the device sits idle before it asks for a PIN again.">
              <Select
                value={lockAfterMinutes}
                onChange={(e) => setLockAfterMinutes((e.target as HTMLSelectElement).value)}
              >
                {LOCK_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Business type" hint="Affects defaults and onboarding, not what you can do.">
              <Select
                value={businessType}
                onChange={(e) => setBusinessType((e.target as HTMLSelectElement).value as BusinessType)}
              >
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {BUSINESS_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </Field>

            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
        </Card>

        <Card>
          <div class="space-y-4">
            <Field label="Logo URL" hint="Optional.">
              <Input value={logoUrl} onInput={(e) => setLogoUrl((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Timezone" hint="IANA name, e.g. Africa/Kampala. Optional.">
              <Input value={timezone} onInput={(e) => setTimezone((e.target as HTMLInputElement).value)} />
            </Field>
            <Field label="Email" hint="Optional.">
              <Input
                type="email"
                value={email}
                onInput={(e) => setEmail((e.target as HTMLInputElement).value)}
              />
            </Field>
            <Field label="Website" hint="Optional.">
              <Input value={website} onInput={(e) => setWebsite((e.target as HTMLInputElement).value)} />
            </Field>
          </div>
        </Card>

        <Button type="submit" block disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
        </Button>

        <InfoNote>
          Changing the shop name changes it everywhere, including on messages already drafted but
          not yet sent. Changing the currency only affects orders created after the change --
          existing orders keep the currency they were created with.
        </InfoNote>
      </form>
    </Screen>
  )
}
