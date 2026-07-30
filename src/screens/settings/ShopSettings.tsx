import { useEffect, useState } from 'preact/hooks'
import { Button, Card, ErrorNote, Field, Input, Screen } from '../../components/ui'
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
      <Screen title="Shop details">
        <Card>
          <p class="text-sm text-gray-600">
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

  // Shown as a warning rather than blocking the save. The shop's own number is
  // not used to send anything -- it is reference -- so a format this app does
  // not recognise is worth flagging, not refusing.
  const numberLooksWrong = whatsapp.trim().length > 0 && toWaNumber(whatsapp) === null

  return (
    <Screen title="Shop details">
      <Card>
        <form
          onSubmit={save}
          onInput={() => setSaved(false)}
          class="space-y-3"
        >
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

          <Button type="submit" class="w-full" disabled={saving}>
            {saving ? 'Saving...' : saved ? 'Saved' : 'Save'}
          </Button>
        </form>
      </Card>
    </Screen>
  )
}
