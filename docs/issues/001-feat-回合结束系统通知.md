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

### 通知通道（`src/notify.ts`）

- 只用 `node:child_process` 的 `execFile` argv 形态，不经 shell：正文里的引号、
  换行、分号都只是参数，不会变成命令注入。
- 不引宿主包（`@deepseek-ai/dsh-native-command`）：插件不依赖运行期 node_modules
  布局，profile 里 `link:` 装法不会解析不到。
- macOS 走 `/usr/bin/osascript` 的 `display notification`（AppleScript 字面量要转义
  反斜杠与双引号，换行折成空格）；Linux 走 `notify-send`；Windows 无内置通道，
  显式报错并提示改配 `command`。
- `command` 支持自定义 argv 模板，占位符 `{title}` / `{body}`。

### 接线（`src/index.ts`）

`inject: ['sessions']`：官方会话类插件的同一写法（`packages/session/session-title/src/index.ts:302`），
保证插件在会话存储就绪后才激活，不漏启动初期的回合事件。

## 影响面

- 不注册 Agent tool：通知是宿主行为，不是模型能力。
- 不改宿主源码，不改 DSH 版本锚，不触碰持久化格式。
- 不做数据迁移，无 storeDir 既有数据。

## 验收标准

- [x] 四道闸的决策逻辑有单测覆盖（每个闸各一条用例）
- [x] AppleScript 转义、平台命令构造、占位符替换有单测覆盖
- [x] 三门禁全绿：`pnpm test` / `pnpm typecheck` / `pnpm build`
- [ ] 实机验证：装进 desktop profile 并重启实例后，跑一轮真实对话，macOS 弹出通知横幅
- [ ] 实机验证：子代理回合不重复弹（开一轮含 subagent 的任务）
- [ ] 实机验证：`abort` 的回合不弹通知

## 依赖

- 无前置 issue。
- 实机验证需要 macOS 通知权限放行，且不能处于专注模式（系统层，插件管不了）。

## 进度日志

- 2026-11-17  jianan  查证 DSH 无内置通知能力，定下自建 host 插件路线
- 2026-11-17  jianan  脚手架生成项目，实现决策逻辑与通知通道，三门禁全绿
