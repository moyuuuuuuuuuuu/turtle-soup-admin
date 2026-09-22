import { fetchEventSource, type EventSourceMessage } from '@microsoft/fetch-event-source'

interface TerminalStreamOptions {
  baseUrl: string
  token: string
  command: string
  uuid: string
  extend: string
  signal: AbortSignal
  onmessage: (message: EventSourceMessage) => void
  fetch?: typeof fetch
  credentials?: RequestCredentials
}

export function streamTerminal(options: TerminalStreamOptions): Promise<void> {
  return fetchEventSource(`${options.baseUrl.replace(/\/$/, '')}/app/saipackage/index/terminal`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      command: options.command,
      uuid: options.uuid,
      extend: options.extend
    }),
    credentials: options.credentials ?? 'same-origin',
    signal: options.signal,
    fetch: options.fetch,
    openWhenHidden: true,
    async onopen(response) {
      if (!response.ok || !response.headers.get('content-type')?.includes('text/event-stream')) {
        throw new Error('Terminal stream request failed')
      }
    },
    onmessage: options.onmessage,
    onerror() {
      // Never retry a command automatically after an interrupted connection.
      throw new Error('Terminal stream interrupted')
    }
  })
}
