/** 2D affine transforms (see Affine in ./types). */
import { normalize, sub, type Vec } from '../vec'
import type { Affine } from './types'

export const IDENTITY: Affine = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }

export const applyAffine = (m: Affine, p: Vec): Vec => ({
  x: m.a * p.x + m.c * p.y + m.e,
  y: m.b * p.x + m.d * p.y + m.f,
})

/** `outer ∘ inner`: apply `inner` first, then `outer`. */
export const composeAffine = (outer: Affine, inner: Affine): Affine => ({
  a: outer.a * inner.a + outer.c * inner.b,
  b: outer.b * inner.a + outer.d * inner.b,
  c: outer.a * inner.c + outer.c * inner.d,
  d: outer.b * inner.c + outer.d * inner.d,
  e: outer.a * inner.e + outer.c * inner.f + outer.e,
  f: outer.b * inner.e + outer.d * inner.f + outer.f,
})

export const translation = (t: Vec): Affine => ({ ...IDENTITY, e: t.x, f: t.y })

/** Rotation by `theta` radians (clockwise on screen, y down) about `pivot`. */
export const rotationAbout = (theta: number, pivot: Vec): Affine => {
  const cos = Math.cos(theta)
  const sin = Math.sin(theta)
  return {
    a: cos,
    b: sin,
    c: -sin,
    d: cos,
    e: pivot.x - cos * pivot.x + sin * pivot.y,
    f: pivot.y - sin * pivot.x - cos * pivot.y,
  }
}

/** Reflection across the infinite line through `p` and `q` (p ≠ q). */
export const reflectionAcross = (p: Vec, q: Vec): Affine => {
  const u = normalize(sub(q, p))
  if (u.x === 0 && u.y === 0) throw new Error('reflectionAcross: degenerate axis')
  const a = u.x * u.x - u.y * u.y
  const b = 2 * u.x * u.y
  const d = -a
  // x' = R (x − p) + p
  return { a, b, c: b, d, e: p.x - a * p.x - b * p.y, f: p.y - b * p.x - d * p.y }
}

/** Determinant of the linear part: negative when the transform mirrors. */
export const affineDet = (m: Affine): number => m.a * m.d - m.b * m.c

/** Rotation angle of the linear part (radians); for a mirroring transform, of its rotation part. */
export const affineRotation = (m: Affine): number => Math.atan2(m.b, m.a)
