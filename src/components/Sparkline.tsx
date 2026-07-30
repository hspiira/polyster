/**
 * A minimal inline trend line, in the spirit of the per-asset charts in
 * consumer finance apps -- but only used where there is a real daily series
 * behind it. A sparkline drawn from data that does not exist is worse than no
 * chart at all in an app whose whole premise is that figures are trustworthy;
 * see the "figures come from what is on this device" note on Reports.
 *
 * No charting library. This is nine points and a `<path>`, and the project's
 * standing rule is that bundle size is a design constraint (ARCHITECTURE.md
 * section 8) -- the same reason the icon set is hand-rolled SVG rather than a
 * package.
 */
interface SparklineProps {
  values: readonly number[]
  width?: number
  height?: number
  class?: string
  /** Fills the area under the line at low opacity, in the current colour. */
  filled?: boolean
}

export function Sparkline({ values, width = 96, height = 32, class: className, filled }: SparklineProps) {
  if (values.length < 2) return null

  const min = Math.min(...values)
  const max = Math.max(...values)
  // A flat series (every day the same, including all-zero) would divide by
  // zero and collapse to a single point -- draw it as a flat mid-line instead
  // of hiding it, since "nothing happened" is a real and legible answer.
  const span = max - min || 1

  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width
    const y = height - ((value - min) / span) * height
    return [x, y] as const
  })

  const line = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  const area = `${line} L${width},${height} L0,${height} Z`

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      class={className}
      role="img"
      aria-hidden="true"
    >
      {filled && <path d={area} fill="currentColor" opacity="0.12" />}
      <path d={line} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  )
}
