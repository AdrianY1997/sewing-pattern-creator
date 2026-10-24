/**
 * Export model (SPEC §9): drawable primitives in millimetres, grouped by piece and layer, laid out
 * on pages. Pure data, shared by the PDF and SVG writers.
 *
 * Coordinates are page millimetres with the origin at the top-left corner and y growing downward
 * (as on the canvas). The PDF writer flips y; 1 mm = 72/25.4 pt exactly.
 */
import type { Draft, Pattern, ReplayOptions, Vec } from '../core'

/** One drawing command of a path (absolute coordinates, mm). Béziers are kept as curves. */
export type PathCmd =
  | { readonly c: 'M'; readonly p: Vec }
  | { readonly c: 'L'; readonly p: Vec }
  | { readonly c: 'C'; readonly p1: Vec; readonly p2: Vec; readonly p: Vec }
  | { readonly c: 'Z' }

export interface Stroke {
  /** `#rrggbb`. */
  readonly color: string
  readonly widthMm: number
  /** Dash pattern in mm (on, off, …); absent = solid. */
  readonly dash?: readonly number[]
}

export interface PathPrim {
  readonly kind: 'path'
  readonly cmds: readonly PathCmd[]
  readonly stroke?: Stroke
  /** Fill colour (`#rrggbb`), e.g. arrow heads. */
  readonly fill?: string
}

/** Axis-aligned rectangle (the test square is one, so its size is written exactly). */
export interface RectPrim {
  readonly kind: 'rect'
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
  readonly stroke?: Stroke
  readonly fill?: string
  /** Tag written around it (PDF marked content, SVG id), e.g. 'TestSquare'. */
  readonly tag?: string
}

export interface TextPrim {
  readonly kind: 'text'
  /** Baseline anchor point. */
  readonly at: Vec
  readonly text: string
  /** Font size (mm, em height). */
  readonly sizeMm: number
  readonly color: string
  readonly anchor: 'start' | 'middle' | 'end'
  /** Degrees, clockwise on the page (y down), about `at`. */
  readonly angleDeg?: number
  readonly bold?: boolean
}

export type Prim = PathPrim | RectPrim | TextPrim

/** Layers the user can switch on and off (Exportar → Capas). */
export type ExportLayer =
  | 'seam'
  | 'cut'
  | 'darts'
  | 'internal'
  | 'notches'
  | 'grain'
  | 'fold'
  | 'marks'
  | 'label'
  | 'construction'

export const EXPORT_LAYERS: readonly { readonly id: ExportLayer; readonly label: string }[] = [
  { id: 'seam', label: 'Línea de costura' },
  { id: 'cut', label: 'Línea de corte (margen)' },
  { id: 'darts', label: 'Pinzas' },
  { id: 'internal', label: 'Líneas internas y frunces' },
  { id: 'notches', label: 'Piquetes' },
  { id: 'grain', label: 'Hilo' },
  { id: 'fold', label: 'Doblez' },
  { id: 'marks', label: 'Texto y botones' },
  { id: 'label', label: 'Etiqueta de pieza' },
  { id: 'construction', label: 'Líneas de construcción y puntos' },
]

export type LayerSet = Readonly<Record<ExportLayer, boolean>>

export const DEFAULT_EXPORT_LAYERS: LayerSet = {
  seam: true,
  cut: true,
  darts: true,
  internal: true,
  notches: true,
  grain: true,
  fold: true,
  marks: true,
  label: true,
  construction: false,
}

/** A named group of primitives (SVG `<g id>`); `children` nest (piece → layer). */
export interface Group {
  readonly id: string
  readonly prims: readonly Prim[]
  readonly children?: readonly Group[]
}

export interface ExportPage {
  readonly widthMm: number
  readonly heightMm: number
  readonly groups: readonly Group[]
  /** Ids of the layout items (pieces) drawn on this page. */
  readonly itemIds: readonly string[]
  /** Sizes drawn on this page. */
  readonly sizes: readonly string[]
  /** Rectangle available to the pieces (page mm). */
  readonly contentBox: Box
  /** Where each item's bounding box landed (page mm). */
  readonly placements: readonly { readonly itemId: string; readonly box: Box }[]
  readonly orientation: 'portrait' | 'landscape' | 'custom'
  /** True for a page made for one piece larger than A0. */
  readonly oversize?: boolean
}

export interface ExportDocument {
  readonly title: string
  readonly pages: readonly ExportPage[]
  /** Spanish notices for the user (oversize pieces, rearranged layout, replay issues). */
  readonly warnings: readonly string[]
}

export interface Box {
  readonly minX: number
  readonly minY: number
  readonly maxX: number
  readonly maxY: number
}

/** One size to export: its draft and its replayed pattern. */
export interface SizeSource {
  readonly id: string
  readonly label: string
  readonly draft: Draft
  readonly pattern: Pattern
  /** Number of operations that did not apply on this size. */
  readonly issueCount?: number
}

export interface ExportSource {
  readonly title: string
  /** Sizes in table order. */
  readonly sizes: readonly SizeSource[]
  /**
   * Replay options of the block (piece cut counts, half pieces, allowance defaults): used to
   * extract every piece when nothing is extracted yet.
   */
  readonly replayOptions?: ReplayOptions
  /** Size whose pieces fix the arrangement of nested sizes (default: the first). */
  readonly referenceSize?: string
  /** Shown in the title block, e.g. "24/10/2026". */
  readonly date: string
  readonly appUrl: string
}

export type PageMode = 'a0' | 'single'

export interface ExportOptions {
  readonly mode: PageMode
  readonly layers: LayerSet
  readonly cutLine: 'solid' | 'dashed'
  /** One page (A0: one set of pages) per size; otherwise sizes are nested. */
  readonly pagePerSize: boolean
  /** "Incluir trazo de construcción": the overlapping construction frame of the block. */
  readonly includeConstruction: boolean
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  mode: 'single',
  layers: DEFAULT_EXPORT_LAYERS,
  cutLine: 'solid',
  pagePerSize: false,
  includeConstruction: false,
}

/** Exact conversion factor (SPEC §2). */
export const PT_PER_MM = 72 / 25.4

export const A0_MM = { w: 841, h: 1189 } as const
/** Page margin (mm). */
export const PAGE_MARGIN = 10
/** Minimum gap between the cut lines of two pieces (mm). */
export const MIN_PIECE_GAP = 20
/** Side of the test square (mm). */
export const TEST_SQUARE_MM = 100
export const TEST_SQUARE_LABEL = '10 cm — comprobar escala al 100 %'
export const APP_URL = 'https://adriany1997.github.io/sewing-pattern-creator/'
