/**
 * 2D vector / point math. Units are millimetres, angles are radians.
 * Coordinates are SVG-like (x right, y down), so a positive angle turns from +x towards +y,
 * which is clockwise on screen.
 */

export interface Vec {
  readonly x: number
  readonly y: number
}

/** A point is just a position vector. */
export type Point = Vec

export const EPS = 1e-9

export const vec = (x: number, y: number): Vec => ({ x, y })
export const ORIGIN: Vec = vec(0, 0)

export const add = (a: Vec, b: Vec): Vec => vec(a.x + b.x, a.y + b.y)
export const sub = (a: Vec, b: Vec): Vec => vec(a.x - b.x, a.y - b.y)
export const scale = (a: Vec, k: number): Vec => vec(a.x * k, a.y * k)
export const neg = (a: Vec): Vec => vec(-a.x, -a.y)
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y
/** z component of the 3D cross product. */
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x
export const length = (a: Vec): number => Math.hypot(a.x, a.y)
export const distance = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y)

/** Unit vector in the direction of `a`. Returns the zero vector for a zero-length input. */
export const normalize = (a: Vec): Vec => {
  const l = length(a)
  return l < EPS ? ORIGIN : vec(a.x / l, a.y / l)
}

/** Linear interpolation: `a` at t = 0, `b` at t = 1. */
export const lerp = (a: Vec, b: Vec, t: number): Vec =>
  vec(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)

export const midpoint = (a: Vec, b: Vec): Vec => lerp(a, b, 0.5)

/** Angle of vector `a` (radians, from +x towards +y). */
export const angle = (a: Vec): number => Math.atan2(a.y, a.x)

/** Angle of the direction from `a` to `b`. */
export const angleTo = (a: Vec, b: Vec): number => angle(sub(b, a))

/** Signed angle that rotates `a` onto `b`, in (-π, π]. */
export const angleBetween = (a: Vec, b: Vec): number => Math.atan2(cross(a, b), dot(a, b))

/** Unit vector at `theta`. */
export const fromAngle = (theta: number): Vec => vec(Math.cos(theta), Math.sin(theta))

/** Perpendicular: `a` rotated +90° (towards +y from +x). */
export const perp = (a: Vec): Vec => vec(-a.y, a.x)

/** Rotate point `p` by `theta` radians about `pivot` (default origin). */
export const rotate = (p: Vec, theta: number, pivot: Vec = ORIGIN): Vec => {
  const c = Math.cos(theta)
  const s = Math.sin(theta)
  const dx = p.x - pivot.x
  const dy = p.y - pivot.y
  return vec(pivot.x + dx * c - dy * s, pivot.y + dx * s + dy * c)
}

/** Mirror point `p` across the infinite line through `a` and `b`. */
export const mirror = (p: Vec, a: Vec, b: Vec): Vec => {
  const foot = perpendicularFoot(p, a, b)
  return sub(scale(foot, 2), p)
}

export const equals = (a: Vec, b: Vec, eps = 1e-6): boolean => distance(a, b) <= eps

export const degToRad = (deg: number): number => (deg * Math.PI) / 180
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI

// ---------- construction helpers ----------

/** Point at `dist` from `origin` in direction `theta` (radians). */
export const pointAtAngle = (origin: Vec, theta: number, dist: number): Vec =>
  add(origin, scale(fromAngle(theta), dist))

/** Point at `dist` from `origin` along direction `dir` (need not be unit). */
export const pointInDirection = (origin: Vec, dir: Vec, dist: number): Vec =>
  add(origin, scale(normalize(dir), dist))

/**
 * Point at distance `dist` from `a` on the line towards `b`. Negative distances go backwards;
 * distances beyond |ab| extend the line.
 */
export const pointAlong = (a: Vec, b: Vec, dist: number): Vec =>
  pointInDirection(a, sub(b, a), dist)

/**
 * Parameter u such that `a + u (b - a)` is the orthogonal projection of `p` on line ab
 * (0 at a, 1 at b). Throws if a and b coincide.
 */
export const projectParam = (p: Vec, a: Vec, b: Vec): number => {
  const ab = sub(b, a)
  const l2 = dot(ab, ab)
  if (l2 < EPS * EPS) throw new Error('projectParam: degenerate line (a == b)')
  return dot(sub(p, a), ab) / l2
}

/** Foot of the perpendicular from `p` onto the infinite line through `a` and `b`. */
export const perpendicularFoot = (p: Vec, a: Vec, b: Vec): Vec => lerp(a, b, projectParam(p, a, b))

/** Signed distance from `p` to the line ab; positive on the `perp(b - a)` side. */
export const signedDistanceToLine = (p: Vec, a: Vec, b: Vec): number =>
  cross(normalize(sub(b, a)), sub(p, a))
