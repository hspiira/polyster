/* Collections, online-only. Generic: the optional story fields are for any
   tenant (§21). */
import { useEffect, useState } from 'preact/hooks'
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
  Skeleton,
  Textarea,
} from '../ui'
import { IconChevronRight, IconPlus, IconTag } from '../components/icons'
import { useCurrentShop } from '../state/ShopProvider'
import { useOnlineFeature } from '../hooks/useOnlineFeature'
import { withTimeout } from '../lib/withTimeout'
import { ImageUploadField } from './ImageUploadField'
import {
  COLLECTION_STATUSES,
  createCollection,
  deleteCollectionImage,
  listCollections,
  updateCollection,
  uploadCollectionImage,
  type Collection,
  type CollectionInput,
  type CollectionStatus,
} from '../online/collections'
import { useBack } from '../hooks/useBack'

const STATUS_LABELS: Record<CollectionStatus, string> = {
  draft: 'Draft',
  planned: 'Planned',
  active: 'Active',
  sold_out: 'Sold out',
  archived: 'Archived',
}

export function Collections() {
  const back = useBack()
  const { shop } = useCurrentShop()
  const online = useOnlineFeature()
  const [collections, setCollections] = useState<Collection[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<Collection | null>(null)

  async function reload() {
    try {
      const list = await withTimeout(
        listCollections(shop.id),
        8000,
        'No response from the server. Check your connection and try again.',
      )
      setCollections(list)
      setLoadError(null)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load collections.')
    }
  }

  useEffect(() => {
    if (online) void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online, shop.id])

  if (!online) {
    return (
      <Screen title="Collections" back={back}>
        <EmptyState spacious illustration={<IconTag size={48} />} title="No connection" description="Collections live on the server, so this needs a connection to load." />
      </Screen>
    )
  }

  return (
    <>
      <Screen
        title="Collections"
        back={back}
        action={
          collections && collections.length > 0 ? (
            <HeaderAction label="Add" icon={<IconPlus size={16} />} onClick={() => setAdding(true)} />
          ) : undefined
        }
      >
        <div class="space-y-4">
          {loadError && <ErrorNote>{loadError}</ErrorNote>}

          {collections === null && !loadError && (
            <div class="space-y-2">
              <Skeleton class="h-14" />
              <Skeleton class="h-14" />
            </div>
          )}

          {collections && collections.length === 0 && (
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

      <CollectionSheet open={adding} onClose={() => setAdding(false)} onSaved={reload} />
      {editing && (
        <CollectionSheet
          open={Boolean(editing)}
          collection={editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      )}
    </>
  )
}

function CollectionSheet({
  open,
  collection,
  onClose,
  onSaved,
}: {
  open: boolean
  collection?: Collection
  onClose: () => void
  onSaved: () => void
}) {
  const { shop } = useCurrentShop()
  const [name, setName] = useState(collection?.name ?? '')
  const [code, setCode] = useState(collection?.code ?? '')
  const [status, setStatus] = useState<CollectionStatus>(collection?.status ?? 'draft')
  const [releaseDate, setReleaseDate] = useState(collection?.release_date ?? '')
  const [description, setDescription] = useState(collection?.description ?? '')
  const [tagline, setTagline] = useState(collection?.tagline ?? '')
  const [story, setStory] = useState(collection?.story ?? '')
  const [coverImageUrl, setCoverImageUrl] = useState(collection?.cover_image_url ?? '')
  const [coordinateLabel, setCoordinateLabel] = useState(collection?.coordinate_label ?? '')
  const [latitude, setLatitude] = useState(collection?.latitude ? String(collection.latitude) : '')
  const [longitude, setLongitude] = useState(collection?.longitude ? String(collection.longitude) : '')
  const [productionLimit, setProductionLimit] = useState(
    collection?.production_limit ? String(collection.production_limit) : '',
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function submit(event: Event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Give the collection a name.')
      return
    }
    setSaving(true)
    setError(null)
    const input: CollectionInput = {
      name,
      code,
      status,
      release_date: releaseDate || undefined,
      description,
      tagline,
      story,
      cover_image_url: coverImageUrl,
      coordinate_label: coordinateLabel,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
      production_limit: productionLimit ? Number(productionLimit) : undefined,
    }
    try {
      if (collection) {
        await updateCollection(collection.id, input)
      } else {
        await createCollection(shop.id, input)
      }
      onClose()
      onSaved()
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
          <Input value={name} autofocus onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Code" hint='Optional, e.g. "FOUND002".'>
          <Input value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus((e.target as HTMLSelectElement).value as CollectionStatus)}>
            {COLLECTION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Release date" hint="Optional.">
          <Input type="date" value={releaseDate} onInput={(e) => setReleaseDate((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Tagline" hint='Optional, e.g. "KEEP GOING."'>
          <Input value={tagline} onInput={(e) => setTagline((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Description" hint="Optional.">
          <Textarea value={description} onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)} />
        </Field>
        <Field label="Story" hint="Optional.">
          <Textarea value={story} onInput={(e) => setStory((e.target as HTMLTextAreaElement).value)} />
        </Field>

        <ImageUploadField
          label="Cover image"
          imageUrl={coverImageUrl}
          onChange={setCoverImageUrl}
          upload={(file) => uploadCollectionImage(shop.id, file)}
          onDelete={deleteCollectionImage}
        />

        <div class="space-y-4 rounded-control bg-surface-sunken p-3">
          <p class="text-xs font-medium text-content-muted">Coordinates and limit (optional)</p>
          <Field label="Coordinate label" hint='e.g. "08.13° N 32.58° E".'>
            <Input value={coordinateLabel} onInput={(e) => setCoordinateLabel((e.target as HTMLInputElement).value)} />
          </Field>
          <div class="flex gap-3">
            <div class="flex-1">
              <Field label="Latitude">
                <Input type="number" inputmode="decimal" value={latitude} onInput={(e) => setLatitude((e.target as HTMLInputElement).value)} />
              </Field>
            </div>
            <div class="flex-1">
              <Field label="Longitude">
                <Input type="number" inputmode="decimal" value={longitude} onInput={(e) => setLongitude((e.target as HTMLInputElement).value)} />
              </Field>
            </div>
          </div>
          <Field label="Production limit" hint="Optional -- e.g. 50 for a limited run.">
            <Input
              type="number"
              inputmode="numeric"
              value={productionLimit}
              onInput={(e) => setProductionLimit((e.target as HTMLInputElement).value)}
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
