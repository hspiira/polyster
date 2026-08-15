/* Curve fitting for the line charts. Pure, so the one property that matters --
   a smoothed money line never leaves the range of its own data -- is testable. */

export interface Point {
  x: number
  y: number
}

/* Fritsch-Carlson tangents. A Catmull-Rom spline overshoots between points,
   which on a running total draws a dip below zero that never happened. */
export function monotoneTangents(points: readonly Point[]): number[] {
  const n = points.length
  if (n === 0) return []
  if (n === 1) return [0]

  const slopes: number[] = []
  for (let i = 0; i < n - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    const dx = b.x - a.x
    slopes.push(dx === 0 ? 0 : (b.y - a.y) / dx)
  }

  const tangents: number[] = new Array(n).fill(0)
  tangents[0] = slopes[0]!
  tangents[n - 1] = slopes[n - 2]!

  for (let i = 1; i < n - 1; i += 1) {
    const before = slopes[i - 1]!
    const after = slopes[i]!
    // A turning point gets a flat tangent, which is what stops the overshoot.
    if (before * after <= 0) {
      tangents[i] = 0
      continue
    }
    const average = (before + after) / 2
    const limit = 3 * Math.min(Math.abs(before), Math.abs(after))
    tangents[i] = Math.sign(average) * Math.min(Math.abs(average), limit)
  }

  return tangents
}

/** An SVG `d` through every point, smoothed but never overshooting one. */
export function smoothPath(points: readonly Point[]): string {
  if (points.length === 0) return ''
  const first = points[0]!
  if (points.length === 1) return `M${first.x} ${first.y}`

  const tangents = monotoneTangents(points)
  let d = `M${first.x} ${first.y}`
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    const third = (b.x - a.x) / 3
    const c1y = a.y + tangents[i]! * third
    const c2y = b.y - tangents[i + 1]! * third
    d += ` C${a.x + third} ${c1y} ${b.x - third} ${c2y} ${b.x} ${b.y}`
  }
  return d
}

/* Where a curve actually reaches, control points included. The bound the
   overshoot test asserts against. */
export function pathExtent(points: readonly Point[]): { min: number; max: number } {
  if (points.length === 0) return { min: 0, max: 0 }
  const tangents = monotoneTangents(points)
  let min = Infinity
  let max = -Infinity

  const see = (value: number) => {
    if (value < min) min = value
    if (value > max) max = value
  }

  for (let i = 0; i < points.length; i += 1) see(points[i]!.y)
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!
    const b = points[i + 1]!
    const third = (b.x - a.x) / 3
    see(a.y + tangents[i]! * third)
    see(b.y - tangents[i + 1]! * third)
  }

  return { min, max }
}
