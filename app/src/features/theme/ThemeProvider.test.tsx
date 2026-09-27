import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useTheme, ThemeProvider } from './ThemeProvider'

function ThemeProbe() {
  const { theme, effectiveTheme, setTheme, cycleTheme } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="effective">{effectiveTheme}</span>
      <button onClick={() => setTheme('auto')}>Auto</button>
      <button onClick={cycleTheme}>Next</button>
    </div>
  )
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.removeAttribute('data-theme-mode')
    document.documentElement.classList.remove('dark')
    const existingMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const themeColor = existingMeta ?? document.head.appendChild(document.createElement('meta'))
    themeColor.name = 'theme-color'
    themeColor.content = '#ffffff'
  })

  it('restores a stored theme and applies the dark class for dark palettes', () => {
    window.localStorage.setItem('nook:theme', 'midnight')
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    expect(screen.getByTestId('theme').textContent).toContain('midnight')
    expect(document.documentElement.dataset.theme).toBe('midnight')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content).toBe('#111827')
  })

  it('cycles through all named modes and persists the choice', async () => {
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    await act(async () => screen.getByRole('button', { name: 'Next' }).click())
    expect(screen.getByTestId('theme').textContent).toContain('coffee')
    expect(window.localStorage.getItem('nook:theme')).toBe('coffee')
  })

  it('keeps Auto selected while following the system palette', async () => {
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    await act(async () => screen.getByRole('button', { name: 'Auto' }).click())

    expect(screen.getByTestId('theme').textContent).toContain('auto')
    expect(screen.getByTestId('effective').textContent).toContain('light')
    expect(document.documentElement.dataset.themeMode).toBe('auto')
    expect(window.localStorage.getItem('nook:theme')).toBe('auto')
  })

  it('syncs only supported theme values from another same-origin tab', async () => {
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'nook:theme', newValue: 'forest' }))
    })
    expect(screen.getByTestId('theme').textContent).toContain('forest')
    expect(document.documentElement.dataset.theme).toBe('forest')

    await act(async () => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'nook:theme', newValue: 'unexpected' }))
    })
    expect(screen.getByTestId('theme').textContent).toContain('forest')
  })

  it('cycles with T globally but ignores form-entry focus and modifiers', () => {
    render(<ThemeProvider><ThemeProbe /><input aria-label="Title" /><select aria-label="Type"><option>General</option></select></ThemeProvider>)

    fireEvent.keyDown(document.body, { key: 't' })
    expect(screen.getByTestId('theme').textContent).toContain('coffee')

    const title = screen.getByRole('textbox', { name: 'Title' })
    title.focus()
    fireEvent.keyDown(title, { key: 't' })
    expect(screen.getByTestId('theme').textContent).toContain('coffee')

    const type = screen.getByRole('combobox', { name: 'Type' })
    type.focus()
    fireEvent.keyDown(type, { key: 't' })
    expect(screen.getByTestId('theme').textContent).toContain('coffee')

    fireEvent.keyDown(document.body, { key: 't', ctrlKey: true })
    expect(screen.getByTestId('theme').textContent).toContain('coffee')
  })
})
