/**
 * Drifting glow behind the entry screens. Parent needs `relative overflow-hidden`.
 *
 * Deliberately dim: these screens should read as black with a blue cast, not
 * as blue screens. Anything stronger tints the glass surfaces on top of it and
 * they stop looking like glass.
 */
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
