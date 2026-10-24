import { useEffect } from 'react'
import '../theme.css'
import './layout.css'
import { Canvas } from '../canvas/Canvas'
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
    </div>
  )
}
