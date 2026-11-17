---
id: 001
type: feat
title: 回合结束发本机系统通知
status: doing
priority: P1
labels: []
created: 2026-11-17
updated: 2026-11-17
assignee: jianan
related: []
---

# 001 · 回合结束发本机系统通知

## 背景

DSH 的对话跑完时没有任何本机信号，人不在屏幕前就完全不知道活干完了。macOS 上关闭
窗口 DSH 仍在后台运行（`apps/desktop/src/main.ts:1497-1499`：`window-all-closed` 只在
非 darwin 平台 quit），所以「关掉窗口去干别的、回来发现早就跑完了」是常态。

查过 DSH 内置能力，结论是**没有**对话完成通知：

| 检查项 | 结论 | 证据 |
|---|---|---|
| 桌面端 Electron Notification | 只有强制更新安装提醒、登录过期一次性提醒两处 | `apps/desktop/src/update-attention.ts:43`、`apps/desktop/src/welcome-api.ts:23` |
| Agent 工具目录 | 无任何通知类工具 | `docs/tool-catalog.zh.md` |
| `account-notifications` | DeepSeek 账号中心消息（余额、公告），不是本机系统通知 | `packages/client/ui-account-notifications/` |
| 设置项 | 无通知开关、无提示音开关 | `packages/settings` |
| 桌面端文档 | 明确写了关窗不发系统通知 | `apps/desktop/README.md:76` |

可用挂载点有三个，本 issue 选第一个：

1. **自建 host 形态插件**（本 issue）：订阅 `session/event`，`turn/end` 时发通知。
   可控、能带摘要与阈值。
2. 挂 `@deepseek-ai/dsh-hooks-claude-code`，给 `Stop` 事件挂命令。`Stop` 映射到
   `agent/turn-stopping`，正是「运行即将停止」的时刻。但命令退出码非 0 会强制 agent
   再跑一步，且 `transcript_path` 恒为空（拿不到对话内容），只能发固定文案。
3. 客户端侧 Notification API：浏览器要授权，前台时横幅不可靠。

### 后补的要求：归属要是 DSH，点一下要唤起 DSH Desktop

第一版用宿主自己的 osascript 发通知，功能通了，但横幅归属显示「脚本编辑器」，点它
唤起的是脚本编辑器而不是 DSH。要同时满足「归属是 DSH」与「点击唤起 DSH Desktop」，
**通知必须由 Electron 应用自己发**：

- 宿主进程是 Electron 主进程派生的**子进程**（实测主进程 PID 与 host 监听端口的
  进程不是同一个），拿不到 Electron 的 Notification API；
- host → Electron 主进程之间只有固定几条消息类型（`starting` / `ready` /
  `shutdown` / `file-drag-*` / `quit-inspection`），没有通知通道，且官方 app 是签
  名发行版，不该改；
- **客户端半边（渲染进程）可以发**：主窗口所在 session 的权限处理器对非 media 权限
  一律放行（`apps/desktop/src/microphone-permissions.ts:23`），所以渲染进程里的
  `new Notification(...)` 能弹系统通知，归属是应用本身；点击时 macOS 激活应用，
  桌面端已有 `app.on('activate') → focusPrimaryWindow()`（`apps/desktop/src/main.ts:1494`）
  把 DSH Desktop 的窗口拉到前台。

于是形态从 host 改为 **full（host + client）**：host 判定后把载荷推给 client，
client 用系统的 Notification API 弹。typert 的方向是 client → host 的调用，
所以「host 推给 client」用**流方法**（`@Remote({ mode: 'stream' })`）实现。

## 目标

- 回合正常结束时弹一条本机系统通知，正文是最后一条助手消息的摘要。
- 不制造噪音：人自己按停（aborted）不报，子代理回合不报，秒回的活不报。
- 常驻进程为零：通知由宿主事件驱动，用完即走，不装 LaunchAgent、不自启。

## 方案

### 事件点

- `ctx.on('session/event', ...)`：宿主会话事件的提交后广播，回调在日志落盘后执行，
  监听器抛错被宿主吞掉并记录，不会让会话失败。
- `turn/end` 事件的 `reason.kind` 有 `completed` / `error` / `max-tokens` / `blocked` /
  `aborted` / `interrupted` / `forked`（`packages/core/session/src/types.ts:206-238`）。
- 子代理判定用 `session.header.origin === 'subagent'`（同一文件 `SessionHeader.origin`）。

### 四道闸（`src/turn-watcher.ts`，纯逻辑可单测）

总开关 → 结束原因名单 → 是否子代理 → 最短耗时。任何一道不过都不发，并给出原因码，
日志里能回答「为什么这次没响」。

### 通知通道（full 形态：host 判定 + client 弹）

- **只有一条路（客户端）**：host 把载荷推给 client 半边（typert 流方法），client 用
  `new Notification(title, { body })` 弹。桌面端归属是 DSH 本身，点一下唤起
  DSH Desktop。普通浏览器里权限默认不给（不主动弹权限框打断正事），这种环境下就没有
  通知。
- **不做兜底通道**（2026-11-17 定：主路行就行，不行就不行）：没有客户端接入通知流时
  通知直接丢弃，宿主日志记「无人接收通知（没有客户端接入通知流），已丢弃」。理由是
  兜底那条的归属只能是别的应用（macOS 的 osascript 归属「脚本编辑器」，点它唤起的是
  脚本编辑器），与其弹一条归属不对的，不如不弹。
  → wire 契约里的兜底端点（`notify/fallback`）、`src/notify.ts`（osascript 命令构造与
  发送）、配置项 `fallback` / `fallbackDelayMs` / `soundName` / `appName` 全部删除。
- host 侧不引 `@deepseek-ai/dsh-native-command`：插件不依赖运行期 node_modules
  布局，profile 里 `link:` 装法不会解析不到。

### 接线（`src/index.ts`）

`inject: ['sessions']`：官方会话类插件的同一写法（`packages/session/session-title/src/index.ts:302`），
保证插件在会话存储就绪后才激活，不漏启动初期的回合事件。

### 点横幅切回会话（后补的要求）

要求追加到「点一下要唤起 DSH Desktop」之后：**点横幅还要切到这条通知对应的会话**。

- 载荷加 `sessionId`（`src/contract.ts`）：host 在 `turn/end` 时把会话 id 放进载荷，
  typert 的 wire 契约随之带上（生成产物里 `sessionId` 是可选字段）。
- client 半边点横幅时调 `ctx.get('uiWorkspace').openSession(sessionId)`：DSH 客户端的
  `uiWorkspace` 服务负责「选中该会话并在会话区显示它」
  （`packages/client/ui-workspace/src/client/navigation.ts:293`）。
- `uiWorkspace` 按**可选服务**取（动态插件 ctx 的 `ctx.get` 是免声明的可选查找，见
  `packages/extensions/cordis-client-runner/src/client/guard.ts:220`），取不到就只唤起
  窗口、不切会话，不让整条通知链断掉。client 装载时自报一行「客户端就绪：
  uiWorkspace=可用/不可用」，排查时先看它。
- 切会话的判断抽成纯函数 `src/client/session-jump.ts`（有会话 id 与服务才切；失败
  如实报 failed，不吞异常），五种结果各有单测。

## 前提：macOS 通知权限

横幅显不显示由 macOS 决定。实测（本机 macOS 26 / 27，DeepSeek Harness 0.2.2-rc.2）：

- 插件日志记「已通知」、客户端也把通知交给了系统（`usernoted` 与 `NotificationCenter`
  的系统日志里能看到 `com.deepseek.dsh` 的通知记录），但横幅不出现；
- 系统日志里该应用的通知被拒：`notificationsAllowed: false`、`authorizationStatus: Denied`，
  且通知中心偏好（`com.apple.ncprefs`）里没有该应用的登记；
- 结论：macOS 未给 DeepSeek Harness 通知授权，通知请求被系统吞掉。插件无权代开，
  也不该代改系统设置，要用户在「系统设置 → 通知 → DeepSeek Harness」里放行。

同一个原因也会让 DSH 自带的更新提醒（`apps/desktop/src/update-attention.ts:43`）不显示。

## 已知告警（无害）

web boot 时控制台会出现一条：

```
web boot: warning: 1 entry did not activate
@dreamariner/dsh-notify: import failed (see console for the import error)
```

这是宿主启动时的存活检查与动态 client 插件的异步装载之间的时序差：检查时本插件的
fiber 还没落地，于是记一条「import failed」，几十毫秒后插件照常激活（控制台随后会
出现「客户端就绪」，宿主日志里出现「客户端已接入通知流」）。

A/B 验证过：用改动前的客户端产物（commit `89b2615`）重载，同样出现这条警告，说明
与本次改动无关。插件侧无法消除（警告由宿主的启动检查产生）。

## 影响面

- 不注册 Agent tool：通知是宿主行为，不是模型能力。
- 不改宿主源码，不改 DSH 版本锚，不触碰持久化格式。
- 不做数据迁移，无 storeDir 既有数据。

## 验收标准

- [x] 四道闸的决策逻辑有单测覆盖（每个闸各一条用例）
- [x] 通知总线的行为有单测覆盖（有客户端订阅时推走 / 没人订阅时丢弃 / 订阅者关闭后不再接）
- [x] 点横幅切会话的判断有单测覆盖（有会话有服务 / 无会话 / 无服务 / 服务报错）
- [x] 三门禁全绿：`pnpm test`（45 项）/ `pnpm typecheck` / `pnpm build`
- [x] 装进 desktop profile 并重启实例，`pnpm dsh:probe` 显示本插件 active
- [x] 真机验证主回合：跑一轮真实对话，日志记 `已通知：kind=completed 用时=5616ms 正文="收到"`，
  正文取到的正是助手那条回复
- [x] 真机验证子代理回合：子代理会话头带 `origin: "subagent"`（实测 `delegationDepth: 1`），
  插件记 `不通知（subagent）：kind=completed`，父会话照常发通知
- [x] 真机验证客户端接入：日志出现「客户端已接入通知流」→ 横幅是客户端弹的，归属是
  DSH 本身
- [x] 实机验证 `abort` 的回合不弹通知（默认 notifyKinds 不含 aborted）
- [x] 真机验证点横幅切会话：模拟点击后窗口标题从当前会话（「真人版形象设计进展」）
  切到通知对应的会话（「收到」），客户端控制台记「点横幅 → 切回会话：session-9b7a4c37…」
- [x] 系统层验证横幅真的被呈现：macOS 授权放行后，系统日志里同一条通知从
  `alertStyle: none` 变成 `alertStyle: banner`、`present: true`，列表项归属
  `com.deepseek.dsh`（即 DeepSeek Harness），且不再出现 `notificationsAllowed: false`
- [x] 人眼确认横幅归属显示「DeepSeek Harness」，且点一下能把 DSH Desktop 唤到前台
      （系统层只能由人确认；脚本只能确认「客户端接走了载荷」「点击后切了会话」
      「系统把横幅呈现了」）
      ⚠ 前提：先在「系统设置 → 通知 → DeepSeek Harness」里放行通知
- [x] 去掉兜底通道后全仓无残留：产物里搜不到 `osascript` 与兜底端点（`fallback` 只剩
      zod 内部的 `zod.compile.fallback` 符号），wire 契约只剩通知流一个端点

## 实测记录

一次含子代理的任务（第一版，host 自己发）：

```
05:02:49 [info] 已通知：kind=completed 用时=170224ms 正文="…11 个直接子目录…"
05:02:50 [info] 不通知（subagent）：kind=completed 用时=165500ms
05:02:54 [info] 已通知：kind=completed 用时=3539ms 正文="子代理 dir-counter 已收工…"
```

第一行是派完子代理、父回合收尾那一轮；第三行是子代理跑完、父回合转述结果那一轮。
**一个用户任务会收到两条通知**（父会话每轮各一条）。嫌第二条吵就把 `minDurationMs`
调大（例如 30000，转述那一轮只有 3.5 秒会被滤掉）。

改成 full 形态后（客户端弹）：

```
08:02:50 [info] 已装载：监听回合结束事件，通知原因码 completed / error
08:02:52 [info] 客户端已接入通知流（通知由客户端弹，归属是 DSH 本身）
08:03:12 [info] 已通知：kind=completed 用时=13895ms 正文="收到"
```

客户端在插件装载后约 1.5 秒接入；之后发的通知一律走客户端，没有兜底记录。

### 「通知没出现」的排查（2026-11-17 17:00 前后）

系统日志里能看到 DSH 自己发的通知请求（`n#dsh-app://app#…` 是渲染进程的 web 通知
请求号），但横幅不出现：

```
16:49:02 Electron[12805] [com.apple.UserNotifications:Connections] [com.deepseek.dsh] Adding notification request 4FB7-DE25
16:49:02 NotificationCenter[1159] [com.apple.unc:dnd] Should not play sound for com.deepseek.dsh:
         playSounds: true, hasAuthorizations: true, notificationsAllowed: false, darkWake: false
```

`notificationsAllowed: false` 与偏好里没有该应用登记，指向 macOS 未授权该应用发通知。
专注模式当时是关的（`donotdisturbd` 记 `outcome: allowed; reason: disabled`），排除。

### 点横幅切会话的真机验证（2026-11-17 17:04）

在渲染进程里劫持 `window.Notification` 留住通知实例，触发一轮真实对话后调用实例的
`onclick`（等价于点横幅）：

```
[dsh-notify] 已弹系统通知：DSH · 收到 · 会话=session-9b7a4c37-146b-4a99-9312-fade43d8faf5
[dsh-notify] 点横幅 → 切回会话：session-9b7a4c37-146b-4a99-9312-fade43d8faf5
```

窗口标题从「真人版形象设计进展 — DeepSeek Harness」变成「收到 — DeepSeek Harness」，
即界面确实切到了通知对应的会话。

## 依赖

- 无前置 issue。
- 实机验证需要 macOS 通知权限放行，且不能处于专注模式（系统层，插件管不了）。

## 进度日志

- 2026-11-17  jianan  查证 DSH 无内置通知能力，定下自建 host 插件路线
- 2026-11-17  jianan  脚手架生成项目，实现决策逻辑与通知通道，三门禁全绿
- 2026-11-17  jianan  装进 desktop profile、重启实例、probe 显示 active；真机跑通主回合与
  子代理回合（子代理按 origin=subagent 正确过滤），补文件日志与验收脚本
- 2026-11-17  jianan  按「归属是 DSH、点击唤起 DSH Desktop」的要求改为 full 形态：
  client 半边在渲染进程里弹通知（归属 DSH 本身），host 保留 osascript 兜底；
  真机确认客户端已接入通知流且未触发兜底
- 2026-11-17  jianan  定位「横幅不出现」的根因：macOS 未给 DeepSeek Harness 通知授权，
  系统把通知吞了（插件侧一切正常）；写进 README 与本 issue，插件不代改系统设置
- 2026-11-17  jianan  加「点横幅切回该会话」：载荷带 sessionId，client 用
  `uiWorkspace.openSession` 切会话；纯逻辑抽成 session-jump.ts 并补 5 条单测，
  真机模拟点击后窗口标题切到通知对应的会话
- 2026-11-17  jianan  跨平台口径定案：主路跨平台不动代码，兜底通道只留 macOS 的
  osascript，不扩 Windows / Linux（DSH Desktop 只发行 macOS 与 Windows）
- 2026-11-17  jianan  macOS 通知授权放行后系统层复核：同一条通知由 `alertStyle: none`
  变成 `alertStyle: banner`、`present: true`，归属 `com.deepseek.dsh`，横幅确被呈现
- 2026-11-17  jianan  去掉兜底通道（林老师定：主路行就行，不行就不行）：删 wire 兜底
  端点、`src/notify.ts` 与 `fallback` / `fallbackDelayMs` / `soundName` / `appName` 四个
  配置项；没有客户端接入时通知直接丢弃并记一行原因
- 2026-11-17  jianan  顺手修掉一个构建竞态：client 产物内联的 wire 契约是上一轮的旧
  产物（两段 tsdown 并行跑）。拆成 `tsdown.host.config.ts` / `tsdown.client.config.ts`，
  build 脚本按 host → client 顺序跑；清空 lib/ 从零构建验证过
