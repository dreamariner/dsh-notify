// @dreamariner/dsh-notify 日志
//
// 双写：console（进实例日志）+ 插件自己的文件。
// 桌面端宿主 logger 不可见（「宿主 logger 在桌面端不可见」是既有插件的实测结论），
// 所以本插件自带一份文件日志，回答「这次为什么没响」只能靠它。

import { appendFileSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

/** DSH_HOME（未设则 ~/.dsh）。 */
export const dshHome = (): string => process.env.DSH_HOME || join(homedir(), '.dsh')

/** 插件日志文件路径。 */
export const logFilePath = (): string => join(dshHome(), 'logs', 'dsh-notify.log')

export interface Logger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
}

/** 宿主 logger 的最小形状（取不到就只写文件，不报错）。 */
interface HostLogger {
  info?: (name: string, ...args: unknown[]) => void
  warn?: (name: string, ...args: unknown[]) => void
}

/** 把日志参数拼成一行文本。 */
function line(args: unknown[]): string {
  return args
    .map((arg) => (typeof arg === 'string' ? arg : (() => { try { return JSON.stringify(arg) } catch { return String(arg) } })()))
    .join(' ')
}

/** 建一个双写日志器。写文件失败不抛（日志不该把通知链路带崩）。 */
export function createLogger(plugin: string, ctx: { logger?: HostLogger } | undefined): Logger {
  const write = (level: 'info' | 'warn', args: unknown[]): void => {
    const text = line(args)
    try {
      const path = logFilePath()
      mkdirSync(dirname(path), { recursive: true })
      appendFileSync(path, `${new Date().toISOString()} [${level}] ${text}\n`)
    } catch { /* noop */ }
    try {
      if (level === 'warn') ctx?.logger?.warn?.(`[${plugin}]`, text)
      else ctx?.logger?.info?.(`[${plugin}]`, text)
    } catch { /* noop */ }
    if (level === 'warn') console.warn(`[${plugin}]`, text)
    else console.info(`[${plugin}]`, text)
  }
  return {
    info: (...args: unknown[]) => { write('info', args) },
    warn: (...args: unknown[]) => { write('warn', args) },
  }
}
