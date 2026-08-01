import { Button, EmptyState, Screen } from '../components/ui'
import { IllustrationSearch } from '../components/illustrations'

export function NotFound() {
  return (
    <Screen title="Not found">
      <EmptyState
        spacious
        illustration={<IllustrationSearch size={112} />}
        title="There is nothing at this address"
        description="The link may be from an older version of the app."
        action={
          <a href="/">
            <Button variant="secondary">Back to Today</Button>
          </a>
        }
      />
    </Screen>
  )
}
