import { Observable, Subscription, BehaviorSubject } from 'rxjs'

export interface Connection {
  connectionStatus: Observable<number>
  messages: Observable<string>
}

interface EventWithReason {
  reason: string
}

interface EventWithData {
  // TODO: should be
  // data: string | ArrayBuffer | Blob;
  data: string
}

interface EventWithMessage {
  message?: string
}

export interface IWebSocket {
  close(): any
  send(data: string | ArrayBuffer | Blob): any

  // TypeScript doesn't seem to apply function bivariance on each property when
  // comparing an object to an interface so the argument types have to be `any` :(
  // Ideally would be able to use the EventWith... interfaces
  onopen: ((event: any) => any) | null
  onclose: ((event: any) => any) | null
  onmessage: ((event: any) => any) | null
  onerror: ((event: any) => any) | null
}

export type WebSocketFactory = (url: string, protocols?: string | string[]) => IWebSocket

const defaultProtocols = [];

const defaultWebsocketFactory: WebSocketFactory = (url: string, protocols: string | string[] = defaultProtocols): IWebSocket => new WebSocket(url, protocols)

export default function connect(
  url: string,
  input: Observable<string>,
  protocols: string | string[] = defaultProtocols,
  websocketFactory: WebSocketFactory = defaultWebsocketFactory,
): Connection {
  const connectionStatus = new BehaviorSubject<number>(0)

  const messages = new Observable<string>(observer => {
    const socket = websocketFactory(url, protocols)
    let inputSubscription: Subscription

    let open = false
    let forcedClose = false

    const closed = () => {
      if (! open)
        return

      connectionStatus.next(connectionStatus.getValue() - 1)
      open = false
    }

    socket.onopen = () => {
      open = true
      connectionStatus.next(connectionStatus.getValue() + 1)
      inputSubscription = input.subscribe(data => {
        socket.send(data)
      })
    }

    socket.onmessage = (message: EventWithData) => {
      observer.next(message.data)
    }

    socket.onerror = (error: EventWithMessage) => {
      closed()
      observer.error(new Error(error.message))
    }

    socket.onclose = (event: EventWithReason) => {
      // prevent observer.complete() being called after observer.error(...)
      if (! open)
        return

      closed()
      if (forcedClose)
        observer.complete()
      else
        observer.error(new Error(event.reason))
    }

    return () => {
      forcedClose = true
      if (inputSubscription)
        inputSubscription.unsubscribe()

      if (open) {
        closed()
        socket.close()
      }
    }
  })

  return { messages, connectionStatus }
}
