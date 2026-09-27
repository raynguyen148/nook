import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react'
import { flushSync } from 'react-dom'

export const THEME_MODES = ['light', 'coffee', 'forest', 'midnight', 'dark', 'retro', 'auto'] as const
export type ThemeMode = (typeof THEME_MODES)[number]
export type EffectiveTheme = Exclude<ThemeMode, 'auto'>

const THEME_STORAGE_KEY = 'nook:theme'
const THEME_BACKGROUND_FALLBACKS: Record<EffectiveTheme, string> = {
  light: '#f8fafc',
  coffee: '#faf7f4',
  forest: '#f5f8f5',
  midnight: '#111827',
  dark: '#0d1118',
  retro: '#f5f2e8',
}

interface ThemeContextValue {
  theme: ThemeMode
  effectiveTheme: EffectiveTheme
  setTheme: (mode: ThemeMode) => void
  cycleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function runThemeTransition(update: () => void): void {
  const startViewTransition = document.startViewTransition?.bind(document)
  if (!startViewTransition || prefersReducedMotion()) {
    update()
    return
  }

  document.documentElement.dataset.uiTransition = 'theme'
  try {
    const transition = startViewTransition(() => flushSync(update))
    void transition.ready.catch(() => undefined)
    void transition.finished.catch(() => undefined).finally(() => {
      delete document.documentElement.dataset.uiTransition
    })
  } catch {
    delete document.documentElement.dataset.uiTransition
    update()
  }
}

function readStoredTheme(): ThemeMode {
  try {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
    const normalizedTheme = storedTheme === 'warm' ? 'coffee' : storedTheme
    return THEME_MODES.find((mode) => mode === normalizedTheme) ?? 'light'
  } catch {
    return 'light'
  }
}

function readSystemTheme(): EffectiveTheme {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<ThemeMode>(readStoredTheme)
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(readSystemTheme)
  const effectiveTheme = theme === 'auto' ? systemTheme : theme

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = (event: MediaQueryListEvent | MediaQueryList) => {
      setSystemTheme(event.matches ? 'dark' : 'light')
    }

    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', updateSystemTheme)
      return () => query.removeEventListener('change', updateSystemTheme)
    }

    query.addListener(updateSystemTheme)
    return () => query.removeListener(updateSystemTheme)
  }, [])

  useEffect(() => {
    function syncThemeFromAnotherTab(event: StorageEvent) {
      if (event.key !== THEME_STORAGE_KEY || event.newValue === null) return
      const candidate = event.newValue === 'warm' ? 'coffee' : event.newValue
      if (THEME_MODES.includes(candidate as ThemeMode)) setThemeState(candidate as ThemeMode)
    }

    window.addEventListener('storage', syncThemeFromAnotherTab)
    return () => window.removeEventListener('storage', syncThemeFromAnotherTab)
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = effectiveTheme
    root.dataset.themeMode = theme
    root.classList.toggle('dark', effectiveTheme === 'dark' || effectiveTheme === 'midnight')
    root.style.colorScheme = effectiveTheme === 'dark' || effectiveTheme === 'midnight' ? 'dark' : 'light'
    const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (themeColor) {
      const background = getComputedStyle(root).getPropertyValue('--background').trim()
      themeColor.content = background || THEME_BACKGROUND_FALLBACKS[effectiveTheme]
    }
  }, [effectiveTheme, theme])

  const persistTheme = useCallback((mode: ThemeMode) => {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode)
    } catch {
      // The selected theme remains available for the current session.
    }
  }, [])

  const setTheme = useCallback((mode: ThemeMode) => {
    if (!THEME_MODES.includes(mode) || mode === theme) return
    runThemeTransition(() => setThemeState(mode))
    persistTheme(mode)
  }, [persistTheme, theme])

  const cycleTheme = useCallback(() => {
    const currentIndex = THEME_MODES.indexOf(theme)
    const nextTheme = THEME_MODES[(currentIndex + 1) % THEME_MODES.length]
    runThemeTransition(() => setThemeState(nextTheme))
    persistTheme(nextTheme)
  }, [persistTheme, theme])

  useEffect(() => {
    function handleThemeShortcut(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat || event.isComposing) return
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      if (event.key.toLowerCase() !== 't') return
      const target = event.target instanceof HTMLElement ? event.target : null
      const isFormTarget = Boolean(target?.closest('input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"]'))
      if (isFormTarget) return
      event.preventDefault()
      cycleTheme()
    }

    document.addEventListener('keydown', handleThemeShortcut)
    return () => document.removeEventListener('keydown', handleThemeShortcut)
  }, [cycleTheme])

  const value = useMemo(
    () => ({ theme, effectiveTheme, setTheme, cycleTheme }),
    [theme, effectiveTheme, setTheme, cycleTheme],
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext)
  if (!context) throw new Error('useTheme must be used inside ThemeProvider')
  return context
}
