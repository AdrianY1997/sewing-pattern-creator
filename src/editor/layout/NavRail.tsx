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
import { newProject } from '../store/projectManager'
import { OUT_OF_V1, COMING_SOON } from './controls'

interface NavItem {
  readonly label: string
  readonly icon: LucideIcon
  /** Left panel tab opened by the item; items without a tab or `active` are placeholders. */
  readonly tab?: LeftTab
  readonly active?: boolean
  readonly placeholder?: string
  /** Opens the projects page. */
  readonly projects?: boolean
  /** Starts a fresh project. */
  readonly create?: boolean
}

const ITEMS: readonly NavItem[] = [
  { label: 'Inicio', icon: House, placeholder: COMING_SOON },
  { label: 'Nuevo patrón', icon: Plus, active: true, tab: 'design', create: true },
  { label: 'Mis patrones', icon: FolderOpen, projects: true },
  { label: 'Biblioteca', icon: Library, placeholder: OUT_OF_V1 },
  { label: 'Medidas', icon: Ruler, tab: 'measurements' },
  { label: 'Proyectos', icon: FolderKanban, projects: true },
]

/** Below this width the side panels are drawers (docs/UI.md §5; keep in sync with layout.css). */
const NARROW_QUERY = '(max-width: 1199px)'

const SETTINGS: NavItem = { label: 'Configuración', icon: Settings, tab: 'settings' }

function RailButton({ item }: { readonly item: NavItem }) {
  const setLeftTab = useEditorStore((s) => s.setLeftTab)
  const setDrawer = useEditorStore((s) => s.setDrawer)
  const Icon = item.icon
  return (
    <button
      type="button"
      className="rail-item"
      aria-current={item.active ? 'page' : undefined}
      disabled={!!item.placeholder}
      title={item.placeholder ?? item.label}
      onClick={() => {
        if (item.projects) useEditorStore.getState().setProjectsOpen(true)
        if (item.create) void newProject()
        if (!item.tab) return
        setLeftTab(item.tab)
        // Narrow layout: the configuration panel is a drawer, open it.
        if (window.matchMedia?.(NARROW_QUERY).matches) setDrawer('left')
      }}
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
