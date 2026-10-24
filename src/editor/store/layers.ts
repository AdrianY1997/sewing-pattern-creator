/** Canvas layers (docs/UI.md §3), in the order of the Capas panel. */
export type LayerId = 'outline' | 'seam' | 'sizes' | 'darts' | 'guides' | 'notes'

export interface LayerDef {
  readonly id: LayerId
  readonly label: string
  /** Swatch in the Capas panel: a dot or a dashed line of the layer colour. */
  readonly swatch: 'dot' | 'dash'
  readonly color: string
  readonly defaultVisible: boolean
}

export const LAYERS: readonly LayerDef[] = [
  {
    id: 'outline',
    label: 'Contorno',
    swatch: 'dot',
    color: 'var(--layer-outline)',
    defaultVisible: true,
  },
  {
    id: 'seam',
    label: 'Costura',
    swatch: 'dash',
    color: 'var(--layer-seam)',
    defaultVisible: true,
  },
  {
    id: 'sizes',
    label: 'Tallas',
    swatch: 'dot',
    color: 'var(--layer-sizes)',
    defaultVisible: false,
  },
  {
    id: 'darts',
    label: 'Pinzas',
    swatch: 'dot',
    color: 'var(--layer-darts)',
    defaultVisible: true,
  },
  {
    id: 'guides',
    label: 'Líneas guía',
    swatch: 'dash',
    color: 'var(--layer-guide)',
    defaultVisible: false,
  },
  {
    id: 'notes',
    label: 'Notas',
    swatch: 'dash',
    color: 'var(--layer-notes)',
    defaultVisible: false,
  },
]

export type LayerVisibility = Readonly<Record<LayerId, boolean>>

export const DEFAULT_LAYERS: LayerVisibility = Object.fromEntries(
  LAYERS.map((l) => [l.id, l.defaultVisible]),
) as Record<LayerId, boolean>
