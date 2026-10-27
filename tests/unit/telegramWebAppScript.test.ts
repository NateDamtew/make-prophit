import { describe, expect, it, mock } from 'bun:test'

import TelegramWebAppScript from '@/components/TelegramWebAppScript'

function runLoader({
  hostname = 'beta.makeprophit.com',
  hash = '',
  search = '',
  storage = {} as Record<string, string>,
  webviewProxy = false,
}) {
  const element = TelegramWebAppScript() as { props: { dangerouslySetInnerHTML: { __html: string } } }
  const code = element.props.dangerouslySetInnerHTML.__html
  const write = mock()
  const fakeWindow = {
    location: { hostname, hash, search },
    sessionStorage: {
      getItem: (key: string) => storage[key] ?? null,
      setItem: (key: string, value: string) => {
        storage[key] = value
      },
    },
    ...(webviewProxy ? { TelegramWebviewProxy: {} } : {}),
  }
  // The loader only touches `window` and `document`, so run it against fakes.
  // oxlint-disable-next-line no-new-func
  new Function('window', 'document', code)(fakeWindow, { write })
  return { write, storage }
}

describe('telegram web app script loader', () => {
  it('does not load the Telegram script on the public site', () => {
    const { write } = runLoader({})
    expect(write).not.toHaveBeenCalled()
  })

  it('loads it on the TMA host', () => {
    const { write } = runLoader({ hostname: 'tma.makeprophit.com' })
    expect(write).toHaveBeenCalledWith('<script src="https://telegram.org/js/telegram-web-app.js"></script>')
  })

  it('loads it when Telegram launch parameters are present and remembers that for the tab', () => {
    const { write, storage } = runLoader({ hash: '#tgWebAppData=query_id%3D1&tgWebAppVersion=8.0' })
    expect(write).toHaveBeenCalledTimes(1)

    const reload = runLoader({ storage })
    expect(reload.write).toHaveBeenCalledTimes(1)
  })

  it("loads it inside Telegram's WebView", () => {
    const { write } = runLoader({ webviewProxy: true })
    expect(write).toHaveBeenCalledTimes(1)
  })
})
