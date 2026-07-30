import { Button, Card, EmptyState, Screen } from '../components/ui'
import { IconAlert } from '../components/icons'

export function NotFound() {
  return (
    <Screen title="Not found">
      <Card padded={false}>
        <EmptyState
          icon={<IconAlert size={26} />}
          title="There is nothing at this address"
          description="The link may be from an older version of the app."
          action={
            <a href="/">
              <Button variant="secondary">Back to Today</Button>
            </a>
          }
        />
      </Card>
    </Screen>
  )
}
