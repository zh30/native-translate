import { fireEvent, render, screen } from '@testing-library/react'
import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SegmentedControl } from '@/components/ui/segmented-control'

describe('SegmentedControl', () => {
  it('renders a fieldset group and notifies onChange', () => {
    const onChange = vi.fn()
    render(
      <SegmentedControl
        ariaLabel="summary format"
        value="tldr"
        onChange={onChange}
        options={[
          { value: 'tldr', label: 'TLDR' },
          { value: 'key-points', label: 'Points' },
        ]}
      />,
    )
    const group = screen.getByRole('group', { name: 'summary format' })
    expect(group.tagName).toBe('FIELDSET')
    fireEvent.click(screen.getByRole('button', { name: 'Points' }))
    expect(onChange).toHaveBeenCalledWith('key-points')
  })
})
