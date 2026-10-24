/**
 * Block registry: everything the editor needs to list, configure and draft a block. New blocks
 * (F3) register here and the UI picks them up without changes.
 */
import type { Draft } from '../core'
import {
  getMeasurements,
  getTable,
  type KeyOf,
  type MeasurementSystem,
  type Sex,
  type SizeOf,
} from '../data'
import { draftMenBodice } from './menBodice'
import { MEN_SLEEVE_DEFAULTS, draftMenSleeve } from './menSleeve'
import { MEN_TROUSERS_BLOCK_DEFAULTS, draftMenTrousers } from './menTrousers'
import { draftWomenTrousers } from './womenTrousers'
import { draftWomenBodice } from './womenBodice'
import { draftWomenSkirt } from './womenSkirt'
import { WOMEN_SLEEVE_DEFAULTS, draftWomenSleeve } from './womenSleeve'

export type BlockOptionValue = string

/** A choice-type option shown as a select in the Diseño tab. */
export interface BlockOptionSchema {
  readonly key: string
  readonly label: string
  readonly choices: readonly { readonly value: BlockOptionValue; readonly label: string }[]
  readonly default: BlockOptionValue
}

export type BlockOptions = Readonly<Record<string, BlockOptionValue>>

/** How many times a piece is cut and from which material (piece label "x1 / (Tela)"). */
export interface PieceCutInfo {
  readonly count: number
  readonly material: string
}

/** A "modelo" card: a named view of the block that focuses one piece. */
export interface BlockView {
  readonly id: string
  readonly label: string
  readonly pieceId: string
}

export interface BlockDef<S extends MeasurementSystem = MeasurementSystem> {
  readonly id: string
  /** Spanish label for the UI. */
  readonly label: string
  /** Breadcrumb trail after the sex, e.g. ['Cuerpo', 'Bloques base']. */
  readonly category: readonly string[]
  readonly sex: Sex
  readonly system: S
  readonly defaultSize: SizeOf<S>
  readonly options: readonly BlockOptionSchema[]
  readonly views: readonly BlockView[]
  /** Cut info per piece id; pieces not listed default to DEFAULT_CUT. */
  readonly cut?: Readonly<Record<string, PieceCutInfo>>
  /**
   * Pieces drafted as a half (the other half is the mirror image across the centre front / centre
   * back edge): extracted "al doblez" by default. Legs and sleeves are not half pieces.
   */
  readonly halfPieces?: readonly string[]
  /** Pure draft function: measurements in mm (getMeasurements of `system`) and option values. */
  readonly draft: (measurements: Readonly<Record<KeyOf<S>, number>>, options: BlockOptions) => Draft
}

/** A block of any measurement system. */
export type AnyBlockDef = { [S in MeasurementSystem]: BlockDef<S> }[MeasurementSystem]

/** Front and back of a block drafted as halves (centre front / centre back on the fold). */
const FRONT_BACK_HALVES: readonly string[] = ['front', 'back']

export const DEFAULT_CUT: PieceCutInfo = { count: 1, material: 'Tela' }

export const WOMEN_BODICE_BLOCK: BlockDef<'co-women-industrial'> = {
  id: 'women-bodice',
  label: 'Cuerpo base mujer',
  category: ['Cuerpo', 'Bloques base'],
  sex: 'female',
  system: 'co-women-industrial',
  defaultSize: '10',
  options: [
    {
      key: 'length',
      label: 'Largo',
      choices: [
        { value: 'hip', label: 'Hasta la cadera' },
        { value: 'waist', label: 'Hasta la cintura' },
      ],
      default: 'hip',
    },
  ],
  views: [
    { id: 'front', label: 'Frente', pieceId: 'front' },
    { id: 'back', label: 'Espalda', pieceId: 'back' },
  ],
  halfPieces: FRONT_BACK_HALVES,
  draft: (m, o) => draftWomenBodice(m, { length: o.length === 'waist' ? 'waist' : 'hip' }),
}

/** Parse a numeric choice value (mm), falling back to `fallback`. */
const mmOption = (v: BlockOptionValue | undefined, fallback: number): number => {
  const n = Number(v)
  return v !== undefined && v !== '' && Number.isFinite(n) ? n : fallback
}

export const WOMEN_SLEEVE_BLOCK: BlockDef<'co-women-industrial'> = {
  id: 'women-sleeve',
  label: 'Manga base mujer',
  category: ['Manga', 'Bloques base'],
  sex: 'female',
  system: 'co-women-industrial',
  defaultSize: '10',
  options: [
    {
      key: 'capEase',
      label: 'Embebido de copa',
      choices: [
        { value: '15', label: '1,5 cm' },
        { value: '30', label: '3 cm' },
        { value: '42', label: '4,2 cm (ejemplo del método)' },
      ],
      default: String(WOMEN_SLEEVE_DEFAULTS.capEase),
    },
  ],
  views: [{ id: 'sleeve', label: 'Manga', pieceId: 'sleeve' }],
  cut: { sleeve: { count: 2, material: 'Tela' } },
  draft: (m, o) =>
    draftWomenSleeve(m, { capEase: mmOption(o.capEase, WOMEN_SLEEVE_DEFAULTS.capEase) }),
}

export const WOMEN_SKIRT_BLOCK: BlockDef<'co-women-industrial'> = {
  id: 'women-skirt',
  label: 'Falda base mujer',
  category: ['Falda', 'Bloques base'],
  sex: 'female',
  system: 'co-women-industrial',
  defaultSize: '10',
  options: [
    {
      key: 'sideSeamShift',
      label: 'Desvío del costado',
      choices: [
        { value: '0', label: 'Centrado' },
        { value: '10', label: '1 cm hacia el delantero' },
      ],
      default: '0',
    },
  ],
  views: [
    { id: 'front', label: 'Frente', pieceId: 'front' },
    { id: 'back', label: 'Espalda', pieceId: 'back' },
  ],
  halfPieces: FRONT_BACK_HALVES,
  draft: (m, o) => draftWomenSkirt(m, { sideSeamShift: mmOption(o.sideSeamShift, 0) }),
}

export const MEN_BODICE_BLOCK: BlockDef<'es-men-easd'> = {
  id: 'men-bodice',
  label: 'Cuerpo base / camisa hombre',
  category: ['Cuerpo', 'Bloques base'],
  sex: 'male',
  system: 'es-men-easd',
  defaultSize: '48',
  options: [
    {
      key: 'length',
      label: 'Largo',
      choices: [
        { value: 'shirt', label: 'Largo de camisa' },
        { value: 'hip', label: 'Hasta la cadera' },
      ],
      default: 'shirt',
    },
  ],
  views: [
    { id: 'front', label: 'Frente', pieceId: 'front' },
    { id: 'back', label: 'Espalda', pieceId: 'back' },
  ],
  halfPieces: FRONT_BACK_HALVES,
  draft: (m, o) => draftMenBodice(m, { length: o.length === 'hip' ? 'hip' : 'shirt' }),
}

export const MEN_SLEEVE_BLOCK: BlockDef<'es-men-easd'> = {
  id: 'men-sleeve',
  label: 'Manga base hombre',
  category: ['Manga', 'Bloques base'],
  sex: 'male',
  system: 'es-men-easd',
  defaultSize: '48',
  options: [
    {
      key: 'capEase',
      label: 'Embebido de copa',
      choices: [
        { value: '0', label: 'Sin embebido' },
        { value: '10', label: '1 cm (camisa)' },
        { value: '20', label: '2 cm' },
      ],
      default: String(MEN_SLEEVE_DEFAULTS.capEase),
    },
  ],
  views: [{ id: 'sleeve', label: 'Manga', pieceId: 'sleeve' }],
  cut: { sleeve: { count: 2, material: 'Tela' } },
  draft: (m, o) => draftMenSleeve(m, { capEase: mmOption(o.capEase, MEN_SLEEVE_DEFAULTS.capEase) }),
}

/** Trouser legs are cut twice (left and right). */
const TROUSER_CUT: Readonly<Record<string, PieceCutInfo>> = {
  front: { count: 2, material: 'Tela' },
  back: { count: 2, material: 'Tela' },
}

const TROUSER_VIEWS: readonly BlockView[] = [
  { id: 'front', label: 'Frente', pieceId: 'front' },
  { id: 'back', label: 'Espalda', pieceId: 'back' },
]

export const WOMEN_TROUSERS_BLOCK: BlockDef<'co-women-industrial'> = {
  id: 'women-trousers',
  label: 'Pantalón base mujer',
  category: ['Pantalón', 'Bloques base'],
  sex: 'female',
  system: 'co-women-industrial',
  defaultSize: '10',
  options: [
    {
      key: 'bottom',
      label: 'Ancho de bota',
      choices: [
        { value: 'straight', label: 'Recta' },
        { value: 'jeans', label: 'Ajustada (jean)' },
      ],
      default: 'straight',
    },
  ],
  views: TROUSER_VIEWS,
  cut: TROUSER_CUT,
  draft: (m, o) => draftWomenTrousers(m, { bottom: o.bottom === 'jeans' ? 'jeans' : 'straight' }),
}

export const MEN_TROUSERS_BLOCK: BlockDef<'es-men-easd'> = {
  id: 'men-trousers',
  label: 'Pantalón base hombre',
  category: ['Pantalón', 'Bloques base'],
  sex: 'male',
  system: 'es-men-easd',
  defaultSize: '48',
  options: [
    {
      key: 'crotchEase',
      label: 'Holgura de tiro',
      choices: [
        { value: '0', label: '0 cm (tabla)' },
        { value: '10', label: '1 cm' },
        { value: '20', label: '2 cm' },
        { value: '25', label: '2,5 cm (recomendada)' },
        { value: '30', label: '3 cm' },
        { value: '40', label: '4 cm' },
      ],
      default: String(MEN_TROUSERS_BLOCK_DEFAULTS.crotchEase),
    },
  ],
  views: TROUSER_VIEWS,
  cut: TROUSER_CUT,
  draft: (m, o) =>
    draftMenTrousers(m, {
      crotchEase: mmOption(o.crotchEase, MEN_TROUSERS_BLOCK_DEFAULTS.crotchEase),
      crotchExtensionEase: MEN_TROUSERS_BLOCK_DEFAULTS.crotchExtensionEase,
    }),
}

export const BLOCKS: readonly AnyBlockDef[] = [
  WOMEN_BODICE_BLOCK,
  WOMEN_SLEEVE_BLOCK,
  WOMEN_SKIRT_BLOCK,
  WOMEN_TROUSERS_BLOCK,
  MEN_BODICE_BLOCK,
  MEN_SLEEVE_BLOCK,
  MEN_TROUSERS_BLOCK,
]

export const DEFAULT_BLOCK_ID = WOMEN_BODICE_BLOCK.id

export const getBlock = (id: string): AnyBlockDef => {
  const block = BLOCKS.find((b) => b.id === id)
  if (!block) throw new Error(`Unknown block "${id}"`)
  return block
}

/** Default value of every option of the block. */
export const defaultBlockOptions = (block: AnyBlockDef): Record<string, BlockOptionValue> =>
  Object.fromEntries(block.options.map((o) => [o.key, o.default]))

/** Option values restricted to the block's schema (unknown keys dropped, invalid values reset). */
export const sanitizeBlockOptions = (
  block: AnyBlockDef,
  options: Readonly<Record<string, unknown>>,
): Record<string, BlockOptionValue> =>
  Object.fromEntries(
    block.options.map((o) => {
      const v = options[o.key]
      return [o.key, o.choices.some((c) => c.value === v) ? (v as string) : o.default]
    }),
  )

/** Size ids of the block's measurement system, in table order. */
export const blockSizes = (block: AnyBlockDef): readonly string[] =>
  getTable(block.system).sizes.map((s) => s.id)

export const isBlockSize = (block: AnyBlockDef, size: string): boolean =>
  blockSizes(block).includes(size)

/** Draft a block for one size of its system. Throws if the size does not belong to it. */
export const draftBlock = (block: AnyBlockDef, size: string, options: BlockOptions = {}): Draft => {
  if (!isBlockSize(block, size)) throw new Error(`Size "${size}" is not in "${block.system}"`)
  const merged = { ...defaultBlockOptions(block), ...options }
  // The union of block types cannot correlate `system` with `draft`; each entry is typed above.
  const draft = block.draft as (m: Readonly<Record<string, number>>, o: BlockOptions) => Draft
  return draft(getMeasurements(block.system, size as SizeOf<typeof block.system>), merged)
}

/** True for a piece the block drafts as a half (default "al doblez" when it has a centre edge). */
export const isHalfPiece = (block: AnyBlockDef, pieceId: string): boolean =>
  block.halfPieces?.includes(pieceId) ?? false

export const pieceCut = (block: AnyBlockDef, pieceId: string): PieceCutInfo =>
  block.cut?.[pieceId] ?? DEFAULT_CUT
