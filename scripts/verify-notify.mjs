// @dreamariner/dsh-notify :: 真机验收脚本
//
// 干什么：连本机 DSH 实例，建一个会话，发一条一句话提示词，等这一回合跑完，
// 然后读插件自己的日志文件，看通知到底有没有发出去、发的是什么正文。
//
// 为什么自己写而不是看屏幕：通知弹窗只有人眼能确认，脚本只能确认「决策走到了
// 发送这一步」；两者合起来才算验收通过。
//
// 用法：node scripts/verify-notify.mjs [提示词]
// 依赖：实例在跑（pnpm dsh:status），插件已装载（pnpm dsh:probe）。

import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME = process.env.DSH_HOME || join(homedir(), '.dsh')
const LOG = join(DSH_HOME, 'logs', 'dsh-notify.log')
const PROMPT = process.argv[2] || '请只回复两个字：收到'
const TIMEOUT_MS = 120_000

/** 读实例状态文件里的地址与 token。 */
function instance() {
  const state = JSON.parse(readFileSync(join(DSH_HOME, 'dsh-instance.json'), 'utf8'))
  if (typeof state.url !== 'string') throw new Error('dsh-instance.json 里没有 url')
  return state.url
}

/** 拿会话 cookie（token 换 cookie，DSH 的 web 通道靠它鉴权）。 */
async function cookie(base, token) {
  const res = await fetch(`${base}/?token=${token}`, { redirect: 'manual' })
  return res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ')
}

/** 调一次客户端 RPC。 */
async function call(base, ck, method, args) {
  const res = await fetch(`${base}/api/${method}`, {
    method: 'POST',
    headers: { cookie: ck, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `verify-${Date.now()}`,
      method,
      payload: { args },
    }),
    signal: AbortSignal.timeout(30_000),
  })
  const body = await res.json()
  if (!body.result?.ok) {
    throw new Error(`${method} 失败：${body.result?.error?.code ?? ''} ${body.result?.error?.message ?? res.status}`)
  }
  return body.result.value
}

/** 读日志文件现有内容（可能还不存在）。 */
function logSoFar() {
  try { return readFileSync(LOG, 'utf8') } catch { return '' }
}

const url = instance()
const base = new URL(url).origin
const token = new URL(url).searchParams.get('token')
console.log(`[verify] 实例 ${base}`)

const ck = await cookie(base, token)
const before = logSoFar()

const created = await call(base, ck, 'session/create', { request: { cwd: DSH_HOME } })
const sessionId = created.sessionId
console.log(`[verify] 会话 ${sessionId}`)

await call(base, ck, 'session/prompt', {
  request: {
    requestId: `verify-${Date.now()}`,
    sessionId,
    mode: 'queue',
    content: [{ type: 'text', text: PROMPT }],
    clientTimeZone: 'Asia/Shanghai',
  },
})
console.log('[verify] 提示词已投递，等回合结束…')

const started = Date.now()
let hit = null
while (Date.now() - started < TIMEOUT_MS) {
  await new Promise((resolve) => { setTimeout(resolve, 2000) })
  const fresh = logSoFar().slice(before.length)
  const lines = fresh.split('\n').filter((line) => line.trim() !== '')
  const decided = lines.find((line) => line.includes('已通知') || line.includes('不通知') || line.includes('通知发送失败'))
  if (decided !== undefined) { hit = decided; break }
}

if (hit === null) {
  console.error('[verify] ✗ 超时：日志里没有出现本回合的决策记录（回合可能还在跑）')
  console.error(`[verify] 日志文件：${LOG}`)
  process.exit(1)
}
const notified = hit.includes('已通知')
console.log(`[verify] ${notified ? '✓ 已发通知' : '✗ 未发通知'} ${hit}`)
console.log(notified
  ? '[verify] 请看一眼屏幕，确认 macOS 横幅真的弹出来了'
  : '[verify] 插件记录了不通知的原因（见上面 reason 码），按预期即验收通过')
process.exit(notified ? 0 : 2)
