import { useEffect } from 'react'
import '../theme.css'
import './layout.css'
import { Canvas } from '../canvas/Canvas'
import { CalibrationDialog } from '../panels/CalibrationDialog'
import { DetailsPanel } from '../panels/DetailsPanel'
import { InstructionsCard } from '../panels/InstructionsCard'
import { LeftPanel } from '../panels/LeftPanel'
import { PreviewCard } from '../panels/PreviewCard'
import { UserMeasurementsCard } from '../panels/UserMeasurementsCard'
import { useEditorStore } from '../store/editorStore'
import { ProjectsDialog } from '../panels/ProjectsDialog'
import { initProjects } from '../store/projectManager'
import { NavRail } from './NavRail'
import { TopBar } from './TopBar'

const isEditable = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))

/** The editor shell: regions and proportions of docs/UI.md §1. */
export function Editor() {
  const drawer = useEditorStore((s) => s.drawer)
  const calibrationOpen = useEditorStore((s) => s.calibrationOpen)
  const projectsOpen = useEditorStore((s) => s.projectsOpen)

  useEffect(() => {
    if (!drawer) return
    const onKey = (ev: KeyboardEvent) =>
      ev.key === 'Escape' && useEditorStore.getState().setDrawer(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  // Undo / redo: Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y (Cmd on macOS); text fields keep their own undo.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (!(ev.ctrlKey || ev.metaKey) || ev.altKey || isEditable(ev.target)) return
      const key = ev.key.toLowerCase()
      const store = useEditorStore.getState()
      if (key === 'z' && !ev.shiftKey) store.undo()
      else if ((key === 'z' && ev.shiftKey) || key === 'y') store.redo()
      else return
      ev.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    void initProjects()
  }, [])

  return (
    <div className="editor">
      <TopBar />
      <NavRail />
      <LeftPanel />
      <main className="workspace">
        <Canvas />
        <div className="bottom-center">
          <PreviewCard />
          <InstructionsCard />
        </div>
        <DetailsPanel />
        <UserMeasurementsCard />
      </main>
      {drawer && (
        <div
          className="drawer-backdrop"
          data-testid="drawer-backdrop"
          onPointerDown={() => useEditorStore.getState().setDrawer(null)}
        />
      )}
      {calibrationOpen && <CalibrationDialog />}
      {projectsOpen && <ProjectsDialog />}
    </div>
  )
}
