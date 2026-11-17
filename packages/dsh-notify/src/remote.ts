// @dreamariner/dsh-notify :: Typert Remote 契约（codegen 的单一来源）
//
// 本文件用标准装饰器（TC39，TS 5.9 原生）声明 wire 契约；构建期 typertPlugin 会：
//   ① 把标准装饰器降级为可运行形态（rolldown/oxc 原生不降标准装饰器）；
//   ② 从装饰器方法生成 lib/typert.host.*（服务类型 + wire codec）与
//      lib/typert.remote-client.*（client 侧契约 + 类型化 RPC 客户端）。
//
// 契约约束（违反会在构建期或运行期踩坑）：
//   · 方法名 = wire 端点名；形参名必须与 wire 名逐字一致（统一 args，末位 signal）；
//   · super(ctx, '<key>') 的服务键必须是字符串字面量（标识符会报
//     "Gateway service key must be a string literal"），且与下方 Context 增强的
//     属性名一致；
//   · 本类必须在 src/index.ts 里 re-export：生成器从包的 export 图收集符号，
//     漏 export = 生成器看不见它。
//
// 面向客户端的两个端点：
//   · notifications（流）：宿主在回合结束时推载荷，客户端拿到就弹系统通知。
//     桌面端（Electron）发出来的横幅归属是 DSH 本身，点一下由操作系统激活应用，
//     桌面端的 activate → focusPrimaryWindow 逻辑把窗口拉到前台；
//   · fallback（一元）：客户端发不了系统通知时（浏览器没给通知权限等），
//     请宿主用自己的 osascript 通道补一条。

import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { NotifyFallbackArgs, NotifyFallbackResult, NotifyPayload } from './contract.ts'
import { subscribeNotifications } from './notify-bus.ts'
import { getRuntime } from './runtime.ts'

// 服务契约的 Context 增强：client 与宿主侧都能类型化地访问 ctx.remote.<key>。
declare module '@deepseek-ai/cordis' {
  interface Context {
    notify: NotifyRemote
  }
}

export class NotifyRemote extends TypertRemoteService {
  constructor(ctx: any) {
    // ⚠ 字符串字面量（见上）；与 Context 增强属性名一致
    super(ctx, 'notify')
  }

  /**
   * 通知流：宿主每判定一条该通知的回合，就推一条载荷下来。
   * @param signal - 结束流。
   * @returns 通知载荷，按发布顺序。
   */
  @Remote({ mode: 'stream' })
  async *notifications(signal: AbortSignal): AsyncIterable<NotifyPayload> {
    const subscriber = subscribeNotifications()
    const onAbort = (): void => { subscriber.close() }
    signal.addEventListener('abort', onAbort, { once: true })
    getRuntime()?.log.info('客户端已接入通知流（通知由客户端弹，归属是 DSH 本身）')
    try {
      for await (const payload of subscriber) {
        if (signal.aborted) return
        yield payload
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
      subscriber.close()
    }
  }

  /**
   * 客户端发不了系统通知时，请宿主用兜底通道补一条（macOS 的 osascript）。
   * @param payload - 要补发的通知载荷。
   * @param signal - 取消。
   * @returns 是否发出去了。
   */
  @Remote
  async fallback(
    args: NotifyFallbackArgs,
    signal: AbortSignal,
  ): Promise<NotifyFallbackResult> {
    signal.throwIfAborted()
    const runtime = getRuntime()
    if (runtime === undefined) return { posted: false }
    try {
      await runtime.fallback({ title: args.title, body: args.body, kind: args.kind })
      runtime.log.info(`客户端转交兜底通知：${args.title} · ${args.body}`)
      return { posted: true }
    } catch (error: unknown) {
      runtime.log.warn('兜底通知发送失败：', error instanceof Error ? error.message : String(error))
      return { posted: false }
    }
  }
}
