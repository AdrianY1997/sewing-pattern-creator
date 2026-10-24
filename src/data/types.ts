/** Measurement table model. Stored values are centimetres exactly as published; accessors return mm. */

/**
 * - `full`: full circumference (contorno completo).
 * - `half`: half of the full measurement (media medida), e.g. EASD chest or a half width.
 * - `length`: a linear length/height/width that is not halved.
 */
export type MeasurementKind = 'full' | 'half' | 'length'

export type MeasurementSystem = 'co-women-industrial' | 'es-men-easd'

export type Sex = 'female' | 'male'

export type WomenSize = '6' | '8' | '10' | '12' | '14' | '16'
export type MenSize = '40' | '42' | '44' | '46' | '48' | '50' | '52' | '54'

/** Measurements of the women's table (SPEC §3.1). */
export type WomenTableKey =
  | 'bust'
  | 'waist'
  | 'hip'
  | 'shoulderLength'
  | 'hipDepth'
  | 'bustDepth'
  | 'neck'
  | 'frontWaistLength'
  | 'backWaistLength'
  | 'halfChestWidth'
  | 'halfBackWidth'
  | 'halfBustSpan'
  | 'upperArm'
  | 'sleeveLength'
  | 'wrist'

/** Women's complementary measurements (SPEC §3.4.1). */
export type WomenComplementaryKey =
  | 'waistToKnee'
  | 'skirtLength'
  | 'trouserLength'
  | 'bodyRise'
  | 'thigh'
  | 'knee'
  | 'ankle'
  | 'halfTrouserBottomWidth'
  | 'halfJeansBottomWidth'

/** Measurements of the men's EASD table (SPEC §3.2). */
export type MenTableKey =
  | 'neckRadius'
  | 'hipDepth'
  | 'chest'
  | 'waist'
  | 'hip'
  | 'halfBackWidth'
  | 'waistLength'
  | 'sleeveLength'
  | 'armholeDepth'
  | 'crotchDepth'
  | 'kneeLength'
  | 'trouserLength'
  | 'halfCuffWidth'
  | 'halfTrouserBottomWidth'
  | 'halfKneeWidth'

export type WomenKey = WomenTableKey | WomenComplementaryKey
/** Men's complementary measurements (SPEC §3.4.2). */
export type MenComplementaryKey =
  'neck' | 'shoulderLength' | 'halfChestWidth' | 'upperArm' | 'wrist' | 'shirtLength' | 'thigh'

export type MenKey = MenTableKey | MenComplementaryKey

export type MeasurementKey = WomenKey | MenKey

export interface MeasurementRow<K extends string = string> {
  readonly key: K
  /** Spanish label for the UI. */
  readonly label: string
  readonly kind: MeasurementKind
  /** Values in cm, one per size, in the table's size order. */
  readonly valuesCm: readonly number[]
}

export interface ComplementaryRow<K extends string = string> extends MeasurementRow<K> {
  /** How the value was obtained (source or derivation). */
  readonly method: string
  /** True when estimated rather than taken from a published table (validate with a toile). */
  readonly derived: boolean
}

export interface SizeDef<Z extends string = string> {
  readonly id: Z
  readonly label: string
}

export interface MeasurementTable<K extends string = string, Z extends string = string> {
  readonly system: MeasurementSystem
  readonly sex: Sex
  /** Spanish display name. */
  readonly name: string
  readonly source: string
  readonly unit: 'cm'
  readonly sizes: readonly SizeDef<Z>[]
  /** Original table rows (never modified). */
  readonly rows: readonly MeasurementRow<K>[]
  /** Complementary rows kept apart from the original table. */
  readonly complementary: readonly ComplementaryRow<K>[]
  readonly complementarySource?: string
  readonly notes?: readonly string[]
}

export interface SystemMap {
  'co-women-industrial': { key: WomenKey; size: WomenSize }
  'es-men-easd': { key: MenKey; size: MenSize }
}

export type KeyOf<S extends MeasurementSystem> = SystemMap[S]['key']
export type SizeOf<S extends MeasurementSystem> = SystemMap[S]['size']
