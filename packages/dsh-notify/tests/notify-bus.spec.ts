// @dreamariner/dsh-notify :: 通知总线单测
//
// 守两条互斥路径：
//   ① 有客户端订阅时，载荷推给客户端，宿主不兜底；
//   ② 没人订阅时，延迟到期后宿主兜底发一条；
//   ③ 客户端在延迟窗口内连上来，挂着的载荷交给它，兜底取消。
import { describe, expect, it } from 'vitest'
import { publishNotification, subscribeNotifications } from '../src/notify-bus.ts'
import type { NotifyPayload } from '../src/contract.ts'

const payload: NotifyPayload = { title: 'DSH', body: '跑完了', kind: 'completed' }

/** 订阅并把收到的载荷收进数组。 */
async function collect(count: number): Promise<{ items: NotifyPayload[]; dispose: () => void }> {
  const subscriber = subscribeNotifications()
  const items: NotifyPayload[] = []
  const reader = (async () => {
    for await (const item of subscriber) {
      items.push(item)
      if (items.length >= count) break
    }
  })()
  void reader
  return { items, dispose: () => { subscriber.close() } }
}

describe('通知总线', () => {
  it('有客户端订阅时载荷推给客户端，不触发兜底', async () => {
    let fallbackCalls = 0
    const { items, dispose } = await collect(1)
    publishNotification(payload, () => { fallbackCalls += 1 }, 50)
    await new Promise((resolve) => { setTimeout(resolve, 120) })
    expect(items).toEqual([payload])
    expect(fallbackCalls).toBe(0)
    dispose()
  })

  it('没人订阅时延迟到期后兜底发一条', async () => {
    let fallbackCalls = 0
    publishNotification(payload, () => { fallbackCalls += 1 }, 30)
    await new Promise((resolve) => { setTimeout(resolve, 120) })
    expect(fallbackCalls).toBe(1)
  })

  it('客户端在延迟窗口内连上来时接走载荷，兜底取消', async () => {
    let fallbackCalls = 0
    publishNotification(payload, () => { fallbackCalls += 1 }, 200)
    const { items, dispose } = await collect(1)
    await new Promise((resolve) => { setTimeout(resolve, 260) })
    expect(items).toEqual([payload])
    expect(fallbackCalls).toBe(0)
    dispose()
  })
})
