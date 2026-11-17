// @dreamariner/dsh-notify :: 通知决策单测（纯逻辑，不依赖宿主）
//
// 这层是「什么情况下才响」的唯一真相源：四道闸（总开关 / 结束原因 / 子代理 / 耗时）
// 任何一道不过都不该发通知。守住它们，别让插件变成随机骚扰源。
import { describe, expect, it } from 'vitest'
import { decideNotification, summarize } from '../src/turn-watcher.ts'
import { Config, resolveConfig, type NotifyConfig } from '../src/config.ts'

const base: NotifyConfig = resolveConfig(Config, {}, 'test')

describe('通知决策', () => {
  it('总开关关掉时不通知', () => {
    const decision = decideNotification(
      { ...base, enabled: false },
      { isSubagent: false },
      { kind: 'completed', durationMs: 1000 },
    )
    expect(decision.notify).toBe(false)
    expect(decision.reason).toBe('disabled')
  })

  it('结束原因不在名单里时不通知（aborted 是人自己按停的，不该吵）', () => {
    const decision = decideNotification(
      base,
      { isSubagent: false },
      { kind: 'aborted', durationMs: 1000 },
    )
    expect(decision.notify).toBe(false)
    expect(decision.reason).toBe('kind-not-watched')
  })

  it('子代理会话默认不通知，避免一轮里弹好几次', () => {
    const skipped = decideNotification(
      base,
      { isSubagent: true },
      { kind: 'completed', durationMs: 1000 },
    )
    expect(skipped.notify).toBe(false)
    expect(skipped.reason).toBe('subagent')

    const included = decideNotification(
      { ...base, includeSubagents: true },
      { isSubagent: true },
      { kind: 'completed', durationMs: 1000 },
    )
    expect(included.notify).toBe(true)
  })

  it('耗时低于阈值时不通知', () => {
    const decision = decideNotification(
      { ...base, minDurationMs: 5000 },
      { isSubagent: false },
      { kind: 'completed', durationMs: 4999 },
    )
    expect(decision.notify).toBe(false)
    expect(decision.reason).toBe('too-fast')
  })

  it('正常完成时通知：正文取最后一条助手消息的摘要', () => {
    const decision = decideNotification(
      base,
      { isSubagent: false },
      { kind: 'completed', durationMs: 1000, lastText: '已经改完配置并跑通测试。' },
    )
    expect(decision.notify).toBe(true)
    expect(decision.body).toBe('已经改完配置并跑通测试。')
    expect(decision.title).toBe('DSH')
  })

  it('会话标题拼进通知标题', () => {
    const decision = decideNotification(
      base,
      { isSubagent: false, title: '品牌选型' },
      { kind: 'completed', durationMs: 1000, lastText: '好了' },
    )
    expect(decision.title).toBe('DSH · 品牌选型')
  })

  it('决策带上会话 id：客户端点横幅据此切回该会话', () => {
    const withId = decideNotification(
      base,
      { isSubagent: false, id: 'session-42' },
      { kind: 'completed', durationMs: 1000, lastText: '好了' },
    )
    expect(withId.sessionId).toBe('session-42')

    const withoutId = decideNotification(
      base,
      { isSubagent: false, id: '' },
      { kind: 'completed', durationMs: 1000, lastText: '好了' },
    )
    expect(withoutId.sessionId).toBeUndefined()
  })

  it('没有助手文本时用结束原因对应的兜底正文', () => {
    const completed = decideNotification(
      base,
      { isSubagent: false },
      { kind: 'completed', durationMs: 1000 },
    )
    expect(completed.body).toBe('回合已完成')

    const failed = decideNotification(
      base,
      { isSubagent: false },
      { kind: 'error', durationMs: 1000 },
    )
    expect(failed.body).toBe('回合出错结束')
  })

  it('关掉摘要后正文只留兜底文案', () => {
    const decision = decideNotification(
      { ...base, showSummary: false },
      { isSubagent: false },
      { kind: 'completed', durationMs: 1000, lastText: '这段不该出现' },
    )
    expect(decision.body).toBe('回合已完成')
  })
})

describe('摘要处理', () => {
  it('压平空白', () => {
    expect(summarize('第一行\n\n第二行\t带空格', 100)).toBe('第一行 第二行 带空格')
  })

  it('超长时截断并补省略号', () => {
    const out = summarize('abcdefghij', 5)
    expect(out).toBe('abcd…')
    expect(out.length).toBe(5)
  })

  it('空文本返回空串', () => {
    expect(summarize(undefined, 10)).toBe('')
    expect(summarize('   ', 10)).toBe('')
  })
})
