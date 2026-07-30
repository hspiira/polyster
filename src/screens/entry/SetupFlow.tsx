/**
 * First run: verify a number, then build the shop.
 *
 * Verification comes first so a failed code costs no typing. A build with no
 * Supabase credentials, or a device with no signal, skips straight to the shop
 * and claims the number later (spec E3).
 *
 * No back arrow anywhere -- each step is a history entry, so swipe on iOS and
 * the system gesture on Android both step back (useWizardSteps).
 */
import { useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import { GlowBackdrop } from '../../components/GlowBackdrop'
import { useWizardSteps } from '../../hooks/useWizardSteps'
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { useAuth } from '../../hooks/useAuth'
import { useShop } from '../../state/ShopProvider'
import { isSupabaseConfigured } from '../../lib/supabaseClient'
import { cn } from '../../lib/cn'
import { PhoneStep } from './steps/PhoneStep'
import { CodeStep } from './steps/CodeStep'
import { ShopStep } from './steps/ShopStep'
import { PinStep } from './steps/PinStep'
import { MeasureStep } from './steps/MeasureStep'
import { InstallStep } from './InstallStep'
import { EntryQuietButton } from './parts'
import type { ShopDoc, StaffDoc } from '../../db/schema'

const STEPS = ['phone', 'code', 'shop', 'pin', 'measure', 'install'] as const
type Step = (typeof STEPS)[number]

/** The install epilogue is not part of creating a shop, so it is not a segment. */
const COUNTED_STEPS = 5

export function SetupFlow({ onDone }: { onDone: () => void }) {
  const { state: auth } = useAuth()
  const { setActiveStaff } = useShop()
  const install = useInstallPrompt()

  // A build with no Supabase credentials cannot send a code, so it must not
  // offer to. Already verified means the number is done.
  const canVerify = isSupabaseConfigured() && auth.status !== 'signed_in'
  const { step, goTo, replaceWith } = useWizardSteps<Step>(STEPS, canVerify ? 'phone' : 'shop')

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
    <Frame index={STEPS.indexOf(step)}>
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
            goTo('pin')
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

function Frame({ index, children }: { index: number; children: ComponentChildren }) {
  return (
    <main class="relative flex min-h-svh flex-col overflow-hidden bg-stone-950 px-6 text-stone-100">
      <GlowBackdrop />

      {/* safe-top sets padding itself, so the design spacing goes on the child. */}
      <header class="safe-top relative z-10">
        <div class="flex justify-center pb-7 pt-8">
          <div
            class="flex w-26 gap-1.5"
            aria-label={`Step ${Math.min(index + 1, COUNTED_STEPS)} of ${COUNTED_STEPS}`}
          >
            {Array.from({ length: COUNTED_STEPS }, (_, i) => (
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
        <div class="mx-auto flex w-full max-w-sm flex-1 flex-col pb-10">{children}</div>
      </div>
    </main>
  )
}
