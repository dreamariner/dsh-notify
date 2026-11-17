// @dreamariner/dsh-notify :: 浏览器半边入口
//
// 职责：接住宿主推来的通知载荷，用系统的 Notification API 弹横幅。
//
// 为什么在客户端发：桌面端（Electron）的渲染进程发出来的横幅，归属就是应用本身
// （显示「DeepSeek Harness」），点一下时 macOS 激活应用，桌面端的
// activate → focusPrimaryWindow 逻辑会把 DSH Desktop 的窗口拉到前台。
// 宿主自己用 osascript 发的话，归属是「脚本编辑器」，点它唤起的是脚本编辑器。
//
// 浏览器里发不出去时（通知权限没给 / 被拒），请宿主用 osascript 兜底补一条，
// 至少别让人漏掉「活干完了」。
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

export const inject = ['remote']

/** 一条通知载荷（与宿主侧 wire 契约同形）。 */
interface NotifyPayload {
  title: string
  body: string
  kind: string
}

/** 客户端侧用到的 Remote 命名空间形状。 */
interface NotifyNamespace {
  notifications: (signal?: AbortSignal) => AsyncIterable<NotifyPayload> & { dispose: () => void }
  fallback: (
    args: NotifyPayload,
    signal?: AbortSignal,
  ) => Promise<{ readonly ok: true; readonly value: { readonly posted: boolean } } | { readonly ok: false; readonly error: unknown }>
}

/** 客户端 ctx 的最小形状。 */
interface ClientContext {
  remote?: {
    $mount: (info: unknown) => Promise<() => void>
  }
  effect?: (fn: () => (() => void) | void, label: string) => void
  inject?: (keys: string[], callback: (scoped: unknown) => void) => void
}

/** Electron 渲染进程（应用自己的窗口）。 */
function inElectron(): boolean {
  return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent)
}

/**
 * 弹一条系统通知。
 * @returns 是否真的弹出去了（弹不出去要请宿主兜底）。
 */
function postNotification(payload: NotifyPayload): boolean {
  if (typeof Notification === 'undefined') return false
  try {
    if (Notification.permission === 'denied') return false
    // 普通浏览器里权限还是 default 时不弹：会弹权限询问框，打断正在做的事。
    if (Notification.permission === 'default' && !inElectron()) return false
    const notification = new Notification(payload.title, { body: payload.body })
    notification.onclick = () => {
      try { window.focus() } catch { /* 聚焦失败不影响已弹出的通知 */ }
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
          const posted = postNotification(payload)
          if (!posted) {
            // 客户端发不出去：请宿主用 osascript 兜底补一条。
            const result = await namespace.fallback(payload)
            if (!result.ok) console.error('[dsh-notify] 兜底通知调用失败', result.error)
          }
        }
      })().catch((error: unknown) => { console.error('[dsh-notify] 通知流中断', error) })
      return () => { handle.dispose() }
    }, 'dsh-notify: notification stream')
  })
}
