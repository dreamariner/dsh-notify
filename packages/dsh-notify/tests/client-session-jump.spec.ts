// @dreamariner/dsh-notify :: 点横幅切会话单测（纯逻辑，不依赖浏览器）
//
// 这层是「点了横幅之后做什么」的唯一真相源：切回触发通知的会话；切不了时要分清
// 是「没有会话 id」还是「客户端没有 uiWorkspace 服务」，两者的处置不同（后者只
// 唤起窗口，必要时提示一句）。
import { describe, expect, it, vi } from 'vitest'
import { jumpToSession, type UiWorkspaceLike } from '../src/client/session-jump.ts'

describe('点横幅切会话', () => {
  it('有会话 id 与服务时切回该会话', () => {
    const openSession = vi.fn()
    const uiWorkspace: UiWorkspaceLike = { openSession }
    const result = jumpToSession('session-42', uiWorkspace)
    expect(result.outcome).toBe('opened')
    expect(openSession).toHaveBeenCalledWith('session-42')
  })

  it('没有会话 id 时不切（只唤起窗口）', () => {
    const openSession = vi.fn()
    const result = jumpToSession(undefined, { openSession })
    expect(result.outcome).toBe('no-session')
    expect(openSession).not.toHaveBeenCalled()
  })

  it('会话 id 是空串时也不切', () => {
    const openSession = vi.fn()
    const result = jumpToSession('', { openSession })
    expect(result.outcome).toBe('no-session')
    expect(openSession).not.toHaveBeenCalled()
  })

  it('没有 uiWorkspace 服务时不切（客户端可能不在桌面端）', () => {
    const result = jumpToSession('session-42', undefined)
    expect(result.outcome).toBe('no-service')
  })

  it('切会话抛错时如实报失败，不吞异常', () => {
    const boom = new Error('会话不存在')
    const result = jumpToSession('session-42', {
      openSession: () => { throw boom },
    })
    expect(result.outcome).toBe('failed')
    expect(result.error).toBe(boom)
  })
})
