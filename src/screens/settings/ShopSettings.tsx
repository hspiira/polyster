import { useEffect, useState } from 'preact/hooks'
import { Button, Card, ErrorNote, Field, Input, InfoNote, Screen } from '../../components/ui'
import { useShop } from '../../state/ShopProvider'
import { updateShop } from '../../db/writes'
import { toWaNumber } from '../../lib/whatsapp'

export function ShopSettings() {
  const { db, shop } = useShop()
  const [name, setName] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!shop) return
    setName(shop.name)
    setWhatsapp(shop.whatsapp_number ?? '')
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

    setSaving(true)
    setError(null)
    try {
      await updateShop(db, shop!.id, { name, whatsapp_number: whatsapp })
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

            {error && <ErrorNote>{error}</ErrorNote>}
          </div>
        </Card>

        <Button type="submit" block disabled={saving}>
          {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
        </Button>

        <InfoNote>
          Changing the shop name changes it everywhere, including on messages already drafted but
          not yet sent.
        </InfoNote>
      </form>
    </Screen>
  )
}
