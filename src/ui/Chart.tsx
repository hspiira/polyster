/**
 * Charts, drawn by hand.
 *
 * No chart library, for the same reason there is no icon package (ARCHITECTURE
 * section 8): these are a few hundred bytes of SVG each, against tens of
 * kilobytes for a library, on a metered connection.
 *
 * Each chart measures its own box and draws in real pixels. A fixed viewBox
 * stretched to fit is a smaller amount of code and it lies: the bars come out
 * thin, the corner radii turn oval and the strokes thicken on one axis only.
 *
 * Fixed specs, so two charts never disagree: bars fill their slot up to 24px
 * with a rounded data-end and a square baseline, lines are 2px, and every chart
 * is `role="img"` with a spoken summary and the same numbers in text beside it,
 * so colour is never the only channel.
 */
import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef, useState } from 'preact/hooks'
import { cn } from '../lib/cn'

const MAX_BAR = 24
const MIN_BAR = 8
/** Share of a slot the bar takes; the rest is the air between neighbours. */
const BAR_FILL = 0.66
const RADIUS = 4

/**
 * The rendered width of a block, so a chart can draw at 1:1 rather than scale.
 *
 * Measured in a layout effect, so the first paint already has the real width
 * rather than an empty box that fills in a frame later.
 *
 * Both a ResizeObserver and a window listener, because neither covers the other:
 * the observer catches the box changing while the window does not (a rail opens,
 * a container query fires), and it is delivered on the rendering lifecycle, so a
 * page that is not painting -- a background tab -- never hears from it.
 */
function useWidth(): [{ current: HTMLDivElement | null }, number] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return

    const measure = () => setWidth(node.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [])

  // Every render, not only on mount: if the box has changed and neither signal
  // above arrived, the next render corrects it rather than leaving a chart drawn
  // to a width the screen no longer has.
  useLayoutEffect(() => {
    const measured = ref.current?.clientWidth
    if (measured && measured !== width) setWidth(measured)
  })

  return [ref, width]
}

/** A bar in a row: the shape used for shares, stages and rankings. */
export function MeterRow({
  label,
  value,
  /** 0..1. Width of the fill. */
  share,
  tone = 'bg-accent',
  trailing,
}: {
  label: ComponentChildren
  value: ComponentChildren
  share: number
  tone?: string
  trailing?: ComponentChildren
}) {
  return (
    <div class="py-1.5">
      <div class="flex items-baseline justify-between gap-3">
        <span class="min-w-0 flex-1 truncate text-[15px] font-medium">{label}</span>
        <span class="shrink-0 text-sm font-semibold tabular-nums">{value}</span>
      </div>
      <div class="mt-1 flex items-center gap-2">
        <span class="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-sunken">
          <span
            class={cn('block h-full rounded-pill transition-[width]', tone)}
            style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%` }}
          />
        </span>
        {trailing && (
          <span class="shrink-0 text-xs tabular-nums text-content-muted">{trailing}</span>
        )}
      </div>
    </div>
  )
}

export interface FlowBar {
  /** Axis label, kept short: "13", "7 Aug", "Aug". */
  label: string
  /** Money in, drawn above the baseline. */
  up: number
  /** Money out, drawn below it. */
  down: number
}

/** Rounded at the data end, square where it meets the baseline. */
function bar(x: number, width: number, baseline: number, height: number, up: boolean): string {
  if (height <= 0) return ''
  const r = Math.min(RADIUS, width / 2, height)
  const end = up ? baseline - height : baseline + height
  const dir = up ? 1 : -1

  return [
    `M${x} ${baseline}`,
    `V${end + r * dir}`,
    `Q${x} ${end} ${x + r} ${end}`,
    `H${x + width - r}`,
    `Q${x + width} ${end} ${x + width} ${end + r * dir}`,
    `V${baseline}`,
    'Z',
  ].join(' ')
}

/**
 * Money in above a baseline, money out below it.
 *
 * The two series are told apart by which side of the line they sit on before
 * colour does any work: red/green separation collapses for a deuteranope, side
 * of the axis does not.
 */
export function FlowColumns({
  bars,
  selected,
  onSelect,
  summary,
}: {
  bars: readonly FlowBar[]
  selected?: number | null
  onSelect?: (index: number | null) => void
  /** Spoken instead of the drawing. State the shape and the extremes. */
  summary: string
}) {
  const [ref, width] = useWidth()

  const height = 152
  const labels = 14
  const mid = (height - labels) / 2
  const peak = Math.max(1, ...bars.map((b) => Math.max(b.up, b.down)))
  const slot = width / Math.max(1, bars.length)
  const barWidth = Math.max(MIN_BAR, Math.min(MAX_BAR, slot * BAR_FILL))
  const scale = (value: number) => (value / peak) * (mid - 6)

  // Every label if they fit, else every other one, so they never collide.
  const labelStep = slot >= 26 ? 1 : Math.ceil(26 / slot)

  return (
    <div ref={ref}>
      {width > 0 && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          class="block touch-manipulation"
          role="img"
          aria-label={summary}
        >
          {bars.map((entry, index) => {
            const centre = slot * index + slot / 2
            const active = selected === index
            const dim = selected != null && !active
            return (
              <g key={entry.label}>
                {/* Full-slot hit target: a 24px bar is not a comfortable tap. */}
                <rect
                  x={slot * index}
                  y={0}
                  width={slot}
                  height={height - labels}
                  rx={6}
                  fill={active ? 'var(--hover)' : 'transparent'}
                  onClick={() => onSelect?.(active ? null : index)}
                />
                <path
                  d={bar(centre - barWidth / 2, barWidth, mid, scale(entry.up), true)}
                  fill="var(--success)"
                  opacity={dim ? 0.4 : 1}
                />
                <path
                  d={bar(centre - barWidth / 2, barWidth, mid, scale(entry.down), false)}
                  fill="var(--content-subtle)"
                  opacity={dim ? 0.4 : 1}
                />
                {index % labelStep === 0 && (
                  <text
                    x={centre}
                    y={height - 2}
                    text-anchor="middle"
                    class="text-[10px]"
                    fill={active ? 'var(--content)' : 'var(--content-subtle)'}
                  >
                    {entry.label}
                  </text>
                )}
              </g>
            )
          })}
          <line
            x1="0"
            y1={mid}
            x2={width}
            y2={mid}
            stroke="var(--line-strong)"
            stroke-width="1"
          />
        </svg>
      )}
    </div>
  )
}

/**
 * One series over time: a 2px line on a 10% wash, last point marked.
 *
 * A single series, so no legend -- the heading above it says what is plotted.
 */
export function Sparkline({
  values,
  summary,
  tone = 'var(--accent)',
}: {
  values: readonly number[]
  summary: string
  tone?: string
}) {
  const [ref, width] = useWidth()
  const height = 72
  const pad = 6

  const min = Math.min(0, ...values)
  const max = Math.max(1, ...values)
  const span = max - min || 1
  const x = (index: number) => (index / Math.max(1, values.length - 1)) * width
  const y = (value: number) => pad + (1 - (value - min) / span) * (height - pad * 2)

  const line = values.map((value, index) => `${index === 0 ? 'M' : 'L'}${x(index)} ${y(value)}`)
  const last = values[values.length - 1]

  return (
    <div ref={ref}>
      {width > 0 && values.length > 1 && last !== undefined && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          class="block"
          role="img"
          aria-label={summary}
        >
          <path
            d={`${line.join(' ')} L${width} ${height} L0 ${height} Z`}
            fill={tone}
            opacity="0.1"
          />
          <path
            d={line.join(' ')}
            fill="none"
            stroke={tone}
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          {/* Ringed in the surface colour so it reads where it crosses the line. */}
          <circle
            cx={x(values.length - 1)}
            cy={y(last)}
            r="4"
            fill={tone}
            stroke="var(--surface)"
            stroke-width="2"
          />
        </svg>
      )}
    </div>
  )
}
