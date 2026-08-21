/* Collections, on the device. The optional story fields are for any tenant. */
import { useState } from 'preact/hooks'
import {
  Button,
  Card,
  EmptyState,
  ErrorNote,
  Field,
  HeaderAction,
  Input,
  RowList,
  Screen,
  Select,
  Sheet,
  Textarea,
} from '../ui'
import { IconChevronRight, IconPlus, IconTag } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useQuery } from '../hooks/useQuery'
import { ImageUploadField } from './ImageUploadField'
import {
  createCollection,
  observeCollections,
  updateCollection,
  type CollectionInput,
} from '../db/repo'
import { deleteCollectionImage, uploadCollectionImage } from '../online/images'
import { COLLECTION_STATUSES, type Collection, type CollectionStatus } from '../db/schema'
import { useBack } from '../hooks/useBack'
import { useDraft } from '../hooks/useDraft'

const STATUS_LABELS: Record<CollectionStatus, string> = {
  draft: 'Draft',
  planned: 'Planned',
  active: 'Active',
  sold_out: 'Sold out',
  archived: 'Archived',
}

interface CollectionDraft {
  name: string
  code: string
  status: CollectionStatus
  releaseDate: string
  description: string
  tagline: string
  story: string
  coverImageUrl: string
  coordinateLabel: string
  latitude: string
  longitude: string
  productionLimit: string
}

export function Collections() {
  const back = useBack()
  const { db, shop } = useCurrentShop()
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Collection | null>(null)

  const collections = useQuery(() => observeCollections(db, shop.id), [db, shop.id], [])

  return (
    <>
      <Screen
        title="Collections"
        back={back}
        action={
          collections.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {collections.length === 0 && (
            <EmptyState
              spacious
              illustration={<IconTag size={48} />}
              title="No collections yet"
              description="Group products into a release, with its own story, cover image and status."
              action={
                <Button onClick={() => setAdding(true)}>
                  <IconPlus size={18} /> Add a collection
                </Button>
              }
            />
          )}

          {collections && collections.length > 0 && (
            <Card padded={false}>
              <RowList>
                {collections.map((collection) => (
                  <li key={collection.id}>
                    <button
                      type="button"
                      onClick={() => setEditing(collection)}
                      class="flex min-h-tap w-full items-center gap-3 px-gutter py-3 text-left
                             transition-colors hover:bg-hover active:bg-pressed"
                    >
                      {collection.cover_image_url ? (
                        <img src={collection.cover_image_url} alt="" class="size-10 shrink-0 rounded-control object-cover" />
                      ) : (
                        <span class="flex size-10 shrink-0 items-center justify-center rounded-control bg-surface-sunken text-content-subtle">
                          <IconTag size={18} />
                        </span>
                      )}
                      <span class="min-w-0 flex-1">
                        <span class="block truncate font-medium">{collection.name}</span>
                        <span class="block truncate text-sm text-content-muted">
                          {[STATUS_LABELS[collection.status], collection.tagline].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                      <IconChevronRight size={18} class="shrink-0 text-content-subtle" />
                    </button>
                  </li>
                ))}
              </RowList>
            </Card>
          )}
        </div>
      </Screen>

      <CollectionSheet open={adding} onClose={() => setAdding(false)} />
      {editing && (
        <CollectionSheet
          open={Boolean(editing)}
          collection={editing}
          onClose={() => setEditing(null)}
         
        />
      )}
    </>
  )
}

function CollectionSheet({
  open,
  collection,
  onClose,
}: {
  open: boolean
  collection?: Collection
  onClose: () => void
}) {
  const { db, shop } = useCurrentShop()
  const { draft, set } = useDraft<CollectionDraft>(() => ({
    name: collection?.name ?? '',
    code: collection?.code ?? '',
    status: collection?.status ?? 'draft',
    releaseDate: collection?.release_date ?? '',
    description: collection?.description ?? '',
    tagline: collection?.tagline ?? '',
    story: collection?.story ?? '',
    coverImageUrl: collection?.cover_image_url ?? '',
    coordinateLabel: collection?.coordinate_label ?? '',
    latitude: collection?.latitude ? String(collection.latitude) : '',
    longitude: collection?.longitude ? String(collection.longitude) : '',
    productionLimit: collection?.production_limit ? String(collection.production_limit) : '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setError('Give the collection a name.')
      return
    }
    setSaving(true)
    setError(null)
    const input: CollectionInput = {
      name: draft.name,
      code: draft.code,
      status: draft.status,
      release_date: draft.releaseDate || undefined,
      description: draft.description,
      tagline: draft.tagline,
      story: draft.story,
      cover_image_url: draft.coverImageUrl,
      coordinate_label: draft.coordinateLabel,
      latitude: draft.latitude ? Number(draft.latitude) : undefined,
      longitude: draft.longitude ? Number(draft.longitude) : undefined,
      production_limit: draft.productionLimit ? Number(draft.productionLimit) : undefined,
    }
    try {
      if (collection) {
        await updateCollection(db, collection.id, input)
      } else {
        await createCollection(db, shop.id, input)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this collection.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} title={collection ? 'Edit collection' : 'New collection'} onClose={onClose}>
      <form onSubmit={submit} class="space-y-4">
        <Field label="Name">
          <Input value={draft.name} autofocus onValue={(v) => set('name', v)} />
        </Field>
        <Field label="Code" hint='Optional, e.g. "FOUND002".'>
          <Input value={draft.code} onValue={(v) => set('code', v)} />
        </Field>
        <Field label="Status">
          <Select value={draft.status} onValue={(v) => set('status', v as CollectionStatus)}>
            {COLLECTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Release date" hint="Optional.">
          <Input type="date" value={draft.releaseDate} onValue={(v) => set('releaseDate', v)} />
        </Field>
        <Field label="Tagline" hint='Optional, e.g. "KEEP GOING."'>
          <Input value={draft.tagline} onValue={(v) => set('tagline', v)} />
        </Field>
        <Field label="Description" hint="Optional.">
          <Textarea value={draft.description} onValue={(v) => set('description', v)} />
        </Field>
        <Field label="Story" hint="Optional.">
          <Textarea value={draft.story} onValue={(v) => set('story', v)} />
        </Field>

        <ImageUploadField
          label="Cover image"
          imageUrl={draft.coverImageUrl}
          onChange={(v) => set('coverImageUrl', v)}
          upload={(file) => uploadCollectionImage(shop.id, file)}
          onDelete={deleteCollectionImage}
        />

        <div class="space-y-4 rounded-control bg-surface-sunken p-3">
          <p class="text-xs font-medium text-content-muted">Coordinates and limit (optional)</p>
          <Field label="Coordinate label" hint='e.g. "08.13° N 32.58° E".'>
            <Input value={draft.coordinateLabel} onValue={(v) => set('coordinateLabel', v)} />
          </Field>
          <div class="flex gap-3">
            <div class="flex-1">
              <Field label="Latitude">
                <Input type="number" inputmode="decimal" value={draft.latitude} onValue={(v) => set('latitude', v)} />
              </Field>
            </div>
            <div class="flex-1">
              <Field label="Longitude">
                <Input type="number" inputmode="decimal" value={draft.longitude} onValue={(v) => set('longitude', v)} />
              </Field>
            </div>
          </div>
          <Field label="Production limit" hint="Optional -- e.g. 50 for a limited run.">
            <Input
              type="number"
              inputmode="numeric"
              value={draft.productionLimit}
              onValue={(v) => set('productionLimit', v)}
            />
          </Field>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div class="flex gap-2 pt-1">
          <Button variant="secondary" class="flex-1" type="button" onClick={onClose}>
            Cancel
          </Button>
          <Button class="flex-1" type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save collection'}
          </Button>
        </div>
      </form>
    </Sheet>
  )
}
