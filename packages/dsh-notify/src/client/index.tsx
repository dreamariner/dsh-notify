// @dreamariner/dsh-notify :: 浏览器半边入口
//
// 职责：接住宿主推来的通知载荷，用系统的 Notification API 弹横幅；点了横幅就切回
// 触发这条通知的会话。
//
// 为什么在客户端发：桌面端（Electron）的渲染进程发出来的横幅，归属就是应用本身
// （显示「DeepSeek Harness」），点一下时 macOS 激活应用，桌面端的
// activate → focusPrimaryWindow 逻辑会把 DSH Desktop 的窗口拉到前台。
// 宿主自己用 osascript 发的话，归属是「脚本编辑器」，点它唤起的是脚本编辑器。
//
// 切会话：载荷里带会话 id，点击时用客户端的 uiWorkspace.openSession 切过去
// （uiWorkspace 是可选服务：取不到就只唤起窗口，不切会话）。
//
// 浏览器里发不出去时（通知权限没给 / 被拒）就没有提醒了：本插件只有这一条路，
// 不做宿主侧兜底通道。
//
// 官方形态（DSH skill cordis-plugin-development 的 templates/decoration/client.js）：
//   · 产物 lib/client.js 被 tsdown.config.ts 包上 window.__ModuleLoader__.load({...})
//     的 CJS 包装；factory 返回 { inject, apply } : 与 host 插件同构的 cordis 接口；
//   · react 来自宿主渲染进程模块表（构建时 EXTERNALS 外置），不打包、不 CDN、不自装。
//
// Remote 走 typert 生成的 $mount（lib/typert.remote-client.js），不能从 src/remote.ts
// 值导入：那会把 typert-protocol 的值依赖拖进浏览器 bundle → web boot: 1 entry did
// not activate。

import { TYPERT_REMOTE } from '@dreamariner/dsh-notify/remote'
import { jumpToSession, type UiWorkspaceLike } from './session-jump.ts'

export const inject = ['remote']

/** 一条通知载荷（与宿主侧 wire 契约同形）。 */
interface NotifyPayload {
  title: string
  body: string
  kind: string
  /** 触发通知的会话 id，点击横幅时据此切回该会话。 */
  sessionId?: string
}

/** 客户端侧用到的 Remote 命名空间形状。 */
interface NotifyNamespace {
  notifications: (signal?: AbortSignal) => AsyncIterable<NotifyPayload> & { dispose: () => void }
}

/** 客户端 ctx 的最小形状。 */
interface ClientContext {
  remote?: {
    $mount: (info: unknown) => Promise<() => void>
  }
  effect?: (fn: () => (() => void) | void, label: string) => void
  inject?: (keys: string[], callback: (scoped: unknown) => void) => void
  /** 可选服务查找（uiWorkspace 是可选服务，取不到就只唤起窗口）。 */
  get?: (name: string) => unknown
}

/** Electron 渲染进程（应用自己的窗口）。 */
function inElectron(): boolean {
  return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
}

/**
 * 弹一条系统通知。
 * @param payload - 通知载荷。
 * @param onClick - 点横幅后的动作（切回触发通知的会话）。
 * @returns 是否真的弹出去了（弹不出去要请宿主兜底）。
 */
function postNotification(payload: NotifyPayload, onClick: (sessionId: string) => void): boolean {
  if (typeof Notification === 'undefined') return false
  try {
    if (Notification.permission === 'denied') return false
    // 普通浏览器里权限还是 default 时不弹：会弹权限询问框，打断正在做的事。
    if (Notification.permission === 'default' && !inElectron()) return false
    const notification = new Notification(payload.title, { body: payload.body })
    notification.onclick = () => {
      // 点横幅：先把窗口拉到前台（macOS 激活应用后由桌面端 focusPrimaryWindow 兜底），
      // 再切回这条通知对应的会话。
      try { window.focus() } catch { /* 聚焦失败不影响已弹出的通知 */ }
      if (payload.sessionId !== undefined) {
        console.info(`[dsh-notify] 点横幅 → 切回会话：${payload.sessionId}`)
        onClick(payload.sessionId)
      } else {
        console.info('[dsh-notify] 点横幅（载荷里没有会话 id，只唤起窗口）')
      }
    }
    return true
  } catch {
    return false
  }
}

export function apply(rawCtx: unknown): void {
  const ctx = rawCtx as ClientContext
  const remote = ctx.remote
  if (remote === undefined || typeof remote.$mount !== 'function') {
    throw new Error('[dsh-notify] ctx.remote 不可用:inject 白名单声明与宿主实际提供的服务不一致')
  }

  // $mount 与 inject 的顺序：mount 先行（不阻塞），scoped 注入在命名空间就绪后回调。
  const mounted = remote.$mount(TYPERT_REMOTE)
    .then((dispose) => { ctx.effect?.(() => dispose, 'dsh-notify: unmount remote'); return dispose })
    .catch((error: unknown) => { console.error('[dsh-notify] $mount 失败', error) })

  // 点横幅后切回触发通知的会话：uiWorkspace 是可选服务，取不到就只唤起窗口。
  const openSession = (sessionId: string): void => {
    const uiWorkspace = ctx.get?.('uiWorkspace') as UiWorkspaceLike | undefined
    const result = jumpToSession(sessionId, uiWorkspace)
    if (result.outcome === 'opened') return
    if (result.outcome === 'no-service') {
      console.warn('[dsh-notify] 客户端没有 uiWorkspace 服务，点横幅只能唤起窗口，切不回会话')
      return
    }
    if (result.outcome === 'failed') {
      console.error('[dsh-notify] 切回会话失败', result.error)
    }
  }

  // 自报切会话能力：出问题时看这一行就知道是「点不到服务」还是「服务报错」。
  console.info(`[dsh-notify] 客户端就绪：uiWorkspace=${
    ctx.get?.('uiWorkspace') === undefined ? '不可用（点横幅只唤起窗口）' : '可用（点横幅切回会话）'
  }`)

  ctx.inject?.(['remote.notify'], (scoped: unknown) => {
    void mounted
    const namespace = (scoped as { remote?: { notify?: NotifyNamespace } }).remote?.notify
    if (namespace === undefined) {
      console.error('[dsh-notify] remote.notify 命名空间不可用，通知不会弹出')
      return
    }

    ctx.effect?.(() => {
      const handle = namespace.notifications()
      void (async () => {
        for await (const payload of handle) {
          const posted = postNotification(payload, openSession)
          if (!posted) {
            // 没有第二路可走：通知权限没给或被拒时，这次就没有提醒。
            console.warn('[dsh-notify] 系统通知发不出去（通知权限未给或被拒），本次不提醒')
          } else {
            console.info(`[dsh-notify] 已弹系统通知：${payload.title} · 会话=${payload.sessionId ?? '无'}`)
          }
        }
      })().catch((error: unknown) => { console.error('[dsh-notify] 通知流中断', error) })
      return () => { handle.dispose() }
    }, 'dsh-notify: notification stream')
  })
}
