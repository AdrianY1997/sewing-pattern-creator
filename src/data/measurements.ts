/** Accessors over the bundled measurement tables. All returned values are millimetres. */
import { MEN_ES_EASD } from './men'
import type {
  ComplementaryRow,
  KeyOf,
  MeasurementKind,
  MeasurementRow,
  MeasurementSystem,
  MeasurementTable,
  SizeOf,
} from './types'
import { WOMEN_CO_INDUSTRIAL } from './women'

export const MEASUREMENT_TABLES: {
  readonly [S in MeasurementSystem]: MeasurementTable<KeyOf<S>, SizeOf<S>>
} = {
  'co-women-industrial': WOMEN_CO_INDUSTRIAL,
  'es-men-easd': MEN_ES_EASD,
}

export const getTable = <S extends MeasurementSystem>(
  system: S,
): MeasurementTable<KeyOf<S>, SizeOf<S>> => {
  const table = MEASUREMENT_TABLES[system]
  if (!table) throw new Error(`Unknown measurement system "${system}"`)
  return table
}

/** Original rows followed by complementary rows. */
export const allRows = <K extends string>(
  table: MeasurementTable<K>,
): readonly (MeasurementRow<K> | ComplementaryRow<K>)[] => [...table.rows, ...table.complementary]

/** cm → mm without float noise (table values have at most 2 decimals). */
const toMm = (cm: number): number => Math.round(cm * 10 * 1e6) / 1e6

const sizeIndex = <S extends MeasurementSystem>(system: S, size: SizeOf<S>): number => {
  const idx = getTable(system).sizes.findIndex((s) => s.id === size)
  if (idx < 0) throw new Error(`Size "${size}" does not exist in "${system}"`)
  return idx
}

/** Every measurement (original + complementary) of one size, in mm, as stored (full/half/length). */
export const getMeasurements = <S extends MeasurementSystem>(
  system: S,
  size: SizeOf<S>,
): Record<KeyOf<S>, number> => {
  const idx = sizeIndex(system, size)
  const out = {} as Record<KeyOf<S>, number>
  for (const row of allRows(getTable(system))) out[row.key] = toMm(row.valuesCm[idx])
  return out
}

const findRow = <S extends MeasurementSystem>(system: S, key: KeyOf<S>) => {
  const row = allRows(getTable(system)).find((r) => r.key === key)
  if (!row) throw new Error(`Measurement "${key}" does not exist in "${system}"`)
  return row
}

export const getMeasurementKind = <S extends MeasurementSystem>(
  system: S,
  key: KeyOf<S>,
): MeasurementKind => findRow(system, key).kind

/** One measurement in mm, as stored. */
export const getMeasurement = <S extends MeasurementSystem>(
  system: S,
  size: SizeOf<S>,
  key: KeyOf<S>,
): number => toMm(findRow(system, key).valuesCm[sizeIndex(system, size)])

/**
 * The full measurement in mm whatever the stored kind: half measurements are doubled
 * (EASD chest 48 → 960 mm circumference); full circumferences and lengths are returned as is.
 */
export const getFullMeasurement = <S extends MeasurementSystem>(
  system: S,
  size: SizeOf<S>,
  key: KeyOf<S>,
): number => {
  const v = getMeasurement(system, size, key)
  return findRow(system, key).kind === 'half' ? v * 2 : v
}

/** Same as getFullMeasurement but halved: the value a half-pattern needs. */
export const getHalfMeasurement = <S extends MeasurementSystem>(
  system: S,
  size: SizeOf<S>,
  key: KeyOf<S>,
): number => {
  const v = getMeasurement(system, size, key)
  return findRow(system, key).kind === 'half' ? v : v / 2
}

// ---------- grading irregularities ----------

export interface GradingStep<Z extends string = string> {
  readonly from: Z
  readonly to: Z
  /** Increment in cm. */
  readonly increment: number
}

export interface GradingIrregularity<K extends string = string, Z extends string = string> {
  readonly key: K
  readonly label: string
  /** The most frequent increment of the row (cm); ties go to the first one seen. */
  readonly expectedIncrement: number
  /** Steps whose increment differs from the expected one. */
  readonly steps: readonly GradingStep<Z>[]
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6

/** Rows whose size-to-size increment is not constant ("irregularidad de escalado"). */
export const findGradingIrregularities = <K extends string, Z extends string>(
  table: MeasurementTable<K, Z>,
): GradingIrregularity<K, Z>[] => {
  const out: GradingIrregularity<K, Z>[] = []
  for (const row of allRows(table)) {
    const incs = row.valuesCm.slice(1).map((v, i) => round6(v - row.valuesCm[i]))
    if (incs.length === 0) continue
    const counts = new Map<number, number>()
    for (const d of incs) counts.set(d, (counts.get(d) ?? 0) + 1)
    let expected = incs[0]
    for (const [d, c] of counts) if (c > (counts.get(expected) ?? 0)) expected = d
    const steps = incs.flatMap((d, i) =>
      d === expected ? [] : [{ from: table.sizes[i].id, to: table.sizes[i + 1].id, increment: d }],
    )
    if (steps.length > 0)
      out.push({ key: row.key, label: row.label, expectedIncrement: expected, steps })
  }
  return out
}

/**
 * UI label of a measurement row: half measures (kind `half`) are marked "(1/2)", e.g. the EASD
 * "Pecho" becomes "Pecho (1/2)"; labels that already say so are kept as they are.
 */
export const measurementLabel = (row: { readonly label: string; readonly kind: string }): string =>
  row.kind === 'half' && !/\(1\/2\)/.test(row.label) ? `${row.label} (1/2)` : row.label
