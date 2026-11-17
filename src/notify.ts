// @dreamariner/dsh-notify 通知发送
//
// 只用 node: 内建（child_process.execFile 的 argv 形态，不经 shell）：
//   · 不引宿主包 → 插件不依赖运行期 node_modules 布局，profile 里 link: 装法不会解析不到；
//   · argv 形态 → 通知正文里的引号、换行、分号都只是参数，不会变成命令注入。
//
// 平台通道：
//   · macOS：/usr/bin/osascript -e 'display notification "…" with title "…"'。
//     注意通知归属会显示成「脚本编辑器 / Script Editor」（osascript 属于该应用），
//     要换成自己的名字走 config.command 自定义通道。
//   · Linux：notify-send（需系统装了 libnotify-bin）。
//   · Windows：没有内置通道，走 config.command 自定义（不实现未经实测的 PowerShell toast）。

import { execFile } from 'node:child_process'

export interface NotifyPayload {
  /** 通知标题。 */
  title: string
  /** 通知正文。 */
  body: string
  /** macOS 声音名；空串表示用系统默认。 */
  soundName?: string
  /** 通知归属的应用名（Linux notify-send 的 --app-name）。 */
  appName?: string
}

/** 命令执行边界（测试可替换为假实现）。 */
export type CommandRunner = (
  command: string,
  args: readonly string[],
  signal: AbortSignal,
) => Promise<void>

/**
 * AppleScript 字符串字面量转义。
 * 反斜杠与双引号必须先转义，否则正文里的引号会提前闭合字面量；
 * 换行不能进字面量（AppleScript 字符串不跨行），折成空格。
 */
export function appleScriptString(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, ' ')
}

/** macOS 通道：osascript 的 display notification。 */
export function buildDarwinCommand(payload: NotifyPayload): string[] {
  const body = appleScriptString(payload.body)
  const title = appleScriptString(payload.title)
  let script = `display notification "${body}" with title "${title}"`
  const sound = payload.soundName?.trim()
  if (sound) script += ` sound name "${appleScriptString(sound)}"`
  return ['/usr/bin/osascript', '-e', script]
}

/** Linux 通道：notify-send。 */
export function buildLinuxCommand(payload: NotifyPayload): string[] {
  return [
    'notify-send',
    '--app-name',
    payload.appName ?? 'DeepSeek Harness',
    payload.title,
    payload.body,
  ]
}

/**
 * 自定义命令模板展开：{title} / {body} 就地替换；
 * 模板里一个占位符都没有时，标题与正文按顺序追加到末尾。
 */
export function fillCommand(template: readonly string[], payload: NotifyPayload): string[] {
  const hasPlaceholder = template.some((arg) => arg.includes('{title}') || arg.includes('{body}'))
  const filled = template.map((arg) =>
    arg.replaceAll('{title}', payload.title).replaceAll('{body}', payload.body),
  )
  return hasPlaceholder ? filled : [...filled, payload.title, payload.body]
}

/** 真实执行：execFile 的 argv 形态，退出码非 0 即失败。 */
export const runCommand: CommandRunner = (command, args, signal) =>
  new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      { encoding: 'utf8', signal, windowsHide: true },
      (error, stdout, stderr) => {
        if (error !== null) {
          reject(Object.assign(new Error(error.message, { cause: error }), {
            code: error.code,
            stdout,
            stderr,
          }))
          return
        }
        resolve()
      },
    )
  })

export interface NotifierOptions {
  /** 运行平台。 */
  platform: NodeJS.Platform
  /** 自定义命令模板；空则走平台内置通道。 */
  command: readonly string[]
  /** macOS 声音名。 */
  soundName: string
  /** 通知归属的应用名。 */
  appName: string
  /** 单条通知的超时（毫秒）。 */
  timeoutMs?: number
  /** 命令执行边界，测试可替换。 */
  runner?: CommandRunner
}

/** 构造发送器：返回的函数把一条 payload 交给本机通知通道。 */
export function createNotifier(options: NotifierOptions): (payload: NotifyPayload) => Promise<void> {
  const runner = options.runner ?? runCommand
  const timeoutMs = options.timeoutMs ?? 10_000
  return async (payload: NotifyPayload): Promise<void> => {
    const full: NotifyPayload = {
      ...payload,
      soundName: payload.soundName ?? options.soundName,
      appName: payload.appName ?? options.appName,
    }
    let argv: string[]
    if (options.command.length > 0) {
      argv = fillCommand(options.command, full)
    } else if (options.platform === 'darwin') {
      argv = buildDarwinCommand(full)
    } else if (options.platform === 'linux') {
      argv = buildLinuxCommand(full)
    } else {
      throw new Error(`当前平台（${options.platform}）没有内置通知通道，请在 config.command 里指定通知命令`)
    }
    const [command, ...args] = argv
    await runner(command, args, AbortSignal.timeout(timeoutMs))
  }
}
