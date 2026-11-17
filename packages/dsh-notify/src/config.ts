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
  /** 回合最短耗时（毫秒）。低于阈值不通知：秒回的活不值得把人叫起来。 */
  minDurationMs: number
  /** 通知标题。会话标题存在时拼在后面（标题 · 会话名）。 */
  title: string
  /** 正文是否带最后一条助手消息摘要。 */
  showSummary: boolean
  /** 摘要最大字数，超出截断。 */
  summaryMaxChars: number
  /**
   * 宿主兜底通道：客户端（桌面端 / 浏览器）接不到通知时，宿主自己发。
   *   · osascript：macOS 的 display notification（横幅归属显示「脚本编辑器」）；
   *   · none：不兜底（没有客户端就彻底不发）。
   */
  fallback: 'osascript' | 'none'
  /** 兜底延迟（毫秒）：客户端在这段时间内接走通知就不兜底。 */
  fallbackDelayMs: number
  /** macOS 通知声音名（/System/Library/Sounds 下的文件名，不含扩展名）。空则用系统默认。 */
  soundName: string
  /**
   * 通知归属的应用名。
   * 当前实现里没有通道消费它（macOS 兜底用 osascript，归属是「脚本编辑器」；
   * 客户端那条路的归属由系统按应用 bundle 决定），留着是为了将来加 Linux
   * notify-send 之类按应用名归属的通道时不必改配置面。
   */
  appName: string
  /** 插件装载时先弹一条自检通知，确认通知通道通不通。默认关。 */
  notifyOnLoad: boolean
}

export const Config: z<NotifyConfig> = z.object({
  enabled: z.boolean().default(true),
  notifyKinds: z.array(z.string()).default(['completed', 'error']),
  includeSubagents: z.boolean().default(false),
  minDurationMs: z.number().default(0),
  title: z.string().default('DSH'),
  showSummary: z.boolean().default(true),
  summaryMaxChars: z.number().default(120),
  fallback: z.union(['osascript', 'none']).default('osascript'),
  fallbackDelayMs: z.number().default(8000),
  soundName: z.string().default(''),
  appName: z.string().default('DeepSeek Harness'),
  notifyOnLoad: z.boolean().default(false),
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
  'fallback',
  'fallbackDelayMs',
  'soundName',
  'appName',
  'notifyOnLoad',
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
