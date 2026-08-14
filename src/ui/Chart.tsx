/* Charts drawn by hand: a few hundred bytes of SVG against tens of kilobytes of
   library (§8). Each measures its own box, so nothing is stretched to fit. */
import { useLayoutEffect, useRef, useState } from 'preact/hooks'

const MAX_BAR = 24
const MIN_BAR = 8
/** Share of a slot the bar takes; the rest is the air between neighbours. */
const BAR_FILL = 0.66
const RADIUS = 4

/* Rendered width, measured in a layout effect so the first paint is right. Both
   a ResizeObserver and a window listener: neither covers the other's case. */
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

  // Every render on purpose: corrects a chart drawn to a width that has changed
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the guard stops the loop
  useLayoutEffect(() => {
    const measured = ref.current?.clientWidth
    if (measured && measured !== width) setWidth(measured)
  })

  return [ref, width]
}

export interface Share {
  key: string
  label: string
  value: number
  formatted: string
  hint?: string
}

/* Steps of one hue, not six invented colours: position and order carry identity
   and opacity only reinforces it. The 0.35 floor keeps late steps visible. */
const STEPS = [1, 0.82, 0.68, 0.56, 0.45, 0.35]

/** Part-to-whole in one strip, with the segments named underneath. */
export function ShareBar({
  shares,
  total,
  summary,
}: {
  shares: readonly Share[]
  total: number
  summary: string
}) {
  if (total <= 0 || shares.length === 0) return null

  const percent = (value: number) => (value / total) * 100
  const step = (index: number) => STEPS[Math.min(index, STEPS.length - 1)] ?? 0.2

  return (
    <div>
      {/* gap-0.5 is the 2px of surface that separates touching segments; a
          border round each one would add ink that is not data. */}
      <div class="flex h-4 gap-0.5 overflow-hidden rounded-pill" role="img" aria-label={summary}>
        {shares.map((share, index) => (
          <span
            key={share.key}
            class="block h-full first:rounded-l-pill last:rounded-r-pill"
            style={{
              width: `${percent(share.value)}%`,
              backgroundColor: 'var(--accent)',
              opacity: step(index),
            }}
          />
        ))}
      </div>

      <ul class="mt-3 space-y-1.5">
        {shares.map((share, index) => (
          <li key={share.key} class="flex items-baseline gap-2">
            <span
              class="mt-1 size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: 'var(--accent)', opacity: step(index) }}
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1 truncate text-sm">
              {share.label}
              {share.hint && <span class="text-content-muted"> · {share.hint}</span>}
            </span>
            <span class="shrink-0 text-sm font-semibold tabular-nums">{share.formatted}</span>
            <span class="w-9 shrink-0 text-right text-xs tabular-nums text-content-muted">
              {Math.round(percent(share.value))}%
            </span>
          </li>
        ))}
      </ul>
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

/* Money in above the baseline, out below. Side of the baseline is the primary
   channel: red/green collapses for a deuteranope, position does not. */
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
                  fill="var(--danger)"
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

/* One series over time: a 2px line on a 10% wash, last point marked. No legend
   -- the heading above says what is plotted. */
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
