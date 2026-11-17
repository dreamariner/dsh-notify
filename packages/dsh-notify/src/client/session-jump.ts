// @dreamariner/dsh-notify :: 通知点击 → 切回对应会话（纯逻辑，便于单测）
//
// 为什么单独成文件：发通知这件事只有浏览器里有（Notification 的 onclick），
// 而「点了之后切到哪个会话、切不了算什么」是纯判断。拆出来就能在 node 环境
// 单测，不用起浏览器。

/** DSH 客户端里能切会话的服务面（客户端的 uiWorkspace.openSession）。 */
export interface UiWorkspaceLike {
  /** 选中该会话并在会话区显示它。 */
  openSession: (sessionId: string) => void
}

/** 点击横幅后的处理结果。 */
export type JumpOutcome =
  /** 已切回该会话。 */
  | 'opened'
  /** 载荷里没有会话 id（只唤起窗口，不切会话）。 */
  | 'no-session'
  /** 客户端没有 uiWorkspace 服务（只唤起窗口，不切会话）。 */
  | 'no-service'
  /** 切会话时抛错。 */
  | 'failed'

/** 点击横幅后的处理结果（带失败原因）。 */
export interface JumpResult {
  /** 结果码。 */
  readonly outcome: JumpOutcome
  /** 失败时的原始错误（outcome 为 failed 时有值）。 */
  readonly error?: unknown
}

/**
 * 点横幅后切回触发通知的会话。
 * @param sessionId - 载荷里的会话 id，没有就不切（只唤起窗口）。
 * @param uiWorkspace - 客户端的 uiWorkspace 服务，没有就不切。
 * @returns 处理结果。
 */
export function jumpToSession(
  sessionId: string | undefined,
  uiWorkspace: UiWorkspaceLike | undefined,
): JumpResult {
  if (sessionId === undefined || sessionId === '') return { outcome: 'no-session' }
  if (uiWorkspace === undefined) return { outcome: 'no-service' }
  try {
    uiWorkspace.openSession(sessionId)
    return { outcome: 'opened' }
  } catch (error: unknown) {
    return { outcome: 'failed', error }
  }
}
