/**
 * Shared UI primitives.
 *
 * Deliberately plain. Every screen here is used one-handed, on a phone, often
 * standing up with fabric in the other hand -- so tap targets are large, text
 * is not small, and there are no hover-only affordances.
 *
 * Kept in one file while there are few enough to scan at a glance; split when
 * that stops being true.
 */
import type { ComponentChildren, JSX } from 'preact'

/** Minimum comfortable tap target. Below this, mis-taps become common. */
const TAP = 'min-h-11'

export function Screen({
  title,
  action,
  children,
}: {
  title: string
  action?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <div class="mx-auto w-full max-w-lg px-4 pb-6">
      <header class="flex items-center justify-between gap-3 py-4">
        <h1 class="text-xl font-semibold text-gray-900">{title}</h1>
        {action}
      </header>
      {children}
    </div>
  )
}

// JSX.IntrinsicElements, not JSX.HTMLAttributes: the latter omits
// element-specific props like `type`, `value` and `disabled`.
type ButtonProps = JSX.IntrinsicElements['button'] & {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
}

export function Button({ variant = 'primary', class: className, ...props }: ButtonProps) {
  const variants = {
    primary: 'bg-gray-900 text-white',
    secondary: 'border border-gray-300 bg-white text-gray-800',
    danger: 'border border-red-300 bg-white text-red-700',
    ghost: 'text-gray-600',
  } as const

  return (
    <button
      {...props}
      class={`${TAP} inline-flex items-center justify-center gap-2 rounded-lg px-4 text-sm
              font-medium disabled:opacity-50 ${variants[variant]} ${className ?? ''}`}
    />
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string | null
  children: ComponentChildren
}) {
  return (
    <label class="block space-y-1">
      <span class="text-sm font-medium text-gray-700">{label}</span>
      {children}
      {hint && !error && <span class="block text-xs text-gray-500">{hint}</span>}
      {error && (
        <span role="alert" class="block text-xs text-red-600">
          {error}
        </span>
      )}
    </label>
  )
}

const CONTROL = `${TAP} w-full rounded-lg border border-gray-300 bg-white px-3 text-base
                 text-gray-900 focus:border-gray-900 focus:outline-none focus:ring-1
                 focus:ring-gray-900`

export function Input({ class: className, ...props }: JSX.IntrinsicElements['input']) {
  return <input {...props} class={`${CONTROL} ${className ?? ''}`} />
}

export function Textarea({ class: className, ...props }: JSX.IntrinsicElements['textarea']) {
  return <textarea {...props} rows={3} class={`${CONTROL} py-2 ${className ?? ''}`} />
}

export function Select({ class: className, ...props }: JSX.IntrinsicElements['select']) {
  return <select {...props} class={`${CONTROL} ${className ?? ''}`} />
}

export function Card({ children, class: className }: { children: ComponentChildren; class?: string }) {
  return (
    <div class={`rounded-lg border border-gray-200 bg-white p-4 ${className ?? ''}`}>{children}</div>
  )
}

/**
 * What a list shows when it has nothing in it. Always offers the next action,
 * because an empty screen with no way forward is a dead end -- and on a first
 * install, every screen is empty.
 */
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: ComponentChildren
}) {
  return (
    <div class="rounded-lg border border-dashed border-gray-300 px-4 py-10 text-center">
      <p class="font-medium text-gray-800">{title}</p>
      <p class="mx-auto mt-1 max-w-xs text-sm text-gray-500">{description}</p>
      {action && <div class="mt-4 flex justify-center">{action}</div>}
    </div>
  )
}

export function ErrorNote({ children }: { children: ComponentChildren }) {
  return (
    <p role="alert" class="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </p>
  )
}

const CHIP_TONES = {
  neutral: 'bg-gray-100 text-gray-700',
  good: 'bg-green-100 text-green-800',
  warn: 'bg-amber-100 text-amber-900',
  bad: 'bg-red-100 text-red-800',
  info: 'bg-blue-100 text-blue-800',
} as const

export type ChipTone = keyof typeof CHIP_TONES

export function Chip({ tone = 'neutral', children }: { tone?: ChipTone; children: ComponentChildren }) {
  return (
    <span class={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${CHIP_TONES[tone]}`}>
      {children}
    </span>
  )
}

/** A tappable row in a list. An anchor, so long-press and middle-click work. */
export function ListRow({ href, children }: { href: string; children: ComponentChildren }) {
  return (
    <a
      href={href}
      class="flex items-center justify-between gap-3 border-b border-gray-100 px-1 py-3
             last:border-b-0 active:bg-gray-50"
    >
      {children}
    </a>
  )
}
