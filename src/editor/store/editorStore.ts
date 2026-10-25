/**
 * Editor state (Zustand): current block, size, options, layers, view and selection, plus the
 * operation log of the project with its undo/redo history (lists of operations).
 */
import { create } from 'zustand'
import {
  DEFAULT_BLOCK_ID,
  defaultBlockOptions,
  getBlock,
  isBlockSize,
  sanitizeBlockOptions,
  type BlockOptionValue,
} from '../../blocks'
import type { MeasurementSystem } from '../../data'
import { operationProblem, type Operation, type OperationInput, type Vec } from '../../core'
import {
  DEFAULT_PX_PER_MM,
  isValidPxPerMm,
  loadCalibration,
  saveCalibration,
} from '../canvas/calibration'
import { IDENTITY_VIEW, panBy, zoomAt, type ViewTransform } from '../canvas/viewTransform'
import { cachedDraft, statePattern } from './patternData'
import { DEFAULT_LAYERS, LAYERS, type LayerId, type LayerVisibility } from './layers'

/** "Opciones avanzadas": stored now, applied by the editing operations of F4. */
export interface AdvancedOptions {
  readonly seamAllowance: boolean
  readonly seamAllowanceMm: number
  readonly hem: boolean
  readonly hemMm: number
  readonly darts: boolean
  readonly bias: boolean
}

export type LeftTab = 'design' | 'measurements' | 'settings'
/**
 * - select: pick pieces and segments
 * - pan: drag pans the view
 * - move: drag extracted pieces (Piezas view); elsewhere the drag pans the view
 * - rotate: rotate extracted pieces by dragging (Shift: 15° steps)
 * - notch: "Añadir piquete", a click on the outline of an extracted piece adds a notch there
 * - addPoint / removePoint: "Añadir punto" (click the outline) / "Eliminar punto" (click a vertex)
 * - curve: drag the handles of the selected curve, or drag to draw a curved internal line
 * - line: drag to draw a straight internal line
 * - text / button: a click inside a piece places a text mark / a button
 * - ruler: "Reglas", a real-size ruler on the canvas (place, rotate, slide, align, trace)
 * - measure: "Medir", distances between points and lengths along segments
 */
export type Tool =
  | 'select'
  | 'pan'
  | 'move'
  | 'rotate'
  | 'notch'
  | 'addPoint'
  | 'removePoint'
  | 'curve'
  | 'line'
  | 'text'
  | 'button'
  | 'ruler'
  | 'measure'

/** "Trasladar" of the Pinzas panel waiting for the click on the target edge. */
export interface PendingDartTransfer {
  readonly pieceId: string
  readonly dartId: string
}
/** Canvas view: the combined construction ("Trazo") or the extracted pieces ("Piezas"). */
export type ViewMode = 'trace' | 'pieces'
/** Side panel shown as a drawer on narrow screens (docs/UI.md §5). */
export type Drawer = 'left' | 'right'

export interface EditorData {
  readonly title: string
  /** True once the user typed a title: switching blocks then keeps it. */
  readonly titleEdited: boolean
  readonly blockId: string
  readonly system: MeasurementSystem
  readonly size: string
  readonly blockOptions: Readonly<Record<string, BlockOptionValue>>
  readonly advanced: AdvancedOptions
  readonly notes: string
  readonly layers: LayerVisibility
  readonly showGrid: boolean
  readonly view: ViewTransform
  readonly selectedPieceId: string | null
  /** Selected segment id (its piece, if any, is selected too). */
  readonly selectedSegmentId: string | null
  readonly tool: Tool
  readonly leftTab: LeftTab
  /** Snap the cursor to points, segments and the grid. */
  readonly snapEnabled: boolean
  /** Screen calibration: CSS px per real mm, the scale shown as 100 % / 1:1. */
  readonly pxPerMm: number
  /** True when pxPerMm comes from a calibration (not the 96 dpi fallback). */
  readonly calibrated: boolean
  readonly calibrationOpen: boolean
  /** Open drawer on narrow screens (ignored by the wide layout). */
  readonly drawer: Drawer | null
  /** Editing operations of the project, replayed over the draft of the current size. */
  readonly operations: readonly Operation[]
  /** Previous operation lists (most recent last). */
  readonly undoStack: readonly (readonly Operation[])[]
  /** Undone operation lists (most recent last). */
  readonly redoStack: readonly (readonly Operation[])[]
  readonly viewMode: ViewMode
  /** Dart transfer waiting for its target edge (canvas click), or null. */
  readonly dartTransfer: PendingDartTransfer | null
  /** Text placed by the Texto tool. */
  readonly markText: string
  /** Diameter (mm) of the buttons placed by the Botón tool. */
  readonly buttonMm: number
  /** Id of the project being edited (IndexedDB), or null until the projects are loaded. */
  readonly projectId: string | null
  /** The projects page (Mis patrones / Proyectos) is open. */
  readonly projectsOpen: boolean
}

/** The part of the state saved by "Guardar". */
export type ProjectSnapshot = Pick<
  EditorData,
  | 'title'
  | 'blockId'
  | 'size'
  | 'blockOptions'
  | 'advanced'
  | 'notes'
  | 'operations'
  | 'layers'
  | 'viewMode'
>

export interface EditorActions {
  setTitle(title: string): void
  /** Switch block: resets options and selection; keeps the size when the system allows it. */
  setBlock(blockId: string): void
  /** Ignored when the size does not belong to the current system. */
  setSize(size: string): void
  setBlockOption(key: string, value: BlockOptionValue): void
  setAdvanced(patch: Partial<AdvancedOptions>): void
  setNotes(notes: string): void
  setLayer(layer: LayerId, visible: boolean): void
  toggleLayer(layer: LayerId): void
  toggleGrid(): void
  setView(view: ViewTransform): void
  zoomAt(screenPt: Vec, factor: number): void
  panBy(dx: number, dy: number): void
  /** Select a piece (clears the segment selection). */
  selectPiece(pieceId: string | null): void
  /** Select a segment and its owning piece. */
  selectSegment(segmentId: string | null, pieceId?: string | null): void
  toggleSnap(): void
  /** Store a calibration (persisted); null restores the 96 dpi fallback. */
  setPxPerMm(pxPerMm: number | null): void
  setCalibrationOpen(open: boolean): void
  setDrawer(drawer: Drawer | null): void
  setTool(tool: Tool): void
  setLeftTab(tab: LeftTab): void
  /**
   * Append operations as one undo step; ids are assigned here (an operation that already has one,
   * because a later operation of the same step refers to it, keeps it).
   */
  applyOps(ops: OperationInput | Operation | readonly (OperationInput | Operation)[]): void
  undo(): void
  redo(): void
  setViewMode(mode: ViewMode): void
  setDartTransfer(pending: PendingDartTransfer | null): void
  setMarkText(text: string): void
  setButtonMm(mm: number): void
  setProjectId(id: string | null): void
  setProjectsOpen(open: boolean): void
  loadSnapshot(snapshot: Partial<ProjectSnapshot>): void
  reset(): void
}

export type EditorState = EditorData & EditorActions

export const DEFAULT_ADVANCED: AdvancedOptions = {
  seamAllowance: true,
  seamAllowanceMm: 10,
  hem: true,
  hemMm: 20,
  darts: true,
  bias: false,
}

const initialData = (): EditorData => {
  const block = getBlock(DEFAULT_BLOCK_ID)
  return {
    title: block.label,
    titleEdited: false,
    blockId: block.id,
    system: block.system,
    size: block.defaultSize,
    blockOptions: defaultBlockOptions(block),
    advanced: DEFAULT_ADVANCED,
    notes: '',
    layers: DEFAULT_LAYERS,
    showGrid: true,
    view: IDENTITY_VIEW,
    selectedPieceId: null,
    selectedSegmentId: null,
    tool: 'select',
    leftTab: 'design',
    snapEnabled: true,
    ...calibrationState(loadCalibration()),
    calibrationOpen: false,
    drawer: null,
    ...EMPTY_HISTORY,
    viewMode: 'trace',
    dartTransfer: null,
    markText: 'Texto',
    buttonMm: 12,
    projectId: null,
    projectsOpen: false,
  }
}

const EMPTY_HISTORY = { operations: [], undoStack: [], redoStack: [] } as const

let opCounter = 0
/** Operation id, unique within a session (ids only need to be distinct). */
export const newOpId = (): string =>
  `op-${Date.now().toString(36)}-${(++opCounter).toString(36)}${Math.random().toString(36).slice(2, 6)}`

/**
 * Keep only well-formed operations from a stored project: each type's parameters are validated,
 * the rest are dropped with a console.warn (replay reports operations that do not apply).
 */
export const partitionOperations = (v: unknown): { valid: Operation[]; invalid: unknown[] } => {
  const valid: Operation[] = []
  const invalid: unknown[] = []
  if (!Array.isArray(v)) return { valid, invalid }
  for (const o of v as unknown[]) {
    const problem = operationProblem(o)
    if (problem === null) valid.push(o as Operation)
    else {
      invalid.push(o)
      console.warn(`Operación descartada al cargar el proyecto: ${problem}`, o)
    }
  }
  return { valid, invalid }
}

export const sanitizeOperations = (v: unknown): Operation[] => partitionOperations(v).valid

/** Layer visibility from a stored project: unknown or non-boolean entries use the defaults. */
export const sanitizeLayers = (v: unknown): LayerVisibility => {
  const l = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  return Object.fromEntries(
    LAYERS.map((d) => [d.id, typeof l[d.id] === 'boolean' ? l[d.id] : d.defaultVisible]),
  ) as Record<LayerId, boolean>
}

const clampMm = (v: unknown, fallback: number, max: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(0, v)) : fallback

/** "Opciones avanzadas" from a stored project, field by field (bad values fall back to defaults). */
export const sanitizeAdvanced = (v: unknown): AdvancedOptions => {
  const a = (typeof v === 'object' && v !== null ? v : {}) as Record<string, unknown>
  const flag = (k: keyof AdvancedOptions & string, d: boolean) =>
    typeof a[k] === 'boolean' ? a[k] : d
  return {
    seamAllowance: flag('seamAllowance', DEFAULT_ADVANCED.seamAllowance),
    seamAllowanceMm: clampMm(a.seamAllowanceMm, DEFAULT_ADVANCED.seamAllowanceMm, 50),
    hem: flag('hem', DEFAULT_ADVANCED.hem),
    hemMm: clampMm(a.hemMm, DEFAULT_ADVANCED.hemMm, 100),
    darts: flag('darts', DEFAULT_ADVANCED.darts),
    bias: flag('bias', DEFAULT_ADVANCED.bias),
  }
}

/**
 * The selection of `s` restricted to what exists in what the canvas shows (the replayed pattern in
 * Piezas, the draft in Trazo): ids that no longer exist are cleared.
 */
export const validSelection = (
  s: EditorData,
): Pick<EditorData, 'selectedPieceId' | 'selectedSegmentId'> => {
  if (s.selectedPieceId === null && s.selectedSegmentId === null)
    return { selectedPieceId: null, selectedSegmentId: null }
  let draft
  try {
    draft =
      s.viewMode === 'pieces'
        ? statePattern(s).world
        : cachedDraft(s.blockId, s.size, s.blockOptions).draft
  } catch {
    return { selectedPieceId: null, selectedSegmentId: null }
  }
  const pieceOk = s.selectedPieceId !== null && draft.pieces.some((p) => p.id === s.selectedPieceId)
  const segOk = s.selectedSegmentId !== null && s.selectedSegmentId in draft.segments
  return {
    selectedPieceId: pieceOk ? s.selectedPieceId : null,
    selectedSegmentId: segOk ? s.selectedSegmentId : null,
  }
}

const calibrationState = (v: number | null) => ({
  pxPerMm: v ?? DEFAULT_PX_PER_MM,
  calibrated: v !== null,
})

export const selectSnapshot = (s: EditorData): ProjectSnapshot => ({
  title: s.title,
  blockId: s.blockId,
  size: s.size,
  blockOptions: s.blockOptions,
  advanced: s.advanced,
  notes: s.notes,
  operations: s.operations,
  layers: s.layers,
  viewMode: s.viewMode,
})

/** `patch` plus the selection of the state it produces, with vanished ids cleared. */
const withValidSelection = (s: EditorData, patch: Partial<EditorData>): Partial<EditorData> => ({
  ...patch,
  ...validSelection({ ...s, ...patch }),
})

export const useEditorStore = create<EditorState>()((set, get) => ({
  ...initialData(),

  setTitle: (title) => set({ title, titleEdited: true }),

  setBlock: (blockId) => {
    const block = getBlock(blockId)
    const { size } = get()
    set({
      ...(get().titleEdited ? {} : { title: block.label }),
      blockId: block.id,
      system: block.system,
      size: isBlockSize(block, size) ? size : block.defaultSize,
      blockOptions: defaultBlockOptions(block),
      selectedPieceId: null,
      selectedSegmentId: null,
      // Operations refer to the pieces of the block: another block starts a new log.
      ...EMPTY_HISTORY,
      viewMode: 'trace',
      dartTransfer: null,
    })
  },

  setSize: (size) => {
    if (isBlockSize(getBlock(get().blockId), size)) set(withValidSelection(get(), { size }))
  },

  setBlockOption: (key, value) => {
    const block = getBlock(get().blockId)
    set(
      withValidSelection(get(), {
        blockOptions: sanitizeBlockOptions(block, { ...get().blockOptions, [key]: value }),
      }),
    )
  },

  setAdvanced: (patch) => set({ advanced: { ...get().advanced, ...patch } }),
  setNotes: (notes) => set({ notes }),

  setLayer: (layer, visible) => set({ layers: { ...get().layers, [layer]: visible } }),
  toggleLayer: (layer) => get().setLayer(layer, !get().layers[layer]),
  toggleGrid: () => set({ showGrid: !get().showGrid }),

  setView: (view) => set({ view }),
  zoomAt: (screenPt, factor) => set({ view: zoomAt(get().view, screenPt, factor) }),
  panBy: (dx, dy) => set({ view: panBy(get().view, dx, dy) }),

  selectPiece: (selectedPieceId) => set({ selectedPieceId, selectedSegmentId: null }),
  selectSegment: (selectedSegmentId, pieceId = null) =>
    set({ selectedSegmentId, selectedPieceId: selectedSegmentId ? pieceId : null }),
  toggleSnap: () => set({ snapEnabled: !get().snapEnabled }),
  setPxPerMm: (v) => {
    if (v !== null && !isValidPxPerMm(v)) return
    saveCalibration(v)
    set(calibrationState(v))
  },
  setCalibrationOpen: (calibrationOpen) => set({ calibrationOpen }),
  setDrawer: (drawer) => set({ drawer }),
  setTool: (tool) => set({ tool, dartTransfer: null }),
  setLeftTab: (leftTab) => set({ leftTab }),

  applyOps: (input) => {
    const list: readonly (OperationInput | Operation)[] = Array.isArray(input)
      ? input
      : [input as OperationInput]
    if (list.length === 0) return
    const { operations, undoStack } = get()
    const added = list.map(
      (o) => ({ ...o, id: 'id' in o && typeof o.id === 'string' ? o.id : newOpId() }) as Operation,
    )
    set({
      operations: [...operations, ...added],
      undoStack: [...undoStack, operations],
      redoStack: [],
    })
  },
  undo: () => {
    const { operations, undoStack, redoStack } = get()
    const prev = undoStack[undoStack.length - 1]
    if (!prev) return
    set(
      withValidSelection(get(), {
        operations: prev,
        undoStack: undoStack.slice(0, -1),
        redoStack: [...redoStack, operations],
      }),
    )
  },
  redo: () => {
    const { operations, undoStack, redoStack } = get()
    const next = redoStack[redoStack.length - 1]
    if (!next) return
    set(
      withValidSelection(get(), {
        operations: next,
        undoStack: [...undoStack, operations],
        redoStack: redoStack.slice(0, -1),
      }),
    )
  },
  setViewMode: (viewMode) => {
    if (get().viewMode !== viewMode)
      set({ viewMode, selectedPieceId: null, selectedSegmentId: null, dartTransfer: null })
  },
  setDartTransfer: (dartTransfer) => set({ dartTransfer }),
  setMarkText: (markText) => set({ markText }),
  setButtonMm: (mm) => {
    if (Number.isFinite(mm) && mm > 0 && mm <= 100) set({ buttonMm: mm })
  },

  setProjectId: (projectId) => set({ projectId }),
  setProjectsOpen: (projectsOpen) => set({ projectsOpen }),

  loadSnapshot: (snap) => {
    let blockId = get().blockId
    try {
      if (snap.blockId) blockId = getBlock(snap.blockId).id
    } catch {
      // unknown block in an old save: keep the current one
    }
    const block = getBlock(blockId)
    set({
      blockId,
      system: block.system,
      size: snap.size && isBlockSize(block, snap.size) ? snap.size : block.defaultSize,
      blockOptions: sanitizeBlockOptions(block, snap.blockOptions ?? {}),
      title: typeof snap.title === 'string' ? snap.title : get().title,
      titleEdited: typeof snap.title === 'string' ? snap.title !== block.label : get().titleEdited,
      advanced: sanitizeAdvanced(snap.advanced),
      notes: typeof snap.notes === 'string' ? snap.notes : '',
      operations: sanitizeOperations(snap.operations),
      layers: sanitizeLayers(snap.layers),
      viewMode: snap.viewMode === 'pieces' ? 'pieces' : 'trace',
      undoStack: [],
      redoStack: [],
      selectedPieceId: null,
      selectedSegmentId: null,
      dartTransfer: null,
    })
  },

  reset: () => set(initialData()),
}))
