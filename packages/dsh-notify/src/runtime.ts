// @dreamariner/dsh-notify 宿主运行时（宿主半边与 Remote 契约之间的共享状态）
//
// 宿主插件的 apply() 负责装载：解析配置、建日志器。Remote 契约（src/remote.ts）
// 也要用到同一份日志器，两者同进程同包，用一个模块级运行时对象交接。热重载会重建
// 模块，apply() 会重新写入，状态不会跨版本残留。

import type { NotifyConfig } from './config.ts'
import type { Logger } from './logger.ts'

export interface NotifyRuntime {
  /** 已解析的配置。 */
  config: NotifyConfig
  /** 双写日志器。 */
  log: Logger
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
