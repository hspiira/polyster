/* Buttons, and the header action that behaves like one. Focus is drawn once in
   index.css -- do not add a per-variant focus style. */
import type { ComponentChildren, JSX } from 'preact'
import { cn } from '../lib/cn'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-content hover:bg-accent-hover',
  secondary: 'bg-surface-sunken text-content hover:bg-pressed',
  danger: 'bg-danger-soft text-danger-on-soft hover:bg-danger hover:text-danger-content',
  ghost: 'text-content-muted hover:bg-hover hover:text-content',
}

/** 44px floor: below it mis-taps become common, with a thumb or a mouse. */
const SIZES: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm',
  md: 'min-h-tap px-4 text-[15px]',
  lg: 'min-h-12 px-5 text-base',
}

type ButtonBase = {
  variant?: Variant
  size?: Size
  block?: boolean
}

type ButtonProps = ButtonBase & JSX.IntrinsicElements['button'] & { linkTo?: never }

/* `linkTo` renders an anchor that looks like a button, so navigation actions
   stop being `<a><Button/></a>` -- invalid, and two tab stops for a keyboard. */
type ButtonLinkProps = ButtonBase &
  Omit<JSX.IntrinsicElements['a'], 'href'> & { linkTo: string }

export function Button(props: ButtonProps | ButtonLinkProps) {
  const { variant = 'primary', size = 'md', block = false, class: className } = props

  const classes = cn(
    'inline-flex items-center justify-center gap-2 rounded-control font-medium',
    'transition-[background-color,color,transform] duration-100',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
    SIZES[size],
    VARIANTS[variant],
    block && 'w-full',
    className,
  )

  if (props.linkTo) {
    // Children spelled out rather than left in the spread: an anchor whose
    // content arrives that way cannot be checked for having any.
    const { linkTo, variant: _v, size: _s, block: _b, class: _c, children, ...rest } = props
    return (
      <a {...rest} href={linkTo} class={classes}>
        {children}
      </a>
    )
  }

  // Narrowed by hand: `linkTo?: never` does not discriminate the union well
  // enough for TypeScript to keep anchor-only attributes out of the rest.
  const { variant: _v, size: _s, block: _b, class: _c, linkTo: _l, ...rest } = props as ButtonProps
  return <button {...rest} class={classes} />
}

/* A screen header's action. Text where it fits, so a create action needs no
   floating button competing with the tab bar. */
export function HeaderAction({
  href,
  onClick,
  label,
  icon,
}: {
  href?: string
  onClick?: () => void
  label: string
  icon?: ComponentChildren
}) {
  const style = cn(
    'flex min-h-tap shrink-0 items-center gap-1.5 rounded-control px-3',
    'text-sm font-semibold text-accent transition-colors hover:bg-accent-soft',
  )
  const inner = (
    <>
      {icon}
      {label}
    </>
  )

  if (href) {
    return (
      <a href={href} class={style}>
        {inner}
      </a>
    )
  }

  return (
    <button type="button" onClick={onClick} class={cn(style, '-mr-2')}>
      {inner}
    </button>
  )
}
