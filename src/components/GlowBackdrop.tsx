/* Drifting glow behind the entry screens; parent needs relative overflow-hidden.
   Dim on purpose -- anything stronger tints the glass and it stops reading as glass. */
export function GlowBackdrop() {
  return (
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        class="animate-glow-drift-a absolute -left-[18%] top-[-16%] aspect-square w-[105%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklch, var(--color-brand-500) 46%, transparent) 0%, transparent 66%)',
          filter: 'blur(56px)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        class="animate-glow-drift-b absolute right-[-32%] bottom-[4%] aspect-square w-[95%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklch, var(--color-brand-700) 52%, transparent) 0%, transparent 68%)',
          filter: 'blur(58px)',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  )
}
