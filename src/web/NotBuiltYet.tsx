/**
 * A page the web design has not been drawn for yet.
 *
 * Says so plainly, and offers the phone design as the way to get the work done
 * in the meantime. An honest gap beats an empty screen that reads as breakage,
 * and it beats quietly falling back, which hides how much is left.
 */
import { chooseLayout } from '../components/layoutSwitch'
import { cn } from '../lib/cn'
import { CONTROL, RADIUS, TEXT_SM } from './chrome'
import { Page } from './Page'

export function NotBuiltYet({ title, crumbs }: { title: string; crumbs?: string[] }) {
  return (
    <Page title={title} crumbs={crumbs}>
      <div class="flex flex-1 items-center justify-center">
        <div class="max-w-sm text-center">
          <p class="text-[15px] font-semibold">Not drawn for the desk yet</p>
          <p class={cn('mt-1.5 text-content-muted', TEXT_SM)}>
            {title} exists and works — it has not been redesigned for a large screen. Orders is
            the screen to look at for where this is going.
          </p>
          <div class="mt-4 flex justify-center gap-2">
            <a
              href="/orders"
              class={cn(
                'flex items-center bg-accent px-3 font-semibold text-accent-content',
                'hover:brightness-110',
                CONTROL,
                RADIUS,
                TEXT_SM,
              )}
            >
              Go to Orders
            </a>
            {/* Goes through the shared switch, so the way back exists: in the
                account menu here, and under Layout in the phone's Settings. */}
            <button
              type="button"
              onClick={() => chooseLayout('phone')}
              class={cn(
                'flex items-center bg-surface-sunken px-3 font-semibold text-content hover:bg-pressed',
                CONTROL,
                RADIUS,
                TEXT_SM,
              )}
            >
              Use the phone design
            </button>
          </div>
        </div>
      </div>
    </Page>
  )
}
