/**
 * The page frame inside the work area: breadcrumb, title, optional tabs, an
 * optional view bar, and the body.
 *
 * The web design's equivalent of ui/Screen.tsx, and deliberately a different
 * component rather than a prop on that one. Screen caps a reading measure and
 * clears a floating tab bar; neither is true here, and a component that did
 * both would be the compromise again.
 */
import type { ComponentChildren } from 'preact'
import { cn } from '../lib/cn'
import { GUTTER, TEXT_UI, TEXT_XS } from './chrome'

export function Page({
  crumbs,
  title,
  actions,
  tabs,
  viewbar,
  children,
}: {
  /** Ancestors only. The page's own name is `title`. */
  crumbs?: string[]
  title: string
  actions?: ComponentChildren
  tabs?: ComponentChildren
  /** Filters, search, column controls. Sits under the tabs and above the body. */
  viewbar?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <div class={cn('flex min-w-0 flex-1 flex-col', TEXT_UI)}>
      <div class={cn('pt-3.5', GUTTER)}>
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" class={cn('mb-0.5 flex items-center gap-1.5 text-content-subtle', TEXT_XS)}>
            {crumbs.map((crumb) => (
              <span key={crumb} class="after:ml-1.5 after:content-['/'] last:after:content-none">
                {crumb}
              </span>
            ))}
          </nav>
        )}
        <div class="flex items-center gap-3">
          <h1 class="min-w-0 flex-1 truncate text-[18px] font-semibold tracking-tight">{title}</h1>
          {actions}
        </div>
      </div>

      {tabs && <div class={cn('mt-2.5 flex gap-4 border-b border-line', GUTTER)}>{tabs}</div>}
      {viewbar && <div class={cn('flex items-center gap-1.5 py-2.5', GUTTER)}>{viewbar}</div>}

      <div class={cn('flex min-h-0 flex-1 flex-col pb-3', GUTTER, !viewbar && 'pt-2.5')}>
        {children}
      </div>
    </div>
  )
}

export function PageTab({
  selected = false,
  children,
  onClick,
}: {
  selected?: boolean
  children: ComponentChildren
  onClick?: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={selected}
      onClick={onClick}
      class={cn(
        '-mb-px border-b-2 py-1.5 text-[12.5px] font-medium',
        selected
          ? 'border-accent font-semibold text-content'
          : 'border-transparent text-content-muted hover:text-content',
      )}
    >
      {children}
    </button>
  )
}
