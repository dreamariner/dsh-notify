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

- **主路（客户端）**：host 把载荷推给 client 半边（typert 流方法），client 用
  `new Notification(title, { body })` 弹。桌面端归属是 DSH 本身，点一下唤起
  DSH Desktop。普通浏览器里权限默认不给（不主动弹权限框打断正事），这时请 host
  走兜底通道（`notify/fallback`）。
- **兜底（宿主）**：没人接时，host 在 `fallbackDelayMs`（默认 8 秒）后用 osascript 的
  `display notification` 补一条，归属是「脚本编辑器」。两路互斥：client 接走就不兜底。
- 命令一律 `node:child_process` 的 `execFile` argv 形态（不经 shell，不引宿主包）：
  正文里的引号、换行、分号都只是参数，不会变成命令注入。AppleScript 字面量要转义
  反斜杠与双引号，换行折成空格。
- host 侧不引 `@deepseek-ai/dsh-native-command`：插件不依赖运行期 node_modules
  布局，profile 里 `link:` 装法不会解析不到。

### 接线（`src/index.ts`）

`inject: ['sessions']`：官方会话类插件的同一写法（`packages/session/session-title/src/index.ts:302`），
保证插件在会话存储就绪后才激活，不漏启动初期的回合事件。

## 影响面

- 不注册 Agent tool：通知是宿主行为，不是模型能力。
- 不改宿主源码，不改 DSH 版本锚，不触碰持久化格式。
- 不做数据迁移，无 storeDir 既有数据。

## 验收标准

- [x] 四道闸的决策逻辑有单测覆盖（每个闸各一条用例）
- [x] 通知总线的两条路径有单测覆盖（客户端接走 / 超时兜底 / 客户端中途连上）
- [x] AppleScript 转义与命令构造有单测覆盖
- [x] 三门禁全绿：`pnpm test`（45 项）/ `pnpm typecheck` / `pnpm build`
- [x] 装进 desktop profile 并重启实例，`pnpm dsh:probe` 显示本插件 active
- [x] 真机验证主回合：跑一轮真实对话，日志记 `已通知：kind=completed 用时=5616ms 正文="收到"`，
  正文取到的正是助手那条回复
- [x] 真机验证子代理回合：子代理会话头带 `origin: "subagent"`（实测 `delegationDepth: 1`），
  插件记 `不通知（subagent）：kind=completed`，父会话照常发通知
- [x] 真机验证客户端接入：日志出现「客户端已接入通知流」，且**没有**「宿主兜底已发出」
  → 横幅是客户端弹的，归属是 DSH 本身
- [x] 实机验证 `abort` 的回合不弹通知（默认 notifyKinds 不含 aborted）
- [ ] 人眼确认横幅归属显示「DeepSeek Harness」，且点一下能把 DSH Desktop 唤到前台
      （系统层只能由人确认；脚本只能确认「客户端接走了载荷」）

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
