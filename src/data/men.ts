import type { MeasurementTable, MenKey, MenSize } from './types'

/**
 * SPEC §3.2 (EASD Valencia, Spanish sizes). Chest, waist and hip are HALF measurements
 * (size = ½ chest). Values in cm.
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
  complementarySource:
    'SPEC §3.4.2: Ottobre Design "Men 46-60" [OTT] y Kershaw, Patternmaking for Menswear [KER]; tallas EASD 44-54 por contorno de pecho, 40-42 extrapoladas',
  complementary: [
    {
      key: 'neck',
      label: 'Contorno de cuello',
      kind: 'full',
      valuesCm: [36, 37, 38, 39, 40, 41, 42, 43],
      method:
        '[OTT] "Neck circumference" y [KER] "Neck base circumference" (directo, 44-54); 40-42 extrapolado +1 por talla',
      derived: false,
    },
    {
      key: 'shoulderLength',
      label: 'Largo de hombro',
      kind: 'length',
      valuesCm: [13.1, 13.4, 13.7, 14, 14.3, 14.6, 14.9, 15.2],
      method: '[OTT]/[KER] "Shoulder length" (directo, 44-54); 40-42 extrapolado +0.3 por talla',
      derived: false,
    },
    {
      key: 'halfChestWidth',
      label: 'Ancho de pecho (1/2)',
      kind: 'half',
      valuesCm: [17, 17.5, 18, 18.5, 19, 19.5, 20, 20.5],
      method: 'Parcial: ancho de espalda EASD (3.2) - 2.5 (diferencia espalda-pecho de [KER])',
      derived: false,
    },
    {
      key: 'upperArm',
      label: 'Contorno de brazo',
      kind: 'full',
      valuesCm: [27.2, 28.4, 29.6, 30.8, 32, 33.2, 34.4, 35.6],
      method: 'Estimado (sin fuente): 32 en la 48, +1.2 por talla; contraste Craft Yarn Council',
      derived: true,
    },
    {
      key: 'wrist',
      label: 'Contorno de muñeca',
      kind: 'full',
      valuesCm: [16.8, 17, 17.2, 17.4, 17.6, 17.8, 18, 18.2],
      method: '[KER] "Wrist circumference" (directo, 44-54); 40-42 extrapolado +0.2 por talla',
      derived: false,
    },
    {
      key: 'shirtLength',
      label: 'Largo total de camisa',
      kind: 'length',
      valuesCm: [73.5, 74, 74.5, 75, 75.5, 76.5, 77.5, 78.2],
      method: 'Estimado (sin fuente estándar): largo de talle (3.2) + 32; medida de diseño',
      derived: true,
    },
    {
      key: 'thigh',
      label: 'Contorno de muslo',
      kind: 'full',
      valuesCm: [49.1, 50.9, 52.7, 54.5, 56.3, 58.1, 59.9, 61.7],
      method: '[KER] "Thigh circumference" (directo, 44-54, +1.8 por talla); 40-42 extrapolado',
      derived: false,
    },
  ],
  notes: [
    'La cintura salta +4 entre 48→50 y +3 entre 52→54, y el largo de talle de la 54 es 46.2: se respetan tal cual el original y se marcan como irregularidad de escalado.',
  ],
}
