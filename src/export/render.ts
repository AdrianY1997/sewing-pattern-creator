/**
 * Render model: the drawable primitives of each pattern piece, per size and per layer, in world
 * millimetres (the layout translates them onto pages).
 */
import {
  add,
  applyAffine,
  flattenPath,
  gradingAnchor,
  isFoldEdge,
  nearestOutlineEdge,
  normalize,
  notchOnCutLine,
  outlineNormalAt,
  path,
  pieceLayoutBBox,
  pieceLocalPath,
  pieceWorldCutPath,
  pieceWorldPath,
  pointInPolygon,
  polygonSignedArea,
  projectOnSegment,
  replay,
  scale,
  segEnd,
  segmentLength,
  segmentPointAtLength,
  stripMeta,
  sub,
  worldSegment,
  type Draft,
  type DraftSegment,
  type PatternPiece,
  type Segment,
  type Vec,
} from '../core'
import {
  boxUnion,
  circleCmds,
  EMPTY_BOX,
  pathToCmds,
  polylineCmds,
  safeId,
  segmentsToCmds,
  translateGroup,
} from './geometry'
import type {
  Box,
  ExportLayer,
  ExportOptions,
  ExportSource,
  Group,
  Prim,
  SizeSource,
  Stroke,
} from './types'

/** Colour and line style of one size. */
export interface SizeStyle {
  readonly size: string
  readonly label: string
  readonly color: string
  /** Dash pattern of the cut line when cut lines are dashed (each size its own). */
  readonly cutDash: readonly number[]
}

const INK = '#1a1a1a'
const SOFT = '#4a4f5c'
const GUIDE = '#8a94ad'

/** Print-friendly, distinct hues for nested sizes (table order). */
export const SIZE_COLORS = [
  '#d62728',
  '#1f62b4',
  '#2c9a2c',
  '#8e44ad',
  '#e67e00',
  '#0f9fb0',
  '#8c564b',
  '#d6337f',
] as const
const SIZE_DASHES: readonly (readonly number[])[] = [
  [4, 2],
  [6, 1.5, 1, 1.5],
  [2, 1.5],
  [8, 2.5],
  [5, 1.5, 1, 1.5, 1, 1.5],
  [3, 3],
  [10, 2, 2, 2],
  [1.2, 1.2],
]

export function sizeStyles(sizes: readonly SizeSource[], nested: boolean): SizeStyle[] {
  return sizes.map((s, i) => ({
    size: s.id,
    label: s.label,
    color: nested && sizes.length > 1 ? SIZE_COLORS[i % SIZE_COLORS.length] : INK,
    cutDash: SIZE_DASHES[i % SIZE_DASHES.length],
  }))
}

const stroke = (color: string, widthMm: number, dash?: readonly number[]): Stroke =>
  dash ? { color, widthMm, dash } : { color, widthMm }

const segsPrim = (segs: readonly Segment[], st: Stroke): Prim => ({
  kind: 'path',
  cmds: segmentsToCmds(segs),
  stroke: st,
})

/** Area centroid of a polygon (vertex average when degenerate). */
export function centroid(pts: readonly Vec[]): Vec {
  const a = polygonSignedArea(pts)
  if (Math.abs(a) < 1e-9) {
    const n = Math.max(1, pts.length)
    return { x: pts.reduce((s, p) => s + p.x, 0) / n, y: pts.reduce((s, p) => s + p.y, 0) / n }
  }
  let cx = 0
  let cy = 0
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]
    const q = pts[(i + 1) % pts.length]
    const f = p.x * q.y - q.x * p.y
    cx += (p.x + q.x) * f
    cy += (p.y + q.y) * f
  }
  return { x: cx / (6 * a), y: cy / (6 * a) }
}

/** Degrees of a direction, flipped so text along it reads left to right. */
const readable = (d: Vec): number => {
  let a = (Math.atan2(d.y, d.x) * 180) / Math.PI
  if (a > 90) a -= 180
  if (a <= -90) a += 180
  return a
}

type Layers = Partial<Record<ExportLayer, Prim[]>>

const push = (l: Layers, k: ExportLayer, ...p: Prim[]) => {
  ;(l[k] ??= []).push(...p)
}

const grainSegmentId = (pc: PatternPiece): string | undefined => {
  const m = pc.marks.find((x) => x.kind === 'grainline' && typeof x.data?.segment === 'string')
  return m?.data?.segment as string | undefined
}

const dartLegIds = (pc: PatternPiece): Set<string> =>
  new Set(pc.darts.flatMap((d) => [...d.legs, ...(d.legs2 ?? [])]))

/** Filled triangular arrow head at `tip`, pointing along `dir`. */
const arrowHead = (tip: Vec, dir: Vec, len: number, color: string): Prim => {
  const u = normalize(dir)
  const base = sub(tip, scale(u, len))
  const side = scale({ x: -u.y, y: u.x }, len * 0.38)
  return {
    kind: 'path',
    cmds: polylineCmds([tip, add(base, side), sub(base, side)], true),
    fill: color,
  }
}

const NOTCH_LEN = 5
const NOTCH_GAP = 3

/** Notch ticks: on the cut line (into the allowance) or, without allowance, into the piece. */
function notchPrims(pc: PatternPiece, st: Stroke): Prim[] {
  const w = (p: Vec) => applyAffine(pc.transform, p)
  const out: Prim[] = []
  for (const m of pc.marks) {
    if (m.kind !== 'notch') continue
    const segId = typeof m.data?.segment === 'string' ? m.data.segment : undefined
    const count = Math.max(1, Math.floor(typeof m.data?.count === 'number' ? m.data.count : 1))
    let at: Vec
    let inward: Vec
    let len = NOTCH_LEN
    const hit = notchOnCutLine(pc, m.at, segId)
    if (hit) {
      at = hit.at
      inward = hit.inward
      len = Math.min(NOTCH_LEN, hit.allowance)
    } else {
      const edge =
        segId && pc.segments[segId]
          ? { segmentId: segId, ...projectOnSegment(stripMeta(pc.segments[segId]), m.at) }
          : nearestOutlineEdge(pc, m.at)
      const n = edge && outlineNormalAt(pc, edge.segmentId, edge.len)
      if (!n) continue
      at = m.at
      inward = scale(n, -1)
    }
    const along = { x: -inward.y, y: inward.x }
    for (let i = 0; i < count; i++) {
      const base = add(at, scale(along, (i - (count - 1) / 2) * NOTCH_GAP))
      out.push({
        kind: 'path',
        cmds: polylineCmds([w(base), w(add(base, scale(inward, len)))]),
        stroke: st,
      })
    }
  }
  return out
}

/**
 * Fold indicators: on each run of consecutive, collinear straight fold edges, a bracket with
 * arrows towards the edge and "DOBLEZ".
 */
function foldPrims(pc: PatternPiece, color: string): Prim[] {
  const local = pieceLocalPath(pc)
  const n = pc.outline.length
  const isFold = pc.outline.map(
    (r) => pc.segments[r.segment]?.kind === 'line' && isFoldEdge(pc, r.segment),
  )
  if (!isFold.some(Boolean)) return []
  const dir = (k: number) => normalize(sub(segEnd(local.segments[k]), local.segments[k].p0))
  const runs: number[][] = []
  const start = Math.max(
    0,
    isFold.findIndex((f) => !f),
  )
  for (let i = 0; i < n; i++) {
    const k = (start + i) % n
    if (!isFold[k]) continue
    const last = runs[runs.length - 1]
    const prev = (k - 1 + n) % n
    if (last && last[last.length - 1] === prev) {
      const u = dir(prev)
      const v = dir(k)
      if (Math.abs(u.x * v.y - u.y * v.x) < 1e-3) {
        last.push(k)
        continue
      }
    }
    runs.push([k])
  }
  const w = (p: Vec) => applyAffine(pc.transform, p)
  const out: Prim[] = []
  for (const ks of runs) {
    const A = local.segments[ks[0]].p0
    const B = segEnd(local.segments[ks[ks.length - 1]])
    const L = Math.hypot(B.x - A.x, B.y - A.y)
    if (L < 20) continue
    const u = normalize(sub(B, A))
    const outN = outlineNormalAt(pc, pc.outline[ks[0]].segment, 0)
    if (!outN) continue
    const inward = scale(outN, -1)
    const inset = Math.min(16, L / 4)
    const at = (t: number, d: number) => add(add(A, scale(u, t * L)), scale(inward, d))
    const p1 = w(at(0.15, inset))
    const p2 = w(at(0.85, inset))
    const t1 = w(at(0.15, 1))
    const t2 = w(at(0.85, 1))
    out.push({ kind: 'path', cmds: polylineCmds([t1, p1, p2, t2]), stroke: stroke(color, 0.3) })
    out.push(arrowHead(t1, sub(t1, p1), 4, color), arrowHead(t2, sub(t2, p2), 4, color))
    out.push({
      kind: 'text',
      at: w(at(0.5, inset + 7)),
      text: 'DOBLEZ',
      sizeMm: 5,
      color,
      anchor: 'middle',
      angleDeg: readable(sub(w(at(1, 0)), w(at(0, 0)))),
      bold: true,
    })
  }
  return out
}

/** Wavy "fruncir" line along a chain of world segments, inside the piece. */
function gatherPrims(
  segs: readonly Segment[],
  poly: readonly Vec[],
  text: string,
  st: Stroke,
): Prim[] {
  const total = segs.reduce((a, s) => a + segmentLength(s), 0)
  if (total <= 0) return []
  const at = (len: number) => {
    let rest = len
    for (const s of segs) {
      const l = segmentLength(s)
      if (rest <= l + 1e-9) return segmentPointAtLength(s, Math.min(rest, l))
      rest -= l
    }
    const last = segs[segs.length - 1]
    return segmentPointAtLength(last, segmentLength(last))
  }
  const mid = at(total / 2)
  const n0 = { x: -mid.tangent.y, y: mid.tangent.x }
  const side = pointInPolygon(add(mid.point, scale(n0, 3)), poly) ? 1 : -1
  const steps = Math.max(6, Math.round(total / 3))
  const pts: Vec[] = []
  for (let i = 0; i <= steps; i++) {
    const s = at((total * i) / steps)
    const off = (7 + (i % 2 === 0 ? -1.6 : 1.6)) * side
    pts.push({ x: s.point.x - s.tangent.y * off, y: s.point.y + s.tangent.x * off })
  }
  return [
    { kind: 'path', cmds: polylineCmds(pts), stroke: st },
    {
      kind: 'text',
      at: add(mid.point, scale(n0, 17 * side)),
      text,
      sizeMm: 4,
      color: st.color,
      anchor: 'middle',
      angleDeg: readable(mid.tangent),
    },
  ]
}

export interface PieceRenderContext {
  readonly style: SizeStyle
  readonly options: ExportOptions
  readonly nested: boolean
  /** Draw the per-piece annotations (grain, fold, label, point names): reference size only. */
  readonly primary: boolean
  /** Label lines (name excluded). */
  readonly labelSizes: string
  readonly title: string
  readonly date: string
}

/** Primitives of one piece of one size, by layer (world mm). */
export function pieceLayerPrims(pc: PatternPiece, ctx: PieceRenderContext): Layers {
  const { style, options, nested, primary } = ctx
  const color = style.color
  const L: Layers = {}
  const seg = (id: string): Segment | null => {
    const s = pc.segments[id]
    return s ? stripMeta(worldSegment(pc, s)) : null
  }
  const outline = pieceWorldPath(pc)
  const poly = flattenPath(outline, 0.5)

  push(L, 'seam', { kind: 'path', cmds: pathToCmds(outline), stroke: stroke(color, 0.3) })

  const cut = pieceWorldCutPath(pc)
  if (cut) {
    const dash = options.cutLine === 'dashed' ? (nested ? style.cutDash : [4, 2]) : undefined
    push(L, 'cut', {
      kind: 'path',
      cmds: pathToCmds(cut),
      stroke: stroke(color, nested ? 0.4 : 0.5, dash),
    })
  }
  push(L, 'notches', ...notchPrims(pc, stroke(color, 0.35)))

  const grainId = grainSegmentId(pc)
  const legs = dartLegIds(pc)
  for (const id of pc.internalLines) {
    if (id === grainId) continue
    const s = seg(id)
    if (!s) continue
    const role = (pc.segments[id] as DraftSegment).role
    if (legs.has(id) || (role !== 'seam' && /dart/i.test(id)))
      push(L, 'darts', segsPrim([s], stroke(color, 0.3)))
    else if (role === 'seam') push(L, 'internal', segsPrim([s], stroke(color, 0.3)))
    else push(L, 'construction', segsPrim([s], stroke(nested ? color : GUIDE, 0.15, [2, 1.5])))
  }
  if (pc.fold) {
    const a = applyAffine(pc.transform, pc.fold.from)
    const b = applyAffine(pc.transform, pc.fold.to)
    push(L, 'internal', {
      kind: 'path',
      cmds: polylineCmds([a, b]),
      stroke: stroke(nested ? color : SOFT, 0.3, [8, 2, 1.5, 2]),
    })
  }
  for (const m of pc.marks) {
    const at = applyAffine(pc.transform, m.at)
    if (m.kind === 'bustPoint') {
      const r = 3
      push(
        L,
        'darts',
        {
          kind: 'path',
          cmds: polylineCmds([add(at, { x: -r, y: 0 }), add(at, { x: r, y: 0 })]),
          stroke: stroke(color, 0.25),
        },
        {
          kind: 'path',
          cmds: polylineCmds([add(at, { x: 0, y: -r }), add(at, { x: 0, y: r })]),
          stroke: stroke(color, 0.25),
        },
      )
    } else if (m.kind === 'gather' && Array.isArray(m.data?.segments)) {
      const segs = (m.data.segments as unknown[])
        .map((x) => seg(String(x)))
        .filter((s) => s !== null)
      const text = typeof m.data.text === 'string' ? m.data.text : 'fruncir'
      push(L, 'internal', ...gatherPrims(segs, poly, text, stroke(color, 0.25)))
    } else if (m.kind === 'button') {
      const r = (typeof m.data?.diameterMm === 'number' ? m.data.diameterMm : 10) / 2
      push(
        L,
        'marks',
        { kind: 'path', cmds: circleCmds(at, r), stroke: stroke(color, 0.3) },
        {
          kind: 'path',
          cmds: [
            { c: 'M', p: add(at, { x: -r * 0.5, y: 0 }) },
            { c: 'L', p: add(at, { x: r * 0.5, y: 0 }) },
            { c: 'M', p: add(at, { x: 0, y: -r * 0.5 }) },
            { c: 'L', p: add(at, { x: 0, y: r * 0.5 }) },
          ],
          stroke: stroke(color, 0.2),
        },
      )
    } else if (m.kind === 'text' && primary) {
      const text = typeof m.data?.text === 'string' ? m.data.text : ''
      if (text)
        push(L, 'marks', { kind: 'text', at, text, sizeMm: 5, color: SOFT, anchor: 'middle' })
    }
  }

  if (!primary) return L

  // Grainline: double-headed arrow.
  if (grainId && pc.segments[grainId]) {
    const g = seg(grainId)!
    const a = g.p0
    const b = segEnd(g)
    const d = sub(b, a)
    push(
      L,
      'grain',
      { kind: 'path', cmds: polylineCmds([a, b]), stroke: stroke(SOFT, 0.35) },
      arrowHead(a, scale(d, -1), 8, SOFT),
      arrowHead(b, d, 8, SOFT),
    )
  }
  push(L, 'fold', ...foldPrims(pc, SOFT))

  // Label in the clearest part of the piece (away from darts, lines and the outline).
  const lines: { text: string; size: number; bold?: boolean }[] = [
    { text: pc.name, size: 7, bold: true },
    { text: ctx.labelSizes, size: 4.5 },
    { text: `Cortar ×${pc.cutCount}${pc.onFold ? ' (al doblez)' : ''}`, size: 4.5 },
    { text: pc.fabric, size: 4.5 },
    { text: ctx.title, size: 3.5 },
    { text: ctx.date, size: 3.5 },
  ].filter((l) => l.text)
  const lh = lines.reduce((s, l) => s + l.size * 1.4, 0)
  const lw = Math.max(...lines.map((l) => l.text.length * l.size * 0.55))
  const obstacles = [
    ...pc.internalLines.flatMap((id) => {
      const s = seg(id)
      return s ? sampleSegment(s, 3) : []
    }),
    ...outline.segments.flatMap((s) => sampleSegment(s, 3)),
    ...pc.marks.map((m) => applyAffine(pc.transform, m.at)),
  ]
  const c = labelCentre(poly, obstacles, lw, lh)
  let y = c.y - lh / 2
  for (const l of lines) {
    y += l.size * 1.4
    push(L, 'label', {
      kind: 'text',
      at: { x: c.x, y: y - l.size * 0.4 },
      text: l.text,
      sizeMm: l.size,
      color: INK,
      anchor: 'middle',
      ...(l.bold && { bold: true }),
    })
  }

  // Point names (construction layer).
  for (const [name, p] of Object.entries(pc.points)) {
    const at = applyAffine(pc.transform, p)
    push(
      L,
      'construction',
      { kind: 'path', cmds: circleCmds(at, 0.6), fill: GUIDE },
      {
        kind: 'text',
        at: add(at, { x: 1.5, y: -1.5 }),
        text: name,
        sizeMm: 2.5,
        color: GUIDE,
        anchor: 'start',
      },
    )
  }
  return L
}

/** Points every `step` mm along a segment (both ends included). */
function sampleSegment(s: Segment, step: number): Vec[] {
  const len = segmentLength(s)
  const n = Math.max(1, Math.ceil(len / step))
  return Array.from({ length: n + 1 }, (_, i) => segmentPointAtLength(s, (len * i) / n).point)
}

/** Distance from a point to an axis-aligned box (0 inside). */
const boxDistance = (p: Vec, x0: number, y0: number, x1: number, y1: number): number =>
  Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(y0 - p.y, 0, p.y - y1))

/**
 * Centre of a `w` × `h` label inside `poly`: on a grid of candidates whose box lies inside the
 * piece, the one farthest from every obstacle point (lines, darts, outline), ties to the centroid.
 * Falls back to the centroid when the label does not fit.
 */
export function labelCentre(
  poly: readonly Vec[],
  obstacles: readonly Vec[],
  w: number,
  h: number,
): Vec {
  const c0 = centroid(poly)
  const xs = poly.map((p) => p.x)
  const ys = poly.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const N = 28
  let best = c0
  let bestScore = -Infinity
  for (let i = 0; i <= N; i++)
    for (let j = 0; j <= N; j++) {
      const c = { x: minX + ((maxX - minX) * i) / N, y: minY + ((maxY - minY) * j) / N }
      const x0 = c.x - w / 2
      const x1 = c.x + w / 2
      const y0 = c.y - h / 2
      const y1 = c.y + h / 2
      const probes = [
        { x: x0, y: y0 },
        { x: x1, y: y0 },
        { x: x0, y: y1 },
        { x: x1, y: y1 },
        { x: c.x, y: y0 },
        { x: c.x, y: y1 },
        { x: x0, y: c.y },
        { x: x1, y: c.y },
      ]
      if (!probes.every((p) => pointInPolygon(p, poly))) continue
      let clear = Infinity
      for (const o of obstacles) clear = Math.min(clear, boxDistance(o, x0, y0, x1, y1))
      const score = Math.min(clear, 25) - 0.02 * Math.hypot(c.x - c0.x, c.y - c0.y)
      if (score > bestScore) {
        bestScore = score
        best = c
      }
    }
  return best
}

/** A block of the layout: one piece (one or several nested sizes) or the construction frame. */
export interface LayoutItem {
  readonly id: string
  readonly name: string
  /** Spacing box (world mm): the cut lines (seam lines without allowance) of all its sizes. */
  readonly box: Box
  /** Piece group (world mm), with one child group per layer. */
  readonly group: Group
  readonly sizes: readonly string[]
}

const LAYER_ORDER: readonly ExportLayer[] = [
  'construction',
  'cut',
  'seam',
  'internal',
  'darts',
  'notches',
  'marks',
  'grain',
  'fold',
  'label',
]

/** Group of an item: piece → layer → size (only the enabled layers). */
function itemGroup(
  id: string,
  perSize: readonly { size: string; layers: Layers }[],
  options: ExportOptions,
): Group {
  const base = `piece-${safeId(id)}`
  const children: Group[] = []
  for (const layer of LAYER_ORDER) {
    if (!options.layers[layer]) continue
    const sizes = perSize
      .filter((s) => (s.layers[layer]?.length ?? 0) > 0)
      .map((s) => ({ id: `${base}-${layer}-t${safeId(s.size)}`, prims: s.layers[layer]! }))
    if (sizes.length) children.push({ id: `${base}-${layer}`, prims: [], children: sizes })
  }
  return { id: base, prims: [], children }
}

/** Translate a piece so its grading anchor matches `target`. */
const alignTo = (pc: PatternPiece, target: Vec): PatternPiece => {
  const a = gradingAnchor(pc)
  const t = pc.transform
  return { ...pc, transform: { ...t, e: t.e + target.x - a.x, f: t.f + target.y - a.y } }
}

export interface RenderModel {
  readonly items: readonly LayoutItem[]
  /** False when nothing was extracted (the pieces were extracted for the export). */
  readonly extracted: boolean
  readonly styles: readonly SizeStyle[]
}

const EXTRACT_ALL_OP = { id: 'export-extract-all', type: 'extractAll' } as const

/** Patterns of the sizes; when the reference size has no extracted piece, all pieces are extracted. */
function patternsOf(src: ExportSource): { sizes: SizeSource[]; extracted: boolean } {
  const ref = src.sizes.find((s) => s.id === src.referenceSize) ?? src.sizes[0]
  if (!ref || ref.pattern.pieces.length > 0) return { sizes: [...src.sizes], extracted: true }
  return {
    extracted: false,
    sizes: src.sizes.map((s) => ({
      ...s,
      pattern: replay(s.draft, [EXTRACT_ALL_OP], src.replayOptions).pattern,
    })),
  }
}

const sizesLabel = (labels: readonly string[]) =>
  labels.length === 1 ? `Talla ${labels[0]}` : `Tallas ${labels.join(' · ')}`

/** The construction frame (Trazo) of the given sizes as one item. */
function constructionItem(
  sizes: readonly SizeSource[],
  styles: readonly SizeStyle[],
  options: ExportOptions,
  idSuffix: string,
): LayoutItem {
  const perSize = sizes.map((s, i) => {
    const color = styles[i].color
    return { size: s.id, layers: draftLayers(s.draft, color, i === 0) }
  })
  const opts = { ...options, layers: { ...options.layers, seam: true, construction: true } }
  const group = itemGroup(`construccion${idSuffix}`, perSize, opts)
  let box = EMPTY_BOX
  for (const s of sizes)
    for (const sg of Object.values(s.draft.segments)) box = boxUnion(box, segBox(stripMeta(sg)))
  return {
    id: `construccion${idSuffix}`,
    name: 'Trazo de construcción',
    box,
    group,
    sizes: sizes.map((s) => s.id),
  }
}

const segBox = (s: Segment): Box => {
  const p = flattenPath(path([s]), 0.5)
  return p.reduce((b, q) => boxUnion(b, { minX: q.x, minY: q.y, maxX: q.x, maxY: q.y }), EMPTY_BOX)
}

function draftLayers(draft: Draft, color: string, names: boolean): Layers {
  const L: Layers = {}
  const outlineIds = new Set(draft.pieces.flatMap((p) => p.outline.map((r) => r.segment)))
  for (const s of Object.values(draft.segments)) {
    const plain = stripMeta(s)
    if (outlineIds.has(s.id)) push(L, 'seam', segsPrim([plain], stroke(color, 0.25)))
    else push(L, 'construction', segsPrim([plain], stroke(color, 0.15, [2, 1.5])))
  }
  if (names)
    for (const [name, p] of Object.entries(draft.points))
      push(L, 'construction', {
        kind: 'text',
        at: add(p, { x: 1.5, y: -1.5 }),
        text: name,
        sizeMm: 2.5,
        color: GUIDE,
        anchor: 'start',
      })
  return L
}

/**
 * Layout items of the export, in world coordinates (the current Piezas arrangement):
 * - nested: one item per piece of the reference size, with every size aligned on the piece's
 *   grading anchor;
 * - pagePerSize: `buckets` = one list of items per size.
 */
export function buildRenderModel(
  src: ExportSource,
  options: ExportOptions,
): RenderModel & { readonly buckets: readonly (readonly LayoutItem[])[] } {
  const { sizes, extracted } = patternsOf(src)
  const nested = !options.pagePerSize && sizes.length > 1
  const styles = sizeStyles(sizes, nested)
  const ctxFor = (i: number, primary: boolean, labelSizes: string): PieceRenderContext => ({
    style: styles[i],
    options,
    nested,
    primary,
    labelSizes,
    title: src.title,
    date: src.date,
  })

  if (!nested) {
    const buckets = sizes.map((s, i) => {
      const items: LayoutItem[] = s.pattern.pieces.map((pc) => ({
        id: sizes.length > 1 ? `${pc.id}@${s.id}` : pc.id,
        name: pc.name,
        box: pieceLayoutBBox(pc),
        group: itemGroup(
          sizes.length > 1 ? `${pc.id}-t${s.id}` : pc.id,
          [{ size: s.id, layers: pieceLayerPrims(pc, ctxFor(i, true, sizesLabel([s.id]))) }],
          options,
        ),
        sizes: [s.id],
      }))
      if (options.includeConstruction)
        items.push(constructionItem([s], [styles[i]], options, sizes.length > 1 ? `-t${s.id}` : ''))
      return items
    })
    return { items: buckets.flat(), buckets, extracted, styles }
  }

  const refIndex = Math.max(
    0,
    sizes.findIndex((s) => s.id === src.referenceSize),
  )
  const ref = sizes[refIndex]
  const label = sizesLabel(sizes.map((s) => s.id))
  const items: LayoutItem[] = ref.pattern.pieces.map((refPc) => {
    const target = gradingAnchor(refPc)
    const perSize: { size: string; layers: Layers }[] = []
    let box = EMPTY_BOX
    sizes.forEach((s, i) => {
      const pc = s.pattern.pieces.find((q) => q.id === refPc.id)
      if (!pc) return
      const aligned = i === refIndex ? pc : alignTo(pc, target)
      box = boxUnion(box, pieceLayoutBBox(aligned))
      perSize.push({
        size: s.id,
        layers: pieceLayerPrims(aligned, ctxFor(i, i === refIndex, label)),
      })
    })
    return {
      id: refPc.id,
      name: refPc.name,
      box,
      group: itemGroup(refPc.id, perSize, options),
      sizes: perSize.map((p) => p.size),
    }
  })
  if (options.includeConstruction) items.push(constructionItem(sizes, styles, options, ''))
  return { items, buckets: [items], extracted, styles }
}

/** Move an item by `d` (mm). */
export const moveItem = (it: LayoutItem, d: Vec): LayoutItem => ({
  ...it,
  box: {
    minX: it.box.minX + d.x,
    minY: it.box.minY + d.y,
    maxX: it.box.maxX + d.x,
    maxY: it.box.maxY + d.y,
  },
  group: translateGroup(it.group, d),
})
