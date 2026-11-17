// @dreamariner/dsh-notify 配置
// 校验语义：默认值填充 + 带路径的类型报错。schemastery 与宿主共享同一实例
// （peerDependencies 声明 + dev 精确钉版本），不要改成普通 dependency。

import z from '@deepseek-ai/schemastery'

export interface NotifyConfig {
  /** 总开关。关掉后插件仍装载，但一条通知也不发。 */
  enabled: boolean
  /**
   * 哪些 turn/end 的 reason.kind 要通知。
   * 宿主可选值：completed / error / max-tokens / blocked / aborted /
   * interrupted / forked。默认只报 completed 与 error：aborted 是人自己按停的，
   * 报了反而吵。
   */
  notifyKinds: string[]
  /** 子代理会话（session.header.origin === 'subagent'）是否也通知。默认不通知，避免一轮里弹好几次。 */
  includeSubagents: boolean
  /** 回合最短耗时（毫秒）。低于阈值不通知：秒回的活不值得把人叫起来。下限 0。 */
  minDurationMs: number
  /** 通知标题。会话标题存在时拼在后面（标题 · 会话名）。 */
  title: string
  /** 正文是否带最后一条助手消息摘要。 */
  showSummary: boolean
  /** 摘要最大字数，超出截断。下限 1：0 会产出只剩省略号的正文。 */
  summaryMaxChars: number
}

export const Config: z<NotifyConfig> = z.object({
  enabled: z.boolean().default(true),
  notifyKinds: z.array(z.string()).default(['completed', 'error']),
  includeSubagents: z.boolean().default(false),
  minDurationMs: z.number().min(0).default(0),
  title: z.string().default('DSH'),
  showSummary: z.boolean().default(true),
  summaryMaxChars: z.number().min(1).default(120),
})

/** 已知键（schemastery 的 Schema 类型不暴露 properties，故显式列出）。 */
export const KNOWN_KEYS = [
  'enabled',
  'notifyKinds',
  'includeSubagents',
  'minDurationMs',
  'title',
  'showSummary',
  'summaryMaxChars',
] as const

/** schemastery 标准校验的同步封装：默认值填充 + 带路径报错；不支持异步校验。 */
export function resolveConfig<T>(schema: z<T>, raw: unknown, plugin: string): T {
  const result = (schema as unknown as { '~standard': { validate: (v: unknown) => unknown } })['~standard'].validate(raw) as
    | { issues?: Array<{ path?: string[]; message: string }>; value?: T }
    | undefined
  if (result === undefined || result === null) throw new Error(`[${plugin}] 配置校验无返回`)
  if (typeof (result as { then?: unknown }).then === 'function') {
    throw new TypeError(`[${plugin}] 不支持异步配置校验`)
  }
  if (result.issues !== undefined && result.issues.length > 0) {
    const detail = result.issues.map((i) => `${(i.path ?? []).join('.') || '(root)'}: ${i.message}`).join('；')
    throw new Error(`[${plugin}] 配置校验失败：${detail}`)
  }
  return result.value as T
}
