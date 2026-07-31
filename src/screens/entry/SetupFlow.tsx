/**
 * First run: verify a number, then build the shop.
 *
 * Verification comes first so a failed code costs no typing. A build with no
 * Supabase credentials, or a device with no signal, skips straight to the shop
 * and claims the number later (spec E3).
 *
 * No back arrow anywhere. Each step is a history entry, so Android's system
 * back steps back; an installed PWA has no edge-swipe of its own, so the app
 * supplies one (useSwipeBack), limited to the steps stepAllowsBack permits.
 */
import { useState } from 'preact/hooks'
import type { ComponentChildren, RefObject } from 'preact'
import { GlowBackdrop } from '../../components/GlowBackdrop'
import { useWizardSteps } from '../../hooks/useWizardSteps'
import { useSwipeBack } from '../../hooks/useSwipeBack'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { useAuth } from '../../hooks/useAuth'
import { useShop } from '../../state/ShopProvider'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { COUNTED_SETUP_STEPS, SETUP_STEPS, stepAllowsBack } from '../../lib/setupSteps'
import type { SetupStep } from '../../lib/setupSteps'
import { cn } from '../../lib/cn'
import { PhoneStep } from './steps/PhoneStep'
import { CodeStep } from './steps/CodeStep'
import { ShopStep } from './steps/ShopStep'
import { PinStep } from './steps/PinStep'
import { MeasureStep } from './steps/MeasureStep'
import { InstallStep } from './InstallStep'
import { EntryQuietButton } from './parts'
import type { ShopDoc, StaffDoc } from '../../db/schema'

export function SetupFlow({ onDone }: { onDone: () => void }) {
  const { state: auth } = useAuth()
  const { setActiveStaff } = useShop()
  const install = useInstallPrompt()

  // A build with no Supabase credentials cannot send a code, so it must not
  // offer to. Already verified means the number is done.
  const canVerify = isSupabaseConfigured() && auth.status !== 'signed_in'
  const { step, canGoBack, goTo, replaceWith, goBack } = useWizardSteps<SetupStep>(
    SETUP_STEPS,
    canVerify ? 'phone' : 'shop',
  )

  const swipeRef = useSwipeBack(canGoBack && stepAllowsBack(step) ? goBack : undefined)

  const [phone, setPhone] = useState('')
  const [shop, setShop] = useState<ShopDoc | null>(null)
  const [yourName, setYourName] = useState('')
  const [owner, setOwner] = useState<StaffDoc | null>(null)

  function finish() {
    if (owner) setActiveStaff(owner)
    onDone()
  }

  /** Nothing to ask for on a device that already has the app installed. */
  function afterMeasurements() {
    if (install.isStandalone) finish()
    else replaceWith('install')
  }

  return (
    <Frame index={SETUP_STEPS.indexOf(step)} contentRef={swipeRef}>
      {step === 'phone' && (
        <PhoneStep
          onSent={(sent) => {
            setPhone(sent)
            goTo('code')
          }}
          footer={
            <EntryQuietButton type="button" class="mt-4" onClick={() => goTo('shop')}>
              No signal right now? Set up on this device
            </EntryQuietButton>
          }
        />
      )}

      {step === 'code' && (
        <CodeStep phone={phone} onVerified={() => goTo('shop')} onResend={() => goTo('phone')} />
      )}

      {step === 'shop' && (
        <ShopStep
          onCreated={(created, name) => {
            setShop(created)
            setYourName(name)
            // Replace, not push: the shop row now exists, and resubmitting
            // this step would create a second one.
            replaceWith('pin')
          }}
        />
      )}

      {step === 'pin' && shop && (
        <PinStep
          shopId={shop.id}
          yourName={yourName}
          onCreated={(created) => {
            setOwner(created)
            // Replace, not push: going back to choose a PIN that already
            // exists would create a second owner.
            replaceWith('measure')
          }}
        />
      )}

      {step === 'measure' && shop && (
        <MeasureStep shopId={shop.id} onDone={afterMeasurements} />
      )}

      {step === 'install' && <InstallStep onDone={finish} />}
    </Frame>
  )
}

function Frame({
  index,
  contentRef,
  children,
}: {
  index: number
  /** The step slides under the swipe; the progress bar is chrome and stays put. */
  contentRef: RefObject<HTMLDivElement>
  children: ComponentChildren
}) {
  return (
    <main class="relative flex min-h-svh flex-col overflow-hidden bg-stone-950 px-6 text-stone-100">
      <GlowBackdrop />

      {/* safe-top sets padding itself, so the design spacing goes on the child. */}
      <header class="safe-top relative z-10">
        <div class="flex justify-center pb-7 pt-8">
          <div
            class="flex w-26 gap-1.5"
            aria-label={`Step ${Math.min(index + 1, COUNTED_SETUP_STEPS)} of ${COUNTED_SETUP_STEPS}`}
          >
            {Array.from({ length: COUNTED_SETUP_STEPS }, (_, i) => (
              <span
                key={i}
                class={cn(
                  'h-0.75 flex-1 rounded-full transition-colors',
                  i <= index ? 'bg-brand-400' : 'bg-white/16',
                )}
              />
            ))}
          </div>
        </div>
      </header>

      <div class="safe-bottom relative z-10 flex flex-1 flex-col">
        <div ref={contentRef} class="mx-auto flex w-full max-w-sm flex-1 flex-col pb-10">
          {children}
        </div>
      </div>
    </main>
  )
}
