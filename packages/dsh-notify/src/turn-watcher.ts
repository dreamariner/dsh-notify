// @dreamariner/dsh-notify 通知决策（纯逻辑，不碰宿主，可直接单测）
//
// 一条通知要同时过四道闸：总开关、结束原因、是否子代理、耗时下限。
// 任何一道不过都不发，并给出原因码，便于日志里排查「为什么这次没响」。

import type { NotifyConfig } from './config.ts'

/** 会话侧事实（由 index.ts 从宿主事件里取）。 */
export interface SessionFacts {
  /** 是否子代理会话（session.header.origin === 'subagent'）。 */
  isSubagent: boolean
  /** 会话标题，没有则 undefined。 */
  title?: string
  /** 会话 id，客户端点横幅时据此切回该会话。 */
  id?: string
}

/** 回合结束事实。 */
export interface TurnEndFacts {
  /** turn/end 的 reason.kind。 */
  kind: string
  /** 本回合耗时（毫秒）。 */
  durationMs: number
  /** 最后一条助手消息的纯文本，没有则 undefined。 */
  lastText?: string
}

/** 决策结果。reason 是稳定的原因码，日志与自检都按它断言。 */
export interface NotifyDecision {
  /** 是否发通知。 */
  notify: boolean
  /** 原因码：不通知时说明卡在哪一道闸。 */
  reason: 'notify' | 'disabled' | 'kind-not-watched' | 'subagent' | 'too-fast'
  /** 通知标题（notify 为 true 时有值）。 */
  title?: string
  /** 通知正文（notify 为 true 时有值）。 */
  body?: string
  /** 触发通知的会话 id（notify 为 true 且会话 id 已知时有值）。 */
  sessionId?: string
}

/** 结束原因对应的兜底正文（没有助手摘要时用）。 */
const FALLBACK_BODY: Record<string, string> = {
  completed: '回合已完成',
  error: '回合出错结束',
  'max-tokens': '回合达到输出上限',
  blocked: '回合被阻塞',
  aborted: '回合被中止',
  interrupted: '回合被中断',
  forked: '回合被派生',
}

/** 压平空白并按上限截断。 */
export function summarize(text: string | undefined, maxChars: number): string {
  if (text === undefined) return ''
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat.length <= maxChars) return flat
  return `${flat.slice(0, Math.max(0, maxChars - 1))}…`
}

/** 决定这一回合要不要发通知，以及通知长什么样。 */
export function decideNotification(
  config: NotifyConfig,
  session: SessionFacts,
  turn: TurnEndFacts,
): NotifyDecision {
  if (!config.enabled) return { notify: false, reason: 'disabled' }
  if (!config.notifyKinds.includes(turn.kind)) return { notify: false, reason: 'kind-not-watched' }
  if (session.isSubagent && !config.includeSubagents) return { notify: false, reason: 'subagent' }
  if (turn.durationMs < config.minDurationMs) return { notify: false, reason: 'too-fast' }

  const summary = config.showSummary ? summarize(turn.lastText, config.summaryMaxChars) : ''
  const body = summary !== '' ? summary : (FALLBACK_BODY[turn.kind] ?? `回合结束（${turn.kind}）`)
  const title = session.title !== undefined && session.title !== ''
    ? `${config.title} · ${session.title}`
    : config.title
  const sessionId = session.id !== undefined && session.id !== '' ? session.id : undefined
  return { notify: true, reason: 'notify', title, body, sessionId }
}
