/** Drifting glow behind Landing/StaffGate. Parent needs `relative overflow-hidden`. */
export function GlowBackdrop() {
  return (
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div
        class="animate-glow-drift-a absolute -left-1/4 top-[-8%] aspect-square w-[105%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklch, var(--color-brand-400) 55%, transparent) 0%, transparent 70%)',
          filter: 'blur(30px)',
          mixBlendMode: 'screen',
        }}
      />
      <div
        class="animate-glow-drift-b absolute right-[-30%] bottom-[5%] aspect-square w-[95%] rounded-full"
        style={{
          background:
            'radial-gradient(circle, color-mix(in oklch, var(--color-brand-700) 60%, transparent) 0%, transparent 70%)',
          filter: 'blur(30px)',
          mixBlendMode: 'screen',
        }}
      />
    </div>
  )
}
