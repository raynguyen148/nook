/**
 * Input Modality Management
 * Enforces that visual focus rings and highlights only appear when the user
 * navigates with the Tab key, and never on mouse/pointer clicks.
 */

export function setupInputModality(): () => void {
  if (typeof document === 'undefined') return () => {}

  // Default to pointer modality so initial mouse clicks never trigger focus rings
  document.documentElement.dataset.inputModality = 'pointer'

  const handlePointerDown = () => {
    document.documentElement.dataset.inputModality = 'pointer'
  }

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Tab') {
      document.documentElement.dataset.inputModality = 'keyboard'
    }
  }

  // Use capture to ensure the dataset is updated before focus events fire
  window.addEventListener('pointerdown', handlePointerDown, true)
  window.addEventListener('keydown', handleKeyDown, true)

  return () => {
    window.removeEventListener('pointerdown', handlePointerDown, true)
    window.removeEventListener('keydown', handleKeyDown, true)
  }
}
