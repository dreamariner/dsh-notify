// @dreamariner/dsh-notify 通知总线（宿主半边）
//
// 宿主判定「该通知了」之后，通知载荷走两条路：
//   ① 推给客户端（桌面端 / 浏览器）：客户端用系统的 Notification API 弹横幅，
//      归属是 DSH 本身，点一下由操作系统激活应用、桌面端把窗口拉到前台；
//   ② 没人接（没有客户端、headless、浏览器没给通知权限）时，宿主在
//      fallbackDelayMs 之后用 osascript 自己发一条（归属是「脚本编辑器」）。
//
// 两条路互斥：客户端在延迟窗口内接走就不再兜底。

import type { NotifyPayload } from './contract.ts'

/** 一个客户端订阅者：宿主往里推载荷，客户端按序取走。 */
export interface Subscriber {
  push: (payload: NotifyPayload) => void
  close: () => void
}

interface Pending {
  payload: NotifyPayload
  handled: boolean
  timer?: ReturnType<typeof setTimeout>
}

const subscribers = new Set<Subscriber>()
const pending = new Map<number, Pending>()
let nextId = 1

/**
 * 发布一条通知。
 * @param payload - 通知载荷。
 * @param fallback - 没人接时宿主自己的兜底发送函数。
 * @param delayMs - 兜底延迟（毫秒）。
 */
export function publishNotification(
  payload: NotifyPayload,
  fallback: (payload: NotifyPayload) => void,
  delayMs: number,
): void {
  const id = nextId++
  const entry: Pending = { payload, handled: false }
  pending.set(id, entry)

  const take = (): boolean => {
    if (entry.handled) return false
    entry.handled = true
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer)
      entry.timer = undefined
    }
    pending.delete(id)
    return true
  }

  if (subscribers.size > 0) {
    for (const subscriber of subscribers) subscriber.push(payload)
    take()
    return
  }

  // 当前没有客户端：先挂着，等一个客户端连上来；到点仍没人要就兜底。
  entry.timer = setTimeout(() => {
    if (!take()) return
    fallback(payload)
  }, delayMs)
}

/** 订阅通知流（Remote 的流方法用）。 */
export function subscribeNotifications(): Subscriber & AsyncIterable<NotifyPayload> {
  const queue: NotifyPayload[] = []
  const waiting: Array<(result: IteratorResult<NotifyPayload>) => void> = []
  let closed = false

  const subscriber: Subscriber & AsyncIterable<NotifyPayload> = {
    push(payload: NotifyPayload): void {
      if (closed) return
      const resolve = waiting.shift()
      if (resolve !== undefined) {
        resolve({ value: payload, done: false })
        return
      }
      queue.push(payload)
    },
    close(): void {
      if (closed) return
      closed = true
      subscribers.delete(subscriber)
      while (waiting.length > 0) {
        const resolve = waiting.shift()
        resolve?.({ value: undefined, done: true })
      }
    },
    async *[Symbol.asyncIterator](): AsyncIterator<NotifyPayload> {
      try {
        while (true) {
          const item = queue.shift()
          if (item !== undefined) {
            yield item
            continue
          }
          if (closed) return
          const next = await new Promise<IteratorResult<NotifyPayload>>((resolve) => { waiting.push(resolve) })
          if (next.done === true) return
          yield next.value
        }
      } finally {
        subscriber.close()
      }
    },
  }

  subscribers.add(subscriber)
  // 订阅时把还挂着的（等客户端的）通知交给它，并取消兜底。
  for (const [id, entry] of [...pending.entries()]) {
    if (entry.handled) continue
    entry.handled = true
    if (entry.timer !== undefined) {
      clearTimeout(entry.timer)
      entry.timer = undefined
    }
    pending.delete(id)
    subscriber.push(entry.payload)
  }
  return subscriber
}

/** 当前有多少客户端订阅着（诊断用）。 */
export function subscriberCount(): number {
  return subscribers.size
}
