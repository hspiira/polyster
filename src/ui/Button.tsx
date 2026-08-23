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

/* 44px is the thumb floor. A mouse does not need it, and a back office full of
   44px controls reads as a phone app someone stretched. */
const SIZES: Record<Size, string> = {
  sm: 'min-h-9 px-3 text-sm fine:min-h-7 fine:px-2.5',
  md: 'min-h-tap px-4 text-[15px] fine:min-h-9 fine:px-3.5 fine:text-sm',
  lg: 'min-h-12 px-5 text-base fine:min-h-10',
}

type ButtonBase = {
  variant?: Variant
  size?: Size
  block?: boolean
}

type ButtonProps = ButtonBase & JSX.IntrinsicElements['button']

/* `linkTo` renders an anchor that looks like a button, so navigation actions
   stop being `<a><Button/></a>` -- invalid, and two tab stops for a keyboard. */
type ButtonLinkProps = ButtonBase &
  Omit<JSX.IntrinsicElements['a'], 'href'> & { linkTo: string }

export function Button(props: ButtonProps | ButtonLinkProps) {
  /* One destructure. `in` discriminates the union on its own now that ButtonProps
     no longer declares linkTo, which is what forced the old hand-narrowing. */
  const { variant = 'primary', size = 'md', block = false, class: className, ...rest } = props

  const classes = cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium',
    'transition-[background-color,color,transform] duration-100',
    'active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40',
    SIZES[size],
    VARIANTS[variant],
    block && 'w-full',
    className,
  )

  if ('linkTo' in rest) {
    // Children spelled out, not left in the spread: an anchor whose content
    // arrives that way cannot be checked for having any.
    const { linkTo, children, ...anchor } = rest
    return (
      <a {...anchor} href={linkTo} class={classes}>
        {children}
      </a>
    )
  }

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
