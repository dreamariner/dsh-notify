// @dreamariner/dsh-notify 通知载荷与宿主兜底通道
//
// 通知载荷是宿主与客户端之间的契约：宿主判定「该通知了」，客户端负责弹横幅。
// 归属显示 DSH、点一下唤起 DSH Desktop，都靠客户端（Electron 渲染进程）发，
// 宿主这边只保留一条兜底通道（osascript），给没有客户端的环境用。

import { execFile } from 'node:child_process'
import type { NotifyPayload } from './contract.ts'

export type { NotifyPayload } from './contract.ts'

/**
 * 宿主兜底通道：客户端接不到时，宿主自己用 macOS 的 display notification 发。
 * 横幅归属会显示成「脚本编辑器 / Script Editor」（osascript 属于该应用）。
 */
export function appleScriptString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ')
}

/** macOS 兜底命令（argv 形态，不经 shell）。 */
export function buildDarwinCommand(payload: NotifyPayload, soundName = ''): string[] {
  const body = appleScriptString(payload.body)
  const title = appleScriptString(payload.title)
  let script = `display notification "${body}" with title "${title}"`
  const sound = soundName.trim()
  if (sound) script += ` sound name "${appleScriptString(sound)}"`
  return ['/usr/bin/osascript', '-e', script]
}

/** 用 osascript 发一条 macOS 通知（宿主兜底通道）。 */
export function sendDarwinNotification(payload: NotifyPayload, soundName = ''): Promise<void> {
  const [command, ...args] = buildDarwinCommand(payload, soundName)
  return new Promise((resolve, reject) => {
    execFile(command, args, { encoding: 'utf8', timeout: 10_000 }, (error) => {
      if (error !== null) {
        reject(Object.assign(new Error(error.message, { cause: error }), { code: error.code }))
        return
      }
      resolve()
    })
  })
}
