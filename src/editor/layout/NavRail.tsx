import {
  FolderKanban,
  FolderOpen,
  House,
  Library,
  Plus,
  Ruler,
  Settings,
  type LucideIcon,
} from 'lucide-react'
import { useEditorStore, type LeftTab } from '../store/editorStore'
import { COMING_SOON, OUT_OF_V1 } from './controls'

interface NavItem {
  readonly label: string
  readonly icon: LucideIcon
  /** Left panel tab opened by the item; items without a tab or `active` are placeholders. */
  readonly tab?: LeftTab
  readonly active?: boolean
  readonly placeholder?: string
}

const ITEMS: readonly NavItem[] = [
  { label: 'Inicio', icon: House, placeholder: COMING_SOON },
  { label: 'Nuevo patrón', icon: Plus, active: true, tab: 'design' },
  { label: 'Mis patrones', icon: FolderOpen, placeholder: COMING_SOON },
  { label: 'Biblioteca', icon: Library, placeholder: OUT_OF_V1 },
  { label: 'Medidas', icon: Ruler, tab: 'measurements' },
  { label: 'Proyectos', icon: FolderKanban, placeholder: COMING_SOON },
]

const SETTINGS: NavItem = { label: 'Configuración', icon: Settings, tab: 'settings' }

function RailButton({ item }: { readonly item: NavItem }) {
  const setLeftTab = useEditorStore((s) => s.setLeftTab)
  const Icon = item.icon
  return (
    <button
      type="button"
      className="rail-item"
      aria-current={item.active ? 'page' : undefined}
      disabled={!!item.placeholder}
      title={item.placeholder ?? item.label}
      onClick={() => item.tab && setLeftTab(item.tab)}
    >
      <Icon size={20} strokeWidth={1.75} aria-hidden />
      <span className="rail-label">{item.label}</span>
    </button>
  )
}

export function NavRail() {
  return (
    <nav className="rail" aria-label="Navegación principal">
      {ITEMS.map((item) => (
        <RailButton key={item.label} item={item} />
      ))}
      <div className="rail-spacer" />
      <RailButton item={SETTINGS} />
    </nav>
  )
}
