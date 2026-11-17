// @dreamariner/dsh-notify :: 宿主兜底通道单测
//
// 兜底通道是 macOS 的 osascript display notification（客户端接不到时用）。
// 守两件事：AppleScript 字面量的转义（正文里的引号与反斜杠不能提前闭合字符串），
// 以及命令是 argv 形态（不经 shell）。
import { describe, expect, it } from 'vitest'
import { appleScriptString, buildDarwinCommand } from '../src/notify.ts'

describe('AppleScript 字面量转义', () => {
  it('转义双引号与反斜杠', () => {
    expect(appleScriptString('他说"好"')).toBe('他说\\"好\\"')
    expect(appleScriptString('C:\\path')).toBe('C:\\\\path')
  })

  it('换行折成空格（AppleScript 字符串不能跨行）', () => {
    expect(appleScriptString('第一行\n第二行\r\n第三行')).toBe('第一行 第二行 第三行')
  })
})

describe('macOS 兜底命令', () => {
  it('走 osascript 的 display notification', () => {
    const argv = buildDarwinCommand({ title: 'DSH', body: '跑完了', kind: 'completed' })
    expect(argv[0]).toBe('/usr/bin/osascript')
    expect(argv[1]).toBe('-e')
    expect(argv[2]).toContain('display notification "跑完了" with title "DSH"')
  })

  it('带声音时追加 sound name 子句', () => {
    const argv = buildDarwinCommand({ title: 'DSH', body: 'x', kind: 'completed' }, 'Glass')
    expect(argv[2]).toContain('sound name "Glass"')
  })

  it('声音名为空时不追加子句', () => {
    const argv = buildDarwinCommand({ title: 'DSH', body: 'x', kind: 'completed' }, '  ')
    expect(argv[2]).not.toContain('sound name')
  })

  it('正文里的引号被转义，不会提前闭合字符串', () => {
    const argv = buildDarwinCommand({ title: 'DSH', body: '他说"好了"', kind: 'completed' })
    expect(argv[2]).toBe('display notification "他说\\"好了\\"" with title "DSH"')
  })
})
