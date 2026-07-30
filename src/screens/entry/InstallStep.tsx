/**
 * The install ask, once the shop exists and the value is obvious.
 *
 * Outside the stepper, because it is not part of creating a shop. Skipped
 * entirely when the app is already running standalone.
 */
import { useInstallPrompt } from '../../hooks/useInstallPrompt'
import { EntryButton, EntryHeading, EntryNote, EntryQuietButton } from './parts'

export function InstallStep({ onDone }: { onDone: () => void }) {
  const install = useInstallPrompt()

  return (
    <div class="flex flex-1 flex-col justify-center">
      <EntryHeading
        centred
        title="Keep it on your home screen"
        body="This is what makes it open with no internet. In a browser tab it can be lost when you close it."
      />

      {install.isIos && (
        <EntryNote>
          Tap <span class="font-semibold text-white">Share</span> at the bottom of Safari, then{' '}
          <span class="font-semibold text-white">Add to Home Screen</span>.
        </EntryNote>
      )}

      <div class="mt-7 space-y-2">
        {install.canPrompt && (
          <EntryButton
            onClick={async () => {
              await install.prompt()
              onDone()
            }}
          >
            Add to home screen
          </EntryButton>
        )}
        <EntryQuietButton onClick={onDone}>
          {install.canPrompt ? 'Not now' : 'Continue'}
        </EntryQuietButton>
      </div>
    </div>
  )
}
