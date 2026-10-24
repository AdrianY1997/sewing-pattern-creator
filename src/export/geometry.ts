/** Geometry helpers of the export model: paths to commands, bounding boxes, translation. */
import {
  bezierBBox,
  bezierLength,
  cubic,
  distance,
  KAPPA,
  type Path,
  type Segment,
  type Vec,
} from '../core'
import type { Box, Group, PathCmd, Prim } from './types'

const near = (a: Vec, b: Vec) => distance(a, b) < 1e-6

/** Commands of a chain of segments (a new subpath starts at every gap). Béziers stay curves. */
export function segmentsToCmds(segs: readonly Segment[], closed = false): PathCmd[] {
  const out: PathCmd[] = []
  let cursor: Vec | null = null
  let start: Vec | null = null
  for (const s of segs) {
    if (!cursor || !near(cursor, s.p0)) {
      if (closed && cursor && start) out.push({ c: 'Z' })
      out.push({ c: 'M', p: s.p0 })
      start = s.p0
    }
    if (s.kind === 'line') {
      out.push({ c: 'L', p: s.p1 })
      cursor = s.p1
    } else {
      out.push({ c: 'C', p1: s.p1, p2: s.p2, p: s.p3 })
      cursor = s.p3
    }
  }
  if (closed && out.length) out.push({ c: 'Z' })
  return out
}

export const pathToCmds = (p: Path): PathCmd[] => segmentsToCmds(p.segments, p.closed)

export const polylineCmds = (pts: readonly Vec[], closed = false): PathCmd[] =>
  pts.length === 0
    ? []
    : [
        { c: 'M', p: pts[0] },
        ...pts.slice(1).map((p): PathCmd => ({ c: 'L', p })),
        ...(closed ? [{ c: 'Z' } as PathCmd] : []),
      ]

/** Circle as four Bézier arcs. */
export function circleCmds(c: Vec, r: number): PathCmd[] {
  const k = KAPPA * r
  const P = (x: number, y: number): Vec => ({ x: c.x + x, y: c.y + y })
  return [
    { c: 'M', p: P(r, 0) },
    { c: 'C', p1: P(r, k), p2: P(k, r), p: P(0, r) },
    { c: 'C', p1: P(-k, r), p2: P(-r, k), p: P(-r, 0) },
    { c: 'C', p1: P(-r, -k), p2: P(-k, -r), p: P(0, -r) },
    { c: 'C', p1: P(k, -r), p2: P(r, -k), p: P(r, 0) },
    { c: 'Z' },
  ]
}

/** Total stroked length of path commands (mm): lines plus exact Bézier arc lengths. */
export function cmdsLength(cmds: readonly PathCmd[]): number {
  let total = 0
  let cur: Vec | null = null
  let start: Vec | null = null
  for (const k of cmds) {
    if (k.c === 'M') {
      cur = k.p
      start = k.p
    } else if (k.c === 'L' && cur) {
      total += distance(cur, k.p)
      cur = k.p
    } else if (k.c === 'C' && cur) {
      total += bezierLength(cubic('x', cur, k.p1, k.p2, k.p))
      cur = k.p
    } else if (k.c === 'Z' && cur && start) {
      total += distance(cur, start)
      cur = start
    }
  }
  return total
}

export const EMPTY_BOX: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }

export const boxUnion = (a: Box, b: Box): Box => ({
  minX: Math.min(a.minX, b.minX),
  minY: Math.min(a.minY, b.minY),
  maxX: Math.max(a.maxX, b.maxX),
  maxY: Math.max(a.maxY, b.maxY),
})

export const boxW = (b: Box) => b.maxX - b.minX
export const boxH = (b: Box) => b.maxY - b.minY
export const isEmptyBox = (b: Box) => !(b.maxX >= b.minX && b.maxY >= b.minY)

const ptBox = (p: Vec): Box => ({ minX: p.x, minY: p.y, maxX: p.x, maxY: p.y })

/** Exact bounding box of path commands (Bézier extrema included). */
export function cmdsBox(cmds: readonly PathCmd[]): Box {
  let b = EMPTY_BOX
  let cur: Vec | null = null
  for (const k of cmds) {
    if (k.c === 'Z') continue
    if (k.c === 'C' && cur) {
      const bb = bezierBBox(cubic('x', cur, k.p1, k.p2, k.p))
      b = boxUnion(b, bb)
    } else b = boxUnion(b, ptBox(k.p))
    cur = k.p
  }
  return b
}

/** Approximate box of a text (Helvetica-like metrics). */
const textBox = (t: Extract<Prim, { kind: 'text' }>): Box => {
  const w = t.text.length * t.sizeMm * 0.55
  const x0 = t.anchor === 'start' ? 0 : t.anchor === 'middle' ? -w / 2 : -w
  if (t.angleDeg) {
    const r = Math.max(w, t.sizeMm)
    return { minX: t.at.x - r, minY: t.at.y - r, maxX: t.at.x + r, maxY: t.at.y + r }
  }
  return {
    minX: t.at.x + x0,
    minY: t.at.y - t.sizeMm * 0.8,
    maxX: t.at.x + x0 + w,
    maxY: t.at.y + t.sizeMm * 0.25,
  }
}

export function primBox(p: Prim): Box {
  if (p.kind === 'path') return cmdsBox(p.cmds)
  if (p.kind === 'rect') return { minX: p.x, minY: p.y, maxX: p.x + p.w, maxY: p.y + p.h }
  return textBox(p)
}

export const primsBox = (prims: readonly Prim[]): Box =>
  prims.reduce((b, p) => boxUnion(b, primBox(p)), EMPTY_BOX)

export const groupBox = (g: Group): Box =>
  (g.children ?? []).reduce((b, c) => boxUnion(b, groupBox(c)), primsBox(g.prims))

const mv = (p: Vec, d: Vec): Vec => ({ x: p.x + d.x, y: p.y + d.y })

export function translatePrim(p: Prim, d: Vec): Prim {
  if (p.kind === 'rect') return { ...p, x: p.x + d.x, y: p.y + d.y }
  if (p.kind === 'text') return { ...p, at: mv(p.at, d) }
  return {
    ...p,
    cmds: p.cmds.map((k): PathCmd => {
      if (k.c === 'Z') return k
      if (k.c === 'C') return { c: 'C', p1: mv(k.p1, d), p2: mv(k.p2, d), p: mv(k.p, d) }
      return { c: k.c, p: mv(k.p, d) }
    }),
  }
}

export const translateGroup = (g: Group, d: Vec): Group => ({
  ...g,
  prims: g.prims.map((p) => translatePrim(p, d)),
  ...(g.children && { children: g.children.map((c) => translateGroup(c, d)) }),
})

export const translateBox = (b: Box, d: Vec): Box => ({
  minX: b.minX + d.x,
  minY: b.minY + d.y,
  maxX: b.maxX + d.x,
  maxY: b.maxY + d.y,
})

/** XML-safe id fragment. */
export const safeId = (s: string): string => s.replace(/[^A-Za-z0-9_.-]/g, '_')
