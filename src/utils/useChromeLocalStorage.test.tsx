import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useChromeLocalStorage } from './useChromeLocalStorage'

function installChromeStorageStub(initial: Record<string, unknown> = {}) {
  const values = { ...initial }
  const storageArea = {
    get: vi.fn(async (key: string) => ({ [key]: values[key] })),
    set: vi.fn(async (payload: Record<string, unknown>) => {
      Object.assign(values, payload)
    }),
  }

  vi.stubGlobal('chrome', {
    storage: {
      local: storageArea,
    },
  })

  return storageArea
}

describe('useChromeLocalStorage', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('flushes the latest debounced value when the component unmounts', async () => {
    const storage = installChromeStorageStub({ setting: 'stored' })

    function Harness() {
      const [value, setValue, ready] = useChromeLocalStorage('setting', 'default', {
        debounceMs: 1000,
      })

      return (
        <button disabled={!ready} onClick={() => setValue('updated')} type="button">
          {value}
        </button>
      )
    }

    const view = render(<Harness />)

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('stored')
      expect(screen.getByRole('button')).not.toBeDisabled()
    })

    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('updated')

    view.unmount()

    await waitFor(() => {
      expect(storage.set).toHaveBeenLastCalledWith({ setting: 'updated' })
    })
  })

  it('does not write back the hydrated value when nothing changed', async () => {
    const storage = installChromeStorageStub({ setting: 'stored' })

    function Harness() {
      const [value, _setValue, ready] = useChromeLocalStorage('setting', 'default', {
        debounceMs: 10,
      })

      return <output aria-label="setting">{ready ? value : 'loading'}</output>
    }

    render(<Harness />)

    await waitFor(() => {
      expect(screen.getByLabelText('setting')).toHaveTextContent('stored')
    })
    await new Promise((resolve) => setTimeout(resolve, 30))

    expect(storage.set).not.toHaveBeenCalled()
  })

  it('does not let an older write clear a newer pending flush', async () => {
    const storage = installChromeStorageStub({ setting: 'stored' })
    let resolveFirstWrite: () => void = () => {
      throw new Error('First write was not started')
    }
    storage.set.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveFirstWrite = resolve
        }),
    )

    function Harness() {
      const [value, setValue, ready] = useChromeLocalStorage('setting', 'default', {
        debounceMs: 10,
      })

      return (
        <div>
          <output aria-label="setting">{ready ? value : 'loading'}</output>
          <button disabled={!ready} onClick={() => setValue('first')} type="button">
            first
          </button>
          <button disabled={!ready} onClick={() => setValue('second')} type="button">
            second
          </button>
        </div>
      )
    }

    const view = render(<Harness />)

    await waitFor(() => {
      expect(screen.getByLabelText('setting')).toHaveTextContent('stored')
    })

    await userEvent.click(screen.getByRole('button', { name: 'first' }))
    await waitFor(() => {
      expect(storage.set).toHaveBeenCalledWith({ setting: 'first' })
    })

    await userEvent.click(screen.getByRole('button', { name: 'second' }))
    resolveFirstWrite()
    await new Promise((resolve) => setTimeout(resolve, 0))

    view.unmount()

    expect(storage.set).toHaveBeenLastCalledWith({ setting: 'second' })
  })

  it('flushes a pending value for the previous key before hydrating a new key', async () => {
    const storage = installChromeStorageStub({
      first: 'stored first',
      second: 'stored second',
    })

    function Harness() {
      const [storageKey, setStorageKey] = React.useState('first')
      const [value, setValue, ready] = useChromeLocalStorage(storageKey, 'default', {
        debounceMs: 1000,
      })

      return (
        <div>
          <output aria-label="setting">{ready ? value : 'loading'}</output>
          <button disabled={!ready} onClick={() => setValue('edited first')} type="button">
            edit
          </button>
          <button onClick={() => setStorageKey('second')} type="button">
            switch
          </button>
        </div>
      )
    }

    render(<Harness />)

    await waitFor(() => {
      expect(screen.getByLabelText('setting')).toHaveTextContent('stored first')
    })

    await userEvent.click(screen.getByRole('button', { name: 'edit' }))
    expect(screen.getByLabelText('setting')).toHaveTextContent('edited first')

    await userEvent.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => {
      expect(screen.getByLabelText('setting')).toHaveTextContent('stored second')
    })

    await new Promise((resolve) => setTimeout(resolve, 1100))

    expect(storage.set).toHaveBeenCalledTimes(1)
    expect(storage.set).toHaveBeenCalledWith({ first: 'edited first' })
  })

  it('does not duplicate an in-flight debounced write on unmount', async () => {
    const storage = installChromeStorageStub({ setting: 'stored' })
    storage.set.mockImplementationOnce(() => new Promise<void>(() => {}))

    function Harness() {
      const [value, setValue, ready] = useChromeLocalStorage('setting', 'default', {
        debounceMs: 10,
      })

      return (
        <button disabled={!ready} onClick={() => setValue('updated')} type="button">
          {value}
        </button>
      )
    }

    const view = render(<Harness />)

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveTextContent('stored')
    })

    await userEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(storage.set).toHaveBeenCalledWith({ setting: 'updated' })
    })

    view.unmount()

    expect(storage.set).toHaveBeenCalledTimes(1)
  })

  it('ignores a stale failed read after switching keys', async () => {
    const storage = installChromeStorageStub()
    let rejectFirstRead: (error: Error) => void = () => {
      throw new Error('First read was not started')
    }
    storage.get.mockImplementation((key: string) => {
      if (key === 'first') {
        return new Promise((_, reject) => {
          rejectFirstRead = reject
        })
      }
      return Promise.resolve({ second: 'stored second' })
    })

    function Harness() {
      const [storageKey, setStorageKey] = React.useState('first')
      const [value, _setValue, ready] = useChromeLocalStorage(storageKey, 'default')

      return (
        <div>
          <output aria-label="setting">{ready ? value : 'loading'}</output>
          <button onClick={() => setStorageKey('second')} type="button">
            switch
          </button>
        </div>
      )
    }

    render(<Harness />)

    expect(screen.getByLabelText('setting')).toHaveTextContent('loading')

    await userEvent.click(screen.getByRole('button', { name: 'switch' }))

    await waitFor(() => {
      expect(screen.getByLabelText('setting')).toHaveTextContent('stored second')
    })

    rejectFirstRead(new Error('stale read failed'))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(screen.getByLabelText('setting')).toHaveTextContent('stored second')
  })

  it('does not let late hydration overwrite a pre-hydration user change', async () => {
    const storage = installChromeStorageStub()
    let resolveRead: (value: Record<string, unknown>) => void = () => {
      throw new Error('Read was not started')
    }
    storage.get.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve
        }),
    )

    function Harness() {
      const [value, setValue, ready] = useChromeLocalStorage('setting', 'default', {
        debounceMs: 10,
      })

      return (
        <button
          aria-label={ready ? 'ready' : 'loading'}
          onClick={() => setValue('edited')}
          type="button"
        >
          {value}
        </button>
      )
    }

    render(<Harness />)

    expect(screen.getByRole('button')).toHaveTextContent('default')

    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('edited')

    resolveRead({ setting: 'stored' })

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ready' })).toHaveTextContent('edited')
    })
    await waitFor(() => {
      expect(storage.set).toHaveBeenCalledWith({ setting: 'edited' })
    })
  })

  it('does not rehydrate just because default object identity changes', async () => {
    const storage = installChromeStorageStub({ setting: { value: 'stored' } })

    function Harness() {
      const [count, setCount] = React.useState(0)
      const [value, _setValue, ready] = useChromeLocalStorage('setting', { value: 'default' })

      return (
        <div>
          <output aria-label="setting">{ready ? value.value : 'loading'}</output>
          <output aria-label="count">{count}</output>
          <button onClick={() => setCount((current) => current + 1)} type="button">
            rerender
          </button>
        </div>
      )
    }

    render(<Harness />)

    await waitFor(() => {
      expect(screen.getByLabelText('setting')).toHaveTextContent('stored')
    })
    expect(storage.get).toHaveBeenCalledTimes(1)

    await userEvent.click(screen.getByRole('button', { name: 'rerender' }))
    expect(screen.getByLabelText('count')).toHaveTextContent('1')

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(storage.get).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('setting')).toHaveTextContent('stored')
  })
})
