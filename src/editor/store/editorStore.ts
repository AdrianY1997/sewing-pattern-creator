/** Editor state (Zustand): current block, size, options, layers, view and selection. */
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
import type { Vec } from '../../core'
import { IDENTITY_VIEW, panBy, zoomAt, type ViewTransform } from '../canvas/viewTransform'
import { DEFAULT_LAYERS, type LayerId, type LayerVisibility } from './layers'

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
export type Tool = 'select' | 'pan'

export interface EditorData {
  readonly title: string
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
  readonly tool: Tool
  readonly leftTab: LeftTab
}

/** The part of the state saved by "Guardar". */
export type ProjectSnapshot = Pick<
  EditorData,
  'title' | 'blockId' | 'size' | 'blockOptions' | 'advanced' | 'notes'
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
  selectPiece(pieceId: string | null): void
  setTool(tool: Tool): void
  setLeftTab(tab: LeftTab): void
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
    tool: 'select',
    leftTab: 'design',
  }
}

export const selectSnapshot = (s: EditorData): ProjectSnapshot => ({
  title: s.title,
  blockId: s.blockId,
  size: s.size,
  blockOptions: s.blockOptions,
  advanced: s.advanced,
  notes: s.notes,
})

export const useEditorStore = create<EditorState>()((set, get) => ({
  ...initialData(),

  setTitle: (title) => set({ title }),

  setBlock: (blockId) => {
    const block = getBlock(blockId)
    const { size } = get()
    set({
      blockId: block.id,
      system: block.system,
      size: isBlockSize(block, size) ? size : block.defaultSize,
      blockOptions: defaultBlockOptions(block),
      selectedPieceId: null,
    })
  },

  setSize: (size) => {
    if (isBlockSize(getBlock(get().blockId), size)) set({ size })
  },

  setBlockOption: (key, value) => {
    const block = getBlock(get().blockId)
    set({ blockOptions: sanitizeBlockOptions(block, { ...get().blockOptions, [key]: value }) })
  },

  setAdvanced: (patch) => set({ advanced: { ...get().advanced, ...patch } }),
  setNotes: (notes) => set({ notes }),

  setLayer: (layer, visible) => set({ layers: { ...get().layers, [layer]: visible } }),
  toggleLayer: (layer) => get().setLayer(layer, !get().layers[layer]),
  toggleGrid: () => set({ showGrid: !get().showGrid }),

  setView: (view) => set({ view }),
  zoomAt: (screenPt, factor) => set({ view: zoomAt(get().view, screenPt, factor) }),
  panBy: (dx, dy) => set({ view: panBy(get().view, dx, dy) }),

  selectPiece: (selectedPieceId) => set({ selectedPieceId }),
  setTool: (tool) => set({ tool }),
  setLeftTab: (leftTab) => set({ leftTab }),

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
      advanced: { ...DEFAULT_ADVANCED, ...snap.advanced },
      notes: typeof snap.notes === 'string' ? snap.notes : '',
      selectedPieceId: null,
    })
  },

  reset: () => set(initialData()),
}))
