import { useEffect, useState } from 'preact/hooks'
import { Button, Card, ErrorNote, Field, Input, InfoNote, Screen, Select } from '../../components/ui'
import { useShop } from '../../state/ShopProvider'
import { updateShop } from '../../db/writes'
import { toWaNumber } from '../../lib/whatsapp'

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
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!shop) return
    setName(shop.name)
    setWhatsapp(shop.whatsapp_number ?? '')
    setCurrency(shop.currency)
    setLockAfterMinutes(String(shop.lock_after_minutes))
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

            {error && <ErrorNote>{error}</ErrorNote>}
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
