import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Blob from './Blob'

describe('<Blob>', () => {
  it('renders a frozen frame without an animation loop', () => {
    const { container } = render(<Blob frozenAt={1.0} aria-label="Test blob" />)
    expect(screen.getByRole('img', { name: 'Test blob' })).toBeTruthy()
    // body painted with a real path
    const body = container.querySelector('.blob-body')
    expect(body?.getAttribute('d')).toMatch(/^M/)
    // eyes exist as mask holes
    const mask = container.querySelector('mask')
    expect(mask?.querySelectorAll('path').length).toBe(2)
  })

  it('accepts every state without crashing', () => {
    for (const state of ['idle', 'thinking', 'nudge', 'alert', 'sleep', 'joy'] as const) {
      const { container, unmount } = render(<Blob state={state} frozenAt={2.5} />)
      expect(container.querySelector('.blob-body')?.getAttribute('d')).not.toContain('NaN')
      unmount()
    }
  })
})
