import { useEffect } from 'react'
import { NookProvider, useNook } from '@/app/NookContext'
import { OfflineProvider } from '@/app/OfflineContext'
import { Button } from '@/components/ui/button'
import { Toaster } from '@/components/ui/toast'
import { TooltipProvider } from '@/components/ui/tooltip'
import { LibraryScreen } from '@/features/library/LibraryScreen'
import { ThemeProvider } from '@/features/theme/ThemeProvider'
import { WorkspaceScreen } from '@/features/workspace/WorkspaceScreen'
import { setupInputModality } from '@/lib/modality'

function NookSurface() {
  const { ready, error, refresh, workspace } = useNook()

  if (!ready) {
    return <main id="main-content" className="grid min-h-svh place-items-center p-6" aria-busy="true"><p role="status">Opening your local library…</p></main>
  }
  if (error) {
    return <main id="main-content" className="grid min-h-svh place-items-center p-6"><section className="max-w-md space-y-4 text-center" role="alert"><h1 className="text-xl font-semibold">Nook could not open your library</h1><p className="text-muted-foreground">{error}</p><Button onClick={() => { void refresh().catch(() => {}) }}>Try again</Button></section></main>
  }
  return <><LibraryScreen workspaceActive={Boolean(workspace)} />{workspace && <WorkspaceScreen />}</>
}

export default function App() {
  useEffect(() => {
    return setupInputModality()
  }, [])

  return (
    <ThemeProvider>
      <TooltipProvider>
        <NookProvider>
          <OfflineProvider>
            <a className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:p-2 focus:text-foreground focus:ring-2 focus:ring-ring" href="#main-content">
              Skip to main content
            </a>
            <NookSurface />
            <Toaster />
          </OfflineProvider>
        </NookProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
