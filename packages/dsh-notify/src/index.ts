// @dreamariner/dsh-notify :: Node 半边入口
//
// 做什么：DSH 的回合（turn）跑完时，发一条系统通知。
// 为什么：对话跑完人是看不见的，只能一直盯屏；关掉窗口后 DSH 仍在后台跑，
// 通知是唯一能把人叫回来的信号。
//
// 接线方式：订阅宿主的 session 事件流（session/event），按 turn/end 决策。
//   · turn/end 带 reason.kind：completed / error / max-tokens / blocked /
//     aborted / interrupted / forked，默认只报 completed 与 error；
//   · 子代理会话（session.header.origin === 'subagent'）默认不报，否则一轮里弹好几次；
//   · 决策逻辑全在 turn-watcher.ts（纯函数），本文件只做宿主接线。
//
// 通知往哪走：宿主判定之后把载荷推给客户端（桌面端 / 浏览器），由客户端用系统的
// Notification API 弹横幅。桌面端这样发出来的横幅归属是 DSH 本身，点一下会唤起
// DSH Desktop；载荷里带会话 id，客户端收到点击后切回那个会话。
// 没有客户端接入时通知直接丢弃（不做宿主侧兜底通道）。
//
// ⚠ inject 是白名单：只声明的 service 才会出现在 ctx 上。'sessions' 保证本插件
//   在会话存储就绪后才激活，不会漏掉启动初期的回合事件。

import type { Context } from '@deepseek-ai/cordis'
import { Config, KNOWN_KEYS, resolveConfig, type NotifyConfig } from './config.ts'
import { createLogger } from './logger.ts'
import { publishNotification } from './notify-bus.ts'
import type { NotifyPayload } from './contract.ts'
import { NotifyRemote } from './remote.ts'
import { setRuntime } from './runtime.ts'
import { decideNotification, type SessionFacts } from './turn-watcher.ts'

export const name = 'dsh-notify'
export const inject = ['sessions']
export { Config }
// ⚠ 必须再导出：typert 生成器从包的 export 图收集 Remote 符号，漏 export = 生成器看不见
export { NotifyRemote }

/** 宿主事件与会话对象的最小形状（只取本插件用到的字段，不依赖宿主类型包）。 */
interface EventLike {
  type?: string
  /** Unix epoch milliseconds. */
  time?: number
  data?: Record<string, unknown>
}

interface SessionLike {
  id?: string
  header?: {
    origin?: string
    delegationDepth?: number
  }
}

// 本插件只用到宿主事件流里的两个事件。宿主在它自己的类型包里做了 Events 增强，
// 本插件不引宿主类型包（避免把宿主拉进依赖表），故在此按同一形状本地声明。
declare module '@deepseek-ai/cordis' {
  interface Events {
    'session/event': (session: SessionLike, event: EventLike) => void
    'session/disposed': (session: SessionLike) => void
  }
}

interface SessionState {
  /** 本回合的开始时刻（epoch ms），用于算耗时。 */
  startedAt?: number
  /** 最后一条助手消息的纯文本，作为通知正文。 */
  lastText?: string
  /** 会话标题，拼进通知标题。 */
  title?: string
}

/** 取会话 id。取不到就不处理（宁可不通知，也别把通知发到错误的会话上）。 */
function sessionId(session: SessionLike | undefined): string {
  const id = session?.id
  return typeof id === 'string' ? id : ''
}

/** 子代理会话判定：宿主用 header.origin 标记（父会话与 fork 都不是子代理）。 */
function isSubagent(session: SessionLike | undefined): boolean {
  return session?.header?.origin === 'subagent'
}

/** 从助手消息里取纯文本（只取 text 块，思考块与工具调用不进通知正文）。 */
function textOfMessage(message: unknown): string | undefined {
  const content = (message as { content?: unknown } | undefined)?.content
  if (!Array.isArray(content)) return undefined
  const parts: string[] = []
  for (const block of content) {
    if (block === null || typeof block !== 'object') continue
    const typed = block as { type?: unknown; text?: unknown }
    if (typed.type === 'text' && typeof typed.text === 'string') parts.push(typed.text)
  }
  return parts.length > 0 ? parts.join('\n') : undefined
}

/** 取 turn/end 的 reason.kind。 */
function reasonKind(data: Record<string, unknown> | undefined): string {
  const reason = data?.reason as { kind?: unknown } | undefined
  return typeof reason?.kind === 'string' ? reason.kind : ''
}

export function apply(ctx: Context, rawConfig?: Partial<NotifyConfig> | null): void {
  // patch 里没有 config 时 YAML 会解析出 null，默认参数只对 undefined 生效，故显式兜底
  const config = resolveConfig(Config, rawConfig ?? {}, name)
  const { info: log, warn } = createLogger(name, ctx)

  setRuntime({ config, log: { info: log, warn } })

  if (!config.enabled) {
    log('通知已关闭（config.enabled = false），插件已装载但不发任何通知')
    return
  }

  // Typert Remote（客户端数据通道）：客户端靠它接通知载荷。
  ctx.plugin(NotifyRemote)

  const states = new Map<string, SessionState>()

  ctx.on('session/event', (session: SessionLike, event: EventLike) => {
    try {
      const id = sessionId(session)
      if (id === '') return
      const state = states.get(id) ?? {}

      switch (event?.type) {
        case 'turn/start':
          state.startedAt = typeof event.time === 'number' ? event.time : Date.now()
          break

        case 'assistant/message':
          state.lastText = textOfMessage(event.data?.message)
          break

        case 'session/title':
          state.title = typeof event.data?.title === 'string' ? event.data.title : undefined
          break

        case 'turn/end': {
          const kind = reasonKind(event.data)
          const endedAt = typeof event.time === 'number' ? event.time : Date.now()
          const durationMs = state.startedAt !== undefined ? Math.max(0, endedAt - state.startedAt) : 0
          const facts: SessionFacts = { isSubagent: isSubagent(session), title: state.title, id }
          const decision = decideNotification(config, facts, { kind, durationMs, lastText: state.lastText })
          if (!decision.notify) {
            log(`不通知（${decision.reason}）：kind=${kind} 用时=${durationMs}ms`)
            break
          }
          const payload: NotifyPayload = {
            title: decision.title ?? config.title,
            body: decision.body ?? '',
            kind,
            // 客户端点横幅时据此切回该会话
            sessionId: decision.sessionId ?? id,
          }
          if (publishNotification(payload)) {
            log(`已通知：kind=${kind} 用时=${durationMs}ms 会话=${id} 正文="${payload.body}"`)
          } else {
            log(`无人接收通知（没有客户端接入通知流），已丢弃：kind=${kind} 会话=${id} 正文="${payload.body}"`)
          }
          break
        }

        default:
          break
      }

      states.set(id, state)
    } catch (error: unknown) {
      warn('处理会话事件失败（忽略）：', error instanceof Error ? error.message : String(error))
    }
  })

  // 会话销毁时清掉状态，避免长时间运行后 Map 无限增长。
  ctx.on('session/disposed', (session: SessionLike) => {
    const id = sessionId(session)
    if (id !== '') states.delete(id)
  })

  if (config.notifyOnLoad) {
    publishNotification({
      title: config.title,
      body: '通知插件已装载，接下来每轮跑完都会提醒你',
      kind: 'load',
    })
  }

  log(`已装载：监听回合结束事件，通知原因码 ${config.notifyKinds.join(' / ')}`)
}

// KNOWN_KEYS 导出给测试用（未知配置键守卫）；resolveConfig 的校验语义见 config.ts
export { KNOWN_KEYS }
