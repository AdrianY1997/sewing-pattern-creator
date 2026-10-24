import type { MeasurementTable, MenKey, MenSize } from './types'

/**
 * SPEC §3.2 (EASD Valencia, Spanish sizes). Chest, waist and hip are HALF measurements
 * (size = ½ chest). Values in cm. Complementary values (§3.4.2) are not loaded yet.
 */
export const MEN_ES_EASD: MeasurementTable<MenKey, MenSize> = {
  system: 'es-men-easd',
  sex: 'male',
  name: 'Hombre — EASD Valencia, tallas españolas',
  source: 'EASD Valencia — tallas españolas (pecho, cintura y cadera en medias medidas, cm)',
  unit: 'cm',
  sizes: (['40', '42', '44', '46', '48', '50', '52', '54'] as const).map((id) => ({
    id,
    label: id,
  })),
  rows: [
    {
      key: 'neckRadius',
      label: 'Radio de escote',
      kind: 'length',
      valuesCm: [7.2, 7.4, 7.6, 7.8, 8, 8.2, 8.4, 8.6],
    },
    {
      key: 'hipDepth',
      label: 'Altura de cadera',
      kind: 'length',
      valuesCm: [16, 16, 16, 16, 16, 16, 16, 16],
    },
    { key: 'chest', label: 'Pecho', kind: 'half', valuesCm: [40, 42, 44, 46, 48, 50, 52, 54] },
    { key: 'waist', label: 'Cintura', kind: 'half', valuesCm: [32, 34, 36, 38, 40, 44, 46, 49] },
    { key: 'hip', label: 'Cadera', kind: 'half', valuesCm: [42, 44, 46, 48, 50, 52, 54, 56] },
    {
      key: 'halfBackWidth',
      label: 'Ancho de espalda',
      kind: 'half',
      valuesCm: [19.5, 20, 20.5, 21, 21.5, 22, 22.5, 23],
    },
    {
      key: 'waistLength',
      label: 'Largo de talle',
      kind: 'length',
      valuesCm: [41.5, 42, 42.5, 43, 43.5, 44.5, 45.5, 46.2],
    },
    {
      key: 'sleeveLength',
      label: 'Largo de manga',
      kind: 'length',
      valuesCm: [60, 60, 60, 61, 61, 62, 63, 64],
    },
    {
      key: 'armholeDepth',
      label: 'Profundidad de sisa',
      kind: 'length',
      valuesCm: [21, 21.5, 22, 22.5, 23, 23.5, 24, 24.5],
    },
    {
      key: 'crotchDepth',
      label: 'Largo de tiro',
      kind: 'length',
      valuesCm: [19.5, 20, 20.5, 21, 21.5, 22, 22.5, 23],
    },
    {
      key: 'kneeLength',
      label: 'Largo de rodilla',
      kind: 'length',
      valuesCm: [48, 48.5, 49, 49.5, 50, 50.5, 51, 51.5],
    },
    {
      key: 'trouserLength',
      label: 'Largo total de pantalón',
      kind: 'length',
      valuesCm: [104, 104.5, 105, 105.5, 106, 106.5, 107, 107.5],
    },
    {
      key: 'halfCuffWidth',
      label: 'Ancho bocamanga',
      kind: 'half',
      valuesCm: [12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5],
    },
    {
      key: 'halfTrouserBottomWidth',
      label: 'Ancho de camal',
      kind: 'half',
      valuesCm: [12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5],
    },
    {
      key: 'halfKneeWidth',
      label: 'Ancho de rodilla',
      kind: 'half',
      valuesCm: [12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16],
    },
  ],
  complementary: [],
  notes: [
    'La cintura salta +4 entre 48→50 y +3 entre 52→54, y el largo de talle de la 54 es 46.2: se respetan tal cual el original y se marcan como irregularidad de escalado.',
  ],
}
