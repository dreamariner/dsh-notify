// @dreamariner/dsh-notify :: 通知通道单测
//
// 守三件事：
//   ① AppleScript 字面量转义（正文里的引号与反斜杠不能提前闭合字符串）；
//   ② 各平台命令的 argv 形态（不经 shell，参数顺序固定）；
//   ③ 自定义命令模板的占位符替换。
import { describe, expect, it } from 'vitest'
import {
  appleScriptString,
  buildDarwinCommand,
  buildLinuxCommand,
  createNotifier,
  fillCommand,
  type CommandRunner,
} from '../src/notify.ts'

/** 记录调用参数的假执行器。 */
function recordingRunner(): { runner: CommandRunner; calls: Array<{ command: string; args: readonly string[] }> } {
  const calls: Array<{ command: string; args: readonly string[] }> = []
  const runner: CommandRunner = async (command, args) => { calls.push({ command, args: [...args] }) }
  return { runner, calls }
}

describe('AppleScript 字面量转义', () => {
  it('转义双引号与反斜杠', () => {
    expect(appleScriptString('他说"好"')).toBe('他说\\"好\\"')
    expect(appleScriptString('C:\\path')).toBe('C:\\\\path')
  })

  it('换行折成空格（AppleScript 字符串不能跨行）', () => {
    expect(appleScriptString('第一行\n第二行\r\n第三行')).toBe('第一行 第二行 第三行')
  })
})

describe('平台命令构造', () => {
  it('macOS 走 osascript 的 display notification', () => {
    const argv = buildDarwinCommand({ title: 'DSH', body: '跑完了' })
    expect(argv[0]).toBe('/usr/bin/osascript')
    expect(argv[1]).toBe('-e')
    expect(argv[2]).toContain('display notification "跑完了" with title "DSH"')
  })

  it('macOS 带声音时追加 sound name 子句', () => {
    const argv = buildDarwinCommand({ title: 'DSH', body: 'x', soundName: 'Glass' })
    expect(argv[2]).toContain('sound name "Glass"')
  })

  it('macOS 声音名为空时不追加子句', () => {
    const argv = buildDarwinCommand({ title: 'DSH', body: 'x', soundName: '  ' })
    expect(argv[2]).not.toContain('sound name')
  })

  it('正文里的引号被转义，不会提前闭合字符串', () => {
    const argv = buildDarwinCommand({ title: 'DSH', body: '他说"好了"' })
    expect(argv[2]).toBe('display notification "他说\\"好了\\"" with title "DSH"')
  })

  it('Linux 走 notify-send', () => {
    const argv = buildLinuxCommand({ title: 'DSH', body: '跑完了', appName: 'Harness' })
    expect(argv).toEqual(['notify-send', '--app-name', 'Harness', 'DSH', '跑完了'])
  })
})

describe('自定义命令模板', () => {
  it('占位符就地替换', () => {
    expect(fillCommand(['tn', '-title', '{title}', '-message', '{body}'], { title: 'T', body: 'B' }))
      .toEqual(['tn', '-title', 'T', '-message', 'B'])
  })

  it('没有占位符时把标题与正文追加到末尾', () => {
    expect(fillCommand(['tn'], { title: 'T', body: 'B' })).toEqual(['tn', 'T', 'B'])
  })
})

describe('发送器', () => {
  it('自定义命令按模板执行，命令与参数分开传', async () => {
    const { runner, calls } = recordingRunner()
    const notifier = createNotifier({
      platform: 'darwin',
      command: ['/opt/homebrew/bin/terminal-notifier', '-title', '{title}', '-message', '{body}'],
      soundName: '',
      appName: 'DSH',
      runner,
    })
    await notifier({ title: 'DSH', body: '正文' })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.command).toBe('/opt/homebrew/bin/terminal-notifier')
    expect(calls[0]?.args).toEqual(['-title', 'DSH', '-message', '正文'])
  })

  it('无内置通道的平台要显式报错，不静默吞掉', async () => {
    const { runner } = recordingRunner()
    const notifier = createNotifier({
      platform: 'win32',
      command: [],
      soundName: '',
      appName: 'DSH',
      runner,
    })
    await expect(notifier({ title: 'DSH', body: 'x' })).rejects.toThrow(/没有内置通知通道/)
  })

  it('macOS 走内置通道时调用 osascript', async () => {
    const { runner, calls } = recordingRunner()
    const notifier = createNotifier({
      platform: 'darwin',
      command: [],
      soundName: '',
      appName: 'DSH',
      runner,
    })
    await notifier({ title: 'DSH', body: '正文' })
    expect(calls[0]?.command).toBe('/usr/bin/osascript')
    expect(calls[0]?.args[0]).toBe('-e')
  })

  it('Linux 走内置通道时调用 notify-send', async () => {
    const { runner, calls } = recordingRunner()
    const notifier = createNotifier({
      platform: 'linux',
      command: [],
      soundName: '',
      appName: 'Harness',
      runner,
    })
    await notifier({ title: 'DSH', body: '正文' })
    expect(calls[0]?.command).toBe('notify-send')
  })
})
