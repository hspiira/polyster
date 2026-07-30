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
        class="animate-glow-drift-a absolute -left-1/3 top-[-14%] aspect-square w-[85%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklch, var(--color-brand-500) 26%, transparent) 0%, transparent 68%)',
          filter: 'blur(42px)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        class="animate-glow-drift-b absolute right-[-34%] bottom-[2%] aspect-square w-[78%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklch, var(--color-brand-800) 30%, transparent) 0%, transparent 70%)',
          filter: 'blur(46px)',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  )
}
