import { describe, expect, it } from 'vitest'
import { interpolateScrollMap } from './split-scroll'

describe('split-pane scroll mapping', () => {
  it('interpolates between Markdown block anchors instead of using proportional heights', () => {
    const sourceToPreview = [
      { from: 0, to: 0 },
      { from: 100, to: 520 },
      { from: 400, to: 760 },
      { from: 800, to: 1200 },
    ]

    expect(interpolateScrollMap(sourceToPreview, 250)).toBe(640)
    expect(interpolateScrollMap(sourceToPreview, 600)).toBe(980)
    expect(interpolateScrollMap(sourceToPreview, 50)).not.toBe(50 / 800 * 1200)
  })

  it('maps in-bounds values to the first and last rendered anchors', () => {
    const points = [{ from: 12, to: 24 }, { from: 112, to: 324 }]
    expect(interpolateScrollMap(points, 0)).toBe(24)
    expect(interpolateScrollMap(points, 200)).toBe(324)
  })
})
