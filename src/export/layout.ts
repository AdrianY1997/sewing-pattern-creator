/**
 * Page layout of the export (SPEC §9): the current Piezas arrangement when pieces are extracted
 * (and at least MIN_PIECE_GAP apart), else an automatic shelf arrangement; A0 sheets (several when
 * needed, never cutting a piece) or one sheet the size of the layout. Every page carries the 10 cm
 * test square, a title block and its page number.
 */
import { LAYOUT_ROW_WIDTH, type Vec } from '../core'
import { boxH, boxUnion, boxW, EMPTY_BOX, isEmptyBox, polylineCmds, translateBox } from './geometry'
import { buildRenderModel, moveItem, type LayoutItem, type SizeStyle } from './render'
import {
  A0_MM,
  APP_URL,
  MIN_PIECE_GAP,
  PAGE_MARGIN,
  TEST_SQUARE_LABEL,
  TEST_SQUARE_MM,
  type Box,
  type ExportDocument,
  type ExportOptions,
  type ExportPage,
  type ExportSource,
  type Group,
  type Prim,
} from './types'

/** Height of the strip with the test square, title block and legend (mm). */
export const STRIP_H = 112
/** Minimum width of that strip (mm). */
export const STRIP_W = 300
/** Space between the pieces and the strip (mm). */
const STRIP_GAP = 15

const EPS = 1e-6

/** True when every two boxes are at least `gap` apart horizontally or vertically. */
export function boxesSeparated(boxes: readonly Box[], gap: number): boolean {
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]
      const b = boxes[j]
      const apart =
        a.maxX + gap <= b.minX + EPS ||
        b.maxX + gap <= a.minX + EPS ||
        a.maxY + gap <= b.minY + EPS ||
        b.maxY + gap <= a.minY + EPS
      if (!apart) return false
    }
  return true
}

const itemsBox = (items: readonly LayoutItem[]): Box =>
  items.reduce((b, it) => boxUnion(b, it.box), EMPTY_BOX)

/**
 * Shelf packing into a `maxW` × `maxH` area whose top-left is the origin: tallest first, rows
 * left to right, `gap` between boxes. Items that do not fit are returned in `rest`.
 */
export function shelfPack(
  items: readonly LayoutItem[],
  maxW: number,
  maxH: number,
  gap: number,
): { placed: LayoutItem[]; rest: LayoutItem[] } {
  const order = [...items].sort(
    (a, b) => boxH(b.box) - boxH(a.box) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )
  const placed: LayoutItem[] = []
  const rest: LayoutItem[] = []
  let x = 0
  let y = 0
  let rowH = 0
  for (const it of order) {
    const w = boxW(it.box)
    const h = boxH(it.box)
    if (w > maxW + EPS || h > maxH + EPS) {
      rest.push(it)
      continue
    }
    if (x > 0 && x + w > maxW + EPS) {
      // New row, if there is room for it.
      if (y + rowH + gap + h > maxH + EPS) {
        rest.push(it)
        continue
      }
      x = 0
      y += rowH + gap
      rowH = 0
    } else if (y + h > maxH + EPS) {
      rest.push(it)
      continue
    }
    placed.push(moveItem(it, { x: x - it.box.minX, y: y - it.box.minY }))
    x += w + gap
    rowH = Math.max(rowH, h)
  }
  return { placed, rest }
}

/** Automatic arrangement without a height limit (single sheet). */
const autoArrange = (items: readonly LayoutItem[]): LayoutItem[] =>
  shelfPack(
    items,
    Math.max(LAYOUT_ROW_WIDTH, ...items.map((it) => boxW(it.box))),
    Infinity,
    MIN_PIECE_GAP,
  ).placed

const moveAll = (items: readonly LayoutItem[], d: Vec) => items.map((it) => moveItem(it, d))

/** Area (mm²) covered by boxes. */
const boxesArea = (items: readonly LayoutItem[]) =>
  items.reduce((s, it) => s + boxW(it.box) * boxH(it.box), 0)

// ---------- page furniture ----------

const INK = '#1a1a1a'

interface PageInfo {
  readonly title: string
  readonly sizes: string
  readonly date: string
  readonly number: number
  readonly total: number
  readonly legend: readonly SizeStyle[]
  readonly cutDashed: boolean
}

/** Test square, title block and legend, with their top-left at `o`. */
function furniture(o: Vec, info: PageInfo): Group[] {
  const t = (
    x: number,
    y: number,
    text: string,
    sizeMm: number,
    extra: Partial<Extract<Prim, { kind: 'text' }>> = {},
  ): Prim => ({
    kind: 'text',
    at: { x: o.x + x, y: o.y + y },
    text,
    sizeMm,
    color: INK,
    anchor: 'start',
    ...extra,
  })
  const square: Group = {
    id: 'test-square',
    prims: [
      {
        kind: 'rect',
        x: o.x,
        y: o.y,
        w: TEST_SQUARE_MM,
        h: TEST_SQUARE_MM,
        stroke: { color: INK, widthMm: 0.3 },
        tag: 'TestSquare',
      },
      // Centre cross, to measure along both axes.
      {
        kind: 'path',
        cmds: [
          { c: 'M', p: { x: o.x + 45, y: o.y + 50 } },
          { c: 'L', p: { x: o.x + 55, y: o.y + 50 } },
          { c: 'M', p: { x: o.x + 50, y: o.y + 45 } },
          { c: 'L', p: { x: o.x + 50, y: o.y + 55 } },
        ],
        stroke: { color: INK, widthMm: 0.2 },
      },
      t(50, 106, TEST_SQUARE_LABEL, 4, { anchor: 'middle' }),
    ],
  }
  const bx = 115
  const bw = 180
  const title: Group = {
    id: 'title-block',
    prims: [
      { kind: 'rect', x: o.x + bx, y: o.y, w: bw, h: 56, stroke: { color: INK, widthMm: 0.3 } },
      t(bx + 5, 11, info.title || 'Patrón', 7, { bold: true }),
      t(bx + 5, 21, info.sizes, 4.5),
      t(bx + 5, 29, `Fecha: ${info.date}`, 4),
      t(bx + 5, 37, 'Escala 1:1 — imprimir al 100 %, sin ajustar a la página', 3.5),
      t(bx + 5, 45, `Sewing Pattern Creator · ${APP_URL}`, 3.2),
    ],
  }
  const pageNo: Group = {
    id: 'page-number',
    prims: [
      t(bx + bw - 5, 11, `Página ${info.number} de ${info.total}`, 4.5, {
        anchor: 'end',
        bold: true,
      }),
    ],
  }
  const groups = [square, title, pageNo]
  if (info.legend.length > 1) {
    const prims: Prim[] = [t(bx, 66, 'Tallas', 4.5, { bold: true })]
    info.legend.forEach((s, i) => {
      const col = Math.floor(i / 4)
      const row = i % 4
      const x = bx + col * 45
      const y = 74 + row * 9
      prims.push(
        {
          kind: 'path',
          cmds: polylineCmds([
            { x: o.x + x, y: o.y + y - 1.5 },
            { x: o.x + x + 18, y: o.y + y - 1.5 },
          ]),
          stroke: {
            color: s.color,
            widthMm: 0.6,
            ...(info.cutDashed && { dash: s.cutDash }),
          },
        },
        t(x + 21, y, s.label, 4.5, { color: s.color, bold: true }),
      )
    })
    groups.push({ id: 'legend', prims })
  }
  return groups
}

// ---------- pages ----------

interface DraftPage {
  readonly widthMm: number
  readonly heightMm: number
  readonly items: readonly LayoutItem[]
  readonly contentBox: Box
  readonly strip: Vec
  readonly sizes: readonly string[]
  readonly orientation: ExportPage['orientation']
  readonly oversize?: boolean
}

/** A page exactly the size of `items` (already arranged) plus the strip and margins. */
function fittedPage(
  items: readonly LayoutItem[],
  sizes: readonly string[],
  oversize = false,
): DraftPage {
  const b = itemsBox(items)
  const box = isEmptyBox(b) ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : b
  const moved = moveAll(items, { x: PAGE_MARGIN - box.minX, y: PAGE_MARGIN - box.minY })
  const w = boxW(box)
  const h = boxH(box)
  const contentBox = translateBox(box, { x: PAGE_MARGIN - box.minX, y: PAGE_MARGIN - box.minY })
  const gap = items.length ? STRIP_GAP : 0
  return {
    widthMm: Math.max(w, STRIP_W) + 2 * PAGE_MARGIN,
    heightMm: h + gap + STRIP_H + 2 * PAGE_MARGIN,
    items: moved,
    contentBox,
    strip: { x: PAGE_MARGIN, y: PAGE_MARGIN + h + gap },
    sizes,
    orientation: 'custom',
    oversize,
  }
}

const A0_ORIENTATIONS = [
  { orientation: 'portrait' as const, w: A0_MM.w, h: A0_MM.h },
  { orientation: 'landscape' as const, w: A0_MM.h, h: A0_MM.w },
]

/** Area of an A0 page available to the pieces (above the strip). */
const a0Content = (w: number, h: number): Box => ({
  minX: PAGE_MARGIN,
  minY: PAGE_MARGIN,
  maxX: w - PAGE_MARGIN,
  maxY: h - PAGE_MARGIN - STRIP_H - STRIP_GAP,
})

function a0Page(
  o: (typeof A0_ORIENTATIONS)[number],
  items: readonly LayoutItem[],
  sizes: readonly string[],
): DraftPage {
  const c = a0Content(o.w, o.h)
  return {
    widthMm: o.w,
    heightMm: o.h,
    items,
    contentBox: c,
    strip: { x: PAGE_MARGIN, y: o.h - PAGE_MARGIN - STRIP_H },
    sizes,
    orientation: o.orientation,
  }
}

/**
 * A0 pages for arranged items: the arrangement as it is when it fits one sheet (portrait first),
 * else the pieces packed sheet by sheet, each sheet in the orientation that holds more. A piece
 * larger than an A0 sheet in both orientations gets its own page of its size and a warning.
 */
function a0Pages(
  items: readonly LayoutItem[],
  sizes: readonly string[],
  warnings: string[],
): DraftPage[] {
  if (items.length === 0) return [a0Page(A0_ORIENTATIONS[0], [], sizes)]
  const all = itemsBox(items)
  for (const o of A0_ORIENTATIONS) {
    const c = a0Content(o.w, o.h)
    if (boxW(all) <= boxW(c) + EPS && boxH(all) <= boxH(c) + EPS)
      return [a0Page(o, moveAll(items, { x: c.minX - all.minX, y: c.minY - all.minY }), sizes)]
  }
  const fits = (it: LayoutItem) =>
    A0_ORIENTATIONS.some((o) => {
      const c = a0Content(o.w, o.h)
      return boxW(it.box) <= boxW(c) + EPS && boxH(it.box) <= boxH(c) + EPS
    })
  const pages: DraftPage[] = []
  let rest = items.filter(fits)
  while (rest.length) {
    const tries = A0_ORIENTATIONS.map((o) => {
      const c = a0Content(o.w, o.h)
      return { o, c, ...shelfPack(rest, boxW(c), boxH(c), MIN_PIECE_GAP) }
    })
    const best = tries.reduce((a, b) => (boxesArea(b.placed) > boxesArea(a.placed) ? b : a))
    if (best.placed.length === 0) break // cannot happen: every item fits one orientation
    pages.push(a0Page(best.o, moveAll(best.placed, { x: best.c.minX, y: best.c.minY }), sizes))
    rest = best.rest
  }
  for (const it of items.filter((x) => !fits(x))) {
    warnings.push(
      `La pieza «${it.name}» (${(boxW(it.box) / 10).toFixed(1)} × ${(boxH(it.box) / 10).toFixed(1)} cm) no cabe en un A0: va sola en una página de mayor tamaño.`,
    )
    pages.push(fittedPage([it], sizes, true))
  }
  return pages
}

const formatSizes = (labels: readonly string[]) =>
  labels.length === 1 ? `Talla ${labels[0]}` : `Tallas ${labels.join(', ')}`

/** Lay out the export: pages with their groups (pieces, then page furniture). */
export function layoutDocument(src: ExportSource, options: ExportOptions): ExportDocument {
  const model = buildRenderModel(src, options)
  const warnings: string[] = []
  if (src.sizes.length === 0)
    return { title: src.title, pages: [], warnings: ['No hay tallas seleccionadas.'] }
  if (!model.extracted)
    warnings.push(
      'No hay piezas separadas: se exportan todas las piezas separadas automáticamente.',
    )
  for (const s of src.sizes)
    if (s.issueCount)
      warnings.push(`Talla ${s.label}: ${s.issueCount} operación(es) no se pudieron aplicar.`)

  const labelOf = new Map(src.sizes.map((s) => [s.id, s.label]))
  let rearranged = false
  const drafts: DraftPage[] = []
  for (const bucket of model.buckets) {
    const pieces = bucket.filter((it) => !it.id.startsWith('construccion'))
    const frames = bucket.filter((it) => it.id.startsWith('construccion'))
    let arranged: LayoutItem[]
    if (
      model.extracted &&
      boxesSeparated(
        pieces.map((p) => p.box),
        MIN_PIECE_GAP,
      )
    )
      arranged = pieces
    else {
      if (model.extracted && pieces.length > 1) rearranged = true
      arranged = autoArrange(pieces)
    }
    // The construction frame goes to the right of the pieces.
    const pb = itemsBox(arranged)
    for (const f of frames) {
      const at = isEmptyBox(pb) ? { x: 0, y: 0 } : { x: pb.maxX + MIN_PIECE_GAP, y: pb.minY }
      arranged = [...arranged, moveItem(f, { x: at.x - f.box.minX, y: at.y - f.box.minY })]
    }
    const sizes = [...new Set(bucket.flatMap((it) => it.sizes))]
    const bucketSizes = sizes.length ? sizes : src.sizes.map((s) => s.id)
    if (options.mode === 'single') drafts.push(fittedPage(arranged, bucketSizes))
    else drafts.push(...a0Pages(arranged, bucketSizes, warnings))
  }
  if (rearranged)
    warnings.push(
      'Algunas piezas quedarían a menos de 2 cm entre líneas de corte: se recolocan automáticamente.',
    )

  const nested = !options.pagePerSize && src.sizes.length > 1
  const pages: ExportPage[] = drafts.map((d, i) => {
    const info: PageInfo = {
      title: src.title,
      sizes: formatSizes(d.sizes.map((s) => labelOf.get(s) ?? s)),
      date: src.date,
      number: i + 1,
      total: drafts.length,
      legend: nested ? model.styles : [],
      cutDashed: options.cutLine === 'dashed',
    }
    return {
      widthMm: d.widthMm,
      heightMm: d.heightMm,
      groups: [...d.items.map((it) => it.group), ...furniture(d.strip, info)],
      itemIds: d.items.map((it) => it.id),
      sizes: d.sizes,
      contentBox: d.contentBox,
      placements: d.items.map((it) => ({ itemId: it.id, box: it.box })),
      orientation: d.orientation,
      ...(d.oversize && { oversize: true }),
    }
  })
  return { title: src.title, pages, warnings }
}
