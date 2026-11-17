// @dreamariner/dsh-notify :: 通知总线单测
//
// 守一条路：宿主判定的通知推给客户端；没有客户端接入时直接丢弃（不做兜底通道）。
import { describe, expect, it } from 'vitest'
import { publishNotification, subscribeNotifications, subscriberCount } from '../src/notify-bus.ts'
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
  it('有客户端订阅时载荷推给客户端', async () => {
    const { items, dispose } = await collect(1)
    expect(publishNotification(payload)).toBe(true)
    await new Promise((resolve) => { setTimeout(resolve, 50) })
    expect(items).toEqual([payload])
    dispose()
  })

  it('没人订阅时通知被丢弃（不做兜底通道），发布返回 false', () => {
    expect(subscriberCount()).toBe(0)
    expect(publishNotification(payload)).toBe(false)
  })

  it('订阅者关闭后不再接通知', async () => {
    const { items, dispose } = await collect(1)
    dispose()
    expect(subscriberCount()).toBe(0)
    expect(publishNotification(payload)).toBe(false)
    expect(items).toEqual([])
  })
})
