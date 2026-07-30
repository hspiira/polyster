/**
 * The first screen anyone sees on a device that has never signed in.
 *
 * Its job is small and specific: say what this is, set the expectation that it
 * works without a signal, and get out of the way. It is not a marketing page
 * -- nobody arrives here by browsing. They arrive because someone handed them
 * a phone and said "use this now".
 *
 * So: no scrolling, three claims, one button. The offline claim is first
 * because it is the one that changes how the app gets used, and the one a
 * shop will not believe until it is stated plainly.
 */
import { Button } from '../components/ui'
import { IconClock, IconMoney, IconOrders, IconWhatsApp } from '../components/icons'

const POINTS = [
  {
    Icon: IconClock,
    title: 'Works with no internet',
    body: 'Take orders, record payments, update stages. It syncs on its own when a signal comes back.',
  },
  {
    Icon: IconMoney,
    title: 'Know what you are owed',
    body: 'Every balance is worked out from the payments taken, never typed in by hand.',
  },
  {
    Icon: IconWhatsApp,
    title: 'Tell clients on WhatsApp',
    body: 'One tap opens a message that is already written. You read it and send it.',
  },
] as const

export function Landing({ onSignIn }: { onSignIn: () => void }) {
  return (
    <main class="flex min-h-svh flex-col bg-stone-100 px-6 dark:bg-stone-950">
      <div class="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
        <header>
          <span class="flex size-16 items-center justify-center rounded-[1.25rem] bg-brand-700 text-white shadow-raised">
            <IconOrders size={30} />
          </span>
          <h1 class="mt-6 text-3xl font-semibold leading-tight tracking-tight">
            Tailor &amp; Rental Tracker
          </h1>
          <p class="mt-2 text-stone-600 dark:text-stone-300">
            Orders, measurements, and payments for a tailoring or rental shop.
          </p>
        </header>

        <ul class="mt-10 space-y-5">
          {POINTS.map(({ Icon, title, body }) => (
            <li key={title} class="flex gap-3.5">
              <span class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-[0.7rem] bg-brand-100 text-brand-800 dark:bg-brand-950 dark:text-brand-300">
                <Icon size={18} />
              </span>
              <span>
                <span class="block font-medium">{title}</span>
                <span class="mt-0.5 block text-sm leading-relaxed text-stone-600 dark:text-stone-400">
                  {body}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div class="mx-auto w-full max-w-sm pb-8 safe-bottom">
        <Button block onClick={onSignIn}>
          Sign in to your shop
        </Button>
        <p class="mt-3 text-center text-xs leading-relaxed text-stone-500 dark:text-stone-400">
          One account for the whole shop. Staff pick their own name and PIN after signing in.
        </p>
      </div>
    </main>
  )
}
