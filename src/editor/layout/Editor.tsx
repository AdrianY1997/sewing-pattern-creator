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
import { loadProject } from '../store/projectStorage'
import { NavRail } from './NavRail'
import { TopBar } from './TopBar'

/** The editor shell: regions and proportions of docs/UI.md §1. */
export function Editor() {
  const drawer = useEditorStore((s) => s.drawer)
  const calibrationOpen = useEditorStore((s) => s.calibrationOpen)

  useEffect(() => {
    if (!drawer) return
    const onKey = (ev: KeyboardEvent) =>
      ev.key === 'Escape' && useEditorStore.getState().setDrawer(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [drawer])

  useEffect(() => {
    loadProject()
      .then((snap) => snap && useEditorStore.getState().loadSnapshot(snap))
      .catch(() => undefined) // no IndexedDB (private mode…): start from defaults
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
    </div>
  )
}
