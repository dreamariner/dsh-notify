// @dreamariner/dsh-notify 宿主运行时（宿主半边与 Remote 契约之间的共享状态）
//
// 宿主插件的 apply() 负责装载：解析配置、建日志器、决定兜底通道。Remote 契约
// （src/remote.ts）也要用到同一份配置与兜底函数，两者同进程同包，用一个模块级
// 运行时对象交接。热重载会重建模块，apply() 会重新写入，状态不会跨版本残留。

import type { NotifyConfig } from './config.ts'
import type { Logger } from './logger.ts'
import type { NotifyPayload } from './contract.ts'

export interface NotifyRuntime {
  /** 已解析的配置。 */
  config: NotifyConfig
  /** 双写日志器。 */
  log: Logger
  /** 兜底通道：客户端接不到通知时，宿主自己发。 */
  fallback: (payload: NotifyPayload) => Promise<void>
}

let runtime: NotifyRuntime | undefined

/** 写入当前运行时（apply 时调用）。 */
export function setRuntime(next: NotifyRuntime): void {
  runtime = next
}

/** 取当前运行时；未装载时返回 undefined（Remote 被调用说明宿主已装载）。 */
export function getRuntime(): NotifyRuntime | undefined {
  return runtime
}
