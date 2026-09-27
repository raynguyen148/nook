import { createContext, useContext, type ReactNode } from 'react'
import { useNook } from '@/app/NookContext'
import { useOfflineUpdates, type OfflineUpdateState } from '@/features/offline/useOfflineUpdates'

const OfflineContext = createContext<OfflineUpdateState | null>(null)

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { hasDirtyDrafts } = useNook()
  const state = useOfflineUpdates(hasDirtyDrafts)
  return <OfflineContext.Provider value={state}>{children}</OfflineContext.Provider>
}

export function useOfflineStatus(): OfflineUpdateState {
  const context = useContext(OfflineContext)
  if (!context) throw new Error('useOfflineStatus must be used inside OfflineProvider.')
  return context
}
