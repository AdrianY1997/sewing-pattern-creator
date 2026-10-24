/** Real-root polynomial solvers used by bezier bounding boxes and intersections. */

const TINY = 1e-12

/** Real roots of a·x + b = 0 (empty when degenerate). */
const solveLinear = (a: number, b: number): number[] => (Math.abs(a) < TINY ? [] : [-b / a])

/** Real roots of a·x² + b·x + c = 0. */
export const solveQuadratic = (a: number, b: number, c: number): number[] => {
  const scaleRef = Math.max(Math.abs(a), Math.abs(b), Math.abs(c))
  if (scaleRef < TINY) return []
  if (Math.abs(a) < TINY * scaleRef) return solveLinear(b, c)
  const disc = b * b - 4 * a * c
  if (disc < -TINY * scaleRef * scaleRef) return []
  if (disc <= 0) return [-b / (2 * a)]
  // Numerically stable form (avoids cancellation).
  const q = -0.5 * (b + Math.sign(b || 1) * Math.sqrt(disc))
  const r1 = q / a
  const r2 = Math.abs(q) < TINY ? r1 : c / q
  return r1 === r2 ? [r1] : [r1, r2]
}

/** Real roots of a·x³ + b·x² + c·x + d = 0, each polished with Newton steps. */
export const solveCubic = (a: number, b: number, c: number, d: number): number[] => {
  const scaleRef = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d))
  if (scaleRef < TINY) return []
  if (Math.abs(a) < 1e-9 * scaleRef) return solveQuadratic(b, c, d)
  const A = b / a
  const B = c / a
  const C = d / a
  // Depressed cubic t³ + p t + q = 0 with x = t - A/3.
  const p = B - (A * A) / 3
  const q = (2 * A * A * A) / 27 - (A * B) / 3 + C
  const shift = -A / 3
  const disc = (q * q) / 4 + (p * p * p) / 27
  let roots: number[]
  if (Math.abs(disc) < 1e-14) {
    const u = Math.cbrt(-q / 2)
    roots = [2 * u + shift, -u + shift]
  } else if (disc > 0) {
    const s = Math.sqrt(disc)
    roots = [Math.cbrt(-q / 2 + s) + Math.cbrt(-q / 2 - s) + shift]
  } else {
    const r = Math.sqrt(-p / 3)
    const phi = Math.acos(Math.max(-1, Math.min(1, -q / (2 * r * r * r))))
    roots = [0, 1, 2].map((k) => 2 * r * Math.cos((phi - 2 * Math.PI * k) / 3) + shift)
  }
  const f = (x: number) => ((a * x + b) * x + c) * x + d
  const df = (x: number) => (3 * a * x + 2 * b) * x + c
  return roots.map((x) => {
    let y = x
    for (let i = 0; i < 4; i++) {
      const dy = df(y)
      if (Math.abs(dy) < TINY) break
      const next = y - f(y) / dy
      if (!Number.isFinite(next)) break
      y = next
    }
    return Math.abs(f(y)) <= Math.abs(f(x)) ? y : x
  })
}
